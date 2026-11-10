// Actualizar materias primas con el Excel del sistema de gestión (solo administradores).
// Las que ya están se dejan como están, las nuevas entran con stock 0 y las que no figuran en el Excel
// se eliminan, pero solo las que el admin deja marcadas (las que se usan en recetas vienen desmarcadas).
import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "../produccion/util";
import { Drawer } from "../produccion/ui";
import { abrev, nf } from "./util";

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Busca en el Excel la hoja y la fila de títulos que tengan la columna de código. */
async function leerExcel(archivo) {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  for (const nombre of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: "" });
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const titulos = filas[i].map(sinAcentos);
      const col = (re) => titulos.findIndex((t) => re.test(t));
      const cCodigo = col(/^(nro\.? ?articulo|codigo|cod\.?|articulo)$/);
      if (cCodigo < 0) continue;
      const cNombre = col(/descrip|nombre/);
      const cUnidad = col(/^unidad/);
      return filas
        .slice(i + 1)
        .map((f) => ({ codigo: String(f[cCodigo] ?? "").trim(), nombre: cNombre >= 0 ? String(f[cNombre] ?? "").trim() : "", unidad: cUnidad >= 0 ? String(f[cUnidad] ?? "").trim() : "" }))
        .filter((f) => f.codigo);
    }
  }
  throw new Error("No encontré la columna de código en el Excel (por ejemplo «Nro Articulo» o «Código»).");
}

function Grupo({ titulo, icono: Icono, color, cantidad, children, abierto: abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03]">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="w-full min-h-[52px] px-4 flex items-center gap-3 text-left cursor-pointer">
        <Icono size={17} style={{ color }} />
        <span className="flex-1 font-extrabold text-white">{titulo}</span>
        <span className="text-sm font-bold text-zinc-400">{nf(cantidad, 0)}</span>
      </button>
      {abierto && cantidad > 0 && <div className="px-3 pb-3 flex flex-col gap-1.5 max-h-80 overflow-y-auto custom-scrollbar">{children}</div>}
    </section>
  );
}

