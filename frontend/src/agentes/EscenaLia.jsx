import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import logoUrl from "../assets/logo.svg";

/** Lía en 3D. `estado`: idle | listening | thinking | speaking. El padre puede mover la boca (nivel/pulso) y hacerla saludar por ref. */
const EscenaLia = forwardRef(function EscenaLia({ estado, hablando, info, onActividad }, ref) {
  const caja = useRef(null);
  const escena = useRef(null);
  const ultimo = useRef({ estado, hablando, info, onActividad });
  const [carga, setCarga] = useState("cargando"); // cargando | lista | sinwebgl | error

  useEffect(() => {
    ultimo.current = { estado, hablando, info, onActividad };
    const e = escena.current;
    if (e) {
      e.setEstado(estado);
      e.hablando(hablando);
      e.setInfo(info);
    }
  }, [estado, hablando, info, onActividad]);

  useImperativeHandle(ref, () => ({
    pulso: () => escena.current?.pulso(),
    nivel: (n) => escena.current?.nivelVoz(n),
    saludar: () => escena.current?.saludar(),
    celebrar: () => escena.current?.celebrar(),
  }));

  useEffect(() => {
    let vivo = true;
    let creada = null;
    import("./escenaLego")
      .then((m) => {
        if (!vivo) return;
        if (!m.soportaWebGL()) return setCarga("sinwebgl");
        creada = m.crearEscena(caja.current, { logoUrl, onActividad: (t) => ultimo.current.onActividad?.(t) });
        escena.current = creada;
        if (window.__liaTest) window.__liaCtrl = creada; // solo para pruebas automáticas
        const u = ultimo.current;
        creada.setInfo(u.info);
        creada.setEstado(u.estado);
        creada.hablando(u.hablando);
        setCarga("lista");
      })
      .catch((err) => {
        console.error("[Lía 3D]", err);
        if (vivo) setCarga("error");
      });
    return () => {
      vivo = false;
      creada?.destruir();
      escena.current = null;
    };
  }, []);

  return (
    <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 15%, #2a2230 0%, #14141a 55%, #0a0a0c 100%)" }}>
      <div ref={caja} className="absolute inset-0" aria-label="Lía, agente de RRHH, trabajando en su escritorio de LEGO" role="img" />
      {carga === "cargando" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-zinc-400 text-sm">
            <img src={logoUrl} alt="" className="w-14 h-14 rounded-full" />
            <span>Armando la oficina…</span>
          </div>
        </div>
      )}
      {(carga === "sinwebgl" || carga === "error") && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <div>
            <div className="mx-auto w-20 h-20 rounded-2xl bg-[#FF5A00] grid place-items-center text-4xl font-black text-black shadow-[0_10px_0_#b33f00]">L</div>
            <p className="mt-6 text-sm text-zinc-300 font-semibold">Este navegador no puede mostrar el modelo 3D.</p>
            <p className="mt-1 text-xs text-zinc-500">Lía funciona igual: podés hablarle y ver sus avisos.</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default EscenaLia;
