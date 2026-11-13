import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Link2, Plus, Smartphone, Trash2, UserRound } from "lucide-react";
import { api } from "../produccion/util";
import PantallaLlamada from "../voz/PantallaLlamada";

const urlLink = (token) => `${window.location.origin}/?llamar=${token}`;
const fecha = (v) => (v ? new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const duracion = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const DIAS = [
  { v: 1, t: "1 día" },
  { v: 7, t: "7 días" },
  { v: 30, t: "30 días" },
  { v: 0, t: "Sin vencimiento" },
];

function Links({ aviso }) {
  const [links, setLinks] = useState([]);
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState(7);
  const [copiado, setCopiado] = useState(null);
  const cargar = useCallback(() => api("/api/voz/links").then(setLinks).catch((e) => aviso(e.message, "error")), [aviso]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const copiar = async (l) => {
    try {
      await navigator.clipboard.writeText(urlLink(l.token));
      setCopiado(l.id);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      aviso("No se pudo copiar. Mantené apretado el link para copiarlo.", "error");
    }
  };
  const crear = async (e) => {
    e.preventDefault();
    try {
      const l = await api("/api/voz/links", { method: "POST", body: { nombre, dias } });
      setNombre("");
      await cargar();
      copiar(l);
      aviso("Link creado y copiado. Pasalo por WhatsApp o mail.");
    } catch (err) {
      aviso(err.message, "error");
    }
  };
  const desactivar = async (l) => {
    try {
      await api(`/api/voz/links/${l.id}`, { method: "DELETE" });
      cargar();
    } catch (err) {
      aviso(err.message, "error");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Link2 size={16} className="text-[#FF5A00]" /> Links para compartir</h3>
      <p className="text-xs text-zinc-500 mt-1">Cualquiera con el link puede llamar desde el celular o la compu, sin cuenta.</p>
      <form onSubmit={crear} className="mt-3 flex flex-wrap gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Para quién? Ej: Gerencia, Feria" maxLength={120} className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Vence en" className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-sm text-zinc-200 cursor-pointer">
          {DIAS.map((d) => <option key={d.v} value={d.v}>{d.t}</option>)}
        </select>
        <button disabled={!nombre.trim()} className="inline-flex items-center gap-1.5 bg-[#FF5A00] hover:bg-[#ff6f1f] disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2 cursor-pointer"><Plus size={15} /> Crear</button>
      </form>
      <ul className="mt-3 divide-y divide-zinc-800/80">
        {links.map((l) => (
          <li key={l.id} className={`py-2.5 flex items-center gap-2 ${l.usable ? "" : "opacity-45"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-100 truncate">{l.nombre}</p>
              <p className="text-[11px] text-zinc-500">
                {l.usable ? (l.vence_at ? `Vence ${fecha(l.vence_at)}` : "Sin vencimiento") : "Desactivado o vencido"} · {l.usos} {l.usos === 1 ? "llamada" : "llamadas"}
              </p>
            </div>
            {l.usable && (
              <>
                <button onClick={() => copiar(l)} title="Copiar link" aria-label="Copiar link" className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer">{copiado === l.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}</button>
                <button onClick={() => desactivar(l)} title="Desactivar link" aria-label="Desactivar link" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 cursor-pointer"><Trash2 size={16} /></button>
              </>
            )}
          </li>
        ))}
        {!links.length && <li className="py-3 text-xs text-zinc-600">Todavía no creaste ningún link.</li>}
      </ul>
    </section>
  );
}

function Llamadas({ aviso, version }) {
  const [llamadas, setLlamadas] = useState([]);
  const [abierta, setAbierta] = useState(null);
  useEffect(() => {
    api("/api/voz/llamadas").then(setLlamadas).catch((e) => aviso(e.message, "error"));
  }, [aviso, version]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4">
      <h3 className="text-sm font-semibold text-white">Últimas llamadas</h3>
      <ul className="mt-2 divide-y divide-zinc-800/80">
        {llamadas.map((c) => (
          <li key={c.id} className="py-2">
            <button onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="w-full flex items-center gap-2 text-left cursor-pointer">
              {c.origen === "LINK" ? <Smartphone size={15} className="text-zinc-500 shrink-0" /> : <UserRound size={15} className="text-zinc-500 shrink-0" />}
              <span className="flex-1 min-w-0 text-sm text-zinc-200 truncate">
                {c.contacto?.nombre || c.quien || (c.link ? `Link: ${c.link}` : "Desde la app")}
                {c.contacto && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">dejó contacto</span>}
              </span>
              <span className="text-[11px] text-zinc-500 tabular-nums">{fecha(c.created_at)}{c.duracion != null && ` · ${duracion(c.duracion)}`}</span>
              <ChevronDown size={14} className={`text-zinc-600 transition-transform ${abierta === c.id ? "rotate-180" : ""}`} />
            </button>
            {abierta === c.id && (
              <div className="mt-2 ml-6 space-y-1.5">
                {c.contacto && (
                  <p className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    {[c.contacto.nombre, c.contacto.empresa, c.contacto.telefono, c.contacto.mail].filter(Boolean).join(" · ")}
                    {c.contacto.motivo && <><br />{c.contacto.motivo}</>}
                  </p>
                )}
                {c.transcripcion.length ? (
                  c.transcripcion.map((t, i) => (
                    <p key={i} className="text-xs leading-relaxed"><span className={t.rol === "bot" ? "text-[#FF5A00] font-medium" : "text-zinc-400 font-medium"}>{t.rol === "bot" ? "Aldana" : "Cliente"}:</span> <span className="text-zinc-300">{t.texto}</span></p>
                  ))
                ) : (
                  <p className="text-xs text-zinc-600">{c.duracion == null ? "En curso o sin terminar." : "Sin transcripción."}</p>
                )}
              </div>
            )}
          </li>
        ))}
        {!llamadas.length && <li className="py-3 text-xs text-zinc-600">Cuando alguien llame, la charla queda acá.</li>}
      </ul>
    </section>
  );
}

// Llamar a la asistente por voz desde la app, y administrar los links para que llamen otros.
export default function Llamar({ aviso }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10 grid gap-8 lg:grid-cols-[1fr_380px] items-start">
        <div className="flex flex-col items-center lg:pt-6">
          <PantallaLlamada urlOferta="/api/voz/llamar" onEstado={(e) => (e === "terminada" || e === "error") && setTimeout(() => setVersion((v) => v + 1), 1500)} />
          <p className="text-xs text-zinc-600 mt-6 text-center max-w-sm">Sabe lo mismo que el bot de WhatsApp: catálogo, precios y reglas. Podés interrumpirla cuando habla. Usá auriculares si estás en un lugar con ruido.</p>
        </div>
        <div className="space-y-4">
          <Links aviso={aviso} />
          <Llamadas aviso={aviso} version={version} />
        </div>
      </div>
    </div>
  );
}
