"use strict";
// Connie pasó de ser una pestaña de "Métricas & KPI" a un módulo propio ("connie").
// Una sola vez (mientras ningún rol tenga el permiso "connie"), los roles que ya tenían
// "metricas" reciben también "connie" para no quitarle el acceso a nadie.

async function migrarPermisoConnie(db) {
  try {
    const [r] = await db.query("SELECT COUNT(*) AS n FROM permisos_roles WHERE modulo_id = 'connie'");
    if (Number(r[0].n) > 0) return 0;
    const [ins] = await db.query(
      "INSERT INTO permisos_roles (rol_nombre, modulo_id) SELECT DISTINCT rol_nombre, 'connie' FROM permisos_roles WHERE modulo_id IN ('metricas', '*') AND modulo_id <> 'connie'",
    );
    if (ins.affectedRows) console.log(`✔ Permiso "connie" asignado a ${ins.affectedRows} rol(es) que tenían "metricas".`);
    return ins.affectedRows || 0;
  } catch (e) {
    console.error("[permisos] no se pudo migrar el permiso de Connie:", e.message);
    return 0;
  }
}

module.exports = { migrarPermisoConnie };
