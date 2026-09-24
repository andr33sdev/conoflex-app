import { useState, useEffect } from "react";
import {
  Bot,
  Mail,
  Sparkles,
  Settings,
  RefreshCw,
  ExternalLink,
  FileText,
  Link2,
  Upload,
  Search,
  Edit,
  Image,
} from "lucide-react";

export default function ComercialIA() {
  const [activeTab, setActiveTab] = useState("bandeja"); // 'bandeja' | 'catalogo' | 'prompt' | 'reportes'
  const [mails, setMails] = useState([]);
  const [reglas, setReglas] = useState("");
  const [loading, setLoading] = useState(false);
  const [conectado, setConectado] = useState(true);
  const [informeHtml, setInformeHtml] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Catálogo y Lista de Precios
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
  const [catalogoPreview, setCatalogoPreview] = useState("");
  const [productoEditar, setProductoEditar] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("status") === "conectado") {
      window.history.replaceState({}, document.title, window.location.pathname);
      setConectado(true);
    }

    fetchMails();
    fetchReglas();
    fetchProductos();
  }, []);

  const abrirLoginGoogle = () => {
    window.location.href = "/auth/google";
  };

  const fetchReglas = async () => {
    try {
      const res = await fetch("/api/reglas");
      const data = await res.json();
      if (data.reglas !== undefined) setReglas(data.reglas);
    } catch (err) {
      console.error("Error al cargar reglas:", err);
    }
  };

  const fetchProductos = async () => {
    try {
      const res = await fetch("/api/productos");
      const data = await res.json();
      if (data.productos) setProductos(data.productos);
    } catch (err) {
      console.error("Error cargando productos:", err);
    }
  };

  const fetchMails = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/mails");
      const data = await res.json();

      if (!res.ok) {
        setConectado(false);
        setErrorMsg(data.error || "Se requiere vincular la cuenta de Gmail.");
      } else {
        setMails(data.mails || []);
        setConectado(true);
      }
    } catch (err) {
      console.error("Error cargando mails:", err);
      setErrorMsg("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubirListaPrecios = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("lista_precios", file);

    setProcesandoArchivo(true);
    try {
      const res = await fetch("/api/catalogo/procesar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setCatalogoPreview(data.contenidoPreview || "");
        fetchProductos();
        alert(`🎉 ${data.mensaje}`);
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (err) {
      alert("❌ Error procesando el archivo");
    } finally {
      setProcesandoArchivo(false);
    }
  };

  const guardarReglas = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reglas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reglas }),
      });
      if (res.ok) alert("✅ Reglas comerciales guardadas correctamente");
    } catch (err) {
      alert("❌ Error al guardar reglas");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFotoProducto = async (productoId, tipo, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("imagen", file);
    formData.append("tipo", tipo);

    try {
      const res = await fetch(`/api/productos/${productoId}/imagen`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        fetchProductos();
      }
    } catch (err) {
      alert("❌ Error al adjuntar la imagen");
    }
  };

  const handleGuardarEdicionProducto = async () => {
    if (!productoEditar) return;
    try {
      const res = await fetch(`/api/productos/${productoEditar.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productoEditar),
      });
      if (res.ok) {
        fetchProductos();
        setProductoEditar(null);
      }
    } catch (err) {
      alert("❌ Error al actualizar producto");
    }
  };

  const generarBorrador = async (mail) => {
    setLoading(true);
    try {
      const res = await fetch("/api/crear-borrador-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailCliente: mail.emailCliente,
          consultaText: mail.resumen,
          asunto: mail.asunto,
          threadId: mail.threadId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✨ ¡Borrador generado en Gmail con éxito!");
        fetchMails();
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (err) {
      alert("❌ Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const generarInformeEstrategico = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analisis-estrategico", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setInformeHtml(data.informe);
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (err) {
      alert("❌ Error generando informe");
    } finally {
      setLoading(false);
    }
  };

  const productosFiltrados = productos.filter(
    (p) =>
      (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase())) ||
      (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase())) ||
      (p.aplicacion &&
        p.aplicacion.toLowerCase().includes(busqueda.toLowerCase())),
  );

  if (!conectado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 font-mono">
        <Bot className="text-[#ffbe00] animate-bounce" size="{48}" />
        <h2 className="text-xl font-bold font-pixel text-white">
          Vincular Cuenta de Gmail
        </h2>
        <p className="text-xs text-[#a594c9] max-w-md font-mono">
          {errorMsg ||
            "Para utilizar la respuesta automática con IA es necesario otorgar permisos en Gmail."}
        </p>
        <button
          onClick={abrirLoginGoogle}
          className="bg-[#2c1a4d] hover:bg-[#432874] text-[#ffbe00] border-2 border-[#ffbe00] px-6 py-2.5 text-xs font-pixel tracking-wider shadow-[3px_3px_0px_#000] flex items-center gap-2 cursor-pointer"
        >
          <ExternalLink size="{16}" /> Conectar con Google Cloud
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#160c2b] border-2 border-[#432874] p-3 md:p-4 rounded-xs font-mono text-white">
      {/* HEADER CON SOLAPAS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#432874] pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="text-[#ffbe00]" size="{22}" />
          <h2 className="font-pixel text-lg text-[#ffbe00] font-bold">
            Asistente IA Comercial
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={abrirLoginGoogle}
            className="px-3 py-1.5 text-xs font-pixel border-2 border-[#ffbe00] text-[#ffbe00] bg-[#2c1a4d] hover:bg-[#432874] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Link2 size="{14}" /> Vincular Gmail
          </button>

          <button
            onClick={() => setActiveTab("bandeja")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "bandeja"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <Mail size="{14}" /> Bandeja ({mails.length})
          </button>

          <button
            onClick={() => setActiveTab("catalogo")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "catalogo"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <Upload size="{14}" /> Catálogo & Precios ({productos.length})
          </button>

          <button
            onClick={() => setActiveTab("prompt")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "prompt"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <Settings size="{14}" /> Reglas IA
          </button>

          <button
            onClick={() => setActiveTab("reportes")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "reportes"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <FileText size="{14}" /> Diagnóstico
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        {/* BANDEJA DE ENTRADA */}
        {activeTab === "bandeja" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-[#2c1a4d]/50 p-2 border border-[#432874]">
              <span className="text-xs text-[#a594c9]">
                Correos con etiqueta{" "}
                <strong className="text-white">IA-Consulta</strong>
              </span>
              <button
                onClick={fetchMails}
                disabled={loading}
                className="bg-[#2c1a4d] hover:bg-[#432874] text-[#ffbe00] border border-[#432874] px-3 py-1 text-xs font-pixel flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw
                  className={loading ? "animate-spin" : ""}
                  size={12}
                />
                Actualizar
              </button>
            </div>

            {mails.map((mail) => (
              <div
                key={mail.id}
                className="bg-[#24173e] border-2 border-[#432874] p-3 shadow-[3px_3px_0px_#000] space-y-2"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-bold text-white">
                    {mail.asunto}
                  </h3>
                  <span className="text-[10px] bg-[#160c2b] text-[#24cc8f] border border-[#24cc8f] px-2 py-0.5 font-pixel">
                    {mail.emailCliente}
                  </span>
                </div>
                <p className="text-xs text-[#a594c9] italic bg-[#160c2b] p-2 border border-[#432874]">
                  "{mail.resumen}"
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => generarBorrador(mail)}
                    disabled={loading}
                    className="bg-[#ffbe00] hover:bg-[#e6ab00] text-black font-pixel text-xs px-3 py-1.5 font-bold shadow-[2px_2px_0px_#000] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size="{14}" /> Responder con Gemini IA
                  </button>
                </div>
              </div>
            ))}

            {mails.length === 0 && !loading && (
              <div className="text-center py-12 text-[#a594c9] text-xs space-y-1 font-pixel">
                <p>No se encontraron correos pendientes.</p>
              </div>
            )}
          </div>
        )}

        {/* CATÁLOGO Y PROCESAMIENTO DE ARCHIVO */}
        {activeTab === "catalogo" && (
          <div className="space-y-4">
            {/* AREA CÁRGAR ARCHIVO */}
            <div className="bg-[#24173e] p-4 border-2 border-[#432874] space-y-3">
              <h3 className="text-xs font-pixel text-[#ffbe00] font-bold">
                Cargar Lista de Precios Oficial (PDF, Excel .xlsx / .xls o CSV)
              </h3>
              <div className="border-2 border-dashed border-[#432874] hover:border-[#ffbe00] p-6 text-center bg-[#160c2b] cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={handleSubirListaPrecios}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="mx-auto text-[#ffbe00] mb-2" size="{24}" />
                <p className="text-xs font-pixel text-white">
                  {procesandoArchivo
                    ? "⏳ Gemini procesando archivo y actualizando MySQL..."
                    : "Hacé clic o arrastrá acá la lista de precios oficial"}
                </p>
              </div>

              {catalogoPreview && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-[#a594c9] font-pixel">
                    Vista previa formateada por IA:
                  </p>
                  <textarea
                    rows={4}
                    readOnly
                    value={catalogoPreview}
                    className="w-full bg-[#160c2b] border border-[#432874] p-2 text-[10px] text-[#24cc8f] font-mono"
                  />
                </div>
              )}
            </div>

            {/* TABLA DE PRODUCTOS EN MYSQL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Buscar por código, nombre o aplicación..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full bg-[#24173e] border border-[#432874] px-3 py-1.5 text-xs text-white outline-none focus:border-[#ffbe00]"
                  />
                </div>
                <span className="text-xs text-[#a594c9] font-pixel">
                  Total: {productosFiltrados.length}
                </span>
              </div>

              <div className="border border-[#432874] overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#2c1a4d] text-[#ffbe00] font-pixel text-[10px]">
                    <tr>
                      <th className="p-2 border-b border-[#432874]">Código</th>
                      <th className="p-2 border-b border-[#432874]">Nombre</th>
                      <th className="p-2 border-b border-[#432874]">
                        Precio Lista
                      </th>
                      <th className="p-2 border-b border-[#432874]">Fotos</th>
                      <th className="p-2 border-b border-[#432874]">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#432874] bg-[#160c2b]">
                    {productosFiltrados.map((p) => (
                      <tr key={p.id} className="hover:bg-[#24173e]">
                        <td className="p-2 font-bold text-[#ffbe00]">
                          {p.codigo}
                        </td>
                        <td className="p-2 text-white">{p.nombre}</td>
                        <td className="p-2 text-[#24cc8f]">{p.precio_lista}</td>
                        <td className="p-2 flex gap-2">
                          <label className="cursor-pointer text-[10px] bg-[#2c1a4d] border border-[#432874] px-1.5 py-0.5 text-white flex items-center gap-1">
                            <Image size="{10}" /> T
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleUploadFotoProducto(p.id, "tecnica", e)
                              }
                            />
                          </label>
                          <label className="cursor-pointer text-[10px] bg-[#2c1a4d] border border-[#432874] px-1.5 py-0.5 text-white flex items-center gap-1">
                            <Image size="{10}" /> C
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleUploadFotoProducto(p.id, "catalogo", e)
                              }
                            />
                          </label>
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => setProductoEditar({ ...p })}
                            className="bg-[#2c1a4d] hover:bg-[#432874] text-[#ffbe00] border border-[#432874] px-2 py-0.5 text-[10px] font-pixel"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* REGLAS IA */}
        {activeTab === "prompt" && (
          <div className="space-y-3">
            <p className="text-xs text-[#a594c9]">
              Configurá las políticas comerciales y pautas que Gemini debe tomar
              en cuenta:
            </p>
            <textarea
              value={reglas}
              onChange={(e) => setReglas(e.target.value)}
              rows={12}
              className="w-full bg-[#160c2b] border-2 border-[#432874] p-3 text-xs text-white focus:border-[#ffbe00] outline-none font-mono"
            />
            <button
              onClick={guardarReglas}
              disabled={loading}
              className="bg-[#24cc8f] hover:bg-[#1eb37d] text-black font-pixel text-xs px-4 py-2 font-bold shadow-[2px_2px_0px_#000] cursor-pointer"
            >
              Guardar Configuración
            </button>
          </div>
        )}

        {/* DIAGNÓSTICO */}
        {activeTab === "reportes" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#2c1a4d]/50 p-3 border border-[#432874]">
              <div>
                <h3 className="text-xs font-pixel text-white font-bold">
                  Informe Inteligente de Planta
                </h3>
              </div>
              <button
                onClick={generarInformeEstrategico}
                disabled={loading}
                className="bg-[#ffbe00] hover:bg-[#e6ab00] text-black font-pixel text-xs px-3 py-2 font-bold shadow-[2px_2px_0px_#000] flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Sparkles size="{14}" />{" "}
                {loading ? "Analizando..." : "Generar Reporte"}
              </button>
            </div>

            {informeHtml && (
              <div
                className="bg-[#160c2b] border-2 border-[#432874] p-4 text-xs text-gray-200 overflow-x-auto space-y-2 prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: informeHtml }}
              />
            )}
          </div>
        )}
      </div>

      {/* MODAL EDITAR PRODUCTO */}
      {productoEditar && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#160c2b] border-2 border-[#432874] p-4 w-full max-w-md space-y-3 font-mono text-xs text-white">
            <h3 className="font-pixel text-[#ffbe00] text-sm font-bold">
              Editar Producto: {productoEditar.codigo}
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-[#a594c9]">
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  value={productoEditar.nombre || ""}
                  onChange={(e) =>
                    setProductoEditar({
                      ...productoEditar,
                      nombre: e.target.value,
                    })
                  }
                  className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-white outline-none focus:border-[#ffbe00]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#a594c9]">
                  Precio Lista
                </label>
                <input
                  type="text"
                  value={productoEditar.precio_lista || ""}
                  onChange={(e) =>
                    setProductoEditar({
                      ...productoEditar,
                      precio_lista: e.target.value,
                    })
                  }
                  className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-white outline-none focus:border-[#ffbe00]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#a594c9]">
                  Aplicación y Usos Recomendados
                </label>
                <textarea
                  rows={3}
                  value={productoEditar.aplicacion || ""}
                  onChange={(e) =>
                    setProductoEditar({
                      ...productoEditar,
                      aplicacion: e.target.value,
                    })
                  }
                  className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-white outline-none focus:border-[#ffbe00]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setProductoEditar(null)}
                className="bg-transparent border border-[#432874] text-white px-3 py-1 font-pixel text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEdicionProducto}
                className="bg-[#24cc8f] text-black font-pixel text-xs px-3 py-1 font-bold"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
