import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Search } from "lucide-react";
import { GRUPOS, itemsPermitidos, itemPorId, leerRecientes } from "./menu";

const saludo = () => {
  const h = new Date().getHours();
  return h < 6
    ? "Buenas noches"
    : h < 13
      ? "Buen día"
      : h < 20
        ? "Buenas tardes"
        : "Buenas noches";
};

const fechaLarga = () => {
  const t = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const entrada = {
  oculto: { opacity: 0, y: 14 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
  }),
};

function Tile({ item, i, onIr, grande }) {
  const Icon = item.icon;
  return (
    <motion.button
      custom={i}
      variants={entrada}
      initial="oculto"
      animate="visible"
      whileTap={{ scale: 0.98 }}
      onClick={() => onIr(item.id)}
      className={`group relative flex flex-col items-stretch justify-start text-left rounded-2xl border border-white/[0.07] bg-[#111114] hover:border-[#FF5A00]/50 hover:bg-[#15151a] transition-colors p-4 ${grande ? "md:p-5" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span className="w-10 h-10 rounded-xl grid place-items-center bg-white/[0.05] text-zinc-300 group-hover:bg-[#FF5A00] group-hover:text-black transition-colors">
          <Icon size={19} />
        </span>
        <ArrowUpRight
          size={16}
          className="text-zinc-700 group-hover:text-[#FF5A00] transition-colors"
        />
      </div>
      <p className="mt-4 text-[15px] font-bold text-white leading-tight">
        {item.label}
      </p>
      <p className="mt-1 text-[13px] text-zinc-500 leading-snug line-clamp-2">
        {item.desc}
      </p>
    </motion.button>
  );
}

export default function Home({ usuarioActual, onIr }) {
  const items = useMemo(() => itemsPermitidos(usuarioActual), [usuarioActual]);
  const nombre = (usuarioActual?.nombre || "").split(/\s+/)[0] || "";
  const recientes = useMemo(
    () =>
      leerRecientes()
        .map(itemPorId)
        .filter((x) => x && items.some((i) => i.id === x.id))
        .slice(0, 4),
    [items],
  );

  let n = 0;
  return (
    <div className="min-h-full">
      {/* Portada: la línea de calzada avanza despacio. Es el único movimiento continuo de la app. */}
      <section className="relative overflow-hidden border-b border-white/[0.06] bg-[#0d0d10]">
        <div
          className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 260px at 85% -20%, rgba(255,90,0,0.22), transparent 70%)",
          }}
        />
        <div className="relative max-w-[1200px] mx-auto px-5 md:px-8 pt-8 md:pt-12 pb-10 md:pb-14">
          <p className="text-sm text-zinc-500">{fechaLarga()}</p>
          <h2
            className="mt-2 text-[32px] md:text-[48px] leading-[1.05] font-extrabold tracking-tight text-white"
            style={{ fontStretch: "112%" }}
          >
            {saludo()}
            {nombre ? `, ${nombre}` : ""}
          </h2>
          <p className="mt-3 text-zinc-400 max-w-xl text-[15px] md:text-base">
            Elegí un módulo o escribí qué buscás.{" "}
            <span className="hidden md:inline">
              Con{" "}
              <kbd className="text-xs border border-white/15 rounded px-1.5 py-0.5 text-zinc-300">
                Ctrl K
              </kbd>{" "}
              llegás a cualquier pantalla desde donde estés.
            </span>
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event("cf:buscar"))}
            className="mt-6 w-full md:w-[460px] flex items-center gap-3 h-12 px-4 rounded-2xl bg-white/[0.05] border border-white/10 text-zinc-400 hover:border-[#FF5A00]/60 hover:text-white transition-colors"
          >
            <Search size={18} />{" "}
            <span className="text-[15px]">Ir a un módulo…</span>
          </button>
        </div>
        <div aria-hidden className="h-[6px] w-full cf-calzada" />
      </section>

      <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-8 md:py-10 space-y-10 pb-16">
        {recientes.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">
              Seguí donde lo dejaste
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {recientes.map((it) => (
                <Tile key={it.id} item={it} i={n++} onIr={onIr} grande />
              ))}
            </div>
          </section>
        )}
        {GRUPOS.map((g) => {
          const lista = items.filter((i) => i.grupo === g.id);
          if (!lista.length) return null;
          return (
            <section key={g.id}>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                {g.label}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {lista.map((it) => (
                  <Tile key={it.id} item={it} i={n++} onIr={onIr} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
