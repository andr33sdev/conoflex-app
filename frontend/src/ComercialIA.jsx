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
} from "lucide-react";

export default function ComercialIA() {
  const [activeTab, setActiveTab] = useState("bandeja");
  const [mails, setMails] = useState([]);
  const [reglas, setReglas] = useState("");
  const [loading, setLoading] = useState(false);
  const [conectado, setConectado] = useState(true);
  const [informeHtml, setInformeHtml] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Detectar si venimos redirigidos de Google
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("status") === "conectado") {
      // Limpiar el parámetro de la URL sin recargar la página
      window.history.replaceState({}, document.title, window.location.pathname);
      setConectado(true);
    }

    fetchMails();
    fetchReglas();
  }, []);

  const fetchReglas = async () => {
    try {
      const res = await fetch("/api/reglas");
      const data = await res.json();
      if (data.reglas !== undefined) setReglas(data.reglas);
    } catch (err) {
      console.error("Error al cargar reglas:", err);
    }
  };

  // 1. OBTENER MAILS
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

  // 2. GUARDAR REGLAS
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

  // 3. GENERAR BORRADOR
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

  // 4. GENERAR INFORME
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

  if (!conectado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Bot size={48} className="text-[#ffbe00] animate-bounce" />
        <h2 className="text-xl font-bold font-pixel text-white">
          Vincular Cuenta de Gmail
        </h2>
        <p className="text-xs text-[#a594c9] max-w-md font-mono">
          {errorMsg ||
            "Para utilizar la respuesta automática con IA es necesario otorgar permisos de lectura y borrador en Gmail."}
        </p>
        <button
          onClick={abrirLoginGoogle}
          className="bg-[#2c1a4d] hover:bg-[#432874] text-[#ffbe00] border-2 border-[#ffbe00] px-6 py-2.5 text-xs font-pixel tracking-wider shadow-[3px_3px_0px_#000] flex items-center gap-2 cursor-pointer"
        >
          <ExternalLink size={16} /> Conectar con Google Cloud
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#160c2b] border-2 border-[#432874] p-3 md:p-4 rounded-xs font-mono text-white">
      {/* HEADER CON SOLAPAS Y BOTÓN VINCULAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#432874] pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="text-[#ffbe00]" size={22} />
          <h2 className="font-pixel text-lg text-[#ffbe00] font-bold">
            Asistente IA Comercial
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={abrirLoginGoogle}
            className="px-3 py-1.5 text-xs font-pixel border-2 border-[#ffbe00] text-[#ffbe00] bg-[#2c1a4d] hover:bg-[#432874] transition-all flex items-center gap-1.5 cursor-pointer"
            title="Sincronizar o cambiar cuenta de Gmail"
          >
            <Link2 size={14} /> Vincular Gmail
          </button>

          <button
            onClick={() => setActiveTab("bandeja")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 ${
              activeTab === "bandeja"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <Mail size={14} /> Bandeja ({mails.length})
          </button>
          <button
            onClick={() => setActiveTab("prompt")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 ${
              activeTab === "prompt"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <Settings size={14} /> Reglas IA
          </button>
          <button
            onClick={() => setActiveTab("reportes")}
            className={`px-3 py-1.5 text-xs font-pixel border-2 transition-all flex items-center gap-1.5 ${
              activeTab === "reportes"
                ? "bg-[#2c1a4d] border-[#ffbe00] text-white"
                : "bg-transparent border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <FileText size={14} /> Diagnóstico
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
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
                  size={12}
                  className={loading ? "animate-spin" : ""}
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
                    <Sparkles size={14} /> Responder con Gemini IA
                  </button>
                </div>
              </div>
            ))}

            {mails.length === 0 && !loading && (
              <div className="text-center py-12 text-[#a594c9] text-xs space-y-1 font-pixel">
                <p>No se encontraron correos pendientes.</p>
                <p className="text-[10px] text-[#6e588a]">
                  Asigná la etiqueta 'IA-Consulta' en Gmail a los mails que
                  quieras procesar.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "prompt" && (
          <div className="space-y-3">
            <p className="text-xs text-[#a594c9]">
              Configurá la estrategia comercial, políticas de envío, IVA o
              descuentos que querés que Gemini tome en cuenta al generar las
              cotizaciones:
            </p>
            <textarea
              value={reglas}
              onChange={(e) => setReglas(e.target.value)}
              rows={12}
              className="w-full bg-[#160c2b] border-2 border-[#432874] p-3 text-xs text-white focus:border-[#ffbe00] outline-none font-mono"
              placeholder="Ejemplo: Todos los precios son + IVA 21%. Envío gratis en compras superiores a $100.000..."
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

        {activeTab === "reportes" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#2c1a4d]/50 p-3 border border-[#432874]">
              <div>
                <h3 className="text-xs font-pixel text-white font-bold">
                  Informe Inteligente de Planta
                </h3>
                <p className="text-[11px] text-[#a594c9]">
                  Cruza stock de MP, Semielaborados, Ventas y Fallas para
                  recomendar compras y producción.
                </p>
              </div>
              <button
                onClick={generarInformeEstrategico}
                disabled={loading}
                className="bg-[#ffbe00] hover:bg-[#e6ab00] text-black font-pixel text-xs px-3 py-2 font-bold shadow-[2px_2px_0px_#000] flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Sparkles size={14} />{" "}
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
    </div>
  );
}
