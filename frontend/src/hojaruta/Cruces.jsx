const COLOR_PRIO = ["", "text-zinc-400", "text-sky-400", "text-amber-400", "text-orange-400", "text-red-400"];

/** Prioridad de 1 a 5 como cruces: las encendidas son la prioridad. */
export default function Cruces({ valor, onElegir, tam = "text-sm" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 font-black ${tam}`} aria-label={`Prioridad ${valor} de 5`} title={`Prioridad ${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= valor;
        const cls = on ? COLOR_PRIO[valor] : "text-zinc-700";
        return onElegir ? (
          <button key={n} type="button" onClick={() => onElegir(n)} className={`${cls} hover:scale-110 transition-transform px-0.5`} aria-label={`Prioridad ${n}`}>✕</button>
        ) : (
          <span key={n} className={cls}>✕</span>
        );
      })}
    </span>
  );
}
