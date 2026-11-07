// Una burbuja de chat. Respeta la *negrita* de WhatsApp y los saltos de línea.
function conNegrita(texto) {
  return String(texto || "")
    .split(/(\*[^*\n]+\*)/g)
    .map((parte, i) => (/^\*[^*\n]+\*$/.test(parte) ? <b key={i}>{parte.slice(1, -1)}</b> : parte));
}

const ESTILO = {
  CLIENTE: { lado: "justify-start", caja: "bg-zinc-900 border-zinc-800 rounded-bl-sm", etiqueta: null },
  BOT: { lado: "justify-end", caja: "bg-[#FF5A00]/10 border-[#FF5A00]/25 rounded-br-sm", etiqueta: "Bot" },
  PERSONA: { lado: "justify-end", caja: "bg-emerald-500/10 border-emerald-500/25 rounded-br-sm", etiqueta: "Equipo" },
};

export default function Burbuja({ autor, texto, hora, error, accion }) {
  const e = ESTILO[autor] || ESTILO.CLIENTE;
  return (
    <div className={`flex ${e.lado}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] border rounded-2xl px-3.5 py-2 ${e.caja}`}>
        {e.etiqueta && <p className={`text-[11px] font-semibold mb-0.5 ${autor === "BOT" ? "text-[#ff8a4d]" : "text-emerald-400"}`}>{e.etiqueta}</p>}
        <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">{conNegrita(texto)}</p>
        <div className="flex items-center justify-end gap-3 mt-1">
          {error && <span className="text-[11px] text-red-400">No se envió: {error}</span>}
          {accion}
          {hora && <span className="text-[11px] text-zinc-500">{hora}</span>}
        </div>
      </div>
    </div>
  );
}
