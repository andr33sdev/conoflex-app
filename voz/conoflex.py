"""Comunicación con el backend de la app (el mismo servidor, puerto 3001) y cálculos puros."""

import os

import aiohttp

BACKEND = os.getenv("VOZ_BACKEND", f"http://127.0.0.1:{os.getenv('PORT', '3001')}")


def _headers() -> dict:
    return {"x-voz-secreto": os.getenv("VOZ_SECRETO", "")}


async def contexto(session: aiohttp.ClientSession, telefono: str) -> dict:
    async with session.get(
        f"{BACKEND}/api/public/voz/contexto", params={"telefono": telefono}, headers=_headers(), timeout=aiohttp.ClientTimeout(total=8)
    ) as r:
        r.raise_for_status()
        return await r.json()


async def avisar(session: aiohttp.ClientSession, ruta: str, datos: dict) -> dict:
    async with session.post(
        f"{BACKEND}/api/public/voz/{ruta}", json=datos, headers=_headers(), timeout=aiohttp.ClientTimeout(total=15)
    ) as r:
        r.raise_for_status()
        return await r.json()


def _norm(codigo) -> str:
    return " ".join(str(codigo or "").strip().upper().split())


def pesos(n: float) -> str:
    """$1.234,50 (formato argentino)."""
    entero, dec = f"{n:,.2f}".split(".")
    return f"${entero.replace(',', '.')},{dec}"


def calcular_presupuesto(items: list, precios: list) -> dict:
    """Cuenta exacta con precios de lista. Lo que no tiene precio único queda en 'sin_precio'."""
    por_codigo = {_norm(p["codigo"]): p for p in precios}
    lineas, sin_precio = [], []
    for it in (items or [])[:15]:
        codigo = _norm((it or {}).get("codigo"))
        try:
            cantidad = float((it or {}).get("cantidad"))
        except (TypeError, ValueError):
            cantidad = 0
        p = por_codigo.get(codigo)
        if not p or not (0 < cantidad <= 1_000_000):
            sin_precio.append(codigo or "?")
            continue
        subtotal = round(cantidad * float(p["unitario"]), 2)
        lineas.append(
            {"producto": p["nombre"], "cantidad": cantidad, "precio_unitario": pesos(p["unitario"]), "subtotal": pesos(subtotal), "_sub": subtotal}
        )
    total = round(sum(l.pop("_sub") for l in lineas), 2)
    return {"lineas": lineas, "total": pesos(total) if lineas else None, "sin_precio": sin_precio}


def transcripcion(mensajes: list) -> list:
    """Saca del contexto de la llamada solo lo que se dijo, en orden."""
    out = []
    for m in mensajes or []:
        rol = m.get("role") if isinstance(m, dict) else None
        if rol not in ("user", "assistant"):
            continue
        contenido = m.get("content")
        if isinstance(contenido, list):
            texto = " ".join(p.get("text", "") for p in contenido if isinstance(p, dict) and p.get("type") == "text")
        else:
            texto = str(contenido or "")
        texto = " ".join(texto.split())
        if not texto:
            continue
        r = "cliente" if rol == "user" else "bot"
        if out and out[-1]["rol"] == r:
            out[-1]["texto"] += " " + texto
        else:
            out.append({"rol": r, "texto": texto})
    return out
