import { useState } from "react";
import { Check, CheckSquare, Loader2, Search, Square } from "lucide-react";
import { Modal } from "../produccion/ui";
import { api } from "../produccion/util";
import { inputCls } from "./Piezas";

export default function NuevoPedido({ onCerrar, onCreado, toast }) {
  const [op, setOp] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [encontrada, setEncontrada] = useState(null);
  const [elegidos, setElegidos] = useState([]);

  const buscar = async (e) => {
    e.preventDefault();
    if (!op.trim()) return;
    setBuscando(true);
    setEncontrada(null);
    setElegidos([]);
    try {
      const d = await api(`/api/estado-pedidos/op/${encodeURIComponent(op.trim())}`);
      setEncontrada(d);
      setElegidos(d.articulos || []);
    } catch (err) {
      toast(err.status === 404 ? `No encontré la OP ${op.trim()} en el estado de pedidos.` : err.message, "error");
    } finally {
      setBuscando(false);
    }
  };

  const alternar = (art) => setElegidos((l) => (l.some((a) => a.id === art.id) ? l.filter((a) => a.id !== art.id) : [...l, art]));

  const crear = async () => {
    if (!encontrada || !elegidos.length) return;
    setCreando(true);
    try {
      await api("/api/pedidos", { method: "POST", body: { op: encontrada.op, cliente: encontrada.cliente, fecha: encontrada.fecha, articulosSeleccionados: elegidos } });
      onCreado(elegidos.length);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setCreando(false);
    }
  };

  const todos = encontrada && elegidos.length === (encontrada.articulos || []).length;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo pedido"
      subtitulo="Buscá la OP y elegí qué artículos entran a planta."
      ancho="max-w-xl"
      pie={encontrada && (
        <button type="button" onClick={crear} disabled={!elegidos.length || creando} className="w-full min-h-[56px] rounded-2xl bg-[#FFD60A] hover:bg-white text-black text-base font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all">
          {creando ? <Loader2 size={19} className="animate-spin" /> : <Check size={19} />} Ingresar {elegidos.length} {elegidos.length === 1 ? "pedido" : "pedidos"} a planta
        </button>
      )}
    >
      <form onSubmit={buscar} className="flex gap-2">
        <input required value={op} onChange={(e) => setOp(e.target.value)} inputMode="numeric" autoFocus placeholder="N° de OP (ej: 41163)" aria-label="Número de OP" className={`${inputCls} font-bold flex-1 min-w-0`} />
        <button type="submit" disabled={buscando} className="min-h-[52px] px-5 rounded-2xl bg-[#FF5A00] hover:bg-[#ff7a30] text-black font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
          {buscando ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}<span className="hidden min-[400px]:inline">Buscar</span>
        </button>
      </form>

      {encontrada && (
        <div className="mt-5">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">OP {encontrada.op} · cliente</p>
            <p className="mt-1 text-lg font-extrabold text-white uppercase leading-snug break-words">{encontrada.cliente}</p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 mb-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">Artículos (un pedido por cada uno)</p>
            <button type="button" onClick={() => setElegidos(todos ? [] : encontrada.articulos)} className="text-xs font-bold text-[#FFD60A] hover:text-white cursor-pointer">{todos ? "Quitar todos" : "Elegir todos"}</button>
          </div>
          <ul className="space-y-2">
            {(encontrada.articulos || []).map((art) => {
              const on = elegidos.some((a) => a.id === art.id);
              return (
                <li key={art.id}>
                  <button type="button" onClick={() => alternar(art)} aria-pressed={on} className={`w-full min-h-[64px] rounded-2xl border px-4 py-3 flex items-center gap-3 text-left cursor-pointer transition-colors ${on ? "border-[#FF5A00]/70 bg-[#FF5A00]/10" : "border-white/[0.08] bg-white/[0.025] hover:border-white/[0.18]"}`}>
                    {on ? <CheckSquare size={22} className="text-[#FF5A00] shrink-0" /> : <Square size={22} className="text-zinc-600 shrink-0" />}
                    <span className={`flex-1 min-w-0 text-[15px] font-bold uppercase leading-snug break-words ${on ? "text-white" : "text-zinc-400"}`}>{art.modelo}</span>
                    <span className="shrink-0 text-lg font-extrabold tabular-nums text-[#FFD60A]">{art.cantidad}<span className="text-xs font-bold text-zinc-500"> u.</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
