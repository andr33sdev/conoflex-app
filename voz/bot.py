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


async def run_bot(webrtc_connection, call, nombre_cliente: str | None, ctx: dict, http: aiohttp.ClientSession, api: WhatsAppApi):
    telefono = call.from_
    inicio = time.monotonic()
    datos_cliente = {"telefono": telefono, "nombre": nombre_cliente}
    cortando = asyncio.Event()

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True, audio_out_10ms_chunks=2),
    )

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        tools=HERRAMIENTAS,
        settings=GeminiLiveLLMService.Settings(
            voice=os.getenv("VOZ_VOZ", "Aoede"),  # voz femenina
            language=Language.ES_US,  # código que Gemini Live acepta; el acento rioplatense lo da la instrucción
            system_instruction=ctx["instrucciones"],
            **({"model": os.getenv("VOZ_MODELO")} if os.getenv("VOZ_MODELO") else {}),
        ),
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context, realtime_service_mode=True, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    )
    pipeline = Pipeline([transport.input(), user_aggregator, llm, transport.output(), assistant_aggregator])
    worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True))
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

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

    # ---- tope de duración (cuida el costo y la calidad: las sesiones muy largas se ponen lentas)
    async def tope():
        await asyncio.sleep(max(30.0, MAX_MINUTOS * 60 - 30))
        if cortando.is_set():
            return
        context.add_message({"role": "developer", "content": "Se termina el tiempo de la llamada: avisale que le seguimos por WhatsApp y despedite en una frase."})
        await worker.queue_frames([LLMRunFrame()])
        await asyncio.sleep(25)
        await cortar()

    tarea_tope = asyncio.create_task(tope())

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
