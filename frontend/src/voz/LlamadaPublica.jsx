import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "../assets/logo.svg";
import { getApiUrl } from "../apiConfig";
import PantallaLlamada from "./PantallaLlamada";

// Página pública para llamar a la asistente desde un link (?llamar=<token>), sin cuenta.
export default function LlamadaPublica({ token }) {
  const [estado, setEstado] = useState("cargando");
  const [nombre, setNombre] = useState("Aldana");

  useEffect(() => {
    fetch(getApiUrl(`/api/public/voz-web/${encodeURIComponent(token)}`))
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error();
        if (j.nombre) setNombre(j.nombre);
        setEstado("ok");
      })
      .catch(() => setEstado("invalido"));
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-[#050505] text-zinc-100 flex flex-col font-sans" style={{ background: "radial-gradient(ellipse at 50% 0%, #2a1206 0%, #050505 55%)" }}>
      <header className="px-5 pt-5 flex justify-center">
        <img src={logo} alt="Conoflex" className="h-7 opacity-90" />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        {estado === "cargando" && <Loader2 className="animate-spin text-zinc-600" size={28} />}
        {estado === "invalido" && (
          <div className="text-center max-w-xs">
            <p className="text-lg font-semibold text-white">Este link ya no está disponible</p>
            <p className="text-sm text-zinc-400 mt-2">Pedile a Conoflex uno nuevo, o escribinos por WhatsApp.</p>
          </div>
        )}
        {estado === "ok" && <PantallaLlamada urlOferta={`/api/public/voz-web/${encodeURIComponent(token)}/llamar`} nombre={nombre} subtitulo="Atención comercial de Conoflex" />}
      </main>
      <footer className="pb-5 text-center text-[11px] text-zinc-600 px-6">Es una asistente con inteligencia artificial. La llamada usa tu micrófono y queda registrada para mejorar la atención.</footer>
    </div>
  );
}
