import { useState } from "react";
import { Plus } from "lucide-react";
import { Boton, Etiqueta, Modal } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api } from "../produccion/util";

function Fila({ m, onCambio, toast }) {
  const [nombre, setNombre] = useState(m.nombre);
  const [categoria, setCategoria] = useState(m.categoria || "");

  const guardar = async (cambios, restaurar) => {
    try {
      await api(`/api/prod/maquinas/${m.id}`, { method: "PUT", body: cambios });
      onCambio();
    } catch (e) {
      toast(e.message, "error");
      restaurar?.();
    }
  };

  return (
    <li className={`rounded-2xl border p-3.5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end ${m.activa ? "border-white/[0.08] bg-[#131317]" : "border-white/[0.05] bg-white/[0.015] opacity-70"}`}>
      <div>
        <Etiqueta>Nombre</Etiqueta>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre.trim() !== m.nombre && guardar({ nombre }, () => setNombre(m.nombre))} className={campo} />
      </div>
      <div>
        <Etiqueta>Categoría (para métricas)</Etiqueta>
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)} onBlur={() => categoria.trim() !== (m.categoria || "") && guardar({ categoria })} placeholder="Ej: Inyección" className={campo} />
      </div>
      <Boton variante={m.activa ? "suave" : "naranja"} onClick={() => guardar({ activa: !m.activa })}>{m.activa ? "Desactivar" : "Activar"}</Boton>
    </li>
  );
}

export default function Maquinas({ abierto, onCerrar, maquinas, onCambio, toast }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const agregar = async () => {
    setOcupado(true);
    try {
      await api("/api/prod/maquinas", { method: "POST", body: { nombre, categoria } });
      setNombre("");
      setCategoria("");
      onCambio();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Máquinas de la planta" subtitulo="Son las que se pueden elegir al armar un turno. Si una máquina ya no se usa, desactivala (no se borra, para conservar el historial)." ancho="max-w-3xl">
      <div className="rounded-2xl border border-[#FF5A00]/25 bg-[#FF5A00]/[0.04] p-4 mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <div>
            <Etiqueta>Nueva máquina</Etiqueta>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nombre.trim() && agregar()} placeholder="Ej: Inyectora 3" className={campo} />
          </div>
          <div>
            <Etiqueta>Categoría (opcional)</Etiqueta>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Inyección" className={campo} />
          </div>
          <Boton variante="primario" icono={Plus} onClick={agregar} disabled={ocupado || !nombre.trim()}>Agregar</Boton>
        </div>
      </div>
      {maquinas.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-6">Todavía no cargaste ninguna máquina.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {maquinas.map((m) => (
            <Fila key={`${m.id}-${m.nombre}-${m.categoria}-${m.activa}`} m={m} onCambio={onCambio} toast={toast} />
          ))}
        </ul>
      )}
    </Modal>
  );
}
