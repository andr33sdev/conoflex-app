-- Mueve las fichadas cargadas a mano a un rango de rec_no que el reloj nunca usa (>= 4.000.000.000),
-- para que no pisen las fichadas reales del reloj ni cuenten como "último leído".
-- 1) Hacé un backup de `fichadas`.
-- 2) Corré primero la VISTA PREVIA y revisá que sean SOLO tus filas manuales.
-- 3) Después corré el UPDATE (ajustá el WHERE si hace falta).

-- VISTA PREVIA
SELECT id, rec_no, empleado_id, nombre, fecha_hora, tipo, metodo, creado_en
FROM fichadas
WHERE metodo = 'Manual' AND rec_no < 4000000000
ORDER BY id;

-- APLICAR
UPDATE fichadas
SET rec_no = 4000000000 + id
WHERE metodo = 'Manual' AND rec_no < 4000000000;
