"""Servicio de voz de Conoflex: atiende las llamadas de WhatsApp y las que entran desde el navegador.

No está expuesto a internet: escucha en 127.0.0.1. El backend del chat recibe el aviso de Meta,
valida la firma y le reenvía acá solo los eventos de llamadas. Si este servicio se cae, el chat
sigue funcionando igual (las llamadas quedan sin atender).

Arranque (desde la carpeta voz/):  uv run python server.py
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from loguru import logger

# Usa el mismo .env que el backend (token de WhatsApp, clave de Gemini, etc.).
load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

import puertos  # noqa: E402

puertos.instalar()

from pipecat.transports.smallwebrtc.connection import IceServer, SmallWebRTCConnection  # noqa: E402
from pipecat.transports.whatsapp.api import WhatsAppApi, WhatsAppWebhookRequest  # noqa: E402
from pipecat.transports.whatsapp.client import WhatsAppClient  # noqa: E402

import conoflex  # noqa: E402
from bot import proveedor, run_bot, run_bot_web  # noqa: E402

TOKEN = os.getenv("WHATSAPP_TOKEN", "")
PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
SECRETO = os.getenv("VOZ_SECRETO", "")
PUERTO = int(os.getenv("VOZ_PUERTO", "3002"))
WEB_MAX = int(os.getenv("VOZ_WEB_MAX", "4"))  # llamadas desde el navegador al mismo tiempo
STUN = [u.strip() for u in os.getenv("VOZ_STUN", "stun:stun.l.google.com:19302").split(",") if u.strip()]

estado: dict = {}
llamadas: set[asyncio.Task] = set()
llamadas_web: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    faltan = [n for n, v in [("WHATSAPP_TOKEN", TOKEN), ("WHATSAPP_PHONE_NUMBER_ID", PHONE_ID), ("VOZ_SECRETO", SECRETO)] if not v]
    motor = proveedor()
    if motor == "openai" and not os.getenv("OPENAI_API_KEY"):
        faltan.append("OPENAI_API_KEY")
    elif motor == "vertex" and not (os.getenv("VOZ_VERTEX_PROYECTO") and (os.getenv("VOZ_VERTEX_CREDENCIALES") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))):
        faltan.append("VOZ_VERTEX_PROYECTO y VOZ_VERTEX_CREDENCIALES")
    elif motor == "gemini" and not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
        faltan.append("GEMINI_API_KEY")
    if faltan:
        raise RuntimeError(f"Faltan variables en el .env: {', '.join(faltan)}")
    async with aiohttp.ClientSession() as http:
        estado["http"] = http
        estado["api"] = WhatsAppApi(whatsapp_token=TOKEN, phone_number_id=PHONE_ID, session=http)
        estado["cliente"] = WhatsAppClient(whatsapp_token=TOKEN, phone_number_id=PHONE_ID, session=http)
        logger.info(f"Servicio de voz listo en 127.0.0.1:{PUERTO} (motor: {motor})")
        try:
            yield
        finally:
            await estado["cliente"].terminate_all_calls()


app = FastAPI(title="Conoflex voz", lifespan=lifespan)


@app.get("/salud")
async def salud():
    return {"ok": True, "llamadas_en_curso": len(llamadas), "llamadas_web": len(llamadas_web)}


def _llamadas_entrantes(body: WhatsAppWebhookRequest):
    """(llamada, nombre del cliente) de cada evento 'connect'."""
    for entry in body.entry:
        for change in entry.changes:
            contactos = {c.wa_id: c.profile.name for c in (getattr(change.value, "contacts", None) or [])}
            for call in getattr(change.value, "calls", None) or []:
                if call.event == "connect":
                    yield call, contactos.get(call.from_)


@app.post("/llamada")
async def llamada(request: Request):
    if not SECRETO or request.headers.get("x-voz-secreto") != SECRETO:
        raise HTTPException(status_code=403)
    try:
        body = WhatsAppWebhookRequest(**(await request.json()))
    except Exception as e:  # eventos de llamadas que no manejamos (por ejemplo, estados)
        logger.debug(f"[voz] evento ignorado: {e}")
        return {"ok": True, "ignorado": True}

    http, api, cliente = estado["http"], estado["api"], estado["cliente"]
    entrantes = list(_llamadas_entrantes(body))
    contextos: dict[str, dict] = {}
    for call, _nombre in entrantes:
        try:
            ctx = await conoflex.contexto(http, call.from_)
        except Exception as e:
            logger.error(f"[voz] sin contexto para {call.id}: {e}")
            ctx = None
        if not ctx or not ctx.get("atender"):
            logger.info(f"[voz] llamada {call.id} rechazada ({'bot apagado' if ctx else 'backend sin respuesta'})")
            try:
                await api.reject_call_to_whatsapp(call.id)
            except Exception as e:
                logger.warning(f"[voz] no se pudo rechazar {call.id}: {e}")
            continue
        contextos[call.id] = ctx
    nombres = {call.id: nombre for call, nombre in entrantes}

    if entrantes and not contextos:
        return {"ok": True}

    async def al_conectar(connection, call):
        ctx = contextos.get(call.id)
        if ctx is None:
            await connection.disconnect()
            return
        tarea = asyncio.create_task(run_bot(connection, call, nombres.get(call.id), ctx, http, api))
        llamadas.add(tarea)
        tarea.add_done_callback(llamadas.discard)

    try:
        await cliente.handle_webhook_request(body, al_conectar)
    except ValueError as e:
        logger.debug(f"[voz] {e}")
    except Exception as e:
        logger.error(f"[voz] error atendiendo: {e}")
        raise HTTPException(status_code=500)
    return {"ok": True}


@app.post("/web/oferta")
async def web_oferta(request: Request):
    """Llamada desde el navegador. El backend ya validó quién llama y manda lo que sabe la asistente."""
    if not SECRETO or request.headers.get("x-voz-secreto") != SECRETO:
        raise HTTPException(status_code=403)
    datos = await request.json()
    ctx, llamada_id = datos.get("ctx") or {}, datos.get("llamada_id")
    if not ctx.get("instrucciones") or datos.get("type") != "offer" or not datos.get("sdp"):
        raise HTTPException(status_code=400)
    if len(llamadas_web) >= WEB_MAX:
        raise HTTPException(status_code=429)

    conexion = SmallWebRTCConnection(ice_servers=[IceServer(urls=u) for u in STUN])
    try:
        await conexion.initialize(sdp=datos["sdp"], type="offer")
    except Exception as e:
        logger.error(f"[voz-web] oferta inválida: {e}")
        raise HTTPException(status_code=400)
    tarea = asyncio.create_task(run_bot_web(conexion, llamada_id, ctx, estado["http"]))
    llamadas_web.add(tarea)
    tarea.add_done_callback(llamadas_web.discard)
    return conexion.get_answer()


if __name__ == "__main__":
    # loop="asyncio": el control de puertos UDP (puertos.py) funciona sobre el loop estándar.
    uvicorn.run(app, host="127.0.0.1", port=PUERTO, loop="asyncio", log_config=None)
