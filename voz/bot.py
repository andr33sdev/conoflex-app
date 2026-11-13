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
from pipecat.frames.frames import LLMRunFrame
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
]


def proveedor() -> str:
    """Motor de voz: "gemini" (Gemini Live, clave de AI Studio), "vertex" (Gemini Live por Google Cloud)
    u "openai" (OpenAI Realtime, el de ChatGPT voz). Se elige con VOZ_PROVEEDOR."""
    p = (os.getenv("VOZ_PROVEEDOR") or "gemini").strip().lower()
    return p if p in ("gemini", "vertex", "openai") else "gemini"


def _crear_llm(ctx: dict, herramientas: list):
    p = proveedor()
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
                            turn_detection=oa.SemanticTurnDetection(eagerness="high"),
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


async def _armar(transport, llm):
    """Audio ⇄ modelo de voz, con el contexto de la charla (para la transcripción) y el corte de turnos.
    Con OpenAI los turnos los decide su servidor (VAD semántico); con Gemini, el VAD local."""
    context = LLMContext()
    params = LLMUserAggregatorParams() if proveedor() == "openai" else LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context, realtime_service_mode=True, user_params=params)
    pipeline = Pipeline([transport.input(), user_aggregator, llm, transport.output(), assistant_aggregator])
    worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True))
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    return context, user_aggregator, assistant_aggregator, worker, runner


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

    llm = _crear_llm(ctx, HERRAMIENTAS)
    context, user_aggregator, assistant_aggregator, worker, runner = await _armar(transport, llm)

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
    llm = _crear_llm(ctx, HERRAMIENTAS_WEB)
    context, user_aggregator, assistant_aggregator, worker, runner = await _armar(transport, llm)

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
