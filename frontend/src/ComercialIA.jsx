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
  Image as ImageIcon,
  User,
  CheckCircle2,
  Inbox,
  ChevronRight,
  Send,
  Sliders,
  FileSpreadsheet,
  Cpu,
} from "lucide-react";

export default function ComercialIA() {
  const [activeTab, setActiveTab] = useState("bandeja"); // 'bandeja' | 'catalogo' | 'prompt' | 'reportes'
  const [mails, setMails] = useState([]);
  const [selectedMail, setSelectedMail] = useState(null);
  const [reglas, setReglas] = useState("");
  const [loading, setLoading] = useState(false);
  const [generandoBorrador, setGenerandoBorrador] = useState(false);
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
        alert("✨ ¡Borrador inyectado con éxito en Gmail!");
        fetchMails();
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (err) {
      alert("❌ Error al conectar con el servidor");
    } finally {
      setGenerandoBorrador(false);
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
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl">
      {/* HEADER DE MÓDULO CON EFECTO VIDRIO Y GLOW */}
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

        {/* CONTROLES DE PESTAÑA CON TRANSICIÓN SUAVE */}
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

          <button
            onClick={() => setActiveTab("reportes")}
            className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
              activeTab === "reportes"
                ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] scale-[1.02]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#0e1422]"
            }`}
          >
            <FileText size={14} /> Diagnóstico
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO CON ANIMACIÓN FADE-IN */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#070a12] relative">
        {/* VISTA BANDEJA SPLIT-VIEW CON SLIDE-IN */}
        {activeTab === "bandeja" && (
          <div className="h-full flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-800/80 transition-all duration-300 ease-out">
            {/* PANEL IZQUIERDO: BANDEJA DE ENTRADA */}
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
                        className={`self-center shrink-0 transition-all duration-200 ${isSelected ? "text-emerald-400 translate-x-1" : "text-slate-700"}`}
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

            {/* PANEL DERECHO: LECTOR DE MAILS CON TRANSICIÓN */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#070a12]">
              {selectedMail ? (
                <div className="flex-1 flex flex-col min-h-0 p-5 space-y-4 overflow-y-auto transition-all duration-300 ease-out">
                  {/* Carga del Mensaje */}
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

                    {/* Texto Cómodo para Lectura */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        CONTENIDO DEL MENSAJE:
                      </span>
                      <div className="bg-[#070a12] border border-slate-800/80 p-4 rounded-xl text-slate-300 text-xs leading-relaxed font-sans font-normal whitespace-pre-wrap">
                        {selectedMail.resumen}
                      </div>
                    </div>
                  </div>

                  {/* Panel de Inyección IA */}
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

        {/* PESTAÑA CATÁLOGO & PRECIOS */}
        {activeTab === "catalogo" && (
          <div className="p-5 space-y-5 overflow-y-auto h-full transition-all duration-300 ease-out">
            <div className="bg-[#0e1422] border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
              <h3 className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-2">
                <Upload size={14} /> CARGAR LISTA DE PRECIOS OFICIAL (PDF, EXCEL
                O CSV)
              </h3>

              <div className="border border-dashed border-slate-800 hover:border-emerald-500/50 p-6 text-center bg-[#070a12] rounded-xl cursor-pointer relative transition-all group">
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={handleSubirListaPrecios}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <Upload
                  className="mx-auto text-emerald-400 group-hover:scale-110 transition-transform mb-2"
                  size={24}
                />
                <p className="text-xs font-bold text-slate-200">
                  {procesandoArchivo
                    ? "Gemini procesando archivo y actualizando MySQL..."
                    : "Hacé clic o arrastrá la lista de precios oficial"}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mantiene intactos los campos personalizados, fotos técnicas y
                  aplicaciones previas.
                </p>
              </div>

              {catalogoPreview && (
                <div className="mt-2 space-y-1">
                  <span className="text-[11px] text-emerald-400 font-mono">
                    Vista previa estructurada por IA:
                  </span>
                  <textarea
                    rows={4}
                    readOnly
                    value={catalogoPreview}
                    className="w-full bg-[#070a12] border border-slate-800 p-2.5 text-xs text-emerald-400 font-mono rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Tabla de Productos */}
            <div className="space-y-3">
              <div className="flex justify-between items-center gap-3 bg-[#0e1422] p-3 border border-slate-800 rounded-xl">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Buscar producto por código, nombre o uso..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-800 pl-9 pr-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500/50 rounded-lg transition-all"
                  />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Registros:{" "}
                  <strong className="text-white">
                    {productosFiltrados.length}
                  </strong>
                </span>
              </div>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-[#0e1422]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#070a12] text-emerald-400 font-mono text-[11px]">
                    <tr>
                      <th className="p-3 border-b border-slate-800">Código</th>
                      <th className="p-3 border-b border-slate-800">Nombre</th>
                      <th className="p-3 border-b border-slate-800">
                        Precio Lista
                      </th>
                      <th className="p-3 border-b border-slate-800">
                        Adjuntos
                      </th>
                      <th className="p-3 border-b border-slate-800 text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-[#070a12]/40">
                    {productosFiltrados.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-[#0e1422]/60 transition-colors"
                      >
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {p.codigo}
                        </td>
                        <td className="p-3 text-slate-200 font-medium">
                          {p.nombre}
                        </td>
                        <td className="p-3 text-emerald-400 font-mono font-semibold">
                          {p.precio_lista}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <label className="cursor-pointer text-[10px] bg-[#0e1422] border border-slate-800 hover:border-emerald-400 px-2 py-1 text-slate-300 rounded flex items-center gap-1 transition-all">
                              <ImageIcon size={11} /> Técnica
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleUploadFotoProducto(p.id, "tecnica", e)
                                }
                              />
                            </label>
                            <label className="cursor-pointer text-[10px] bg-[#0e1422] border border-slate-800 hover:border-emerald-400 px-2 py-1 text-slate-300 rounded flex items-center gap-1 transition-all">
                              <ImageIcon size={11} /> Catálogo
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleUploadFotoProducto(p.id, "catalogo", e)
                                }
                              />
                            </label>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setProductoEditar({ ...p })}
                            className="bg-[#18202e] hover:bg-[#202b3d] text-emerald-400 border border-slate-800 px-2.5 py-1 text-xs rounded transition cursor-pointer"
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

        {/* PESTAÑA DIAGNÓSTICO */}
        {activeTab === "reportes" && (
          <div className="p-5 space-y-4 max-w-5xl mx-auto h-full overflow-y-auto transition-all duration-300 ease-out">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-[#0e1422] border border-slate-800 p-4 rounded-2xl">
              <div>
                <h3 className="text-sm font-bold text-emerald-400 font-mono">
                  DIAGNÓSTICO ESTRATÉGICO DE OPERACIONES
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Análisis cruzado en tiempo real de stock de Materias Primas,
                  Semielaborados y Ventas.
                </p>
              </div>

              <button
                onClick={generarInformeEstrategico}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Sparkles size={14} />
                <span>{loading ? "Analizando..." : "Generar Diagnóstico"}</span>
              </button>
            </div>

            {informeHtml && (
              <div
                className="bg-[#0e1422] border border-slate-800 p-6 text-xs text-slate-300 rounded-2xl prose prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: informeHtml }}
              />
            )}
          </div>
        )}
      </div>

      {/* MODAL EDITAR PRODUCTO */}
      {productoEditar && (
        <div className="fixed inset-0 bg-[#070a12]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0e1422] border border-slate-800 p-5 w-full max-w-md space-y-4 text-xs text-slate-200 rounded-2xl shadow-2xl">
            <h3 className="text-sm font-bold text-emerald-400 border-b border-slate-800 pb-2 font-mono">
              EDITAR FICHA: {productoEditar.codigo}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-mono">
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
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-white outline-none focus:border-emerald-500/50 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-mono">
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
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-emerald-400 font-mono outline-none focus:border-emerald-500/50 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-mono">
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
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-slate-200 outline-none focus:border-emerald-500/50 rounded-lg mt-1 leading-relaxed"
                  placeholder="Ej: Recomendado para estacionamientos subterráneos, escuelas de manejo..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setProductoEditar(null)}
                className="bg-[#070a12] hover:bg-[#18202e] border border-slate-800 text-slate-300 px-3 py-1.5 text-xs rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEdicionProducto}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-1.5 text-xs rounded-lg shadow transition"
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
