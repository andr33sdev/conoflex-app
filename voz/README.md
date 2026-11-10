# Servicio de voz (llamadas de WhatsApp)

Atiende las llamadas de WhatsApp con voz en tiempo real (Gemini Live). Es un proceso **aparte**
del backend: si se cae, el chat sigue funcionando.

```
Cliente llama por WhatsApp → Meta → backend (valida la firma) → este servicio (127.0.0.1:3002)
                                                 ↑ contexto: catálogo, precios, reglas
Audio: cliente ⇄ este servicio por UDP (puertos 40000-40100) ⇄ Gemini Live
Al cortar: la transcripción queda en WhatsApp → Conversaciones
```

## Variables (en `backend/.env`, el mismo archivo del backend)

| Variable | Qué es |
|---|---|
| `VOZ_SECRETO` | Texto al azar de 32+ caracteres. Lo comparten el backend y este servicio. |
| `VOZ_UDP_DESDE` / `VOZ_UDP_HASTA` | Rango UDP abierto en el firewall (por defecto 40000 / 40100). |
| `VOZ_ACTIVA` | `0` para no atender llamadas sin apagar nada (rechaza y el cliente ve "no atendió"). |
| `VOZ_MAX_MINUTOS` | Tope por llamada (por defecto 10). |
| `VOZ_VOZ` | Voz de Gemini (por defecto `Aoede`, femenina). |

Usa además `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `GEMINI_API_KEY`, que ya están.

## Instalar (una vez, en el VPS)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh     # instala uv (maneja Python solo)
source ~/.bashrc
cd conoflex-app/voz
uv sync                                              # instala todo (tarda unos minutos)
uv run python -m unittest test_voz                   # tiene que decir OK
pm2 start "uv run python server.py" --name conoflex-voz --cwd "$(pwd)"
pm2 save
uv run python activar_llamadas.py                    # activa el botón de llamar en el número
```

En Meta: **WhatsApp → Configuración → Webhook → Campos del webhook → suscribirse a `calls`**.

## Del día a día

- Ver qué pasa: `pm2 logs conoflex-voz`
- Después de un `git pull` con cambios en `voz/`: `pm2 restart conoflex-voz`
- Apagar las llamadas: `uv run python activar_llamadas.py apagar` (o `VOZ_ACTIVA=0` y reiniciar)
