import { useEffect, useState } from "react";
import { api } from "../produccion/util";

/** Estado del 33 contra la planilla: se consulta al abrir y devuelve cuántos códigos difieren. */
export function useAlineacion33() {
  const [estado, setEstado] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    api("/api/semielaborados/alineacion-33").then((d) => vivo && setEstado(d)).catch(() => vivo && setEstado({ error: true, diferencias: [] }));
    return () => { vivo = false; };
  }, [version]);
  return [estado, () => setVersion((v) => v + 1)];
}

