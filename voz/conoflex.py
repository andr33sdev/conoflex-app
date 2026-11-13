"""Comunicación con el backend de la app (el mismo servidor, puerto 3001) y cálculos puros."""

import os
import re

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


def _sin_tildes(t: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(c) != "Mn")


_VACIAS = {"de", "del", "la", "el", "los", "las", "un", "una", "unos", "para", "con", "y", "o", "en", "que", "cm", "centimetros", "centimetro", "por", "me", "quiero", "tenes", "tienen", "hay", "algo"}


def buscar_catalogo(consulta: str, catalogo: list, maximo: int = 8) -> dict:
    """Fichas del catálogo que mejor coinciden con lo que pidió el cliente (palabras y medidas)."""
    palabras = [w for w in re.findall(r"[a-z0-9]+", _sin_tildes(consulta)) if w not in _VACIAS]
    if not palabras:
        return {"resultados": [], "nota": "Decí qué producto o medida buscás."}
    puntajes = []
    for i, item in enumerate(catalogo or []):
        texto = _sin_tildes(item.get("texto", ""))
        codigo = _sin_tildes(item.get("codigo", ""))
        tokens = set(re.findall(r"[a-z0-9]+", texto))
        puntos = 0
        for w in palabras:
            if w.isdigit():
                # una medida tiene que aparecer como número entero ("120" no matchea "1200")
                if re.search(rf"(?<![\d.,]){w}\s*(cm|kg|mm)\b", texto) or w in codigo.split():
                    puntos += 3
                elif w in tokens:
                    puntos += 1
            elif w in tokens or any(t.startswith(w) and len(w) >= 4 for t in tokens):
                puntos += 2 if w in codigo else 1
        if puntos:
            puntajes.append((-puntos, i))
    puntajes.sort()
    resultados = [catalogo[i]["texto"] for _, i in puntajes[:maximo]]
    return {"resultados": resultados, "total_coincidencias": len(puntajes)} if resultados else {"resultados": [], "nota": "No figura en el catálogo: ofrecé que lo confirme un vendedor."}


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
