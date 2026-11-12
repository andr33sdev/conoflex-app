// El producto en la app: ítems creados o vinculados (con su receta y costo), ventas reales y datos del proyecto.
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Link2, Loader2, Plus, Search, TrendingUp, Unlink } from "lucide-react";
import { api } from "../produccion/util";
import { ORIGENES, botonPrimario, botonSecundario, campo, etiqueta, fechaCorta, plata, usd } from "./formato";

function Agregar({ p, accion }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [crear, setCrear] = useState(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return undefined;
    const t = setTimeout(() => {
      setBuscando(true);
      api(`/api/desarrollo/buscar-items?q=${encodeURIComponent(q.trim())}`)
        .then(setRes)
        .catch(() => setRes([]))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const vincular = (x) => accion(() => api(`/api/desarrollo/proyectos/${p.id}/items`, { method: "POST", body: { tipo: x.tipo, codigo: x.codigo } }), `${x.codigo} vinculado.`).then((ok) => ok && setQ(""));
  const crearItem = async (e) => {
    e.preventDefault();
    if (await accion(() => api(`/api/desarrollo/proyectos/${p.id}/items`, { method: "POST", body: { ...crear, crear: true } }), `${crear.codigo} creado en la app.`)) setCrear(null);
  };
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4">
      <p className="text-sm font-semibold text-white">Agregar producto o semielaborado</p>
      <p className="text-xs text-zinc-500 mt-0.5">Buscá uno que ya exista o crealo acá: queda dado de alta en la app para cargarle la receta en Ingeniería.</p>
      {!crear ? (
        <>
          <label className="relative block mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o nombre" aria-label="Buscar ítem" className={`${campo} pl-9`} />
            {buscando && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
          </label>
          {q.trim().length >= 2 && res.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800">
              {res.map((x) => (
                <li key={`${x.tipo}${x.id}`}>
                  <button onClick={() => vincular(x)} className="w-full text-left px-3 py-2 hover:bg-zinc-900 flex items-center gap-2 cursor-pointer">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{x.tipo === "PT" ? "PT" : "SEMI"}</span>
                    <span className="flex-1 min-w-0 truncate text-sm text-white">{x.codigo} <span className="text-zinc-500">· {x.nombre}</span></span>
                    <Link2 size={14} className="text-zinc-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2 flex-wrap">
            <button onClick={() => setCrear({ tipo: "PT", codigo: q.trim(), nombre: "" })} className={botonSecundario}><Plus size={15} /> Crear producto terminado</button>
            <button onClick={() => setCrear({ tipo: "SE", codigo: q.trim(), nombre: "" })} className={botonSecundario}><Plus size={15} /> Crear semielaborado</button>
          </div>
        </>
      ) : (
        <form onSubmit={crearItem} className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-zinc-400">Nuevo {crear.tipo === "PT" ? "producto terminado" : "semielaborado"}</p>
          <div className="grid sm:grid-cols-[180px_1fr] gap-3">
            <label className={etiqueta}>Código<input autoFocus required value={crear.codigo} onChange={(e) => setCrear((c) => ({ ...c, codigo: e.target.value }))} className={campo} /></label>
            <label className={etiqueta}>Nombre<input required value={crear.nombre} onChange={(e) => setCrear((c) => ({ ...c, nombre: e.target.value }))} placeholder={p.nombre} className={campo} /></label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={botonPrimario}>Crear en la app</button>
            <button type="button" onClick={() => setCrear(null)} className={botonSecundario}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Ventas({ v, p }) {
  if (!v) return null;
  const max = Math.max(1, ...v.meses.map((m) => m.unidades));
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4" aria-label="Ventas">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-[#FF5A00]" />
        <h3 className="text-sm font-semibold text-white">Ventas reales{v.desde ? ` desde el lanzamiento (${fechaCorta(v.desde)})` : ""}</h3>
      </div>
      {v.meses.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{p.estado === "TERMINADO" ? "Todavía no hay facturas de este producto." : "Cuando se empiece a facturar, acá se ve cuánto se vende, mes a mes."}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/50 p-3"><p className="text-xs text-zinc-500">Unidades</p><p className="text-xl font-semibold text-white tabular-nums">{v.unidades.toLocaleString("es-AR")}</p></div>
            <div className="rounded-xl bg-black/50 p-3"><p className="text-xs text-zinc-500">Facturado sin IVA</p><p className="text-xl font-semibold text-white tabular-nums">{plata(v.neto)}</p></div>
          </div>
          <ol className="mt-4 flex items-end gap-1.5 h-32" aria-label="Unidades por mes">
            {v.meses.slice(-12).map((m) => (
              <li key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.mes}: ${m.unidades} u. · ${plata(m.neto)}`}>
                <span className="text-[10px] text-zinc-400 tabular-nums">{m.unidades}</span>
                <div className="w-full rounded-t bg-[#FF5A00]/80" style={{ height: `${Math.max(4, (m.unidades / max) * 88)}px` }} />
                <span className="text-[10px] text-zinc-500">{m.mes.slice(5)}/{m.mes.slice(2, 4)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Datos({ p, accion, usuarios }) {
  const [f, setF] = useState({ nombre: p.nombre, cliente: p.cliente || "", punto_partida: p.punto_partida || "", origen: p.origen || "", fecha_objetivo: p.fecha_objetivo ? String(p.fecha_objetivo).slice(0, 10) : "", responsable_id: p.responsable_id || "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cambiado = f.nombre !== p.nombre || f.cliente !== (p.cliente || "") || f.punto_partida !== (p.punto_partida || "") || f.origen !== (p.origen || "") || f.fecha_objetivo !== (p.fecha_objetivo ? String(p.fecha_objetivo).slice(0, 10) : "") || String(f.responsable_id) !== String(p.responsable_id || "");
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4" aria-label="Datos del proyecto">
      <h3 className="text-sm font-semibold text-white">Datos del proyecto</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`${etiqueta} sm:col-span-2`}>Nombre<input value={f.nombre} onChange={set("nombre")} className={campo} /></label>
        <label className={etiqueta}>Lo pide<select value={f.origen} onChange={set("origen")} className={campo}><option value="">—</option>{Object.entries(ORIGENES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={etiqueta}>Cliente<input value={f.cliente} onChange={set("cliente")} className={campo} /></label>
        <label className={`${etiqueta} sm:col-span-2`}>De qué se parte<input value={f.punto_partida} onChange={set("punto_partida")} className={campo} /></label>
        <label className={etiqueta}>Responsable<select value={f.responsable_id} onChange={set("responsable_id")} className={campo}><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
        <label className={etiqueta}>Fecha objetivo<input type="date" value={f.fecha_objetivo} onChange={set("fecha_objetivo")} className={campo} /></label>
      </div>
      <label className="mt-4 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={p.listado_ventas} onChange={(e) => accion(() => api(`/api/desarrollo/proyectos/${p.id}`, { method: "PUT", body: { listado_ventas: e.target.checked } }), e.target.checked ? "Marcado como listado en ventas." : "Marcado como no listado en ventas.")} className="w-4 h-4 accent-[#FF5A00]" />
        <span className="text-sm text-zinc-200">Producto listado en ventas <span className="text-zinc-500">(ya está en la lista de precios)</span></span>
      </label>
      {cambiado && <button onClick={() => accion(() => api(`/api/desarrollo/proyectos/${p.id}`, { method: "PUT", body: { ...f, responsable_id: f.responsable_id ? Number(f.responsable_id) : null } }), "Datos guardados.")} className={`${botonPrimario} mt-4`}>Guardar cambios</button>}
    </section>
  );
}

export default function Producto({ p, accion, usuarios }) {
  const irIngenieria = () => {
    window.history.pushState({}, document.title, "/ingenieria");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 min-w-0">
        {p.items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {p.items.map((x) => (
              <li key={x.id} className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4">
                <div className="flex items-start gap-3">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 mt-0.5">{x.tipo === "PT" ? "PT" : "SEMI"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{x.codigo}</p>
                    <p className="text-xs text-zinc-500">{x.nombre}{x.creado ? " · creado desde este desarrollo" : ""}</p>
                  </div>
                  <button onClick={() => window.confirm(`¿Desvincular ${x.codigo}? Sigue existiendo en la app.`) && accion(() => api(`/api/desarrollo/items/${x.id}`, { method: "DELETE" }), "Desvinculado.")} aria-label="Desvincular" title="Desvincular" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 cursor-pointer"><Unlink size={14} /></button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-black/50 p-3">
                    <p className="text-xs text-zinc-500">Receta</p>
                    {x.tiene_receta ? <p className="mt-0.5 text-sm text-emerald-300 flex items-center gap-1"><CheckCircle2 size={14} /> Cargada</p> : <p className="mt-0.5 text-sm text-amber-300 flex items-center gap-1"><AlertTriangle size={14} /> Falta</p>}
                  </div>
                  <div className="rounded-xl bg-black/50 p-3">
                    <p className="text-xs text-zinc-500">Costo por receta</p>
                    <p className={`mt-0.5 text-sm font-semibold tabular-nums ${x.costo_completo ? "text-white" : "text-amber-300"}`}>{x.costo != null ? usd(x.costo) : "—"}{x.costo != null && !x.costo_completo && <span className="text-xs font-normal"> (parcial)</span>}</p>
                  </div>
                </div>
                {x.faltan?.length > 0 && <p className="mt-2 text-xs text-amber-300/90">{x.faltan.slice(0, 3).join(". ")}{x.faltan.length > 3 ? ` (y ${x.faltan.length - 3} más)` : ""}.</p>}
                <button onClick={irIngenieria} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#FF5A00] hover:underline cursor-pointer">{x.tiene_receta ? "Ver receta en Ingeniería" : "Cargar receta en Ingeniería"} <ArrowUpRight size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <Agregar p={p} accion={accion} />
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <Ventas v={p.ventas} p={p} />
        <Datos key={p.updated_at} p={p} accion={accion} usuarios={usuarios} />
      </div>
    </div>
  );
}
