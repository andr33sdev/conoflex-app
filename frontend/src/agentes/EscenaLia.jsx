import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/** Lía en 3D. `estado`: idle | listening | thinking | speaking. El padre puede llamar pulso() / saludar() por ref. */
const EscenaLia = forwardRef(function EscenaLia({ estado, hablando, info }, ref) {
  const caja = useRef(null);
  const escena = useRef(null);
  const ultimo = useRef({ estado, hablando, info });
  const [carga, setCarga] = useState("cargando"); // cargando | lista | sinwebgl | error

  useEffect(() => {
    ultimo.current = { estado, hablando, info };
    const e = escena.current;
    if (e) {
      e.setEstado(estado);
      e.hablando(hablando);
      e.setInfo(info);
    }
  }, [estado, hablando, info]);

  useImperativeHandle(ref, () => ({
    pulso: () => escena.current?.pulso(),
    saludar: () => escena.current?.saludar(),
  }));

  useEffect(() => {
    let vivo = true;
    let creada = null;
    import("./escenaLego")
      .then((m) => {
        if (!vivo) return;
        if (!m.soportaWebGL()) return setCarga("sinwebgl");
        creada = m.crearEscena(caja.current);
        escena.current = creada;
        const u = ultimo.current;
        creada.setEstado(u.estado);
        creada.hablando(u.hablando);
        creada.setInfo(u.info);
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
    <div
      className="absolute inset-0"
      style={{ background: "radial-gradient(120% 90% at 50% 15%, #2a2230 0%, #14141a 55%, #0a0a0c 100%)" }}
    >
      <div ref={caja} className="absolute inset-0" aria-label="Lía, agente de RRHH, en su oficina de LEGO" role="img" />
      {carga === "cargando" && (
        <div className="absolute inset-0 grid place-items-center text-zinc-400 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF5A00] cf-punto" />
            <span className="w-2 h-2 rounded-full bg-[#FF5A00] cf-punto" style={{ animationDelay: "0.15s" }} />
            <span className="w-2 h-2 rounded-full bg-[#FF5A00] cf-punto" style={{ animationDelay: "0.3s" }} />
            <span className="ml-1">Armando la oficina…</span>
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
