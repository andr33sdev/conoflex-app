"""Una llamada: audio de WhatsApp ⇄ Gemini Live (voz a voz, sin pasar por texto).

Gemini escucha y habla directo, así responde rápido y se lo puede interrumpir como a una persona.
Sabe lo mismo que el chat (catálogo, precios, reglas y correcciones) porque se lo da el backend
al atender, y tiene herramientas para hacer cuentas exactas, mandar cosas al chat, derivar y cortar.
"""

import asyncio
import os
import time

import aiohttp
from loguru import logger
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import LLMRunFrame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.whatsapp.api import WhatsAppApi
from pipecat.workers.runner import WorkerRunner

import conoflex

MAX_MINUTOS = float(os.getenv("VOZ_MAX_MINUTOS", "10"))

HERRAMIENTAS = [
    FunctionSchema(
        name="calcular_presupuesto",
        description="Calcula el total exacto con precios de lista para las cantidades que pidió el cliente. Usala siempre que haya cantidades.",
        properties={
            "items": {
                "type": "array",
                "description": "Productos y cantidades",
                "items": {
                    "type": "object",
                    "properties": {
                        "codigo": {"type": "string", "description": "Código del producto en el catálogo"},
                        "cantidad": {"type": "number"},
                    },
                    "required": ["codigo", "cantidad"],
                },
            }
        },
        required=["items"],
    ),
    FunctionSchema(
        name="enviar_por_whatsapp",
        description="Manda un mensaje escrito al chat de WhatsApp de este cliente (precios por escrito, resumen, datos). Avisale que se lo mandaste.",
        properties={"texto": {"type": "string", "description": "Texto corto y claro para WhatsApp"}},
        required=["texto"],
    ),
    FunctionSchema(
        name="derivar_a_persona",
        description="Pasa el caso a alguien del equipo, que le va a escribir por WhatsApp.",
        properties={"motivo": {"type": "string", "description": "Qué necesita el cliente, en una línea"}},
        required=["motivo"],
    ),
    FunctionSchema(
        name="cortar_llamada",
        description="Corta la llamada. Usala solo después de despedirte.",
        properties={},
        required=[],
    ),
]


BUSCAR = FunctionSchema(
    name="buscar_catalogo",
    description="Busca en el catálogo y devuelve las fichas completas (precio, medidas, altura, peso, usos). Usala antes de dar cualquier dato de un producto.",
    properties={"consulta": {"type": "string", "description": "Lo que busca el cliente, en pocas palabras: producto, código o medida (ej: 'conos 120 cm')"}},
    required=["consulta"],
)
HERRAMIENTAS.append(BUSCAR)

HERRAMIENTAS_WEB = [
    HERRAMIENTAS[0],
    FunctionSchema(
        name="dejar_contacto",
        description="Le pasa a un vendedor los datos del cliente para que lo contacte. Usala cuando quiera una cotización formal, comprar, o algo que vos no podés resolver. Necesita al menos teléfono o mail.",
        properties={
            "nombre": {"type": "string"},
            "empresa": {"type": "string"},
            "telefono": {"type": "string", "description": "Solo números, como lo dictó"},
            "mail": {"type": "string"},
            "motivo": {"type": "string", "description": "Qué necesita, en una línea (productos y cantidades si los dijo)"},
        },
        required=["motivo"],
    ),
    HERRAMIENTAS[3],
    BUSCAR,
]


def proveedor() -> str:
    """Motor de voz: "gemini" (Gemini Live, clave de AI Studio), "vertex" (Gemini Live por Google Cloud)
    u "openai" (OpenAI Realtime, el de ChatGPT voz). Se elige con VOZ_PROVEEDOR."""
    p = (os.getenv("VOZ_PROVEEDOR") or "gemini").strip().lower()
    return p if p in ("gemini", "vertex", "openai", "elevenlabs") else "gemini"


def es_cascada() -> bool:
    """"elevenlabs": oído (OpenAI) → cerebro de texto (OpenAI) → voz de ElevenLabs. Permite una voz
    argentina nativa y meter las fichas del catálogo sin que la asistente tenga que "ir a buscar"."""
    return proveedor() == "elevenlabs"


