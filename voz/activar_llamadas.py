"""Activa (o desactiva) las llamadas de WhatsApp en el número de Conoflex y muestra cómo quedó.

Uso, desde la carpeta voz/:
    uv run python activar_llamadas.py            # activar
    uv run python activar_llamadas.py apagar     # desactivar (los clientes dejan de ver el botón de llamar)
    uv run python activar_llamadas.py ver        # solo mostrar la configuración
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
TOKEN = os.getenv("WHATSAPP_TOKEN", "")
PHONE_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
VERSION = os.getenv("WHATSAPP_API_VERSION", "v23.0")


def pedir(metodo: str, datos: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"https://graph.facebook.com/{VERSION}/{PHONE_ID}/settings",
        method=metodo,
        data=json.dumps(datos).encode() if datos else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


if __name__ == "__main__":
    if not TOKEN or not PHONE_ID:
        sys.exit("Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en backend/.env")
    accion = (sys.argv[1] if len(sys.argv) > 1 else "activar").lower()
    if accion in ("activar", "apagar"):
        estado = "ENABLED" if accion == "activar" else "DISABLED"
        print(json.dumps(pedir("POST", {"calling": {"status": estado, "call_icon_visibility": "DEFAULT"}}), indent=2, ensure_ascii=False))
    print(json.dumps(pedir("GET").get("calling", pedir("GET")), indent=2, ensure_ascii=False))
