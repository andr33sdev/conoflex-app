"use strict";
// Aviso de costos desactualizados: cuando se arma o se edita una solicitud de compra, si alguna materia prima
// pedida tiene el costo sin cambiar hace más de 60 días (o no tiene costo), se avisa a los administradores
// para que lo revisen. Una misma materia prima se avisa como mucho una vez por semana.

const DIAS_LIMITE = 60;
const DIAS_ENTRE_AVISOS = 7;
const ROLES = ["ADMIN"];

const diasEntre = (desde, hasta = new Date()) => Math.floor((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400000);

/** Qué materias primas hay que avisar. filas: [{ id, codigo, nombre, costo, ultimo, avisado_at }] */
function paraAvisar(filas, ahora = new Date()) {
  const out = [];
  for (const f of filas) {
    if (f.avisado_at && diasEntre(f.avisado_at, ahora) < DIAS_ENTRE_AVISOS) continue;
    if (f.costo == null || !f.ultimo) out.push({ id: f.id, codigo: f.codigo, nombre: f.nombre, dias: null });
    else {
      const d = diasEntre(f.ultimo, ahora);
      if (d > DIAS_LIMITE) out.push({ id: f.id, codigo: f.codigo, nombre: f.nombre, dias: d });
    }
  }
  return out.sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9));
}

function mensaje(lista, solicitudId) {
  const partes = lista.map((m) => `${m.codigo} (${m.dias == null ? "sin costo" : `hace ${m.dias} días`})`);
  return {
    titulo: `Revisar costos: ${lista.length} materia${lista.length === 1 ? "" : "s"} prima${lista.length === 1 ? "" : "s"} de la solicitud de compra #${solicitudId}`,
    texto: `Costo sin actualizar hace más de ${DIAS_LIMITE} días: ${partes.join(", ")}`.slice(0, 500),
  };
}

/** Revisa las materias primas de una solicitud y avisa si hace falta. Nunca rompe la solicitud: los errores se registran. */
async function avisarCostosViejos(db, solicitudId, { crearNotificacion, ahora = new Date() } = {}) {
  try {
    const [filas] = await db.query(
      `SELECT m.id, m.codigo, m.nombre, c.costo,
              COALESCE((SELECT MAX(h.created_at) FROM mp_costos_historial h WHERE h.materia_prima_id = m.id), c.updated_at) AS ultimo,
              a.avisado_at
         FROM (SELECT DISTINCT materia_prima_id FROM solicitudes_compra_items WHERE solicitud_id = ? AND materia_prima_id IS NOT NULL) i
         JOIN materias_primas m ON m.id = i.materia_prima_id
         LEFT JOIN mp_costos c ON c.materia_prima_id = m.id
         LEFT JOIN mp_costos_avisos a ON a.materia_prima_id = m.id`,
      [solicitudId],
    );
    const lista = paraAvisar(filas, ahora);
    if (!lista.length) return [];
    const { titulo, texto } = mensaje(lista, solicitudId);
    if (crearNotificacion) await crearNotificacion(db, { tipo: "COSTOS", titulo, texto, ruta: "costos", roles: ROLES, push: true });
    for (const m of lista) await db.query("INSERT INTO mp_costos_avisos (materia_prima_id, avisado_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE avisado_at = VALUES(avisado_at)", [m.id, ahora]);
    return lista;
  } catch (e) {
    console.error("[costos] no se pudo revisar la solicitud", solicitudId, e.message);
    return [];
  }
}

module.exports = { DIAS_LIMITE, paraAvisar, mensaje, avisarCostosViejos };
