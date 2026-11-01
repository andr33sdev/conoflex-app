import { useEffect, useState } from "react";
import { ArrowRightLeft, ChevronDown, Loader2, Undo2 } from "lucide-react";
import { api } from "../produccion/util";

const DEPS = [["33", "Depósito 33", "stock_33"], ["26", "Depósito 26", "stock_26"], ["ayolas", "Ayolas", "stock_ayolas"], ["37", "Depósito 37", "stock_37"]];
const n0 = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fecha = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
const campo = "w-full h-11 rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 text-base text-white outline-none";

/** Transferir entre depósitos y ver los movimientos del semielaborado (con su OP). */
export default function Movimientos({ item, alCambiar }) {
  const [form, setForm] = useState(false);
  const [desde, setDesde] = useState("26");
  const [hasta, setHasta] = useState("33");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [ver, setVer] = useState(false);
  const [lista, setLista] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ver) return;
    let vivo = true;
    api(`/api/semielaborados/${item.id}/movimientos`).then((d) => vivo && setLista(d)).catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, [ver, item.id, version]);

  const hay = Number(item[DEPS.find((d) => d[0] === desde)[2]]) || 0;

  const transferir = async () => {
    setOcupado(true);
    setError("");
    try {
      const r = await api("/api/semielaborados/transferir", { method: "POST", body: { semielaborado_id: item.id, desde, hasta, cantidad: Number(cantidad), nota } });
      setHecho(`Listo: pasaste ${n0(r.cantidad)} del ${desde === "ayolas" ? "depósito Ayolas" : `depósito ${desde}`} al ${hasta === "ayolas" ? "depósito Ayolas" : `depósito ${hasta}`}.`);
      setForm(false);
      setCantidad("");
      setNota("");
      setVersion((v) => v + 1);
      alCambiar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async (id) => {
    try {
      await api(`/api/semielaborados/transferencias/${id}`, { method: "DELETE" });
      setHecho("Transferencia deshecha.");
      setVersion((v) => v + 1);
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      {!form ? (
        <button onClick={() => { setForm(true); setHecho(""); }} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white font-semibold cursor-pointer">
          <ArrowRightLeft size={16} /> Transferir entre depósitos
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 p-4 space-y-3 bg-white/[0.02]">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-zinc-500 text-xs mb-1">Sale de</span>
              <select value={desde} onChange={(e) => { setDesde(e.target.value); if (e.target.value === hasta) setHasta(DEPS.find((d) => d[0] !== e.target.value)[0]); }} className={campo}>
                {DEPS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select></label>
            <label className="block"><span className="block text-zinc-500 text-xs mb-1">Entra a</span>
              <select value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo}>
                {DEPS.filter(([v]) => v !== desde).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select></label>
          </div>
          <label className="block"><span className="block text-zinc-500 text-xs mb-1">Cantidad <span className="text-zinc-600">(hay {n0(hay)} en el de origen)</span></span>
            <input type="number" inputMode="numeric" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={campo} autoFocus />
          </label>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Nota (opcional)" className={campo} />
          {error && <p className="text-rose-300 text-[13px]">{error}</p>}
          <div className="flex gap-2">
            <button onClick={transferir} disabled={ocupado || !(Number(cantidad) > 0)} className="min-h-[44px] px-5 rounded-lg bg-white text-black font-bold hover:bg-zinc-200 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer">
              {ocupado && <Loader2 size={15} className="animate-spin" />} Transferir
            </button>
            <button onClick={() => { setForm(false); setError(""); }} className="min-h-[44px] px-4 rounded-lg text-zinc-400 hover:text-white cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}
      {hecho && <p className="text-emerald-300 text-[13px]">{hecho}</p>}
      {!form && error && <p className="text-rose-300 text-[13px]">{error}</p>}

      <button onClick={() => setVer((v) => !v)} aria-expanded={ver} className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-400 hover:text-white cursor-pointer">
        <ChevronDown size={15} className={`transition-transform ${ver ? "rotate-180" : ""}`} /> Movimientos
      </button>
      {ver && (!lista ? <Loader2 size={16} className="animate-spin text-zinc-500" /> : lista.length === 0 ? <p className="text-zinc-500 text-[13px]">Todavía no hay movimientos.</p> : (
        <ul className="divide-y divide-white/[0.06]">
          {lista.map((m, i) => (
            <li key={`${m.clase}-${m.id || i}`} className={`py-2 flex items-start gap-3 ${m.anulada ? "opacity-45 line-through" : ""}`}>
              <span className="w-12 shrink-0 text-zinc-500 tabular-nums">{fecha(m.fecha)}</span>
              <span className="flex-1 min-w-0 text-zinc-300">{m.detalle}{m.op ? <span className="text-zinc-500"> · pedido {m.op}</span> : null}</span>
              <b className={`tabular-nums ${m.clase === "salida" ? "text-rose-300" : "text-white"}`}>{m.clase === "salida" ? "−" : ""}{n0(m.cantidad)}</b>
              {m.clase === "transferencia" && !m.anulada && <button onClick={() => deshacer(m.id)} aria-label="Deshacer transferencia" title="Deshacer" className="shrink-0 text-zinc-500 hover:text-white cursor-pointer"><Undo2 size={14} /></button>}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
