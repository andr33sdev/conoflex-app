// Página pública (sin login) para autorizar el retiro de un producto caliente. Se abre desde el link de WhatsApp.
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import logo from "./assets/logo.svg";
import FirmaCanvas from "./solicitudes/FirmaCanvas";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

function Marco({ children }) {
  return (
    <div className="min-h-dvh bg-[#060608] text-zinc-100 font-sans p-4 sm:p-6 flex items-center justify-center select-none">
      <div className="w-full max-w-xl bg-[#0F0F12] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-[#141418] flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-700 shrink-0"><img src={logo} alt="Conoflex" className="w-full h-full object-cover" /></div>
          <div>
            <h1 className="text-xs font-black tracking-widest uppercase text-white">Autorización de retiro</h1>
            <p className="text-[10px] text-[#FF5A00] font-bold uppercase tracking-wider">Producto caliente</p>
          </div>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export default function AutorizarInternaPublica({ token }) {
  const [sol, setSol] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noExiste, setNoExiste] = useState(false);
  const [firma, setFirma] = useState(null);
  const [aclaracion, setAclaracion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(getApiUrl(`/api/public/solicitudes-internas/autorizacion/${token}`))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (vivo) setSol(d); })
      .catch(() => vivo && setNoExiste(true))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [token]);

  const autorizar = async () => {
    if (!firma) return;
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(getApiUrl(`/api/public/solicitudes-internas/autorizacion/${token}/firmar`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firma, aclaracion: aclaracion.trim().slice(0, 120) }),
      });
      if (res.ok) setListo(true);
      else { const d = await res.json().catch(() => ({})); setError(d.error || "No se pudo autorizar."); }
    } catch {
      setError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <Marco><p className="text-sm text-zinc-500 py-8 text-center">Cargando…</p></Marco>;
  if (noExiste || !sol) return <Marco><p className="text-sm text-rose-400 font-semibold py-8 text-center">No encontramos esta autorización o el enlace no es válido.</p></Marco>;

  const yaAutorizada = listo || Number(sol.autorizado) === 1;

  return (
    <Marco>
      <div className="mb-4 rounded-2xl border border-zinc-800 bg-[#0A0A0C] p-4">
        <p className="text-lg font-extrabold text-white leading-snug">{sol.producto}</p>
        <p className="mt-1 text-sm text-zinc-400">Cantidad a retirar: <span className="font-bold text-white">{sol.cantidad}</span></p>
        {sol.motivo && <p className="mt-2 text-sm text-violet-200"><span className="font-bold">Motivo:</span> {sol.motivo}</p>}
        {sol.solicitante && <p className="mt-1 text-xs text-zinc-500">Lo pidió: {sol.solicitante}</p>}
      </div>

      {yaAutorizada ? (
        <div className="text-center py-6">
          <CheckCircle2 size={44} className="text-emerald-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Autorización registrada</h3>
          <p className="text-xs text-zinc-400 mt-1">Ya quedó autorizado el retiro. Podés cerrar esta página.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FirmaCanvas onChange={setFirma} />
          <input type="text" maxLength={120} value={aclaracion} onChange={(e) => setAclaracion(e.target.value)} placeholder="Aclaración (tu nombre)" className="w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70" />
          {error && <p className="text-sm font-semibold text-rose-300">{error}</p>}
          <button type="button" disabled={!firma || guardando} onClick={autorizar} className="w-full min-h-[54px] rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-extrabold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 cursor-pointer">
            <ShieldCheck size={18} /> {guardando ? "Autorizando…" : "Autorizar retiro"}
          </button>
        </div>
      )}
    </Marco>
  );
}