NOTA_CASCADA = """

FICHAS DEL CATÁLOGO
- Las fichas de los productos que menciona el cliente te llegan solas en un mensaje "FICHAS DEL CATÁLOGO". Usalas directo.
- Nunca digas que vas a buscar, ni "a ver", "dame un segundo" o "ya te encontré": respondé de una con el dato, como alguien que se sabe el catálogo.
- Escribí solo lo que se dice en voz alta: sin listas, símbolos, asteriscos ni emojis. Frases cortas.
- Los precios escribilos en palabras como se dicen ("veinticuatro mil doscientos pesos más IVA")."""


def _turnos_openai():
    """Cuándo terminó de hablar el cliente. "rapido" (por defecto): corta tras ~0,45 s de silencio, como
    una charla; "semantico": espera a que la frase tenga sentido (más natural, a veces más lento)."""
    if (os.getenv("VOZ_TURNOS") or "rapido").strip().lower() == "semantico":
        from pipecat.services.openai.realtime import events as oa

        return oa.SemanticTurnDetection(eagerness="high")
    from pipecat.services.openai.realtime import events as oa

    return oa.TurnDetection(threshold=0.55, prefix_padding_ms=250, silence_duration_ms=int(os.getenv("VOZ_SILENCIO_MS", "450")))


def _crear_llm(ctx: dict, herramientas: list):
    p = proveedor()
    if p == "elevenlabs":
        from pipecat.services.openai.llm import OpenAILLMService

        return OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            settings=OpenAILLMService.Settings(model=os.getenv("VOZ_LLM", "gpt-4.1-mini"), system_instruction=ctx["instrucciones"] + NOTA_CASCADA, temperature=0.6),
        )
    if p == "openai":
        from pipecat.services.openai.realtime import events as oa
        from pipecat.services.openai.realtime.llm import OpenAIRealtimeLLMService

        return OpenAIRealtimeLLMService(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            settings=OpenAIRealtimeLLMService.Settings(
                model=os.getenv("VOZ_MODELO") or "gpt-realtime-2.1",
                system_instruction=ctx["instrucciones"],
                session_properties=oa.SessionProperties(
                    tools=herramientas,
                    audio=oa.AudioConfiguration(
                        input=oa.AudioInput(
                            transcription=oa.InputAudioTranscription(language="es"),
                            noise_reduction=oa.InputAudioNoiseReduction(type="near_field"),
                            turn_detection=_turnos_openai(),
                        ),
                        output=oa.AudioOutput(voice=os.getenv("VOZ_VOZ_OPENAI", "marin")),
                    ),
                ),
            ),
        )

    settings = dict(
        voice=os.getenv("VOZ_VOZ", "Aoede"),  # voz femenina
        language=Language.ES_US,  # código que Gemini Live acepta; el acento rioplatense lo da la instrucción
        system_instruction=ctx["instrucciones"],
        **({"model": os.getenv("VOZ_MODELO")} if os.getenv("VOZ_MODELO") else {}),
    )
    if p == "vertex":
        from pipecat.services.google.gemini_live.vertex.llm import GeminiLiveVertexLLMService

        return GeminiLiveVertexLLMService(
            credentials_path=os.getenv("VOZ_VERTEX_CREDENCIALES") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
            project_id=os.getenv("VOZ_VERTEX_PROYECTO", ""),
            location=os.getenv("VOZ_VERTEX_REGION", "us-central1"),
            tools=herramientas,
            settings=GeminiLiveVertexLLMService.Settings(**settings),
        )
    return GeminiLiveLLMService(
        api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        tools=herramientas,
        settings=GeminiLiveLLMService.Settings(**settings),
    )


