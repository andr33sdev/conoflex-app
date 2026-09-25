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
  Cpu,
  LayoutGrid,
  List,
  Tag,
  UploadCloud,
  Zap,
  X,
  Edit3,
} from "lucide-react";

// HELPER PARA RESOLVER RUTAS DE IMÁGENES ESTÁTICAS (BACKEND VS VITE DEV)
const getImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  let path = url.replace(/\\/g, "/");
  if (path.startsWith("public/")) {
    path = path.substring(6);
  }
  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // Si se ejecuta en Vite local (puerto 5173), redirige las imágenes al backend Express (puerto 3000)
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return `http://localhost:3000${path}`;
  }

  return path;
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

  // SISTEMA DE NOTIFICACIONES TOAST CYBER-INDUSTRIAL
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }

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
  const [catalogoPreview, setCatalogoPreview] = useState("");
  const [productoEditar, setProductoEditar] = useState(null);

  // Vista y Paginación del Catálogo
  const [vistaModo, setVistaModo] = useState("tabla"); // 'tabla' | 'tarjetas'
  const [paginaCatalogo, setPaginaCatalogo] = useState(1);
  const itemsPorPagina = 10;

  // ESTADO PARA MODAL LIGHTBOX DE FOTOS AMPLIADAS
  const [fotoLightbox, setFotoLightbox] = useState(null); // { url, titulo }

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
        setCatalogoPreview(data.contenidoPreview || "");
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
        if (productoEditar && productoEditar.id === productoId) {
          setProductoEditar((prev) => ({
            ...prev,
            [tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo"]:
              data.url ||
              prev[tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo"],
          }));
        }
        showToast("Imagen actualizada con éxito", "success");
      }
    } catch (err) {
      showToast("Error al adjuntar la imagen", "error");
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
        showToast("Ficha comercial actualizada", "success");
      }
    } catch (err) {
      showToast("Error al actualizar la ficha del producto", "error");
    }
  };

  const generarBorrador = async (mail) => {
    if (!mail) return;
    setGenerandoBorrador(true);
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

  // RENDERIZADOR ESTRUCTURADO Y LIMPIO PARA PRECIOS COMPUESTOS
  const renderPrecioLimpio = (precioStr) => {
    if (!precioStr || precioStr === "-")
      return <span className="text-slate-500 font-mono">-</span>;

    const partes = precioStr.split("|").map((p) => p.trim());
    if (partes.length === 1) {
      return (
        <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap">
          {partes[0]}
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-1.5 justify-center items-end">
        {partes.map((p, idx) => {
          const subPartes = p.split(":");
          if (subPartes.length === 2) {
            return (
              <div
                key={idx}
                className="flex items-center gap-1.5 text-[10.5px] font-mono whitespace-nowrap bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
              >
                <span className="text-slate-400 font-medium">
                  {subPartes[0].trim()}:
                </span>
                <strong className="text-emerald-300 font-bold">
                  {subPartes[1].trim()}
                </strong>
              </div>
            );
          }
          return (
            <span
              key={idx}
              className="text-emerald-400 font-mono font-bold text-[11px] whitespace-nowrap bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
            >
              {p}
            </span>
          );
        })}
      </div>
    );
  };

  // FILTRADO Y PAGINACIÓN DEL CATÁLOGO
  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return productos;

    return productos.filter((p) => {
      const cod = (p.codigo || "").toLowerCase();
      const nom = (p.nombre || "").toLowerCase();
      const app = (p.aplicacion || "").toLowerCase();
      const esp = (p.especificacion || "").toLowerCase();
      const med = (p.medidas || "").toLowerCase();
      return (
        cod.includes(q) ||
        nom.includes(q) ||
        app.includes(q) ||
        esp.includes(q) ||
        med.includes(q)
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 font-sans bg-[#070a12] text-slate-100 transition-all duration-300">
        <div className="p-6 bg-[#0e1422]/80 border border-slate-800 rounded-3xl shadow-[0_0_30px_rgba(16,185,129,0.1)] relative backdrop-blur-xl">
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full animate-ping" />
          <Cpu size={44} className="text-emerald-400" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-base font-bold tracking-widest text-white uppercase font-mono">
            VINCULAR GMAIL COMERCIAL
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {errorMsg ||
              "Autorizá la conexión con Google Cloud para habilitar la cotización automática por IA."}
          </p>
        </div>
        <button
          onClick={abrirLoginGoogle}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3 text-xs rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all flex items-center gap-2 cursor-pointer active:scale-95"
        >
          <ExternalLink size={14} /> AUTORIZAR GOOGLE WORKSPACE
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl relative">
      {/* SISTEMA DE TOASTS & INDICADOR DE PROCESAMIENTO ANIMADO */}
      <div className="fixed top-6 right-6 z-[300] flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {procesandoArchivo && (
          <div className="pointer-events-auto flex flex-col p-4 bg-[#0f172a]/95 border border-amber-500/50 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.25)] backdrop-blur-2xl transition-all duration-300 animate-in slide-in-from-top-5">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                <RefreshCw size={20} className="animate-spin text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-bold text-amber-300 font-mono uppercase tracking-wider">
                    PROCESANDO CATÁLOGO
                  </h5>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                </div>
                <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                  Parseando matriz de tarjetas y sincronizando productos...
                </p>
              </div>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-1.5 mt-3 overflow-hidden border border-slate-800/80 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 rounded-full animate-pulse shadow-[0_0_10px_#f59e0b]" />
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`pointer-events-auto relative overflow-hidden p-4 bg-[#0f172a]/95 border rounded-2xl shadow-[0_0_35px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all duration-300 animate-in slide-in-from-top-5 text-xs ${
              toast.type === "success"
                ? "border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
                : "border-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.2)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  toast.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                }`}
              >
                {toast.type === "success" ? (
                  <CheckCircle2 size={18} className="animate-bounce" />
                ) : (
                  <AlertCircle size={18} className="animate-pulse" />
                )}
              </div>

              <div className="flex-1 pr-2">
                <h5
                  className={`text-xs font-bold font-mono uppercase tracking-wider ${
                    toast.type === "success"
                      ? "text-emerald-300"
                      : "text-rose-300"
                  }`}
                >
                  {toast.type === "success"
                    ? "OPERACIÓN EXITOSA"
                    : "ERROR DE SISTEMA"}
                </h5>
                <p className="text-[11px] text-slate-200 mt-0.5 leading-relaxed font-sans">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900">
              <div
                className={`h-full transition-all duration-[3800ms] ease-linear ${
                  toast.type === "success" ? "bg-emerald-400" : "bg-rose-400"
                }`}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* HEADER DE MÓDULO */}
      <div className="bg-[#0f172a]/70 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Cpu size={20} className="text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                IA COMERCIAL
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />{" "}
                ONLINE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Generación de propuestas & analítica de planta
            </p>
          </div>
        </div>

        {/* CONTROLES DE PESTAÑA */}
        <div className="flex items-center gap-1 bg-[#090d16]/80 p-1 border border-slate-800/80 rounded-xl shadow-inner">
          <button
            onClick={() => setActiveTab("bandeja")}
            className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
              activeTab === "bandeja"
                ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] scale-[1.02]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#0e1422]"
            }`}
          >
            <Inbox size={14} /> Bandeja ({mails.length})
          </button>

          <button
            onClick={() => setActiveTab("catalogo")}
            className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
              activeTab === "catalogo"
                ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] scale-[1.02]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#0e1422]"
            }`}
          >
            <FileSpreadsheet size={14} /> Catálogo ({productos.length})
          </button>

          <button
            onClick={() => setActiveTab("prompt")}
            className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
              activeTab === "prompt"
                ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] scale-[1.02]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#0e1422]"
            }`}
          >
            <Sliders size={14} /> Reglas IA
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#070a12] relative">
        {/* VISTA BANDEJA */}
        {activeTab === "bandeja" && (
          <div className="h-full flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800/80 transition-all duration-300 ease-out">
            <div className="w-full md:w-80 lg:w-96 flex flex-col min-h-0 bg-[#090d16]/50">
              <div className="p-3.5 border-b border-slate-800/80 flex justify-between items-center bg-[#0e1422]/60">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Mail size={13} className="text-emerald-400" />
                  ENTRADAS IA-CONSULTA
                </span>
                <button
                  onClick={fetchMails}
                  disabled={loading}
                  className="p-1.5 hover:bg-slate-800/80 text-slate-400 hover:text-emerald-400 rounded-lg transition cursor-pointer"
                  title="Sincronizar mensajes"
                >
                  <RefreshCw
                    size={13}
                    className={loading ? "animate-spin text-emerald-400" : ""}
                  />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 min-h-0">
                {mails.map((m) => {
                  const isSelected = selectedMail?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMail(m)}
                      className={`p-3.5 transition-all duration-200 cursor-pointer flex gap-3 relative ${
                        isSelected
                          ? "bg-[#131c2c]/90 border-l-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)] translate-x-0.5"
                          : "hover:bg-[#0e1422]/80 hover:translate-x-0.5"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#0e1424] border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-emerald-400 shrink-0 mt-0.5">
                        {getInicial(m.emailCliente)}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-baseline gap-2">
                          <h4 className="text-xs font-bold text-slate-200 truncate">
                            {m.emailCliente}
                          </h4>
                        </div>
                        <p className="text-xs font-semibold text-emerald-400/90 truncate font-mono">
                          {m.asunto}
                        </p>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {m.resumen}
                        </p>
                      </div>

                      <ChevronRight
                        size={14}
                        className={`self-center shrink-0 transition-all duration-200 ${
                          isSelected
                            ? "text-emerald-400 translate-x-1"
                            : "text-slate-700"
                        }`}
                      />
                    </div>
                  );
                })}

                {mails.length === 0 && !loading && (
                  <div className="p-8 text-center space-y-2 text-slate-500">
                    <CheckCircle2
                      size={28}
                      className="mx-auto text-emerald-500/50"
                    />
                    <p className="text-xs font-medium text-slate-300">
                      Bandeja despejada
                    </p>
                    <p className="text-[11px]">
                      Asigná la etiqueta 'IA-Consulta' en Gmail para procesarlos
                      aquí.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-[#070a12]">
              {selectedMail ? (
                <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 overflow-y-auto transition-all duration-300 ease-out">
                  <div className="bg-[#0e1422]/90 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-md backdrop-blur-md">
                    <div className="flex flex-wrap justify-between items-start gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                          REQUERIMIENTO DETECTADO
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">
                          {selectedMail.asunto}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 bg-[#070a12] border border-slate-800 px-3 py-1.5 rounded-xl">
                        <User size={13} className="text-slate-400" />
                        <span className="text-xs font-mono text-slate-200">
                          {selectedMail.emailCliente}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        CONTENIDO DEL MENSAJE:
                      </span>
                      <div className="bg-[#070a12] border border-slate-800/80 p-4 rounded-xl text-slate-300 text-xs leading-relaxed font-sans font-normal whitespace-pre-wrap">
                        {selectedMail.resumen}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-[#0e1422] via-[#0e1422] to-emerald-950/20 border border-emerald-500/25 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2 font-mono">
                        <Sparkles size={14} /> GENERACIÓN AUTOMÁTICA DE
                        PROPUESTA
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed max-w-lg">
                        Analiza los requerimientos, selecciona productos del
                        catálogo con sus precios vigentes e inyecta la respuesta
                        maquetada en tu borrador de Gmail.
                      </p>
                    </div>

                    <button
                      onClick={() => generarBorrador(selectedMail)}
                      disabled={generandoBorrador}
                      className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2.5 text-xs rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 active:scale-95"
                    >
                      {generandoBorrador ? (
                        <>
                          <RefreshCw
                            size={14}
                            className="animate-spin text-slate-950"
                          />
                          <span>Gemini procesando...</span>
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
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-600 text-center space-y-3">
                  <Inbox size={36} className="text-slate-800" />
                  <p className="text-xs font-medium">
                    Seleccioná un mensaje de la bandeja para leer la consulta y
                    cotizar.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA CATÁLOGO REFORZADA Y PAGINADA */}
        {activeTab === "catalogo" && (
          <div className="p-5 flex flex-col h-full space-y-4 overflow-hidden transition-all duration-300 ease-out">
            {/* 1. ZONA DE CARGA DE LISTA DE PRECIOS */}
            <div className="bg-[#0e1422] border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    SINCRONIZADOR INTELIGENTE DE LISTA DE PRECIOS
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Preserva fotos técnicas, aplicaciones y especificaciones
                    previas al actualizar precios.
                  </p>
                </div>
              </div>

              <label className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2 cursor-pointer shrink-0">
                <UploadCloud size={16} />
                <span>
                  {procesandoArchivo
                    ? "Procesando..."
                    : "Subir PDF / Excel Oficial"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={handleSubirListaPrecios}
                  disabled={procesandoArchivo}
                  className="hidden"
                />
              </label>
            </div>

            {/* 2. BARRA DE HERRAMIENTAS DE BÚSQUEDA Y VISTAS */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0e1422]/60 p-3 border border-slate-800/80 rounded-2xl shrink-0">
              <div className="relative flex-1 w-full max-w-md">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPaginaCatalogo(1);
                  }}
                  placeholder="Buscar por código, nombre, uso o aplicación..."
                  className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-100 pl-10 pr-4 py-2 focus:border-emerald-500/50 outline-none rounded-xl font-sans"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end font-mono">
                <span className="text-xs text-slate-400">
                  Mostrando{" "}
                  <strong className="text-emerald-400">
                    {productosFiltrados.length}
                  </strong>{" "}
                  de <strong className="text-white">{productos.length}</strong>{" "}
                  productos
                </span>

                <div className="flex items-center gap-1 bg-[#070a12] p-1 border border-slate-800 rounded-xl">
                  <button
                    onClick={() => setVistaModo("tabla")}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaModo === "tabla"
                        ? "bg-slate-800 text-emerald-400"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                    title="Vista Tabla Ejecutiva"
                  >
                    <List size={16} />
                  </button>
                  <button
                    onClick={() => setVistaModo("tarjetas")}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      vistaModo === "tarjetas"
                        ? "bg-slate-800 text-emerald-400"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                    title="Vista Tarjetas Comerciales"
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* 3. VISTA DE DATOS (TABLA O TARJETAS CON PAGINACIÓN) */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {productosFiltrados.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-500 font-mono text-xs">
                  No se encontraron productos coincidentes con la búsqueda.
                </div>
              ) : vistaModo === "tabla" ? (
                /* VISTA TABLA EJECUTIVA CON DUAL FOTOS */
                <div className="bg-[#0e1422] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#070a12] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="p-3 w-36 text-center">
                          FOTOS (TÉC. / CAT.)
                        </th>
                        <th className="p-3 w-32">Código</th>
                        <th className="p-3">Nombre & Especificación</th>
                        <th className="p-3 w-44">Uso / Aplicación</th>
                        <th className="p-3 text-right w-56">Precio Lista</th>
                        <th className="p-3 text-center w-24">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 bg-[#070a12]/30">
                      {productosPaginados.map((p) => (
                        <tr
                          key={p.id || p.codigo}
                          className="hover:bg-[#121824]/80 transition-colors align-middle"
                        >
                          {/* Miniaturas de Ambas Fotos */}
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Foto Técnica */}
                              <div
                                onClick={() =>
                                  p.foto_tecnica &&
                                  setFotoLightbox({
                                    url: p.foto_tecnica,
                                    titulo: `Plano Técnico — [${p.codigo}] ${p.nombre}`,
                                  })
                                }
                                className={`w-11 h-11 rounded-lg bg-slate-950 border overflow-hidden flex items-center justify-center transition-all ${
                                  p.foto_tecnica
                                    ? "border-slate-700 cursor-pointer hover:border-emerald-500 hover:scale-105"
                                    : "border-slate-800 opacity-40"
                                }`}
                                title={
                                  p.foto_tecnica
                                    ? "Clic para ampliar Foto Técnica"
                                    : "Sin Foto Técnica"
                                }
                              >
                                {p.foto_tecnica ? (
                                  <img
                                    src={getImageUrl(p.foto_tecnica)}
                                    alt="Técnica"
                                    className="w-full h-full object-contain p-0.5"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src =
                                        "https://via.placeholder.com/150?text=Sin+Foto";
                                    }}
                                  />
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-600">
                                    TÉC
                                  </span>
                                )}
                              </div>

                              {/* Foto Catálogo */}
                              <div
                                onClick={() =>
                                  p.foto_catalogo &&
                                  setFotoLightbox({
                                    url: p.foto_catalogo,
                                    titulo: `Uso / Catálogo — [${p.codigo}] ${p.nombre}`,
                                  })
                                }
                                className={`w-11 h-11 rounded-lg bg-slate-950 border overflow-hidden flex items-center justify-center transition-all ${
                                  p.foto_catalogo
                                    ? "border-slate-700 cursor-pointer hover:border-emerald-500 hover:scale-105"
                                    : "border-slate-800 opacity-40"
                                }`}
                                title={
                                  p.foto_catalogo
                                    ? "Clic para ampliar Foto Catálogo"
                                    : "Sin Foto Catálogo"
                                }
                              >
                                {p.foto_catalogo ? (
                                  <img
                                    src={getImageUrl(p.foto_catalogo)}
                                    alt="Catálogo"
                                    className="w-full h-full object-contain p-0.5"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src =
                                        "https://via.placeholder.com/150?text=Sin+Foto";
                                    }}
                                  />
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-600">
                                    CAT
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                            {p.codigo}
                          </td>

                          <td className="p-3 space-y-0.5">
                            <div className="text-slate-100 font-bold font-sans text-xs">
                              {p.nombre}
                            </div>
                            {p.medidas && (
                              <div className="text-[11px] text-slate-400 font-mono">
                                {p.medidas}
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {p.aplicacion ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px] font-mono">
                                <Tag size={10} /> {p.aplicacion}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 italic">
                                Sin definir
                              </span>
                            )}
                          </td>

                          {/* Precio Lista Estructurado */}
                          <td className="p-3 text-right">
                            {renderPrecioLimpio(p.precio_lista)}
                          </td>

                          <td className="p-3 text-center">
                            <button
                              onClick={() => setProductoEditar({ ...p })}
                              className="p-1.5 bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 rounded-lg transition shadow cursor-pointer inline-flex items-center gap-1 font-mono text-[11px]"
                            >
                              <Edit3 size={13} /> Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* VISTA TARJETAS COMERCIALES REESTRUCTURADA */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productosPaginados.map((p) => (
                    <div
                      key={p.id || p.codigo}
                      className="bg-[#0e1422] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-emerald-500/30 transition-all shadow-lg group relative overflow-hidden"
                    >
                      <div className="space-y-2.5">
                        {/* Cabecera de la Tarjeta */}
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md shrink-0">
                            {p.codigo}
                          </span>
                          <div className="text-right">
                            {renderPrecioLimpio(p.precio_lista)}
                          </div>
                        </div>

                        <h4 className="text-xs font-bold text-white font-sans leading-snug">
                          {p.nombre}
                        </h4>
                        {p.medidas && (
                          <p className="text-[11px] text-slate-400 font-mono line-clamp-2">
                            {p.medidas}
                          </p>
                        )}

                        {/* Grilla Doble de Fotos (Técnica y Catálogo) */}
                        <div className="grid grid-cols-2 gap-2 my-2">
                          {/* Slot Foto Técnica */}
                          <div
                            onClick={() =>
                              p.foto_tecnica &&
                              setFotoLightbox({
                                url: p.foto_tecnica,
                                titulo: `Plano Técnico — [${p.codigo}] ${p.nombre}`,
                              })
                            }
                            className={`h-28 rounded-xl bg-slate-950 border overflow-hidden flex flex-col items-center justify-center p-1 relative transition-all ${
                              p.foto_tecnica
                                ? "border-slate-800 cursor-pointer hover:border-emerald-500/60"
                                : "border-slate-800/60 opacity-50"
                            }`}
                          >
                            <span className="absolute top-1 left-1.5 text-[8px] font-mono font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 z-10">
                              TÉCNICA
                            </span>
                            {p.foto_tecnica ? (
                              <img
                                src={getImageUrl(p.foto_tecnica)}
                                alt="Técnica"
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src =
                                    "https://via.placeholder.com/150?text=Sin+Foto";
                                }}
                              />
                            ) : (
                              <ImageIcon size={22} className="text-slate-800" />
                            )}
                          </div>

                          {/* Slot Foto Catálogo */}
                          <div
                            onClick={() =>
                              p.foto_catalogo &&
                              setFotoLightbox({
                                url: p.foto_catalogo,
                                titulo: `Uso / Catálogo — [${p.codigo}] ${p.nombre}`,
                              })
                            }
                            className={`h-28 rounded-xl bg-slate-950 border overflow-hidden flex flex-col items-center justify-center p-1 relative transition-all ${
                              p.foto_catalogo
                                ? "border-slate-800 cursor-pointer hover:border-emerald-500/60"
                                : "border-slate-800/60 opacity-50"
                            }`}
                          >
                            <span className="absolute top-1 left-1.5 text-[8px] font-mono font-bold text-emerald-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 z-10">
                              CATÁLOGO
                            </span>
                            {p.foto_catalogo ? (
                              <img
                                src={getImageUrl(p.foto_catalogo)}
                                alt="Catálogo"
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src =
                                    "https://via.placeholder.com/150?text=Sin+Foto";
                                }}
                              />
                            ) : (
                              <ImageIcon size={22} className="text-slate-800" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pie de la Tarjeta */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        {p.aplicacion ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px] font-mono truncate max-w-[160px]">
                            <Tag size={10} /> {p.aplicacion}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600 italic">
                            Sin aplicación
                          </span>
                        )}

                        <button
                          onClick={() => setProductoEditar({ ...p })}
                          className="p-1.5 bg-slate-900 border border-slate-700 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-400 rounded-lg transition text-xs font-mono flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Edit3 size={13} /> Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. FOOTER CON PAGINACIÓN */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400 shrink-0">
              <span>
                Página <strong className="text-white">{paginaCatalogo}</strong>{" "}
                de{" "}
                <strong className="text-white">{totalPaginasCatalogo}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaCatalogo((p) => Math.max(p - 1, 1))}
                  disabled={paginaCatalogo === 1}
                  className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 rounded-lg cursor-pointer transition"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="px-3 py-1 bg-[#070a12] border border-slate-800 rounded-lg text-emerald-400 font-bold">
                  {paginaCatalogo} / {totalPaginasCatalogo}
                </span>

                <button
                  onClick={() =>
                    setPaginaCatalogo((p) =>
                      Math.min(p + 1, totalPaginasCatalogo),
                    )
                  }
                  disabled={paginaCatalogo === totalPaginasCatalogo}
                  className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 rounded-lg cursor-pointer transition"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA REGLAS COMERCIALES */}
        {activeTab === "prompt" && (
          <div className="p-5 space-y-4 max-w-4xl mx-auto h-full overflow-y-auto transition-all duration-300 ease-out">
            <div className="bg-[#0e1422] border border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-emerald-400 font-mono">
                  POLÍTICAS COMERCIALES Y ENTRENAMIENTO IA
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Definí las pautas sobre impuestos (IVA), escalas de descuentos
                  por cantidad y políticas de envío en CABA/GBA que Gemini
                  utilizará para redactar los presupuestos.
                </p>
              </div>

              <textarea
                value={reglas}
                onChange={(e) => setReglas(e.target.value)}
                rows={12}
                className="w-full bg-[#070a12] border border-slate-800 p-3.5 text-xs text-slate-200 focus:border-emerald-500/50 outline-none leading-relaxed rounded-xl font-sans"
                placeholder="Ejemplo: Precios indicados son + IVA 21%. Envío sin cargo en GBA en compras superiores a $150.000..."
              />

              <button
                onClick={guardarReglas}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition cursor-pointer"
              >
                Guardar Configuración Comercial
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL LIGHTBOX PARA VER FOTOS EN TAMAÑO COMPLETO */}
      {fotoLightbox && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in transition-all duration-200"
          onClick={() => setFotoLightbox(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full bg-[#0e1422] border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setFotoLightbox(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full transition cursor-pointer z-10 border border-slate-700"
            >
              <X size={18} />
            </button>

            <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider self-start px-1">
              {fotoLightbox.titulo || "Vista Previa de Imagen"}
            </div>

            <div className="w-full max-h-[75vh] flex items-center justify-center bg-[#070a12] rounded-xl overflow-hidden p-3 border border-slate-800">
              <img
                src={getImageUrl(fotoLightbox.url)}
                alt="Foto ampliada"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src =
                    "https://via.placeholder.com/600x400?text=Error+al+cargar+imagen";
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENHANCED EDITAR FICHA TÉCNICA */}
      {productoEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-xl p-6 rounded-2xl shadow-2xl space-y-5 relative text-xs">
            <button
              onClick={() => setProductoEditar(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                FICHA COMERCIAL [{productoEditar.codigo}]
              </span>
              <h3 className="text-sm font-bold text-white mt-1.5">
                {productoEditar.nombre}
              </h3>
            </div>

            <div className="space-y-4">
              {/* Fotos Preview */}
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="bg-[#070a12] p-3 rounded-xl border border-slate-800 text-center space-y-2">
                  <span className="text-[10px] text-slate-400 block font-bold">
                    FOTO TÉCNICA (PLANO)
                  </span>
                  <div className="w-full h-32 rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800 relative p-1">
                    {productoEditar.foto_tecnica ? (
                      <img
                        src={getImageUrl(productoEditar.foto_tecnica)}
                        className="w-full h-full object-contain"
                        alt="Técnica"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src =
                            "https://via.placeholder.com/150?text=Sin+Foto";
                        }}
                      />
                    ) : (
                      <ImageIcon size={24} className="text-slate-800" />
                    )}
                  </div>
                  <label className="cursor-pointer text-[10px] bg-[#0e1422] border border-slate-800 hover:border-emerald-400 px-2 py-1 text-slate-300 rounded inline-flex items-center gap-1 transition-all">
                    <Upload size={10} /> Subir Foto Técnica
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleUploadFotoProducto(
                          productoEditar.id,
                          "tecnica",
                          e,
                        )
                      }
                    />
                  </label>
                </div>

                <div className="bg-[#070a12] p-3 rounded-xl border border-slate-800 text-center space-y-2">
                  <span className="text-[10px] text-slate-400 block font-bold">
                    FOTO CATÁLOGO (USO)
                  </span>
                  <div className="w-full h-32 rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-800 relative p-1">
                    {productoEditar.foto_catalogo ? (
                      <img
                        src={getImageUrl(productoEditar.foto_catalogo)}
                        className="w-full h-full object-contain"
                        alt="Catálogo"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src =
                            "https://via.placeholder.com/150?text=Sin+Foto";
                        }}
                      />
                    ) : (
                      <ImageIcon size={24} className="text-slate-800" />
                    )}
                  </div>
                  <label className="cursor-pointer text-[10px] bg-[#0e1422] border border-slate-800 hover:border-emerald-400 px-2 py-1 text-slate-300 rounded inline-flex items-center gap-1 transition-all">
                    <Upload size={10} /> Subir Foto Catálogo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleUploadFotoProducto(
                          productoEditar.id,
                          "catalogo",
                          e,
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Formulario Comercial */}
              <div className="space-y-3 font-mono">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      Nombre Comercial:
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
                      className="w-full bg-[#070a12] border border-slate-800 text-slate-100 p-2 rounded-xl outline-none focus:border-emerald-500/50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      Precio Lista:
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
                      className="w-full bg-[#070a12] border border-slate-800 text-emerald-400 font-bold p-2 rounded-xl outline-none focus:border-emerald-500/50 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    Aplicaciones y Usos de Venta:
                  </label>
                  <input
                    type="text"
                    value={productoEditar.aplicacion || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        aplicacion: e.target.value,
                      })
                    }
                    placeholder="Ej: Autopistas, Obras Viales, Vía Pública, Seguridad Industrial"
                    className="w-full bg-[#070a12] border border-slate-800 text-slate-100 p-2 rounded-xl outline-none focus:border-emerald-500/50 text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    Especificación Técnica / Medidas:
                  </label>
                  <textarea
                    rows={2}
                    value={productoEditar.medidas || ""}
                    onChange={(e) =>
                      setProductoEditar({
                        ...productoEditar,
                        medidas: e.target.value,
                      })
                    }
                    placeholder="Ej: Conformado: 1 Pieza | Base: 35x35cm. | Reflectivo: 1x7cm."
                    className="w-full bg-[#070a12] border border-slate-800 text-slate-100 p-2 rounded-xl outline-none focus:border-emerald-500/50 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 font-mono">
              <button
                onClick={() => setProductoEditar(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEdicionProducto}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
