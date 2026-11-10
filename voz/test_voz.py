"""Tests de lo que no necesita llamada real.  Correr con:  uv run python -m unittest -v"""

import asyncio
import os
import socket
import unittest

import conoflex
import puertos

PRECIOS = [{"codigo": "1025", "nombre": "Cono 75 cm", "unitario": 10000.5}]


class Presupuesto(unittest.TestCase):
    def test_cuenta_exacta(self):
        r = conoflex.calcular_presupuesto([{"codigo": "1025", "cantidad": 20}], PRECIOS)
        self.assertEqual(r["total"], "$200.010,00")
        self.assertEqual(r["lineas"][0]["precio_unitario"], "$10.000,50")
        self.assertEqual(r["sin_precio"], [])

    def test_sin_precio_o_cantidad_invalida(self):
        r = conoflex.calcular_presupuesto([{"codigo": "9999", "cantidad": 1}, {"codigo": "1025", "cantidad": -3}, {"codigo": "1025", "cantidad": "x"}], PRECIOS)
        self.assertIsNone(r["total"])
        self.assertEqual(len(r["sin_precio"]), 3)
        self.assertIsNone(conoflex.calcular_presupuesto(None, PRECIOS)["total"])

    def test_codigo_con_espacios_y_minusculas(self):
        self.assertEqual(conoflex.calcular_presupuesto([{"codigo": " 1025 ", "cantidad": 1}], PRECIOS)["total"], "$10.000,50")


class Transcripcion(unittest.TestCase):
    def test_orden_roles_y_union(self):
        t = conoflex.transcripcion(
            [
                {"role": "developer", "content": "Atendé"},
                {"role": "user", "content": "hola"},
                {"role": "user", "content": [{"type": "text", "text": "precio"}]},
                {"role": "assistant", "content": "¡Hola!"},
                {"role": "assistant", "content": "  "},
                {"role": "tool", "content": "{}"},
            ]
        )
        self.assertEqual(t, [{"rol": "cliente", "texto": "hola precio"}, {"rol": "bot", "texto": "¡Hola!"}])


class Puertos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        puertos.instalar()

    def test_usa_el_rango(self):
        os.environ["VOZ_UDP_DESDE"], os.environ["VOZ_UDP_HASTA"] = "45000", "45005"

        async def abrir():
            loop = asyncio.get_running_loop()
            t, _ = await loop.create_datagram_endpoint(asyncio.DatagramProtocol, local_addr=("127.0.0.1", 0))
            p = t.get_extra_info("sockname")[1]
            t.close()
            return p

        self.assertTrue(45000 <= asyncio.run(abrir()) <= 45005)

    def test_rango_lleno_falla(self):
        os.environ["VOZ_UDP_DESDE"], os.environ["VOZ_UDP_HASTA"] = "45010", "45010"
        ocupado = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        ocupado.bind(("127.0.0.1", 45010))
        try:

            async def abrir():
                loop = asyncio.get_running_loop()
                await loop.create_datagram_endpoint(asyncio.DatagramProtocol, local_addr=("127.0.0.1", 0))

            with self.assertRaises(OSError):
                asyncio.run(abrir())
        finally:
            ocupado.close()


if __name__ == "__main__":
    unittest.main()
