"""La voz de las llamadas viaja por UDP en puertos al azar. El firewall del VPS solo deja pasar
un rango (VOZ_UDP_DESDE–VOZ_UDP_HASTA), así que acá se obliga a usar puertos de ese rango.

Afecta solo a este proceso (el servicio de voz), nunca al backend del chat.
"""

import asyncio
import os
import random

from loguru import logger

_original = asyncio.BaseEventLoop.create_datagram_endpoint


def rango() -> tuple[int, int] | None:
    try:
        desde = int(os.getenv("VOZ_UDP_DESDE", "40000"))
        hasta = int(os.getenv("VOZ_UDP_HASTA", "40100"))
    except ValueError:
        return None
    if not (1024 <= desde <= hasta <= 65535):
        return None
    return desde, hasta


async def _en_rango(self, protocol_factory, local_addr=None, remote_addr=None, **kwargs):
    r = rango()
    if r is None or local_addr is None or local_addr[1] != 0 or kwargs.get("sock") is not None:
        return await _original(self, protocol_factory, local_addr=local_addr, remote_addr=remote_addr, **kwargs)
    puertos = list(range(r[0], r[1] + 1))
    random.shuffle(puertos)
    ultimo_error: OSError | None = None
    for puerto in puertos:
        try:
            return await _original(
                self, protocol_factory, local_addr=(local_addr[0], puerto), remote_addr=remote_addr, **kwargs
            )
        except OSError as e:  # puerto ocupado o dirección no disponible
            ultimo_error = e
    logger.error(f"No quedan puertos UDP libres en {r[0]}-{r[1]} para {local_addr[0]}")
    raise ultimo_error or OSError("sin puertos UDP libres")


def instalar() -> None:
    asyncio.BaseEventLoop.create_datagram_endpoint = _en_rango
    r = rango()
    logger.info(f"Voz por UDP en puertos {r[0]}-{r[1]}" if r else "Rango UDP inválido: se usan puertos al azar")
