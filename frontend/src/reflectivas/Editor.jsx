// Alta y edición de un artículo: nombre, tildes y las variantes (semielaborados) que el administrador elige.
// Nada se agrupa solo: una variante entra al artículo únicamente si se la tilda acá.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Search, Trash2, X } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api } from "../produccion/util";
import { Pildora } from "./Tilde";

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAX_VISIBLES = 80;
const campo = "w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.09] px-3.5 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70 transition-colors";

function Seccion({ titulo, nota, children }) {
  return (
    <section>
      <h3 className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">{titulo}</h3>
      {nota && <p className="text-xs text-zinc-500 mt-0.5">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Cuerpo({ articulo, abierto, onCerrar, onGuardado, onEliminado, toast }) {
  const nuevo = !articulo;
  const [nombre, setNombre] = useState(articulo?.nombre || "");
  const [flags, setFlags] = useState({
    prograf: !!articulo?.prograf,
    china3m: !!articulo?.china3m,
    protector: !!articulo?.protector,
    aplic_completa: !!articulo?.aplic_completa,
    aplic_union: !!articulo?.aplic_union,
  });
  // Variantes elegidas: id → {id, codigo, nombre}
  const [elegidas, setElegidas] = useState(() => new Map((articulo?.variantes || []).map((v) => [v.id, v])));
  const [semis, setSemis] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [q, setQ] = useState("");
  const [intento, setIntento] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  useEffect(() => {
    let vivo = true;
    api("/api/reflectivas/semielaborados")
      .then((d) => vivo && setSemis(d))
      .catch((e) => vivo && setErrorCarga(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const resultados = useMemo(() => {
    if (!semis) return [];
    const t = norm(q).trim();
    if (!t) return [];
    return semis.filter((s) => norm(s.codigo).includes(t) || norm(s.nombre).includes(t));
  }, [semis, q]);

  // Disponibles = no están en OTRO artículo (las de este mismo artículo sí se pueden tildar/destildar).
  const libre = (s) => !s.articulo_id || (articulo && s.articulo_id === articulo.id);
  const disponibles = resultados.filter(libre);
  const sinElegir = disponibles.filter((s) => !elegidas.has(s.id));

  const alternar = (s) =>
    setElegidas((m) => {
      const n = new Map(m);
      if (n.has(s.id)) n.delete(s.id);
      else n.set(s.id, { id: s.id, codigo: s.codigo, nombre: s.nombre });
      return n;
    });
  const tildarTodos = () =>
    setElegidas((m) => {
      const n = new Map(m);
      for (const s of sinElegir) n.set(s.id, { id: s.id, codigo: s.codigo, nombre: s.nombre });
      return n;
    });
  const quitar = (id) =>
    setElegidas((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });

  const ponerFlag = (k, v) =>
    setFlags((f) => {
      const n = { ...f, [k]: v };
      if (k === "protector" && !v) {
        n.aplic_completa = false;
        n.aplic_union = false;
      }
      return n;
    });

  const errores = {};
  if (!nombre.trim()) errores.nombre = "Poné el nombre del artículo (por ejemplo: 2071 Econo).";
  if (elegidas.size === 0) errores.variantes = "Elegí al menos una variante.";

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setOcupado(true);
    try {
      const body = { nombre, variantes: [...elegidas.keys()], ...flags };
      const r = nuevo ? await api("/api/reflectivas/articulos", { method: "POST", body }) : await api(`/api/reflectivas/articulos/${articulo.id}`, { method: "PUT", body });
      toast(nuevo ? `"${r.articulo.nombre}" creado con ${r.articulo.variantes.length} variantes` : "Cambios guardados");
      onGuardado(r.articulo);
      onCerrar();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    try {
      await api(`/api/reflectivas/articulos/${articulo.id}`, { method: "DELETE" });
      toast(`"${articulo.nombre}" eliminado`);
      onEliminado(articulo.id);
      onCerrar();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };

  const lista = [...elegidas.values()].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={nuevo ? "Agregar artículo" : "Editar artículo"}
      subtitulo={nuevo ? "Elegí qué variantes incluye y qué lleva." : articulo.nombre}
      pie={
        <div className="flex items-center gap-3">
          {!nuevo && (
            <button type="button" onClick={() => setConfirmarBorrar((v) => !v)} aria-label="Eliminar artículo" className="w-12 h-12 shrink-0 grid place-items-center rounded-xl border border-white/[0.1] text-zinc-400 hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10 cursor-pointer">
              <Trash2 size={18} />
            </button>
          )}
          <button type="button" onClick={guardar} disabled={ocupado} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center justify-center gap-2 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer">
            {ocupado ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            {nuevo ? `Crear artículo${elegidas.size ? ` con ${elegidas.size} ${elegidas.size === 1 ? "variante" : "variantes"}` : ""}` : "Guardar cambios"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        <AnimatePresence initial={false}>
          {confirmarBorrar && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-sm text-rose-100">Se elimina el artículo <b>{articulo?.nombre}</b>. Los semielaborados no se borran: solo dejan de estar agrupados.</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={borrar} disabled={ocupado} className="min-h-[44px] px-4 rounded-xl bg-rose-500 text-white text-sm font-bold cursor-pointer disabled:opacity-50">Sí, eliminar</button>
                  <button onClick={() => setConfirmarBorrar(false)} className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-sm font-bold text-zinc-200 cursor-pointer">No</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Seccion titulo="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej: 2071 Econo" className={campo} autoFocus={nuevo} />
          {intento && errores.nombre && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.nombre}</p>}
        </Seccion>

        <Seccion titulo="Qué lleva" nota="Vale para todas las variantes del artículo.">
          <div className="grid gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#ff9a63] mb-2">Reflectiva</p>
              <div className="flex flex-wrap gap-2">
                <Pildora on={flags.prograf} tono="naranja" onChange={(v) => ponerFlag("prograf", v)}>Prograf</Pildora>
                <Pildora on={flags.china3m} tono="celeste" onChange={(v) => ponerFlag("china3m", v)}>China 3M</Pildora>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#FFD60A] mb-2">Protector</p>
              <Pildora on={flags.protector} tono="amarillo" onChange={(v) => ponerFlag("protector", v)}>Orajet</Pildora>
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-emerald-300 mb-2">Aplicación del protector</p>
              <div className="flex flex-wrap gap-2">
                <Pildora on={flags.aplic_completa} tono="verde" bloqueada={!flags.protector} onChange={(v) => ponerFlag("aplic_completa", v)}>Completa</Pildora>
                <Pildora on={flags.aplic_union} tono="verde" bloqueada={!flags.protector} onChange={(v) => ponerFlag("aplic_union", v)}>Unión / puntas</Pildora>
              </div>
              {!flags.protector && <p className="mt-1.5 text-xs text-zinc-600">Se habilita cuando el artículo lleva protector.</p>}
            </div>
          </div>
        </Seccion>

        <Seccion titulo={`Variantes incluidas (${elegidas.size})`} nota="Los semielaborados que cuentan como este artículo, por ejemplo 2071NA, 2071RO…">
          {lista.length === 0 ? (
            <p className={`rounded-2xl border border-dashed px-4 py-5 text-sm text-center ${intento && errores.variantes ? "border-rose-500/50 text-rose-300" : "border-white/[0.12] text-zinc-500"}`}>
              Todavía no elegiste ninguna. Buscá abajo y tildalas.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
              <AnimatePresence initial={false}>
                {lista.map((v) => (
                  <motion.li key={v.id} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.16 }}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] pl-3 pr-1 h-9 text-[13px] font-bold text-white font-mono" title={v.nombre}>
                      {v.codigo}
                      <button type="button" onClick={() => quitar(v.id)} aria-label={`Quitar ${v.codigo}`} className="w-7 h-7 grid place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.12] cursor-pointer"><X size={14} /></button>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <div className="mt-4">
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar semielaborado por código o nombre (ej: 2071)" aria-label="Buscar semielaborado" className={`${campo} pl-10`} />
            </div>

            {errorCarga ? (
              <p className="mt-3 text-sm text-rose-300 flex items-center gap-2"><AlertTriangle size={15} /> {errorCarga}</p>
            ) : !semis ? (
              <p className="mt-3 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="animate-spin" size={15} /> Cargando semielaborados…</p>
            ) : !q.trim() ? (
              <p className="mt-3 text-sm text-zinc-500">Escribí parte del código para ver las variantes disponibles.</p>
            ) : resultados.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No encontré semielaborados con “{q}”.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-zinc-500 flex-1 min-w-[140px]">{resultados.length} {resultados.length === 1 ? "resultado" : "resultados"}{resultados.length > MAX_VISIBLES ? ` · mostrando ${MAX_VISIBLES}` : ""}</p>
                  {sinElegir.length > 0 && (
                    <button type="button" onClick={tildarTodos} className="min-h-[40px] px-4 rounded-full bg-[#FF5A00]/15 border border-[#FF5A00]/40 text-[13px] font-bold text-[#ff9a63] hover:bg-[#FF5A00]/25 cursor-pointer">
                      Tildar los {sinElegir.length} disponibles
                    </button>
                  )}
                </div>
                <ul className="mt-2 flex flex-col gap-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                  {resultados.slice(0, MAX_VISIBLES).map((s) => {
                    const on = elegidas.has(s.id);
                    const ocupada = !libre(s);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={ocupada}
                          onClick={() => alternar(s)}
                          role="checkbox"
                          aria-checked={on}
                          className={`w-full min-h-[52px] rounded-xl border px-3 flex items-center gap-3 text-left transition-colors ${ocupada ? "border-white/[0.05] bg-white/[0.02] opacity-50 cursor-not-allowed" : on ? "border-[#FF5A00]/50 bg-[#FF5A00]/10 cursor-pointer" : "border-white/[0.08] bg-[#131317] hover:border-white/25 cursor-pointer"}`}
                        >
                          <span className={`w-6 h-6 shrink-0 rounded-lg border-2 grid place-items-center ${on ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "border-white/[0.18] text-transparent"}`}><Check size={14} strokeWidth={3.5} /></span>
                          <span className="font-mono text-[13px] font-bold text-white shrink-0">{s.codigo}</span>
                          <span className="min-w-0 flex-1 text-sm text-zinc-400 truncate">{s.nombre}</span>
                          {ocupada && <span className="shrink-0 text-[11px] font-bold text-zinc-400 border border-white/[0.12] rounded-full px-2 py-0.5 max-w-[130px] truncate">En {s.articulo_nombre}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          {intento && errores.variantes && lista.length === 0 && <p className="mt-2 text-sm font-semibold text-rose-300">{errores.variantes}</p>}
        </Seccion>
      </div>
    </Drawer>
  );
}

/** Se vuelve a montar cada vez que se abre (key), así el formulario siempre arranca limpio. */
export default function Editor(props) {
  return <Cuerpo key={props.clave} {...props} />;
}
