// Recuadro para firmar con el dedo o el mouse. Avisa al padre el PNG (dataURL) o null si se limpia.
import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

export default function FirmaCanvas({ onChange, alto = 160 }) {
  const ref = useRef(null);
  const [dibujando, setDibujando] = useState(false);
  const [firmado, setFirmado] = useState(false);

  const punto = (e) => {
    const canvas = ref.current;
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    // El canvas interno mide distinto que en pantalla: se escala la posición.
    return { x: (cx - rect.left) * (canvas.width / rect.width), y: (cy - rect.top) * (canvas.height / rect.height) };
  };

  const iniciar = (e) => {
    e.preventDefault();
    const ctx = ref.current.getContext("2d");
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDibujando(true);
    setFirmado(true);
  };
  const mover = (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const ctx = ref.current.getContext("2d");
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  const soltar = () => {
    if (!dibujando) return;
    setDibujando(false);
    if (firmado && onChange) onChange(ref.current.toDataURL("image/png"));
  };
  const limpiar = () => {
    const canvas = ref.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setFirmado(false);
    onChange?.(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">Firmá en el recuadro</span>
        <button type="button" onClick={limpiar} className="text-[11px] font-bold uppercase text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"><RotateCcw size={12} /> Limpiar</button>
      </div>
      <div className="w-full bg-white rounded-2xl overflow-hidden border-2 border-zinc-400 touch-none shadow-inner">
        <canvas
          ref={ref}
          width={500}
          height={180}
          style={{ height: alto }}
          className="w-full block cursor-crosshair"
          onMouseDown={iniciar}
          onMouseMove={mover}
          onMouseUp={soltar}
          onMouseLeave={soltar}
          onTouchStart={iniciar}
          onTouchMove={mover}
          onTouchEnd={soltar}
        />
      </div>
    </div>
  );
}
