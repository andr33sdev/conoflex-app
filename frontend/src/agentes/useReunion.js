import { useEffect, useState } from "react";
import { api } from "../produccion/util";

/** Hook compartido: la última reunión (se refresca cada 5 minutos y cuando se rehace). */
export function useReunion() {
  const [r, setR] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    const cargar = () => api("/api/agentes/reunion").then((x) => vivo && setR(x)).catch(() => vivo && setR({ hay: false }));
    cargar();
    const id = setInterval(cargar, 5 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [version]);
  return [r, () => setVersion((v) => v + 1)];
}
