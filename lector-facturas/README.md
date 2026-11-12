# Lector de facturas

Lee las facturas y notas de crédito en PDF que el sistema de facturación guarda en
`\\192.168.1.254\EqualRP2\Facturas_Conoplas` y `...\Facturas_Serenplas` y las sube a la app.
Con eso, el informe **Costo de lo vendido** (Métricas & KPI) usa siempre lo realmente facturado.

- Corre en la PC del trabajo (la que llega a esas carpetas por la VPN), con pm2, igual que el del reloj.
- Cada 5 minutos busca PDFs nuevos. Cada archivo se lee una sola vez (queda anotado en `procesados.json`).
- La primera vez lee todo desde la fecha `DESDE` (puede tardar un rato: son miles de archivos).
- No modifica nada en las carpetas: solo lee.

## Instalar (una vez)

1. Copiá esta carpeta `lector-facturas` a la PC (por ejemplo `C:\conoflex\lector-facturas`), o hacé `git pull` del repo.
2. Abrí una consola en esa carpeta e instalá:
   ```
   npm install
   ```
3. Copiá `.env.ejemplo` como `.env` y completá `FACTURAS_TOKEN` (el mismo texto que en el `.env` del backend).
4. Probá a mano (Ctrl+C para cortar):
   ```
   node index.js
   ```
   Tiene que decir "N comprobantes nuevos para leer" y después "Listo: N comprobantes subidos a la app".
5. Dejalo andando con pm2:
   ```
   pm2 start index.js --name lector-facturas
   pm2 save
   ```

## Del día a día

- Ver qué hace: `pm2 logs lector-facturas`
- Si un PDF no se pudo leer, queda en `procesados.json` con el error y se reintenta hasta 3 veces.
- Facturas y notas de crédito B: desde la versión 2 se lee su importe (viene con IVA y se le saca con el "Iva Contenido" del pie). Al actualizar, las B ya leídas se vuelven a leer solas una vez.
- Para volver a leer todo (por ejemplo, si cambia el formato de factura): borrá `procesados.json` y `pm2 restart lector-facturas`. No se duplica nada: la app reconoce cada comprobante por su número.
