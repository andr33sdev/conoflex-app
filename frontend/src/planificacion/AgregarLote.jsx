import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Hand, Loader2, Search, Sparkles } from "lucide-react";
import { Boton, Chip, Etiqueta, Modal, Vacio } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api, num } from "../produccion/util";

const URGENCIA = {
  CRITICA: { tono: "rojo", texto: "Crítico", borde: "border-l-rose-500" },
  ALTA: { tono: "amarillo", texto: "Atención", borde: "border-l-[#FFD60A]" },
  NORMAL: { tono: "gris", texto: "Normal", borde: "border-l-zinc-600" },
};

function ChipMaterial({ m }) {
  if (m.estado === "ALCANZA") return <Chip tono="verde" icono={CheckCircle2}>Material alcanza</Chip>;
  if (m.estado === "INSUFICIENTE")
    return (
      <Chip tono="amarillo" icono={AlertTriangle}>
        Material para {num(m.producible)} · limita {m.limita?.nombre}
      </Chip>
    );
  return <Chip tono="gris">Sin receta activa</Chip>;
}

function Sugerida({ s, semana, onAgregado, toast }) {
  const [cant, setCant] = useState(String(s.cantidad_sugerida));
  const [ocupado, setOcupado] = useState(false);
  const u = URGENCIA[s.urgencia];
  const agregar = async () => {
    setOcupado(true);
    try {
      const r = await api("/api/prod/plan/items", { method: "POST", body: { semana, semielaborado_id: s.semielaborado_id, cantidad: Number(cant), origen: "SUGERIDO" } });
      toast(`${r.lote} agregado a la lista`);
      onAgregado();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }} className={`rounded-2xl border border-white/[0.07] border-l-4 ${u.borde} bg-[#131317] p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tono={u.tono}>{u.texto}</Chip>
        <ChipMaterial m={s.material} />
      </div>
      <p className="mt-2 text-[15px] font-bold text-white leading-snug">{s.nombre}</p>
      <p className="text-xs text-zinc-500">{s.codigo}</p>
      <p className="mt-2 text-[13px] text-zinc-400 leading-relaxed">
        Stock <b className="text-zinc-200 tabular-nums">{num(s.stock_total)}</b> · se vende <b className="text-zinc-200 tabular-nums">{num(s.demanda_mensual)}</b>/mes · alcanza para <b className={`tabular-nums ${s.urgencia === "CRITICA" ? "text-rose-300" : "text-zinc-200"}`}>{s.dias_de_stock != null ? num(s.dias_de_stock, 0) : "—"}</b> días
        {s.ya_planificado > 0 && <> · ya en lista: <b className="text-zinc-200 tabular-nums">{num(s.ya_planificado)}</b></>}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1 max-w-[180px]">
          <Etiqueta>Cantidad a producir</Etiqueta>
          <input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} className={campo} />
        </div>
        <Boton variante="primario" onClick={agregar} disabled={ocupado || !(Number(cant) > 0)} icono={ocupado ? Loader2 : undefined}>Agregar</Boton>
      </div>
    </motion.li>
  );
}

function Sugerencias({ semana, onCambio, toast }) {
  const [cobertura, setCobertura] = useState(30);
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const clave = `${semana}|${cobertura}|${version}`;

  useEffect(() => {
    let vivo = true;
    api(`/api/prod/sugerencias?semana=${semana}&cobertura=${cobertura}`)
      .then((d) => vivo && (setDato({ ...d, clave }), setError("")))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [semana, cobertura, version, clave]);

  const cargando = !error && (!dato || dato.clave !== clave);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-zinc-400">Dejar cubiertos</span>
        {[15, 30, 45, 60].map((d) => (
          <button key={d} onClick={() => setCobertura(d)} className={`min-h-[36px] px-3 rounded-full text-sm font-bold border transition-colors cursor-pointer ${cobertura === d ? "bg-[#FF5A00] text-black border-[#FF5A00]" : "bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:bg-white/[0.09]"}`}>
            {d} días
          </button>
        ))}
      </div>
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : cargando ? (
        <div className="flex items-center justify-center gap-3 py-14 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Calculando según ventas y stock…</div>
      ) : dato.sugerencias.length === 0 ? (
        <Vacio icono={CheckCircle2} titulo="No hay nada urgente por producir" texto={`Con el stock actual y las ventas recientes, los semielaborados quedan cubiertos por ${cobertura} días o ya están en la lista de esta semana.`} />
      ) : (
        <>
          <p className="text-xs text-zinc-500 mb-3">Ordenado por urgencia. Basado en {dato.periodo.split(",")[0]}.</p>
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {dato.sugerencias.map((s) => (
                <Sugerida key={s.semielaborado_id} s={s} semana={semana} toast={toast} onAgregado={() => { onCambio(); setVersion((v) => v + 1); }} />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </div>
  );
}

function ALaMano({ semana, onCambio, toast }) {
  const [catalogo, setCatalogo] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [cant, setCant] = useState("");
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    api("/api/prod/catalogo").then((d) => vivo && setCatalogo(d)).catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = useMemo(() => {
    if (!catalogo) return [];
    const t = norm(q);
    return catalogo.filter((c) => !t || norm(c.nombre).includes(t) || norm(c.codigo).includes(t)).slice(0, 40);
  }, [catalogo, q]);

  const agregar = async () => {
    setOcupado(true);
    try {
      const r = await api("/api/prod/plan/items", { method: "POST", body: { semana, semielaborado_id: sel.id, cantidad: Number(cant), notas, origen: "MANUAL" } });
      toast(`${r.lote} agregado a la lista`);
      setSel(null); setCant(""); setNotas("");
      onCambio();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };

  if (error) return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>;
  if (!catalogo) return <div className="flex items-center justify-center gap-3 py-14 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Cargando productos…</div>;

  return (
    <div>
      {!sel ? (
        <>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá el semielaborado por nombre o código…" className={`${campo} pl-10`} autoFocus />
          </div>
          {lista.length === 0 ? (
            <Vacio icono={Search} titulo="No encontré ese producto" texto="Revisá el nombre o el código." />
          ) : (
            <ul className="flex flex-col gap-2">
              {lista.map((c) => (
                <li key={c.id}>
                  <button onClick={() => { setSel(c); setCant(""); }} className="w-full text-left rounded-xl border border-white/[0.07] bg-[#131317] hover:border-[#FF5A00]/50 hover:bg-[#17171c] px-4 py-3 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{c.nombre}</span>
                      {!c.tiene_receta && <Chip tono="gris">Sin receta activa</Chip>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{c.codigo} · stock {num(c.stock_total)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-[#131317] p-5">
          <p className="text-[15px] font-bold text-white">{sel.nombre}</p>
          <p className="text-xs text-zinc-500">{sel.codigo} · stock {num(sel.stock_total)}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Etiqueta>Cantidad en la semana</Etiqueta>
              <input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} className={campo} autoFocus />
            </div>
            <div className="sm:col-span-2">
              <Etiqueta>Nota (opcional)</Etiqueta>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} placeholder="Ej: pedido urgente de un cliente" className={campo} />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Boton variante="primario" onClick={agregar} disabled={ocupado || !(Number(cant) > 0)}>Agregar a la lista</Boton>
            <Boton variante="fantasma" onClick={() => setSel(null)}>Elegir otro</Boton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgregarLote({ abierto, onCerrar, semana, onCambio, toast }) {
  const [tab, setTab] = useState("sugerencias");
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar a la lista de la semana" subtitulo="Cada renglón recibe un número de lote automático." ancho="max-w-3xl">
      <div role="tablist" className="inline-flex p-1 rounded-xl bg-white/[0.05] border border-white/[0.07] mb-5">
        {[{ id: "sugerencias", t: "Sugerencias", i: Sparkles }, { id: "mano", t: "A mano", i: Hand }].map(({ id, t, i: I }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 min-h-[38px] px-4 rounded-lg text-sm font-bold transition-colors cursor-pointer ${tab === id ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}>
            <I size={15} /> {t}
          </button>
        ))}
      </div>
      {tab === "sugerencias" ? <Sugerencias semana={semana} onCambio={onCambio} toast={toast} /> : <ALaMano semana={semana} onCambio={onCambio} toast={toast} />}
    </Modal>
  );
}
