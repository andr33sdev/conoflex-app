import { MessageCircle, PenLine } from "lucide-react";
import { Modal } from "../produccion/ui";
import { nroSC } from "./formato";

const Opcion = ({ icono: Icono, titulo, texto, onClick, tono = "text-white" }) => (
  <button onClick={onClick} className="w-full text-left flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] px-4 py-3.5 cursor-pointer transition-colors min-h-[64px]">
    <span className={`w-11 h-11 rounded-xl grid place-items-center bg-white/[0.06] shrink-0 ${tono}`}><Icono size={20} /></span>
    <span className="min-w-0"><span className="block text-[15px] font-extrabold text-white">{titulo}</span><span className="block text-sm text-zinc-500">{texto}</span></span>
  </button>
);

/** Firmar acá mismo o mandar el enlace de firma por WhatsApp. */
export default function FirmasModal({ solicitud, onCerrar, onWhatsApp, onFirmar }) {
  return (
    <Modal abierto={!!solicitud} onCerrar={onCerrar} titulo={solicitud ? `Firmas · ${nroSC(solicitud.id)}` : "Firmas"} subtitulo="Elegí cómo conseguir cada firma." ancho="max-w-lg">
      {solicitud && (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-2">Mandar el enlace por WhatsApp</p>
            <div className="space-y-2">
              <Opcion icono={MessageCircle} tono="text-emerald-300" titulo="Al gerente de producción" texto={solicitud.firma_gerente ? "Ya firmó (podés volver a mandarlo)" : "Autoriza la solicitud"} onClick={() => onWhatsApp(solicitud.id, "gerente")} />
              <Opcion icono={MessageCircle} tono="text-emerald-300" titulo="Al jefe de producción" texto={solicitud.firma_jefe ? "Ya firmó (podés volver a mandarlo)" : "Solicita"} onClick={() => onWhatsApp(solicitud.id, "jefe")} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-2">Firmar desde esta pantalla</p>
            <div className="space-y-2">
              <Opcion icono={PenLine} tono="text-[#FFD60A]" titulo="Firmar como jefe" texto={solicitud.firma_jefe ? "Ya está firmada" : "Dibujá la firma con el dedo o el mouse"} onClick={() => onFirmar(solicitud.id, "jefe")} />
              <Opcion icono={PenLine} tono="text-[#FFD60A]" titulo="Firmar como gerente" texto={solicitud.firma_gerente ? "Ya está firmada" : "Dibujá la firma con el dedo o el mouse"} onClick={() => onFirmar(solicitud.id, "gerente")} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
