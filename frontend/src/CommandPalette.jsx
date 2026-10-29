import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { GRUPOS } from "./menu";

const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function CommandPalette({ abierto, onCerrar, items, onElegir }) {
  return (
    <AnimatePresence>
      {abierto && (
        <Paleta onCerrar={onCerrar} items={items} onElegir={onElegir} />
      )}
    </AnimatePresence>
  );
}

function Paleta({ onCerrar, items, onElegir }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listaRef = useRef(null);

  const resultados = useMemo(() => {
    const t = norm(q).trim();
    if (!t) return items;
    return items.filter((i) =>
      norm(`${i.label} ${i.kw || ""} ${i.desc || ""}`).includes(t),
    );
  }, [q, items]);

  useEffect(() => {
    listaRef.current
      ?.querySelector(`[data-i="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e) => {
    if (e.key === "Escape") onCerrar();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && resultados[sel]) {
      onElegir(resultados[sel].id);
      onCerrar();
    }
  };

  const grupoDe = (id) => GRUPOS.find((g) => g.id === id)?.label || "";

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[12vh] bg-black/70 backdrop-blur-sm print:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={onCerrar}
    >
      <motion.div
        role="dialog"
        aria-label="Buscar módulo"
        className="w-full max-w-xl bg-[#101013] border border-white/10 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] overflow-hidden"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 px-4 border-b border-white/10">
          <Search size={18} className="text-zinc-500 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Ir a un módulo…"
            className="flex-1 bg-transparent py-4 text-base text-white placeholder:text-zinc-600 outline-none"
          />
          <kbd className="hidden sm:block text-[11px] text-zinc-500 border border-white/10 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>
        <div ref={listaRef} className="max-h-[50vh] overflow-y-auto p-2">
          {resultados.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">
              No hay módulos que coincidan con “{q}”. Probá con otra palabra.
            </p>
          )}
          {resultados.map((it, i) => {
            const Icon = it.icon;
            const activo = i === sel;
            return (
              <button
                key={it.id}
                data-i={i}
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  onElegir(it.id);
                  onCerrar();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${activo ? "bg-[#FF5A00]/12" : ""}`}
              >
                <span
                  className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${activo ? "bg-[#FF5A00] text-black" : "bg-white/5 text-zinc-400"}`}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white truncate">
                    {it.label}
                  </span>
                  <span className="block text-xs text-zinc-500 truncate">
                    {it.desc || grupoDe(it.grupo)}
                  </span>
                </span>
                {activo && (
                  <CornerDownLeft
                    size={15}
                    className="text-zinc-500 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