export default function SincronizarExcel({ toast, onListo }) {
  const input = useRef(null);
  const [leyendo, setLeyendo] = useState(false);
  const [filas, setFilas] = useState(null);
  const [plan, setPlan] = useState(null);
  const [borrar, setBorrar] = useState(new Set());
  const [aplicando, setAplicando] = useState(false);

  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setLeyendo(true);
    try {
      const f = await leerExcel(archivo);
      const p = await api("/api/materias-primas/excel/previsualizar", { method: "POST", body: { filas: f } });
      setFilas(f);
      setPlan(p);
      // Marcadas para borrar: las que no figuran en el Excel y no se usan en ninguna receta.
      setBorrar(new Set(p.eliminar.filter((m) => !m.recetas.length).map((m) => m.id)));
    } catch (err) {
      toast(err.message || "No pude leer el Excel.", "error");
    } finally {
      setLeyendo(false);
    }
  };

  const cerrar = () => {
    if (aplicando) return;
    setPlan(null);
    setFilas(null);
  };

  const aplicar = async () => {
    setAplicando(true);
    try {
      const r = await api("/api/materias-primas/excel/aplicar", { method: "POST", body: { filas, eliminar: [...borrar] } });
      toast(`Listo: ${r.altas} nuevas con stock 0, ${r.bajas} eliminadas${r.lineas_receta_borradas ? ` (${r.lineas_receta_borradas} líneas de receta)` : ""}.`);
      setPlan(null);
      setFilas(null);
      onListo?.();
    } catch (err) {
      toast(err.message || "No se pudo aplicar.", "error");
    } finally {
      setAplicando(false);
    }
  };

  const alternar = (id) =>
    setBorrar((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const enRecetas = plan ? plan.eliminar.filter((m) => m.recetas.length) : [];
  const sueltas = plan ? plan.eliminar.filter((m) => !m.recetas.length) : [];
  const nada = plan && !plan.nuevas.length && !borrar.size;

  return (
    <>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={elegir} className="hidden" aria-hidden="true" tabIndex={-1} />
      <button onClick={() => input.current?.click()} disabled={leyendo} className="min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors">
        {leyendo ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} <span className="hidden sm:inline">Actualizar con Excel</span><span className="sm:hidden">Excel</span>
      </button>

      <Drawer
        abierto={!!plan}
        onCerrar={cerrar}
        titulo="Actualizar con Excel"
        subtitulo={plan ? `${nf(plan.total_excel, 0)} materias primas en el Excel` : ""}
        pie={
          <div className="flex items-center gap-3">
            <button onClick={cerrar} disabled={aplicando} className="min-h-[46px] px-4 rounded-xl text-sm font-bold text-zinc-400 hover:text-white cursor-pointer">Cancelar</button>
            <button onClick={aplicar} disabled={aplicando || nada} className="ml-auto min-h-[46px] px-5 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-40">
              {aplicando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />} Aplicar
            </button>
          </div>
        }
      >
        {plan && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-400">
              Entran <b className="text-white">{nf(plan.nuevas.length, 0)}</b> nuevas con stock 0, se eliminan <b className="text-white">{nf(borrar.size, 0)}</b> y{" "}
              <b className="text-white">{nf(plan.iguales, 0)}</b> que ya estaban quedan como están.
            </p>

            <Grupo titulo="Nuevas (stock 0)" icono={Plus} color="#34d399" cantidad={plan.nuevas.length}>
              {plan.nuevas.map((n) => (
                <div key={n.codigo} className="rounded-xl border border-white/[0.06] px-3 py-2 text-sm flex gap-3">
                  <span className="font-bold text-white shrink-0">{n.codigo}</span>
                  <span className="text-zinc-400 truncate flex-1">{n.nombre}</span>
                  <span className="text-zinc-500 shrink-0">{abrev(n.unidad_medida)}</span>
                </div>
              ))}
            </Grupo>

            <Grupo titulo="No están en el Excel: se eliminan" icono={Trash2} color="#fb7185" cantidad={sueltas.length} abierto>
              {sueltas.map((m) => (
                <FilaBorrar key={m.id} m={m} marcada={borrar.has(m.id)} onToggle={() => alternar(m.id)} />
              ))}
            </Grupo>

            {enRecetas.length > 0 && (
              <Grupo titulo="No están en el Excel pero se usan en recetas" icono={AlertTriangle} color="#FF5A00" cantidad={enRecetas.length} abierto>
                <p className="text-xs text-[#ff8a4d] px-1 pb-1">Vienen sin marcar. Si marcás una, también se borra de esas recetas (queda una copia guardada).</p>
                {enRecetas.map((m) => (
                  <FilaBorrar key={m.id} m={m} marcada={borrar.has(m.id)} onToggle={() => alternar(m.id)} />
                ))}
              </Grupo>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function FilaBorrar({ m, marcada, onToggle }) {
  return (
    <button type="button" role="checkbox" aria-checked={marcada} onClick={onToggle} className={`text-left w-full rounded-xl border px-3 py-2.5 flex items-start gap-3 cursor-pointer transition-colors ${marcada ? "border-rose-500/40 bg-rose-500/[0.06]" : "border-white/[0.06] opacity-60"}`}>
      <span className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center shrink-0 ${marcada ? "bg-rose-400 border-rose-400" : "border-white/20"}`}>{marcada && <Check size={13} strokeWidth={4} className="text-black" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm"><b className="text-white">{m.codigo}</b> <span className="text-zinc-400">{m.nombre}</span></span>
        {m.recetas.length > 0 && <span className="block text-xs text-zinc-500 mt-0.5">En: {m.recetas.slice(0, 4).join(", ")}{m.recetas.length > 4 ? ` y ${m.recetas.length - 4} más` : ""}</span>}
      </span>
      <span className="shrink-0 text-xs text-zinc-500">stock {nf(m.stock_actual)} {abrev(m.unidad_medida)}</span>
    </button>
  );
}
