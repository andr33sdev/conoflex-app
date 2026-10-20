import { useState, useEffect, useMemo } from "react";
import {
  Mail,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Upload,
  Search,
  Image as ImageIcon,
  User,
  CheckCircle2,
  AlertCircle,
  Inbox,
  ChevronRight,
  ChevronLeft,
  Send,
  Sliders,
  FileSpreadsheet,
  FileText,
  Cpu,
  LayoutGrid,
  List,
  Tag,
  UploadCloud,
  Zap,
  X,
  Eye,
  Box,
  Layers,
  ShieldCheck,
  Paperclip,
} from "lucide-react";

// HELPER SANITIZADOR PARA EVITAR MIXED CONTENT (HTTPS VS HTTP)
const getImageUrl = (url) => {
  if (!url) return "";

  let path = url;
  if (path.includes("/imagenes/")) {
    path = "/imagenes/" + path.split("/imagenes/")[1];
  } else {
    path = path.replace(/\\/g, "/");
    if (path.startsWith("public/")) path = path.substring(6);
    if (!path.startsWith("/")) path = "/" + path;
  }

  return encodeURI(path);
};

export default function ComercialIA() {
  const [activeTab, setActiveTab] = useState("bandeja"); // 'bandeja' | 'catalogo' | 'prompt'
  const [mails, setMails] = useState([]);
  const [selectedMail, setSelectedMail] = useState(null);
  const [reglas, setReglas] = useState("");
  const [loading, setLoading] = useState(false);
  const [generandoBorrador, setGenerandoBorrador] = useState(false);
  const [conectado, setConectado] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // SISTEMA DE NOTIFICACIONES TOAST
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3800);
  };

  // Catálogo, Lista de Precios y Paginación
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState(null);

  // Vista y Paginación del Catálogo
  const [vistaModo, setVistaModo] = useState("tabla"); // 'tabla' | 'tarjetas'
  const [paginaCatalogo, setPaginaCatalogo] = useState(1);
  const itemsPorPagina = 10;

  // ESTADO PARA MODAL LIGHTBOX DE FOTOS AMPLIADAS
  const [fotoLightbox, setFotoLightbox] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("status") === "conectado") {
      window.history.replaceState({}, document.title, window.location.pathname);
      setConectado(true);
      showToast("Conexión con Google Workspace establecida.", "success");
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
        const listaMails = data.mails || [];
        setMails(listaMails);
        setConectado(true);
        if (listaMails.length > 0 && !selectedMail) {
          setSelectedMail(listaMails[0]);
        }
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
        fetchProductos();
        showToast(`🎉 ${data.mensaje}`, "success");
      } else {
        showToast(
          data.error || "Error al procesar la lista de precios",
          "error",
        );
      }
    } catch (err) {
      showToast("Error procesando el archivo en el servidor", "error");
    } finally {
      setProcesandoArchivo(false);
    }
  };

  const handleSubirPdfsFichas = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => formData.append("pdf_files", file));

    const cat = prompt(
      "Categoría para estos PDFs de fichas (ej: Conos, Vallas, Espejos):",
      "Conos",
    );
    if (cat) formData.append("categoriaNombre", cat);

    setProcesandoArchivo(true);
    try {
      const res = await fetch("/api/catalogo/procesar-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        fetchProductos();
        showToast(`🎉 ${data.mensaje}`, "success");
      } else {
        showToast(data.error || "Error al procesar PDFs de fichas", "error");
      }
    } catch (err) {
      showToast("Error de conexión al subir PDFs.", "error");
    } finally {
      setProcesandoArchivo(false);
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
        const data = await res.json();
        await fetchProductos();
        if (productoDetalle && productoDetalle.id === productoId) {
          setProductoDetalle((prev) => ({
            ...prev,
            [tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo"]:
              data.url ||
              prev[tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo"],
          }));
        }
        showToast("Imagen cargada y guardada con éxito", "success");
      } else {
        showToast("Error al guardar la imagen en el servidor", "error");
      }
    } catch (err) {
      showToast("Error de conexión al adjuntar la imagen", "error");
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
      if (res.ok)
        showToast("Reglas comerciales guardadas correctamente", "success");
    } catch (err) {
      showToast("Error al guardar reglas comerciales", "error");
    } finally {
      setLoading(false);
    }
  };

  // ENVÍO DE TEXTO COMPLETO + IMÁGENES A GEMINI
  const generarBorrador = async (mail) => {
    if (!mail) return;
    setGenerandoBorrador(true);
    try {
      const textoCompleto = mail.cuerpoCompleto || mail.cuerpo || mail.resumen;

      const res = await fetch("/api/crear-borrador-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailCliente: mail.emailCliente,
          consultaText: textoCompleto, // CUERPO 100% COMPLETO SIN CORTES
          asunto: mail.asunto,
          threadId: mail.threadId,
          imagenes: mail.imagenes || [], // FOTOS ENVIADAS POR EL CLIENTE
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("✨ ¡Borrador inyectado con éxito en Gmail!", "success");
        fetchMails();
      } else {
        showToast(data.error || "No se pudo inyectar el borrador", "error");
      }
    } catch (err) {
      showToast("Error al conectar con el servidor", "error");
    } finally {
      setGenerandoBorrador(false);
    }
  };

  const renderPrecioLimpio = (precioStr) => {
    if (!precioStr || precioStr === "-")
      return <span className="text-zinc-600 font-mono text-xs">-</span>;

    const partes = precioStr.split("|").map((p) => p.trim());
    if (partes.length === 1) {
      return (
        <span className="font-mono font-bold text-[#FFD700] text-xs whitespace-nowrap">
          {partes[0]}
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-1 justify-center items-end">
        {partes.map((p, idx) => {
          const subPartes = p.split(":");
          if (subPartes.length === 2) {
            return (
              <div
                key={idx}
                className="flex items-center gap-1.5 text-[10px] font-mono whitespace-nowrap bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800"
              >
                <span className="text-zinc-400 font-medium">
                  {subPartes[0].trim()}:
                </span>
                <strong className="text-[#FFD700] font-bold">
                  {subPartes[1].trim()}
                </strong>
              </div>
            );
          }
          return (
            <span
              key={idx}
              className="text-[#FFD700] font-mono font-bold text-[11px] whitespace-nowrap bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800"
            >
              {p}
            </span>
          );
        })}
      </div>
    );
  };

  const parseUsosList = (usosStr) => {
    if (!usosStr) return [];
    return usosStr
      .split(/,|\n|\./)
      .map((u) => u.trim())
      .filter((u) => u.length > 2);
  };

  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return productos;

    return productos.filter((p) => {
      const cod = (p.codigo || "").toLowerCase();
      const nom = (p.nombre || "").toLowerCase();
      const app = (p.aplicacion || "").toLowerCase();
      const esp = (p.especificacion || "").toLowerCase();
      const med = (p.medidas || "").toLowerCase();
      const cat = (p.categoria || "").toLowerCase();
      return (
        cod.includes(q) ||
        nom.includes(q) ||
        app.includes(q) ||
        esp.includes(q) ||
        med.includes(q) ||
        cat.includes(q)
      );
    });
  }, [productos, busqueda]);

  const totalPaginasCatalogo =
    Math.ceil(productosFiltrados.length / itemsPorPagina) || 1;
  const productosPaginados = useMemo(() => {
    const start = (paginaCatalogo - 1) * itemsPorPagina;
    return productosFiltrados.slice(start, start + itemsPorPagina);
  }, [productosFiltrados, paginaCatalogo]);

  const getInicial = (nombre) => {
    if (!nombre) return "C";
    return nombre.charAt(0).toUpperCase();
  };

  if (!conectado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 font-sans bg-[#030303] text-zinc-100">
        <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-[0_0_30px_rgba(255,90,0,0.1)] relative">
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#FF5A00] rounded-full animate-ping" />
          <Cpu size={44} className="text-[#FF5A00]" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-base font-extrabold italic tracking-tight text-white uppercase">
            VINCULAR GMAIL COMERCIAL
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            {errorMsg ||
              "Autorizá la conexión con Google Cloud para habilitar la cotización automática por IA."}
          </p>
        </div>
        <button
          onClick={abrirLoginGoogle}
          className="bg-[#FFD700] hover:bg-yellow-400 text-black font-extrabold text-xs px-6 py-3 rounded-lg shadow-lg uppercase tracking-wider flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
        >
          <ExternalLink size={14} /> AUTORIZAR GOOGLE WORKSPACE
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#050505] font-sans text-zinc-100 overflow-hidden relative">
      {/* TOASTS & NOTIFICACIONES */}
      <div className="fixed top-6 right-6 z-[300] flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {procesandoArchivo && (
          <div className="pointer-events-auto flex flex-col p-4 bg-[#0a0a0a] border border-[#FF5A00]/50 rounded-xl shadow-[0_0_30px_rgba(255,90,0,0.25)] backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-[#FF5A00]/10 border border-[#FF5A00]/30 rounded-lg text-[#FF5A00] shrink-0">
                <RefreshCw size={18} className="animate-spin text-[#FF5A00]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-bold text-[#FF5A00] uppercase font-mono tracking-wider">
                    PROCESANDO ARCHIVOS
                  </h5>
                  <span className="w-2 h-2 rounded-full bg-[#FF5A00] animate-ping" />
                </div>
                <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                  Sincronizando información técnica con base de datos...
                </p>
              </div>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-1 mt-3 overflow-hidden border border-zinc-800 relative">
              <div className="absolute inset-0 bg-[#FF5A00] animate-pulse" />
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`pointer-events-auto relative overflow-hidden p-4 bg-[#0a0a0a] border rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.9)] backdrop-blur-xl text-xs ${
              toast.type === "success"
                ? "border-[#FF5A00]/40 shadow-[0_0_20px_rgba(255,90,0,0.15)]"
                : "border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg border shrink-0 ${
                  toast.type === "success"
                    ? "bg-[#FF5A00]/10 border-[#FF5A00]/30 text-[#FF5A00]"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}
              >
                {toast.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
              </div>

              <div className="flex-1 pr-2">
                <h5
                  className={`text-[11px] font-bold font-mono uppercase tracking-wider ${
                    toast.type === "success"
                      ? "text-[#FF5A00]"
                      : "text-rose-400"
                  }`}
                >
                  {toast.type === "success"
                    ? "OPERACIÓN EXITOSA"
                    : "ERROR DE SISTEMA"}
                </h5>
                <p className="text-[11px] text-zinc-300 mt-0.5 leading-snug">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => setToast(null)}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* HEADER DE MÓDULO */}
      <div className="p-4 sm:p-6 border-b border-zinc-800/80 bg-[#000000] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-white uppercase leading-none">
            COMERCIAL <span className="text-[#FF5A00]">IA</span>
          </h1>
          <p className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase mt-1 flex items-center gap-2">
            <span>ROL DE VISUALIZACIÓN: ADMIN</span>
            <span className="text-zinc-700">•</span>
            <span className="text-[#FF5A00] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shadow-[0_0_8px_#FF5A00]" />
              SISTEMA EN LÍNEA
            </span>
          </p>
        </div>

        {/* TABS DE SELECCIÓN */}
        <div className="flex items-center gap-1 bg-[#090909] p-1 border border-zinc-800 rounded-lg">
          <button
            onClick={() => setActiveTab("bandeja")}
            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-md flex items-center gap-2 cursor-pointer ${
              activeTab === "bandeja"
                ? "bg-[#FF5A00] text-black shadow-md shadow-[#FF5A00]/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Inbox size={14} /> BANDEJA ({mails.length})
          </button>

          <button
            onClick={() => setActiveTab("catalogo")}
            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-md flex items-center gap-2 cursor-pointer ${
              activeTab === "catalogo"
                ? "bg-[#FF5A00] text-black shadow-md shadow-[#FF5A00]/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <FileSpreadsheet size={14} /> CATÁLOGO ({productos.length})
          </button>

          <button
            onClick={() => setActiveTab("prompt")}
            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-md flex items-center gap-2 cursor-pointer ${
              activeTab === "prompt"
                ? "bg-[#FF5A00] text-black shadow-md shadow-[#FF5A00]/20"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Sliders size={14} /> REGLAS IA
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#000000] relative">
        {/* ========================================================
            TAB 1: BANDEJA DE CONSULTAS
            ======================================================== */}
        {activeTab === "bandeja" && (
          <div className="h-full flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-zinc-900">
            {/* Lista lateral de Mails */}
            <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 bg-[#050505]">
              <div className="p-3.5 border-b border-zinc-900 flex justify-between items-center bg-[#080808]">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Mail size={13} className="text-[#FF5A00]" />
                  ENTRADAS IA-CONSULTA
                </span>
                <button
                  onClick={fetchMails}
                  disabled={loading}
                  className="p-1.5 hover:bg-zinc-900 text-zinc-400 hover:text-[#FF5A00] rounded transition cursor-pointer"
                  title="Sincronizar mensajes"
                >
                  <RefreshCw
                    size={13}
                    className={loading ? "animate-spin text-[#FF5A00]" : ""}
                  />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60 min-h-0 custom-scrollbar">
                {mails.map((m) => {
                  const isSelected = selectedMail?.id === m.id;
                  const tieneImagenes = m.imagenes && m.imagenes.length > 0;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMail(m)}
                      className={`p-3.5 transition-all cursor-pointer flex gap-3 relative ${
                        isSelected
                          ? "bg-zinc-900/90 border-l-2 border-[#FF5A00]"
                          : "hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-[#FF5A00] shrink-0 mt-0.5">
                        {getInicial(m.emailCliente)}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-baseline gap-2">
                          <h4 className="text-xs font-bold text-zinc-200 truncate font-mono">
                            {m.emailCliente}
                          </h4>
                        </div>
                        <p className="text-xs font-bold text-[#FF5A00] truncate">
                          {m.asunto}
                        </p>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {m.cuerpoCompleto || m.cuerpo || m.resumen}
                        </p>

                        {tieneImagenes && (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-amber-400">
                            <Paperclip size={11} />
                            <span>
                              {m.imagenes.length} imagen(es) adjunta(s)
                            </span>
                          </div>
                        )}
                      </div>

                      <ChevronRight
                        size={14}
                        className={`self-center shrink-0 transition-colors ${
                          isSelected ? "text-[#FF5A00]" : "text-zinc-700"
                        }`}
                      />
                    </div>
                  );
                })}

                {mails.length === 0 && !loading && (
                  <div className="p-8 text-center space-y-2 text-zinc-600">
                    <CheckCircle2
                      size={28}
                      className="mx-auto text-[#FF5A00]/50"
                    />
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Bandeja despejada
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      Asigná la etiqueta 'IA-Consulta' en Gmail para procesarlos
                      aquí.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Visualizador de Mail & Inyección */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#000000]">
              {selectedMail ? (
                <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 overflow-y-auto custom-scrollbar">
                  <div className="bg-[#080808] border border-zinc-800/80 rounded-xl p-5 space-y-4 shadow-xl">
                    <div className="flex flex-wrap justify-between items-start gap-2 border-b border-zinc-800/80 pb-4">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FF5A00]">
                          REQUERIMIENTO DETECTADO
                        </span>
                        <h3 className="text-base font-extrabold italic text-white mt-1 uppercase">
                          {selectedMail.asunto}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 bg-black border border-zinc-800 px-3 py-1.5 rounded-lg">
                        <User size={13} className="text-zinc-400" />
                        <span className="text-xs font-mono text-zinc-300">
                          {selectedMail.emailCliente}
                        </span>
                      </div>
                    </div>

                    {/* CUERPO COMPLETO SIN RECORTES */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                          MENSAJE COMPLETO DEL CLIENTE:
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          100% ÍNTEGRO
                        </span>
                      </div>
                      <div className="bg-black border border-zinc-800 p-4 rounded-lg text-zinc-200 text-xs leading-relaxed font-sans whitespace-pre-wrap max-h-96 overflow-y-auto custom-scrollbar selection:bg-[#FF5A00]/30 selection:text-white">
                        {selectedMail.cuerpoCompleto ||
                          selectedMail.cuerpo ||
                          selectedMail.resumen}
                      </div>
                    </div>

                    {/* GALERÍA DE FOTOS ADJUNTAS RECIBIDAS (VISUALIZACIÓN MULTIMODAL) */}
                    {selectedMail.imagenes &&
                      selectedMail.imagenes.length > 0 && (
                        <div className="space-y-2.5 pt-2 border-t border-zinc-900">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                              <ImageIcon size={14} /> IMÁGENES ADJUNTAS
                              DETECTADAS ({selectedMail.imagenes.length})
                            </span>
                            <span className="text-[10px] font-mono text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 rounded">
                              ANALIZADAS POR GEMINI VISIÓN
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {selectedMail.imagenes.map((img, idx) => (
                              <div
                                key={idx}
                                onClick={() =>
                                  setFotoLightbox({
                                    url:
                                      img.url ||
                                      `data:${img.mimeType};base64,${img.data}`,
                                    titulo: `Foto Adjunta #${idx + 1} del Cliente (${selectedMail.emailCliente})`,
                                  })
                                }
                                className="h-28 rounded-lg bg-black border border-zinc-800 hover:border-[#FF5A00] transition-all p-1.5 flex flex-col items-center justify-center cursor-pointer relative group overflow-hidden"
                              >
                                <img
                                  src={
                                    img.url ||
                                    `data:${img.mimeType};base64,${img.data}`
                                  }
                                  alt={`Adjunto ${idx + 1}`}
                                  className="w-full h-full object-contain rounded"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Eye size={16} className="text-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Banner CTA Generador */}
                  <div className="bg-[#080808] border border-zinc-800/80 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
                        <Sparkles size={14} className="text-[#FF5A00]" />{" "}
                        ANÁLISIS INTEGRAL MULTIMODAL (TEXTO + FOTOS)
                      </h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed max-w-lg">
                        Gemini inspecciona la totalidad del mensaje y las
                        fotografías (modelos de competencia, roturas o medidas)
                        para sugerir el código exacto de Conoflex y maquetar la
                        propuesta en tu borrador de Gmail.
                      </p>
                    </div>

                    <button
                      onClick={() => generarBorrador(selectedMail)}
                      disabled={generandoBorrador}
                      className="w-full sm:w-auto bg-[#FFD700] hover:bg-yellow-400 text-black font-extrabold uppercase tracking-wider px-6 py-3 text-xs rounded-lg shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                    >
                      {generandoBorrador ? (
                        <>
                          <RefreshCw
                            size={14}
                            className="animate-spin text-black"
                          />
                          <span>Analizando & Inyectando...</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Inyectar Borrador en Gmail</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-600 text-center space-y-3">
                  <Inbox size={36} className="text-zinc-800" />
                  <p className="text-xs font-mono uppercase tracking-wider">
                    Seleccioná un mensaje de la bandeja para leer la consulta y
                    cotizar.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: CATÁLOGO INDUSTRIAL
            ======================================================== */}
        {activeTab === "catalogo" && (
          <div className="p-4 sm:p-6 flex flex-col h-full space-y-4 overflow-hidden">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPaginaCatalogo(1);
                  }}
                  placeholder="Buscar por código, nombre, uso o categoría..."
                  className="w-full bg-black border border-zinc-800 text-xs text-zinc-100 pl-10 pr-4 py-2.5 rounded-lg focus:border-[#FF5A00] outline-none font-mono placeholder:text-zinc-600 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
                <label className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 font-mono font-bold text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 cursor-pointer shrink-0">
                  <FileText size={15} className="text-[#FF5A00]" />
                  <span>
                    {procesandoArchivo ? "Procesando..." : "Subir PDFs Fichas"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleSubirPdfsFichas}
                    disabled={procesandoArchivo}
                    className="hidden"
                  />
                </label>

                <label className="bg-[#FFD700] hover:bg-yellow-400 text-black font-extrabold uppercase tracking-wider text-xs px-4 py-2.5 rounded-lg shadow-md flex items-center gap-2 cursor-pointer shrink-0 active:scale-95 transition-all">
                  <UploadCloud size={15} />
                  <span>
                    {procesandoArchivo
                      ? "Cargando..."
                      : "Subir Precios (Excel)"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={handleSubirListaPrecios}
                    disabled={procesandoArchivo}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center bg-black border border-zinc-800 p-0.5 rounded-lg ml-1">
                  <button
                    onClick={() => setVistaModo("tarjetas")}
                    className={`px-3 py-1.5 text-xs font-bold uppercase rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                      vistaModo === "tarjetas"
                        ? "bg-[#FFD700] text-black"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    <LayoutGrid size={14} /> TARJETAS
                  </button>
                  <button
                    onClick={() => setVistaModo("tabla")}
                    className={`px-3 py-1.5 text-xs font-bold uppercase rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
                      vistaModo === "tabla"
                        ? "bg-[#FFD700] text-black"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    <List size={14} /> TABLA
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-zinc-800/80 rounded-xl bg-[#030303]">
              {productosFiltrados.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs gap-2">
                  <Box size={28} className="text-zinc-800" />
                  <span>No se encontraron productos coincidentes.</span>
                </div>
              ) : vistaModo === "tabla" ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#080808] text-zinc-500 font-mono text-[10px] uppercase border-b border-zinc-800 sticky top-0 z-10 tracking-wider">
                    <tr>
                      <th className="p-3 w-28 text-center">FOTOS</th>
                      <th className="p-3 w-36">CÓDIGO</th>
                      <th className="p-3">PRODUCTO / DENOMINACIÓN</th>
                      <th className="p-3 text-right w-48">PRECIO LISTA</th>
                      <th className="p-3 text-center w-36">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 bg-transparent">
                    {productosPaginados.map((p) => (
                      <tr
                        key={p.id || p.codigo}
                        className="hover:bg-zinc-900/40 transition-colors align-middle"
                      >
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div
                              onClick={() =>
                                p.foto_tecnica &&
                                setFotoLightbox({
                                  url: p.foto_tecnica,
                                  titulo: `Plano Técnico — [${p.codigo}] ${p.nombre}`,
                                })
                              }
                              className={`w-9 h-9 rounded bg-black border overflow-hidden flex items-center justify-center transition-all shrink-0 ${
                                p.foto_tecnica
                                  ? "border-zinc-700 cursor-pointer hover:border-[#FF5A00]"
                                  : "border-zinc-900 opacity-40"
                              }`}
                              title={
                                p.foto_tecnica
                                  ? "Ver Foto Técnica"
                                  : "Sin Foto Técnica"
                              }
                            >
                              {p.foto_tecnica ? (
                                <img
                                  src={getImageUrl(p.foto_tecnica)}
                                  alt="Técnica"
                                  className="w-full h-full object-contain p-0.5"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <span className="text-[8px] font-mono text-zinc-600">
                                  TÉC
                                </span>
                              )}
                            </div>

                            <div
                              onClick={() =>
                                p.foto_catalogo &&
                                setFotoLightbox({
                                  url: p.foto_catalogo,
                                  titulo: `Catálogo — [${p.codigo}] ${p.nombre}`,
                                })
                              }
                              className={`w-9 h-9 rounded bg-black border overflow-hidden flex items-center justify-center transition-all shrink-0 ${
                                p.foto_catalogo
                                  ? "border-zinc-700 cursor-pointer hover:border-[#FF5A00]"
                                  : "border-zinc-900 opacity-40"
                              }`}
                              title={
                                p.foto_catalogo
                                  ? "Ver Foto Catálogo"
                                  : "Sin Foto Catálogo"
                              }
                            >
                              {p.foto_catalogo ? (
                                <img
                                  src={getImageUrl(p.foto_catalogo)}
                                  alt="Catálogo"
                                  className="w-full h-full object-contain p-0.5"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <span className="text-[8px] font-mono text-zinc-600">
                                  CAT
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3 font-mono font-bold">
                          <span className="bg-[#FF5A00]/10 text-[#FF5A00] border border-[#FF5A00]/20 px-2 py-0.5 rounded text-[11px]">
                            {p.codigo}
                          </span>
                        </td>

                        <td className="p-3">
                          <div className="text-zinc-100 font-bold uppercase tracking-tight text-xs">
                            {p.nombre}
                          </div>
                        </td>

                        <td className="p-3 text-right">
                          {renderPrecioLimpio(p.precio_lista)}
                        </td>

                        <td className="p-3 text-center">
                          <button
                            onClick={() => setProductoDetalle(p)}
                            className="px-3 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-mono font-bold text-[10px] uppercase rounded transition cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Eye size={12} className="text-[#FF5A00]" />
                            <span>DETALLES</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productosPaginados.map((p) => (
                    <div
                      key={p.id || p.codigo}
                      className="bg-[#080808] border border-zinc-800/90 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-[#FF5A00]/40 transition-all shadow-md group"
                    >
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-mono text-xs font-bold text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 rounded">
                            {p.codigo}
                          </span>
                          <div className="text-right">
                            {renderPrecioLimpio(p.precio_lista)}
                          </div>
                        </div>

                        <h4 className="text-xs font-bold text-white uppercase tracking-tight leading-snug">
                          {p.nombre}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 my-2">
                          <div
                            onClick={() =>
                              p.foto_tecnica &&
                              setFotoLightbox({
                                url: p.foto_tecnica,
                                titulo: `Plano Técnico — [${p.codigo}] ${p.nombre}`,
                              })
                            }
                            className={`h-24 rounded bg-black border overflow-hidden flex flex-col items-center justify-center p-1 relative ${
                              p.foto_tecnica
                                ? "border-zinc-800 cursor-pointer hover:border-[#FF5A00]/60"
                                : "border-zinc-900 opacity-40"
                            }`}
                          >
                            <span className="absolute top-1 left-1.5 text-[8px] font-mono font-bold text-zinc-400 bg-black/80 px-1 py-0.5 rounded border border-zinc-800 z-10">
                              TÉCNICA
                            </span>
                            {p.foto_tecnica ? (
                              <img
                                src={getImageUrl(p.foto_tecnica)}
                                alt="Técnica"
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <ImageIcon size={20} className="text-zinc-800" />
                            )}
                          </div>

                          <div
                            onClick={() =>
                              p.foto_catalogo &&
                              setFotoLightbox({
                                url: p.foto_catalogo,
                                titulo: `Catálogo — [${p.codigo}] ${p.nombre}`,
                              })
                            }
                            className={`h-24 rounded bg-black border overflow-hidden flex flex-col items-center justify-center p-1 relative ${
                              p.foto_catalogo
                                ? "border-zinc-800 cursor-pointer hover:border-[#FF5A00]/60"
                                : "border-zinc-900 opacity-40"
                            }`}
                          >
                            <span className="absolute top-1 left-1.5 text-[8px] font-mono font-bold text-[#FF5A00] bg-black/80 px-1 py-0.5 rounded border border-zinc-800 z-10">
                              CATÁLOGO
                            </span>
                            {p.foto_catalogo ? (
                              <img
                                src={getImageUrl(p.foto_catalogo)}
                                alt="Catálogo"
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <ImageIcon size={20} className="text-zinc-800" />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-900 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">
                          {p.categoria || "Conos"}
                        </span>

                        <button
                          onClick={() => setProductoDetalle(p)}
                          className="px-3 py-1.5 bg-black hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono font-bold rounded text-[10px] uppercase flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye size={12} className="text-[#FF5A00]" />
                          <span>DETALLES</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 text-[11px] font-mono font-bold text-zinc-500 uppercase shrink-0">
              <span>
                PÁGINA <strong className="text-white">{paginaCatalogo}</strong>{" "}
                DE{" "}
                <strong className="text-white">{totalPaginasCatalogo}</strong> (
                {productosFiltrados.length} REGISTROS)
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaCatalogo((p) => Math.max(p - 1, 1))}
                  disabled={paginaCatalogo === 1}
                  className="p-1.5 bg-black border border-zinc-800 hover:border-zinc-700 text-zinc-400 disabled:opacity-20 rounded cursor-pointer transition"
                >
                  <ChevronLeft size={16} />
                </button>

                <button
                  onClick={() =>
                    setPaginaCatalogo((p) =>
                      Math.min(p + 1, totalPaginasCatalogo),
                    )
                  }
                  disabled={paginaCatalogo === totalPaginasCatalogo}
                  className="p-1.5 bg-black border border-zinc-800 hover:border-zinc-700 text-zinc-400 disabled:opacity-20 rounded cursor-pointer transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: REGLAS COMERCIALES
            ======================================================== */}
        {activeTab === "prompt" && (
          <div className="p-6 space-y-4 max-w-4xl mx-auto h-full overflow-y-auto">
            <div className="bg-[#080808] border border-zinc-800 p-6 rounded-xl space-y-4 shadow-xl">
              <div>
                <h3 className="text-sm font-extrabold italic text-white uppercase font-sans">
                  POLÍTICAS COMERCIALES & ENTRENAMIENTO IA
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Definí las pautas sobre impuestos (IVA), escalas de descuentos
                  por cantidad y políticas de entrega que Gemini utilizará para
                  redactar los presupuestos.
                </p>
              </div>

              <textarea
                value={reglas}
                onChange={(e) => setReglas(e.target.value)}
                rows={12}
                className="w-full bg-black border border-zinc-800 p-4 text-xs text-zinc-200 focus:border-[#FF5A00] outline-none leading-relaxed rounded-lg font-mono placeholder:text-zinc-700"
                placeholder="Ejemplo: Precios indicados son + IVA 21%. Envío sin cargo en GBA en compras superiores a $150.000..."
              />

              <button
                onClick={guardarReglas}
                disabled={loading}
                className="bg-[#FFD700] hover:bg-yellow-400 text-black font-extrabold text-xs uppercase tracking-wider px-6 py-2.5 rounded-lg shadow-md transition cursor-pointer active:scale-95"
              >
                Guardar Configuración Comercial
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL LIGHTBOX
          ======================================================== */}
      {fotoLightbox && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setFotoLightbox(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full bg-[#0a0a0a] border border-zinc-800 rounded-xl p-5 shadow-2xl flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFotoLightbox(null)}
              className="absolute top-4 right-4 p-2 bg-black hover:bg-zinc-900 text-zinc-400 hover:text-white rounded-lg transition border border-zinc-800 cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="text-xs font-mono font-bold text-[#FF5A00] uppercase tracking-wider self-start">
              {fotoLightbox.titulo || "Vista Previa de Imagen"}
            </div>

            <div className="w-full max-h-[75vh] flex items-center justify-center bg-black rounded-lg overflow-hidden p-3 border border-zinc-900">
              <img
                src={getImageUrl(fotoLightbox.url)}
                alt="Foto ampliada"
                className="max-w-full max-h-[70vh] object-contain rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DETALLE: FICHA TÉCNICA
          ======================================================== */}
      {productoDetalle && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[200] flex items-center justify-center p-4 font-sans animate-in fade-in duration-150">
          <div className="bg-[#0a0a0a] border border-zinc-800 w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#050505] border-b border-zinc-800 p-5 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 rounded">
                    [{productoDetalle.codigo}]
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 uppercase">
                    {productoDetalle.categoria || "Conos"}
                  </span>
                </div>
                <h3 className="text-base font-extrabold italic text-white uppercase tracking-tight">
                  {productoDetalle.nombre}
                </h3>
              </div>

              <button
                onClick={() => setProductoDetalle(null)}
                className="p-2 text-zinc-400 hover:text-white bg-black border border-zinc-800 rounded-lg transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              <div className="bg-black border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#FF5A00]/10 text-[#FF5A00] rounded-lg border border-[#FF5A00]/20">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">
                      PRECIO OFICIAL DE LISTA
                    </span>
                    <span className="text-xs text-zinc-400 font-sans">
                      Sincronizado con matriz comercial
                    </span>
                  </div>
                </div>
                <div>{renderPrecioLimpio(productoDetalle.precio_lista)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-black border border-zinc-800 rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                      PLANO TÉCNICO
                    </span>
                    <label className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition">
                      <Upload size={11} />
                      <span>
                        {productoDetalle.foto_tecnica
                          ? "Cambiar"
                          : "Subir Foto"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleUploadFotoProducto(
                            productoDetalle.id,
                            "tecnica",
                            e,
                          )
                        }
                      />
                    </label>
                  </div>

                  <div
                    onClick={() =>
                      productoDetalle.foto_tecnica &&
                      setFotoLightbox({
                        url: productoDetalle.foto_tecnica,
                        titulo: `Plano Técnico — [${productoDetalle.codigo}] ${productoDetalle.nombre}`,
                      })
                    }
                    className={`w-full h-48 rounded bg-[#050505] border border-zinc-900 overflow-hidden flex items-center justify-center relative ${
                      productoDetalle.foto_tecnica
                        ? "cursor-pointer hover:border-[#FF5A00]"
                        : "opacity-40"
                    }`}
                  >
                    {productoDetalle.foto_tecnica ? (
                      <img
                        src={getImageUrl(productoDetalle.foto_tecnica)}
                        alt="Técnica"
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="text-center space-y-1">
                        <ImageIcon
                          size={24}
                          className="mx-auto text-zinc-800"
                        />
                        <span className="text-[10px] font-mono text-zinc-600 block">
                          Sin Foto Técnica
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-black border border-zinc-800 rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-[#FF5A00] uppercase tracking-wider">
                      USO / CATÁLOGO
                    </span>
                    <label className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition">
                      <Upload size={11} />
                      <span>
                        {productoDetalle.foto_catalogo
                          ? "Cambiar"
                          : "Subir Foto"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleUploadFotoProducto(
                            productoDetalle.id,
                            "catalogo",
                            e,
                          )
                        }
                      />
                    </label>
                  </div>

                  <div
                    onClick={() =>
                      productoDetalle.foto_catalogo &&
                      setFotoLightbox({
                        url: productoDetalle.foto_catalogo,
                        titulo: `Uso / Catálogo — [${productoDetalle.codigo}] ${productoDetalle.nombre}`,
                      })
                    }
                    className={`w-full h-48 rounded bg-[#050505] border border-zinc-900 overflow-hidden flex items-center justify-center relative ${
                      productoDetalle.foto_catalogo
                        ? "cursor-pointer hover:border-[#FF5A00]"
                        : "opacity-40"
                    }`}
                  >
                    {productoDetalle.foto_catalogo ? (
                      <img
                        src={getImageUrl(productoDetalle.foto_catalogo)}
                        alt="Catálogo"
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="text-center space-y-1">
                        <ImageIcon
                          size={24}
                          className="mx-auto text-zinc-800"
                        />
                        <span className="text-[10px] font-mono text-zinc-600 block">
                          Sin Foto Catálogo
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {productoDetalle.medidas && (
                <div className="bg-black border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-[11px] font-mono font-bold text-[#FF5A00] uppercase tracking-wider flex items-center gap-2">
                    <Box size={14} /> ESPECIFICACIÓN Y MEDIDAS TÉCNICAS
                  </h4>
                  <p className="text-xs text-zinc-200 font-mono leading-relaxed bg-zinc-950 p-3 rounded border border-zinc-900">
                    {productoDetalle.medidas}
                  </p>
                </div>
              )}

              {productoDetalle.descripcion && (
                <div className="bg-black border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-[11px] font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} className="text-[#FF5A00]" /> DESCRIPCIÓN
                    TÉCNICO-COMERCIAL
                  </h4>
                  <p className="text-xs text-zinc-300 font-sans leading-relaxed bg-zinc-950 p-3.5 rounded border border-zinc-900 whitespace-pre-wrap">
                    {productoDetalle.descripcion}
                  </p>
                </div>
              )}

              {(productoDetalle.aplicacion ||
                productoDetalle.usos_recomendados) && (
                <div className="bg-black border border-zinc-800 rounded-xl p-4 space-y-3">
                  <h4 className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Tag size={14} className="text-[#FF5A00]" /> APLICACIONES Y
                    USOS RECOMENDADOS
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {parseUsosList(
                      productoDetalle.usos_recomendados ||
                        productoDetalle.aplicacion,
                    ).map((uso, idx) => (
                      <span
                        key={idx}
                        className="bg-zinc-900 text-zinc-200 border border-zinc-800 px-3 py-1 rounded text-xs font-mono font-medium flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00]" />
                        {uso}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#050505] border-t border-zinc-800 p-4 flex justify-end shrink-0">
              <button
                onClick={() => setProductoDetalle(null)}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono font-bold text-xs uppercase px-5 py-2 rounded transition cursor-pointer"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