def _oido_y_voz():
    """STT y TTS de la cascada."""
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    from pipecat.services.openai.stt import OpenAIRealtimeSTTService

    stt = OpenAIRealtimeSTTService(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        turn_detection={"type": "server_vad", "threshold": 0.55, "prefix_padding_ms": 250, "silence_duration_ms": int(os.getenv("VOZ_SILENCIO_MS", "450"))},
        settings=OpenAIRealtimeSTTService.Settings(model=os.getenv("VOZ_STT", "gpt-transcribe"), language=Language.ES, noise_reduction="near_field"),
    )
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        settings=ElevenLabsTTSService.Settings(
            voice=os.getenv("VOZ_ELEVEN_VOZ", ""),
            model=os.getenv("VOZ_ELEVEN_MODELO", "eleven_flash_v2_5"),
            language=Language.ES,
            stability=float(os.getenv("VOZ_ELEVEN_ESTABILIDAD", "0.45")),
            similarity_boost=0.8,
            speed=float(os.getenv("VOZ_ELEVEN_VELOCIDAD", "1.0")),
        ),
    )
    return stt, tts


MARCA_FICHAS = "FICHAS DEL CATÁLOGO"


def con_fichas(mensajes: list, fichas: list) -> list:
    """Reemplaza el mensaje de fichas anterior por uno nuevo, al final (justo antes de lo que dice el cliente)."""
    otros = [m for m in mensajes if not (isinstance(m, dict) and str(m.get("content", "")).startswith(MARCA_FICHAS))]
    return otros + [{"role": "developer", "content": f"{MARCA_FICHAS} (lo que el cliente puede estar pidiendo):\n" + "\n".join(fichas)}]


class FichasAutomaticas(FrameProcessor):
    """Con cada frase del cliente busca en el catálogo y le deja las fichas a mano a la asistente,
    así responde con el dato sin anunciar que "va a buscar"."""

    def __init__(self, context: LLMContext, catalogo: list):
        super().__init__()
        self._context = context
        self._catalogo = catalogo or []
        self._anteriores: list[str] = []

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.text and self._catalogo:
            nuevas = conoflex.buscar_catalogo(frame.text, self._catalogo, maximo=6).get("resultados", [])
            if nuevas:
                # se conservan las de antes para preguntas de seguimiento ("¿y cuánto sale?")
                fichas = list(dict.fromkeys(nuevas + self._anteriores))[:8]
                self._anteriores = fichas
                self._context.set_messages(con_fichas(self._context.get_messages(), fichas))
        await self.push_frame(frame, direction)


async def _armar(transport, llm, ctx: dict | None = None, herramientas: list | None = None):
    """Audio ⇄ modelo de voz, con el contexto de la charla (para la transcripción) y el corte de turnos.
    Con OpenAI los turnos los decide su servidor; con Gemini, el VAD local; en la cascada, el oído de OpenAI."""
    cascada = es_cascada()
    context = LLMContext(tools=ToolsSchema(standard_tools=herramientas)) if cascada and herramientas else LLMContext()
    params = LLMUserAggregatorParams() if proveedor() in ("openai", "elevenlabs") else LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context, realtime_service_mode=not cascada, user_params=params)
    if cascada:
        stt, tts = _oido_y_voz()
        etapas = [transport.input(), stt, FichasAutomaticas(context, (ctx or {}).get("catalogo", [])), user_aggregator, llm, tts, transport.output(), assistant_aggregator]
    else:
        etapas = [transport.input(), user_aggregator, llm, transport.output(), assistant_aggregator]
    worker = PipelineWorker(Pipeline(etapas), params=PipelineParams(enable_metrics=True))
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    return context, user_aggregator, assistant_aggregator, worker, runner


def _herramientas(lista: list) -> list:
    """En la cascada las fichas llegan solas: sin la herramienta de búsqueda no hay "ahí te busco"."""
    return [h for h in lista if h.name != "buscar_catalogo"] if es_cascada() else lista


def _buscador(ctx: dict):
    async def h_buscar(params: FunctionCallParams):
        await params.result_callback(conoflex.buscar_catalogo((params.arguments or {}).get("consulta", ""), ctx.get("catalogo", [])))

    return h_buscar


