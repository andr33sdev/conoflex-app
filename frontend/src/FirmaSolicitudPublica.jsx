import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import logo from "./assets/logo.svg";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

export default function FirmaSolicitudPublica({
  id,
  rol = "gerente",
  onVolver,
}) {
  const [solicitud, setSolicitud] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const canvasRef = useRef(null);
  const [dibujando, setDibujando] = useState(false);
  const [haFirmado, setHaFirmado] = useState(false);

  const esGerente = rol.toLowerCase() === "gerente";
  const tituloCargo = esGerente
    ? "Gerente de Producción (Autoriza)"
    : "Jefe de Producción (Solicita)";

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/public/solicitudes-compra/${id}`),
      );
      if (res.ok) setSolicitud(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [id]);

  // Manejo táctil y de mouse para el canvas de firma
  const iniciarDibujo = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setDibujando(true);
    setHaFirmado(true);
  };

  const dibujar = (e) => {
    if (!dibujando) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const detenerDibujo = () => setDibujando(false);

  const limpiarFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHaFirmado(false);
  };

  const guardarFirma = async () => {
    if (!haFirmado)
      return alert(
        "Por favor realiza tu firma en el recuadro antes de confirmar.",
      );
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL("image/png");

    setGuardando(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/public/solicitudes-compra/${id}/firmar`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rol: esGerente ? "gerente" : "jefe",
            firma: dataUrl,
          }),
        },
      );

      if (res.ok) {
        setGuardadoExitoso(true);
      } else {
        alert("Ocurrió un error al guardar la firma");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center font-sans">
        <p className="text-xs uppercase font-bold tracking-widest text-zinc-500">
          Cargando solicitud...
        </p>
      </div>
    );
  }

  if (!solicitud) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center font-sans p-4">
        <p className="text-rose-400 text-xs font-bold uppercase">
          Solicitud no encontrada o enlace inválido.
        </p>
      </div>
    );
  }

  const yaFirmado = esGerente
    ? !!solicitud.firma_gerente
    : !!solicitud.firma_jefe;

  return (
    <div className="min-h-screen bg-[#060608] text-zinc-100 font-sans p-4 sm:p-6 flex flex-col items-center justify-center select-none">
      <div className="w-full max-w-xl bg-[#0F0F12] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* CABECERA */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-[#141418] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-700 shrink-0">
              <img
                src={logo}
                alt="Conoflex"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xs font-black tracking-widest uppercase text-white font-mono">
                SOLICITUD DE COMPRA • SC-{String(solicitud.id).padStart(5, "0")}
              </h1>
              <p className="text-[10px] text-[#FF5A00] font-bold uppercase tracking-wider">
                {tituloCargo}
              </p>
            </div>
          </div>
          {onVolver && (
            <button
              onClick={onVolver}
              className="p-2 text-zinc-400 hover:text-white"
            >
              <ArrowLeft size={16} />
            </button>
          )}
        </div>

        {/* DETALLE RESUMIDO DE ARTÍCULOS (ORDENADOS POR PRIORIDAD 5 A 1) */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[40vh] border-b border-zinc-800 bg-[#0A0A0C]">
          <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block mb-2">
            Artículos solicitados (Ordenados por Urgencia):
          </span>
          <div className="space-y-2">
            {solicitud.items?.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-[#121216] border border-zinc-800 p-2.5 rounded-lg text-xs"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-white uppercase truncate">
                    {item.articulo}
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {item.proveedor}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-white block">
                    {parseFloat(item.cantidad_solicitada).toLocaleString(
                      "es-AR",
                    )}{" "}
                    un.
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      item.prioridad >= 4
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    Proridad {item.prioridad}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RECUADRO DE FIRMA DIGITAL */}
        <div className="p-4 sm:p-5 bg-[#0F0F12]">
          {guardadoExitoso || yaFirmado ? (
            <div className="text-center py-6">
              <CheckCircle2
                size={44}
                className="text-emerald-400 mx-auto mb-2"
              />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Firma Registrada Exitosamente
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                La solicitud ya cuenta con la firma correspondiente en el
                comprobante oficial.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                  Dibuja tu firma en el recuadro blanco:
                </span>
                <button
                  type="button"
                  onClick={limpiarFirma}
                  className="text-[10px] font-bold uppercase text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={12} /> Limpiar
                </button>
              </div>

              <div className="w-full bg-white rounded-xl overflow-hidden border-2 border-zinc-400 touch-none shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={180}
                  className="w-full h-[160px] cursor-crosshair block"
                  onMouseDown={iniciarDibujo}
                  onMouseMove={dibujar}
                  onMouseUp={detenerDibujo}
                  onMouseLeave={detenerDibujo}
                  onTouchStart={iniciarDibujo}
                  onTouchMove={dibujar}
                  onTouchEnd={detenerDibujo}
                />
              </div>

              <button
                type="button"
                disabled={guardando || !haFirmado}
                onClick={guardarFirma}
                className="w-full mt-4 bg-[#FF5A00] hover:bg-[#ff6e1f] disabled:opacity-40 text-white font-bold uppercase tracking-widest text-xs py-3 rounded-xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} />
                <span>
                  {guardando
                    ? "Guardando firma..."
                    : "Confirmar y Firmar Solicitud"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
