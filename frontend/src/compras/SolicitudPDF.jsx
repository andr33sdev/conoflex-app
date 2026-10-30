import logo from "../assets/logo.svg";
import { NIVELES_PRIORIDAD } from "./prioridades";
import { formatFecha } from "./formato";

// Vista oficial para imprimir / exportar a PDF. El diseño es el original, sin cambios.
export default function SolicitudPDF({ solicitud: solicitudImprimiendo }) {
  if (!solicitudImprimiendo) return null;
  const itemsOrdenadosPDF = [...solicitudImprimiendo.items].sort(
    (a, b) => b.prioridad - a.prioridad,
  );
  return (
            <div className="print-visible w-full bg-white text-zinc-900 font-sans leading-tight">
              {/* CABECERA MEMBRETADA */}
              <div className="flex items-center justify-between pb-5 border-b-2 border-zinc-900">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden border border-zinc-200 shrink-0">
                    <img
                      src={logo}
                      alt="Conoflex Logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-black italic tracking-tighter uppercase text-zinc-950 leading-none">
                      CONOFLEX APP
                    </h1>
                    <p className="text-[10px] font-bold text-[#FF5A00] tracking-widest uppercase mt-1">
                      GESTIÓN DE PRODUCCIÓN
                    </p>
                  </div>
                </div>

                <div className="text-right border-l-2 border-zinc-200 pl-6">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">
                    Comprobante Oficial
                  </span>
                  <h2 className="text-lg font-black tracking-tight uppercase text-zinc-950 leading-none mt-1">
                    SOLICITUD DE COMPRA
                  </h2>
                  <div className="mt-2 flex items-center justify-end gap-3 text-xs   font-bold">
                    <span className="bg-zinc-100 text-zinc-900 border border-zinc-300 px-2 py-0.5 rounded">
                      Nº SC-{String(solicitudImprimiendo.id).padStart(5, "0")}
                    </span>
                    <span className="text-zinc-600">
                      {formatFecha(solicitudImprimiendo.fecha)}
                    </span>
                  </div>
                </div>
              </div>

              {/* FICHA DE CONTROL DE SECTORES */}
              <div className="grid grid-cols-4 gap-3 my-5 p-3 rounded bg-zinc-50 border border-zinc-200 text-[10px]">
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Sector Origen
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block">
                    Planta Producción
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Sector Destino
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block">
                    Dpto. de Compras
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Total de Ítems
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block  ">
                    {solicitudImprimiendo.items.length} artículos
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Estado de Gestión
                  </span>
                  <span className="font-bold text-zinc-900 uppercase mt-0.5 block">
                    {solicitudImprimiendo.estado}
                  </span>
                </div>
              </div>

              {/* TABLA DE ARTÍCULOS CON CONTROL DE SALTO DE PÁGINA */}
              <table className="w-full text-left border-collapse border border-zinc-300 text-[11px] mt-4">
                <thead>
                  <tr className="bg-zinc-100/90 text-zinc-800 border-b border-zinc-300 text-[9px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 border-r border-zinc-300 text-center w-12">
                      #
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 font-bold">
                      Materia Prima
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 w-64">
                      Proveedor Sugerido / Marca
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 text-right w-28">
                      Cant. Pedida
                    </th>
                    <th className="py-2.5 px-3 text-center w-28">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {itemsOrdenadosPDF.map((item, idx) => {
                    const urgLabel =
                      NIVELES_PRIORIDAD.find((p) => p.valor === item.prioridad)
                        ?.label || `Nivel ${item.prioridad}`;

                    return (
                      <tr
                        key={idx}
                        className={idx % 2 === 1 ? "bg-zinc-50/50" : "bg-white"}
                      >
                        <td className="py-2 px-3 border-r border-zinc-200 text-center text-zinc-500   text-[10px]">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 font-bold text-zinc-950 uppercase text-[10px]">
                          {item.articulo}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 text-zinc-700 text-[10px]">
                          {item.proveedor || "-"}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 text-right   font-bold text-zinc-950">
                          {parseFloat(item.cantidad_solicitada).toLocaleString(
                            "es-AR",
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider ${item.prioridad >= 4 ? "text-rose-600 font-black" : "text-zinc-800"}`}
                          >
                            {urgLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>


              {/* BLOQUE DE FIRMAS BLINDADO CONTRA CORTES ENTRE HOJAS */}
              <div className="bloque-firmas-print">
                <div className="grid grid-cols-2 gap-20 text-center px-10 pb-4">
                  {/* FIRMA JEFE DE PRODUCCIÓN */}
                  <div>
                    <div className="h-16 flex items-end justify-center mb-1">
                      {solicitudImprimiendo.firma_jefe ? (
                        <img
                          src={solicitudImprimiendo.firma_jefe}
                          alt="Firma Jefe"
                          className="max-h-16 max-w-[200px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-400   italic">
                          Firma Pendiente
                        </span>
                      )}
                    </div>
                    <div className="border-t border-zinc-900 pt-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-950 block">
                        Jefe de Producción
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest block mt-0.5">
                        Firma y Aclaración (Solicita)
                      </span>
                    </div>
                  </div>

                  {/* FIRMA GERENTE DE PRODUCCIÓN */}
                  <div>
                    <div className="h-16 flex items-end justify-center mb-1">
                      {solicitudImprimiendo.firma_gerente ? (
                        <img
                          src={solicitudImprimiendo.firma_gerente}
                          alt="Firma Gerente"
                          className="max-h-16 max-w-[200px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-400   italic">
                          Firma Pendiente
                        </span>
                      )}
                    </div>
                    <div className="border-t border-zinc-900 pt-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-950 block">
                        Gerente de Producción
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest block mt-0.5">
                        Firma y Aclaración (Autoriza)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 flex justify-between text-[8px] text-zinc-400 tracking-tight">
                  <span>Conoflex App • Gestión de Producción</span>
                  <span>Documento de Uso Interno</span>
                </div>
              </div>
            </div>
  );
}