def _tope(context, worker, cortando: asyncio.Event, cortar, despedida: str):
    """Tope de duración (cuida el costo y la calidad: las sesiones muy largas se ponen lentas)."""

    async def tope():
        await asyncio.sleep(max(30.0, MAX_MINUTOS * 60 - 30))
        if cortando.is_set():
            return
        context.add_message({"role": "developer", "content": despedida})
        await worker.queue_frames([LLMRunFrame()])
        await asyncio.sleep(25)
        await cortar()

    return asyncio.create_task(tope())


async def run_bot(webrtc_connection, call, nombre_cliente: str | None, ctx: dict, http: aiohttp.ClientSession, api: WhatsAppApi):
    telefono = call.from_
    inicio = time.monotonic()
    datos_cliente = {"telefono": telefono, "nombre": nombre_cliente}
    cortando = asyncio.Event()

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True, audio_out_10ms_chunks=2),
    )

    herramientas = _herramientas(HERRAMIENTAS)
    llm = _crear_llm(ctx, herramientas)
    context, user_aggregator, assistant_aggregator, worker, runner = await _armar(transport, llm, ctx, herramientas)

    async def cortar(espera: float = 0):
        if cortando.is_set():
            return
        cortando.set()
        await asyncio.sleep(espera)  # deja terminar la despedida
        try:
            await api.terminate_call_to_whatsapp(call.id)
        except Exception as e:
            logger.warning(f"[voz] no se pudo cortar {call.id}: {e}")
        await runner.cancel()

    # ---- herramientas
    async def h_calcular(params: FunctionCallParams):
        await params.result_callback(conoflex.calcular_presupuesto(params.arguments.get("items"), ctx.get("precios", [])))

    async def h_enviar(params: FunctionCallParams):
        try:
            await conoflex.avisar(http, "enviar", {**datos_cliente, "texto": params.arguments.get("texto", "")})
            await params.result_callback({"ok": True})
        except Exception as e:
            logger.error(f"[voz] enviar_por_whatsapp: {e}")
            await params.result_callback({"ok": False, "error": "No se pudo mandar el mensaje; ofrecé que se lo manda alguien del equipo."})

    async def h_derivar(params: FunctionCallParams):
        try:
            await conoflex.avisar(http, "derivar", {**datos_cliente, "motivo": params.arguments.get("motivo", "")})
        except Exception as e:
            logger.error(f"[voz] derivar: {e}")
        await params.result_callback({"ok": True})

    async def h_cortar(params: FunctionCallParams):
        await params.result_callback({"ok": True})
        asyncio.create_task(cortar(espera=2.5))

    llm.register_function("calcular_presupuesto", h_calcular)
    llm.register_function("buscar_catalogo", _buscador(ctx))
    llm.register_function("enviar_por_whatsapp", h_enviar, timeout_secs=20)
    llm.register_function("derivar_a_persona", h_derivar, timeout_secs=20)
    llm.register_function("cortar_llamada", h_cortar)

    tarea_tope = _tope(context, worker, cortando, cortar, "Se termina el tiempo de la llamada: avisale que le seguimos por WhatsApp y despedite en una frase.")

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"[voz] llamada conectada {call.id} ({telefono})")
        context.add_message({"role": "developer", "content": f"Atendé: saludá breve, presentate como {ctx.get('nombre', 'Aldana')} de Conoflex y preguntá en qué podés ayudar."})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"[voz] llamada terminada {call.id}")
        await runner.cancel()

    try:
        await runner.run()
    finally:
        tarea_tope.cancel()
        duracion = round(time.monotonic() - inicio)
        try:
            await conoflex.avisar(http, "fin", {**datos_cliente, "duracion": duracion, "transcripcion": conoflex.transcripcion(context.get_messages())})
        except Exception as e:
            logger.error(f"[voz] no se pudo guardar la transcripción de {call.id}: {e}")


