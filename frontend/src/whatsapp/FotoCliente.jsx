// Foto que mandó un cliente: se ve en la bandeja y el equipo puede marcar qué producto era.
// Esa foto queda como ejemplo real del producto y el bot la usa para reconocer las próximas.
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Tag } from "lucide-react";
import { getApiUrl } from "../apiConfig";
import { api } from "../produccion/util";
import { Boton, Modal } from "../comercial/ui";
import { campo } from "../comercial/util";

let productosCache = null;
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Elegir({ mensajeId, actual, aviso, onCerrar }) {
  const [productos, setProductos] = useState(productosCache);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    if (productosCache) return;
    api("/api/whatsapp/productos")
      .then((p) => {
        productosCache = p;
        setProductos(p);
      })
      .catch(() => setProductos([]));
  }, []);

  const lista = useMemo(() => {
    const t = sinAcentos(q);
    return (productos || []).filter((p) => !t || sinAcentos(`${p.codigo} ${p.nombre}`).includes(t)).slice(0, 80);
  }, [productos, q]);

  const elegir = async (codigo) => {
    setGuardando(codigo || "-");
    try {
      await api(`/api/whatsapp/mensajes/${mensajeId}/producto`, { method: "POST", body: { codigo } });
      aviso(codigo ? `Listo: el bot va a usar esta foto para reconocer el ${codigo}.` : "Se quitó la marca.");
      onCerrar(true);
    } catch (e) {
      aviso(e.message, "error");
      setGuardando(null);
    }
  };

  return (
    <Modal titulo="¿Qué producto es la foto?" onCerrar={() => onCerrar(false)} pie={actual ? <Boton variante="fantasma" onClick={() => elegir("")} cargando={guardando === "-"}>Quitar marca</Boton> : null}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <label htmlFor="foto-buscar" className="sr-only">Buscar producto</label>
          <input id="foto-buscar" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o nombre (ej: obrador)" className={`${campo} pl-9`} />
        </div>
        {productos === null ? (
          <div className="py-6 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : (
          <ul className="max-h-80 overflow-y-auto flex flex-col gap-1">
            {lista.map((p) => (
              <li key={p.codigo}>
                <button onClick={() => elegir(p.codigo)} disabled={!!guardando} className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center gap-3 cursor-pointer disabled:opacity-50 ${p.codigo === actual ? "border-emerald-500/40 bg-emerald-500/10" : "border-zinc-800 hover:bg-zinc-900"}`}>
                  <span className="text-sm font-bold text-white shrink-0">{p.codigo}</span>
                  <span className="text-sm text-zinc-400 truncate flex-1">{p.nombre}</span>
                  {guardando === p.codigo ? <Loader2 size={15} className="animate-spin" /> : p.codigo === actual ? <Check size={15} className="text-emerald-400" /> : null}
                </button>
              </li>
            ))}
            {!lista.length && <li className="text-sm text-zinc-500 py-4 text-center">No hay productos con ese texto.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function FotoCliente({ mensaje, aviso, onCambio }) {
  const [url, setUrl] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    let objeto = null;
    fetch(getApiUrl(`/api/whatsapp/mensajes/${mensaje.id}/foto`))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && vivo) {
          objeto = URL.createObjectURL(b);
          setUrl(objeto);
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [mensaje.id]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] sm:max-w-[60%] flex flex-col gap-1.5">
        {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto del cliente" className="max-h-64 rounded-xl border border-zinc-800 object-contain bg-black" /></a> : <div className="w-40 h-28 rounded-xl border border-zinc-800 bg-zinc-900 grid place-items-center text-zinc-600"><Loader2 size={16} className="animate-spin" /></div>}
        <button onClick={() => setEligiendo(true)} className={`self-start inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer ${mensaje.producto_confirmado ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-zinc-700 text-zinc-300 hover:bg-zinc-900"}`}>
          {mensaje.producto_confirmado ? <><Check size={13} /> Es el {mensaje.producto_confirmado}</> : <><Tag size={13} /> ¿Qué producto es?</>}
        </button>
      </div>
      {eligiendo && <Elegir mensajeId={mensaje.id} actual={mensaje.producto_confirmado} aviso={aviso} onCerrar={(ok) => { setEligiendo(false); if (ok) onCambio?.(); }} />}
    </div>
  );
}
