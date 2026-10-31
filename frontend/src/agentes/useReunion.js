import { useEffect, useState } from "react";
import { api } from "../produccion/util";

/** Hook compartido: la última reunión y el temario en vivo (se refrescan cada 5 minutos y cuando se rehace). */
export function useReunion() {
  const [r, setR] = useState(null);
  const [temario, setTemario] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      api("/api/agentes/reunion").then((x) => vivo && setR(x)).catch(() => vivo && setR({ hay: false }));
      api("/api/agentes/reunion/temario").then((x) => vivo && setTemario(x)).catch(() => vivo && setTemario({ secciones: [], sugerencias: [], error: true }));
    };
    cargar();
    const id = setInterval(cargar, 5 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [version]);
  return [r, () => setVersion((v) => v + 1), temario];
}