async def run_bot_web(connection, llamada_id: int, ctx: dict, http: aiohttp.ClientSession):
    """Llamada desde el navegador (app o link). Igual que la de WhatsApp, pero sin chat atrás:
    en vez de mandar cosas por escrito, toma los datos del cliente para que lo llame un vendedor.
    Además le va mandando al navegador lo que se dice, para mostrarlo como subtítulos."""
    inicio = time.monotonic()
    cortando = asyncio.Event()

    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True, audio_out_10ms_chunks=2),
    )
    herramientas = _herramientas(HERRAMIENTAS_WEB)
    llm = _crear_llm(ctx, herramientas)
    context, user_aggregator, assistant_aggregator, worker, runner = await _armar(transport, llm, ctx, herramientas)

    def al_navegador(**datos):
        try:
            connection.send_app_message({"type": "conoflex", **datos})
        except Exception as e:  # el navegador ya se fue
            logger.debug(f"[voz-web] {e}")

    async def cortar(espera: float = 0):
        if cortando.is_set():
            return
        cortando.set()
        await asyncio.sleep(espera)  # deja terminar la despedida
        al_navegador(evento="fin")
        await asyncio.sleep(0.3)  # que el aviso llegue antes de cerrar
        try:
            await connection.disconnect()
        except Exception as e:
            logger.debug(f"[voz-web] al cortar {llamada_id}: {e}")
        await runner.cancel()

    async def h_calcular(params: FunctionCallParams):
        await params.result_callback(conoflex.calcular_presupuesto(params.arguments.get("items"), ctx.get("precios", [])))

    async def h_contacto(params: FunctionCallParams):
        a = params.arguments or {}
        if not (str(a.get("telefono") or "").strip() or str(a.get("mail") or "").strip()):
            await params.result_callback({"ok": False, "error": "Falta un teléfono o un mail: pedíselo antes."})
            return
        try:
            await conoflex.avisar(http, "web-contacto", {**a, "llamada_id": llamada_id})
            await params.result_callback({"ok": True})
        except Exception as e:
            logger.error(f"[voz-web] dejar_contacto: {e}")
            await params.result_callback({"ok": False, "error": "No se pudo pasar; pedile que escriba a ventas por WhatsApp."})

    async def h_cortar(params: FunctionCallParams):
        await params.result_callback({"ok": True})
        asyncio.create_task(cortar(espera=2.5))

    llm.register_function("calcular_presupuesto", h_calcular)
    llm.register_function("buscar_catalogo", _buscador(ctx))
    llm.register_function("dejar_contacto", h_contacto, timeout_secs=20)
    llm.register_function("cortar_llamada", h_cortar)

    # ---- subtítulos en vivo
    @user_aggregator.event_handler("on_user_turn_message_added")
    async def on_user_text(aggregator, message):
        if getattr(message, "content", None):
            al_navegador(rol="cliente", texto=message.content)

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_bot_text(aggregator, message):
        texto = getattr(message, "content", None)
        if texto:
            al_navegador(rol="bot", texto=texto, interrumpida=bool(getattr(message, "interrupted", False)))

    tarea_tope = _tope(context, worker, cortando, cortar, "Se termina el tiempo de la llamada: si quiere seguir, ofrecé tomar sus datos para que lo llame un vendedor, y despedite en una frase.")

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"[voz-web] llamada {llamada_id} conectada")
        quien = ctx.get("quien")
        saludo = f"Atendé: saludá breve{f' a {quien}' if quien else ''}, presentate como {ctx.get('nombre', 'Aldana')} de Conoflex y preguntá en qué podés ayudar."
        context.add_message({"role": "developer", "content": saludo})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_app_message")
    async def on_app_message(transport, message, sender):
        if isinstance(message, dict) and message.get("type") == "conoflex" and message.get("evento") == "colgar":
            logger.info(f"[voz-web] llamada {llamada_id}: colgó el cliente")
            await runner.cancel()

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"[voz-web] llamada {llamada_id} terminada")
        await runner.cancel()

    try:
        await runner.run()
    finally:
        tarea_tope.cancel()
        try:
            await connection.disconnect()
        except Exception:
            pass
        try:
            await conoflex.avisar(
                http,
                "web-fin",
                {"llamada_id": llamada_id, "duracion": round(time.monotonic() - inicio), "transcripcion": conoflex.transcripcion(context.get_messages())},
            )
        except Exception as e:
            logger.error(f"[voz-web] no se pudo guardar la transcripción de {llamada_id}: {e}")
