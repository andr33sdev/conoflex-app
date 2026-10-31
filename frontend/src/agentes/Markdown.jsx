import { Fragment } from "react";

// Markdown acotado y SEGURO para las respuestas de los agentes: títulos, listas, tablas, negrita y código en línea.
// No interpreta HTML: todo se arma con elementos de React.

function enLinea(texto, clave = "") {
  const partes = String(texto ?? "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return partes.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={clave + i} className="font-bold text-white">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2) return <code key={clave + i} className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-[0.92em] text-[#ffd9bd]">{p.slice(1, -1)}</code>;
    return <Fragment key={clave + i}>{p}</Fragment>;
  });
}

const esTabla = (l) => /^\s*\|.*\|\s*$/.test(l);
const esSeparador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const celdas = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const esNumerica = (t) => /^[-+]?\s*\$?\s*[\d.,]+\s*(%|hs?|kg|u\.?|días?)?$/i.test(t.replace(/\*\*/g, ""));

/** Convierte el texto en bloques: { t: "h"|"p"|"ul"|"ol"|"tabla"|"ojo", ... } */
function parsear(texto) {
  const lineas = String(texto ?? "").replace(/\r/g, "").split("\n");
  const bloques = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      bloques.push({ t: "h", texto: h[2].replace(/\*\*/g, "") });
      i++;
      continue;
    }
    if (esTabla(l) && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      const cab = celdas(l);
      const filas = [];
      i += 2;
      while (i < lineas.length && esTabla(lineas[i])) filas.push(celdas(lineas[i++]));
      bloques.push({ t: "tabla", cab, filas });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items = [];
      while (i < lineas.length && /^\s*[-*•]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*[-*•]\s+/, ""));
      bloques.push({ t: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items = [];
      while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*\d+[.)]\s+/, ""));
      bloques.push({ t: "ol", items });
      continue;
    }
    const buf = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4})\s+/.test(lineas[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lineas[i]) && !(esTabla(lineas[i]) && i + 1 < lineas.length && esSeparador(lineas[i + 1]))) buf.push(lineas[i++]);
    const p = buf.join(" ");
    if (/^\s*(\*\*)?ojo(\*\*)?\s*:/i.test(p)) bloques.push({ t: "ojo", texto: p.replace(/^\s*(\*\*)?ojo(\*\*)?\s*:\s*(\*\*)?/i, "") });
    else bloques.push({ t: "p", texto: p });
  }
  return bloques;
}

export default function Markdown({ texto }) {
  const bloques = parsear(texto);
  return (
    <div className="space-y-2.5 min-w-0">
      {bloques.map((b, i) => {
        if (b.t === "h")
          return (
            <h4 key={i} className="pt-1 text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#ff8a4d] border-b border-white/[0.07] pb-1">{enLinea(b.texto)}</h4>
          );
        if (b.t === "ul")
          return (
            <ul key={i} className="space-y-1.5">
              {b.items.map((it, k) => (
                <li key={k} className="flex gap-2.5 leading-snug">
                  <span className="mt-[0.55em] w-1.5 h-1.5 rounded-sm bg-[#FF5A00] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{enLinea(it, `u${k}`)}</span>
                </li>
              ))}
            </ul>
          );
        if (b.t === "ol")
          return (
            <ol key={i} className="space-y-1.5">
              {b.items.map((it, k) => (
                <li key={k} className="flex gap-2.5 leading-snug">
                  <span className="shrink-0 w-5 h-5 mt-px rounded-md bg-[#FF5A00]/15 text-[#ff8a4d] text-[11px] font-black grid place-items-center">{k + 1}</span>
                  <span className="min-w-0 break-words">{enLinea(it, `o${k}`)}</span>
                </li>
              ))}
            </ol>
          );
        if (b.t === "tabla") {
          const num = b.cab.map((_, c) => b.filas.length > 0 && b.filas.every((f) => f[c] === undefined || f[c] === "" || esNumerica(f[c])));
          return (
            <div key={i} className="rounded-xl border border-white/[0.08] overflow-x-auto custom-scrollbar">
              <table className="w-full text-[13.5px] border-collapse">
                <thead>
                  <tr className="bg-white/[0.06]">
                    {b.cab.map((c, k) => (
                      <th key={k} className={`px-3 py-2 font-bold text-[11.5px] uppercase tracking-wide text-zinc-300 whitespace-nowrap ${num[k] ? "text-right" : "text-left"}`}>{enLinea(c, `h${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.filas.map((f, r) => (
                    <tr key={r} className={r % 2 ? "bg-white/[0.025]" : ""}>
                      {b.cab.map((_, k) => (
                        <td key={k} className={`px-3 py-2 border-t border-white/[0.05] ${num[k] ? "text-right tabular-nums whitespace-nowrap" : "text-left"}`}>{enLinea(f[k] ?? "", `c${r}${k}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.t === "ojo")
          return (
            <div key={i} className="flex gap-2.5 rounded-xl bg-[#FFD60A]/[0.09] border border-[#FFD60A]/25 px-3 py-2.5 text-[14px] leading-snug text-[#ffe98a]">
              <span className="shrink-0 font-black uppercase text-[11px] tracking-wider mt-0.5 text-[#FFD60A]">Ojo</span>
              <span className="min-w-0 break-words">{enLinea(b.texto)}</span>
            </div>
          );
        return <p key={i} className={`leading-relaxed break-words ${i === 0 ? "text-white font-semibold" : "text-zinc-200"}`}>{enLinea(b.texto)}</p>;
      })}
    </div>
  );
}
