import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Plus,
  Package,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  Filter,
  ChevronDown,
} from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [isEstadoMenuOpen, setIsEstadoMenuOpen] = useState(false);

  // ORDENAMIENTO
  const [sortColumn, setSortColumn] = useState("nombre");
  const [sortDirection, setSortDirection] = useState("asc");

  // PAGINACIÓN DINÁMICA DE ALTURA
  const tableAreaRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODALES
  const [modalFormOpen, setModalFormOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState(null);
  const [detailProveedor, setDetailProveedor] = useState(null);
  const [linkedInsumos, setLinkedInsumos] = useState([]);
  const [loadingInsumos, setLoadingInsumos] = useState(false);

  // CAMPOS FORMULARIO
  const [formNombre, setFormNombre] = useState("");
  const [formCuit, setFormCuit] = useState("");
  const [formContacto, setFormContacto] = useState("");
  const [formTelefono, setFormTelefono] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formDireccion, setFormDireccion] = useState("");
  const [formEstado, setFormEstado] = useState("ACTIVO");

  // CÁLCULO DE FILAS VISIBLES (48px DE ALTURA EXACTA)
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableAreaRef.current) return;
      const containerHeight = tableAreaRef.current.clientHeight;
      const headerHeight = 48;
      const rowHeight = 48;
      const availableHeight = containerHeight - headerHeight;
      const calculatedCount = Math.floor(availableHeight / rowHeight);

      if (calculatedCount > 0 && calculatedCount !== itemsPerPage) {
        setItemsPerPage(calculatedCount);
      }
    };

    updatePageSize();
    const observer = new ResizeObserver(() => updatePageSize());
    if (tableAreaRef.current) observer.observe(tableAreaRef.current);
    return () => observer.disconnect();
  }, [itemsPerPage]);

  const fetchProveedores = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/proveedores"));
      if (res.ok) {
        const data = await res.json();
        setProveedores(data || []);
      }
    } catch (err) {
      console.error("Error cargando proveedores:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsumosProveedor = async (id) => {
    setLoadingInsumos(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/proveedores/${id}/materias-primas`),
      );
      if (res.ok) {
        setLinkedInsumos(await res.json());
      } else {
        setLinkedInsumos([]);
      }
    } catch (err) {
      console.error("Error al obtener insumos:", err);
      setLinkedInsumos([]);
    } finally {
      setLoadingInsumos(false);
    }
  };

  useEffect(() => {
    fetchProveedores();
  }, []);

  const handleOpenNuevo = () => {
    setEditingProveedor(null);
    setFormNombre("");
    setFormCuit("");
    setFormContacto("");
    setFormTelefono("");
    setFormEmail("");
    setFormDireccion("");
    setFormEstado("ACTIVO");
    setModalFormOpen(true);
  };

  const handleOpenEditar = (p, e) => {
    e.stopPropagation();
    setEditingProveedor(p);
    setFormNombre(p.nombre || "");
    setFormCuit(p.cuit || "");
    setFormContacto(p.contacto || "");
    setFormTelefono(p.telefono || "");
    setFormEmail(p.email || "");
    setFormDireccion(p.direccion || "");
    setFormEstado(p.estado || "ACTIVO");
    setModalFormOpen(true);
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formNombre.trim())
      return alert("Ingresá la razón social / nombre del proveedor");

    const payload = {
      nombre: formNombre.trim(),
      cuit: formCuit.trim(),
      contacto: formContacto.trim(),
      telefono: formTelefono.trim(),
      email: formEmail.trim(),
      direccion: formDireccion.trim(),
      estado: formEstado,
    };

    try {
      const isEdit = !!editingProveedor;
      const url = isEdit
        ? getApiUrl(`/api/proveedores/${editingProveedor.id}`)
        : getApiUrl("/api/proveedores");
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setModalFormOpen(false);
        fetchProveedores();
      } else {
        alert("Error al guardar proveedor.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    }
  };

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const processedProveedores = useMemo(() => {
    let result = proveedores.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.cuit || "").toLowerCase().includes(q) ||
        (p.contacto || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q);

      const matchEstado =
        filtroEstado === "TODOS" ? true : p.estado === filtroEstado;

      return matchSearch && matchEstado;
    });

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal = a[sortColumn] || "";
        let bVal = b[sortColumn] || "";

        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [proveedores, search, filtroEstado, sortColumn, sortDirection]);

  const totalPages = Math.ceil(processedProveedores.length / itemsPerPage) || 1;
  const paginatedProveedores = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedProveedores.slice(start, start + itemsPerPage);
  }, [processedProveedores, currentPage, itemsPerPage]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* 1. HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-6 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Gestión de <span className="text-[#FF5A00]">Proveedores</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold">
            DIRECTORIO Y CONTACTOS DE EMPRESAS
          </p>
        </div>

        <button
          onClick={handleOpenNuevo}
          className="flex items-center justify-between gap-4 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all z-10 w-full md:w-auto bg-[#FFD700] hover:bg-white text-black active:scale-95 cursor-pointer"
        >
          <Plus size={18} strokeWidth={3} />
          NUEVO PROVEEDOR
        </button>
      </div>

      {/* 2. PANEL DE FILTROS & BÚSQUEDA */}
      <div className="px-4 py-4 md:px-8 border-b border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 bg-black relative z-20">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          {/* BUSCADOR */}
          <div className="relative w-full sm:w-80">
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              type="text"
              placeholder="Buscar por empresa, CUIT, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-10 pr-4 py-2.5 text-xs transition-colors outline-none"
            />
          </div>

          {/* FILTRO ESTADO */}
          <div className="relative w-full sm:w-auto">
            <button
              onClick={() => setIsEstadoMenuOpen(!isEstadoMenuOpen)}
              className="w-full sm:w-auto flex items-center justify-between gap-2.5 bg-[#050505] border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 text-xs font-bold tracking-widest uppercase text-white transition-colors cursor-pointer"
            >
              <Filter size={14} className="text-[#FF5A00]" />
              <span className="text-zinc-500">ESTADO:</span>
              <span className="text-[#FF5A00]">{filtroEstado}</span>
              <ChevronDown
                size={14}
                className={`text-zinc-500 transition-transform ${isEstadoMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isEstadoMenuOpen && (
              <div className="absolute top-full left-0 w-full sm:w-48 mt-1 bg-[#050505] border border-zinc-800 shadow-2xl z-50 flex flex-col">
                {["TODOS", "ACTIVO", "INACTIVO"].map((est) => (
                  <button
                    key={est}
                    onClick={() => {
                      setFiltroEstado(est);
                      setIsEstadoMenuOpen(false);
                      setCurrentPage(1);
                    }}
                    className={`text-left px-4 py-3 text-xs font-bold tracking-widest uppercase transition-colors border-l-2 ${
                      filtroEstado === est
                        ? "border-[#FF5A00] text-[#FF5A00] bg-[#FF5A00]/5"
                        : "border-transparent text-zinc-500 hover:text-white hover:bg-zinc-900/50"
                    }`}
                  >
                    {est}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CONTADOR TOTAL */}
        <div className="border border-zinc-800 px-4 py-2 text-[10px] md:text-xs text-zinc-500 font-mono tracking-widest flex items-center gap-2 bg-[#050505] uppercase font-bold w-full sm:w-auto justify-between shrink-0">
          <span className="flex items-center gap-1.5">TOTAL REGISTROS:</span>
          <strong className="text-white">
            {processedProveedores.length} / {proveedores.length}
          </strong>
        </div>
      </div>

      {/* 3. VISTA ESCRITORIO (GRILLA DE PRECISIÓN) */}
      <div className="hidden md:flex flex-1 flex-col p-4 md:p-8 bg-black min-h-0 justify-between overflow-hidden">
        <div
          ref={tableAreaRef}
          className="flex-1 min-h-0 w-full flex flex-col justify-start"
        >
          <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col overflow-hidden shadow-2xl h-fit">
            {/* CABECERA INDUSTRIAL (160px | 1fr | 180px | 200px | 110px | 70px) */}
            <div className="grid grid-cols-[160px_1fr_180px_200px_110px_70px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-400 font-mono text-[10px] font-extrabold uppercase tracking-widest shrink-0 select-none">
              <div
                onClick={() => handleSort("cuit")}
                className="px-4 flex items-center justify-between cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>CUIT</span>
                {sortColumn === "cuit" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("nombre")}
                className="px-4 flex items-center justify-between cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>RAZÓN SOCIAL</span>
                {sortColumn === "nombre" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("contacto")}
                className="px-3 flex items-center justify-start gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>CONTACTO / TEL</span>
                {sortColumn === "contacto" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("email")}
                className="px-3 flex items-center justify-start gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>EMAIL</span>
                {sortColumn === "email" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("estado")}
                className="px-4 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>ESTADO</span>
                {sortColumn === "estado" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div className="px-2 flex justify-center text-center">EDITAR</div>
            </div>

            {/* FILAS DE LA TABLA */}
            <div className="flex flex-col bg-black">
              {loading ? (
                <div className="py-12 flex justify-center text-[#FF5A00]">
                  <RefreshCw className="animate-spin" size={28} />
                </div>
              ) : paginatedProveedores.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs">
                  No hay proveedores registrados.
                </div>
              ) : (
                paginatedProveedores.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setDetailProveedor(p);
                      fetchInsumosProveedor(p.id);
                    }}
                    className="grid grid-cols-[160px_1fr_180px_200px_110px_70px] h-12 items-center border-b border-zinc-800/80 last:border-b-0 hover:bg-[#0a0a0a] transition-colors duration-150 group cursor-pointer text-xs shrink-0"
                  >
                    <div className="px-4 font-mono font-bold truncate">
                      <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/25 px-2 py-0.5 text-xs group-hover:bg-[#FF5A00] group-hover:text-black transition-colors inline-block max-w-full truncate">
                        {p.cuit || "S/D"}
                      </span>
                    </div>

                    <div className="px-4 text-white font-bold text-xs truncate pr-2">
                      {p.nombre}
                    </div>

                    <div className="px-3 flex flex-col text-zinc-400 font-mono text-[10px] truncate">
                      <span className="truncate text-white font-medium">
                        {p.contacto || "--"}
                      </span>
                      <span className="text-zinc-600 text-[9px] truncate">
                        {p.telefono || ""}
                      </span>
                    </div>

                    <div className="px-3 text-zinc-400 font-mono text-[10px] truncate">
                      {p.email || "--"}
                    </div>

                    <div className="px-4 flex justify-center font-mono font-bold tracking-widest uppercase text-[10px]">
                      <span
                        className={`px-2 py-0.5 border ${
                          (p.estado || "ACTIVO") === "ACTIVO"
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            : "text-zinc-600 border-zinc-800 bg-zinc-900"
                        }`}
                      >
                        {p.estado || "ACTIVO"}
                      </span>
                    </div>

                    <div className="px-2 flex justify-center">
                      <button
                        onClick={(e) => handleOpenEditar(p, e)}
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                        title="Editar Proveedor"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 5. PAGINACIÓN DESKTOP */}
        {processedProveedores.length > 0 && (
          <div className="mt-4 flex items-center justify-between font-mono text-xs text-zinc-500 shrink-0">
            <span className="uppercase text-[10px] font-bold tracking-widest text-zinc-400">
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong> (
              {processedProveedores.length} registros)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="px-3 h-8 flex items-center bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] font-bold text-xs">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. VISTA MOBILE */}
      <div className="flex md:hidden flex-1 flex-col overflow-y-auto min-h-0 p-4 space-y-3 bg-black">
        {loading ? (
          <div className="py-12 flex justify-center text-[#FF5A00]">
            <RefreshCw className="animate-spin" size={28} />
          </div>
        ) : paginatedProveedores.length === 0 ? (
          <div className="py-12 text-center font-bold tracking-widest text-xs uppercase text-zinc-600">
            Sin proveedores.
          </div>
        ) : (
          paginatedProveedores.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setDetailProveedor(p);
                fetchInsumosProveedor(p.id);
              }}
              className="bg-[#050505] border border-zinc-800/80 p-4 space-y-3 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
            >
              <div className="flex justify-between items-start">
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest">
                  {p.cuit || "S/D"}
                </span>

                <span
                  className={`text-[9px] font-mono border px-2 py-0.5 font-bold uppercase tracking-widest ${
                    (p.estado || "ACTIVO") === "ACTIVO"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-zinc-600 border-zinc-800 bg-zinc-900"
                  }`}
                >
                  {p.estado || "ACTIVO"}
                </span>
              </div>

              <div className="text-white font-bold text-sm leading-snug">
                {p.nombre}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-800/50 text-[10px] font-mono text-zinc-400">
                <div>
                  <span className="text-zinc-600 block">CONTACTO:</span>
                  <strong className="text-zinc-200">
                    {p.contacto || "--"}
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-600 block">TELÉFONO:</span>
                  <strong className="text-zinc-200">
                    {p.telefono || "--"}
                  </strong>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={(e) => handleOpenEditar(p, e)}
                  className="px-3 py-1.5 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                >
                  <Edit2 size={10} /> EDITAR
                </button>
              </div>
            </div>
          ))
        )}

        {/* PAGINACIÓN MOBILE */}
        {processedProveedores.length > 0 && (
          <div className="flex flex-col items-center justify-center pt-4 mt-2 border-t border-zinc-800/50 gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="px-3 h-8 flex items-center bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] font-bold text-xs font-mono">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          MODALES
      ========================================================= */}

      {/* MODAL 1: FICHA DE PROVEEDOR */}
      {detailProveedor && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-lg p-8 shadow-2xl relative flex flex-col gap-6">
            <button
              onClick={() => setDetailProveedor(null)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pr-8">
                <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                  FICHA DE PROVEEDOR
                </span>
                <span
                  className={`text-[10px] font-mono tracking-widest uppercase font-bold border px-2 py-0.5 ${
                    (detailProveedor.estado || "ACTIVO") === "ACTIVO"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-zinc-600 border-zinc-800 bg-zinc-900"
                  }`}
                >
                  {detailProveedor.estado || "ACTIVO"}
                </span>
              </div>

              <div>
                <h3 className="text-3xl text-white font-extrabold italic uppercase tracking-tighter flex items-center gap-2.5">
                  <Building2 size={28} className="text-[#FF5A00]" />
                  {detailProveedor.nombre}
                </h3>
                <p className="text-xs font-mono text-zinc-500 font-bold mt-1 tracking-widest">
                  CUIT: {detailProveedor.cuit || "NO REGISTRADO"}
                </p>
              </div>
            </div>

            <div className="w-full h-px bg-zinc-800/80"></div>

            {/* DATOS DE CONTACTO */}
            <div className="grid grid-cols-2 gap-4 font-mono text-xs">
              <div className="bg-black p-4 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[9px] text-zinc-500 flex items-center gap-1 font-bold">
                  <User size={12} /> PERSONA DE CONTACTO
                </span>
                <strong className="text-white text-xs truncate">
                  {detailProveedor.contacto || "NO ESPECIFICADO"}
                </strong>
              </div>

              <div className="bg-black p-4 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[9px] text-zinc-500 flex items-center gap-1 font-bold">
                  <Phone size={12} /> TELÉFONO
                </span>
                <strong className="text-white text-xs truncate">
                  {detailProveedor.telefono || "NO ESPECIFICADO"}
                </strong>
              </div>

              <div className="bg-black p-4 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[9px] text-zinc-500 flex items-center gap-1 font-bold">
                  <Mail size={12} /> EMAIL
                </span>
                <strong className="text-white text-xs truncate">
                  {detailProveedor.email || "NO ESPECIFICADO"}
                </strong>
              </div>

              <div className="bg-black p-4 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[9px] text-zinc-500 flex items-center gap-1 font-bold">
                  <MapPin size={12} /> DIRECCIÓN
                </span>
                <strong className="text-white text-xs truncate">
                  {detailProveedor.direccion || "NO ESPECIFICADA"}
                </strong>
              </div>
            </div>

            {/* INSUMOS PROVEÍDOS */}
            <div className="bg-black border border-zinc-800 p-4 space-y-3">
              <div className="flex justify-between items-center font-mono font-bold uppercase tracking-widest text-[10px]">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Package size={14} className="text-[#FFD700]" /> MATERIAS
                  PRIMAS PROVEÍDAS
                </span>
                <span className="text-white">
                  {linkedInsumos.length} INSUMOS
                </span>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {loadingInsumos ? (
                  <div className="py-4 text-center text-[#FF5A00]">
                    <RefreshCw className="animate-spin mx-auto" size={18} />
                  </div>
                ) : linkedInsumos.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 font-mono italic">
                    Este proveedor no tiene materias primas vinculadas.
                  </p>
                ) : (
                  linkedInsumos.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-[#050505] border border-zinc-800/80 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-[#FF5A00] font-bold text-[10px]">
                          {item.codigo}
                        </span>
                        <span className="text-white truncate font-sans text-xs font-bold">
                          {item.nombre}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-bold shrink-0">
                        {item.stock_actual} {item.unidad_medida || "Kg"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREACIÓN / EDICIÓN (Rediseño Estético) */}
      {modalFormOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md p-8 shadow-2xl relative flex flex-col gap-6">
            <button
              onClick={() => setModalFormOpen(false)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col gap-2 border-b border-zinc-800/80 pb-4">
              <div className="flex items-center justify-between pr-8">
                <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 tracking-widest uppercase">
                  {editingProveedor ? "EDITAR PROVEEDOR" : "NUEVO PROVEEDOR"}
                </span>
              </div>
              <h3 className="text-2xl text-[#FF5A00] font-extrabold italic uppercase tracking-tighter mt-2">
                {editingProveedor
                  ? editingProveedor.nombre
                  : "REGISTRAR EMPRESA"}
              </h3>
            </div>

            <form
              onSubmit={handleSaveForm}
              className="flex flex-col gap-4 font-mono text-xs"
            >
              {/* RAZÓN SOCIAL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                  RAZÓN SOCIAL / NOMBRE *:
                </label>
                <input
                  type="text"
                  required
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="EJ: QUÍMICA SUR S.A."
                  className="w-full bg-black border border-zinc-800 p-3.5 text-white font-bold focus:outline-none focus:border-[#FF5A00] transition-colors"
                  autoFocus
                />
              </div>

              {/* FILA: CUIT Y CONTACTO */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                    CUIT / RUT:
                  </label>
                  <input
                    type="text"
                    value={formCuit}
                    onChange={(e) => setFormCuit(e.target.value)}
                    placeholder="30-70000000-8"
                    className="w-full bg-black border border-zinc-800 p-3.5 text-zinc-300 focus:outline-none focus:border-[#FF5A00] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                    CONTACTO:
                  </label>
                  <input
                    type="text"
                    value={formContacto}
                    onChange={(e) => setFormContacto(e.target.value)}
                    placeholder="Nombre del vendedor"
                    className="w-full bg-black border border-zinc-800 p-3.5 text-zinc-300 focus:outline-none focus:border-[#FF5A00] transition-colors"
                  />
                </div>
              </div>

              {/* FILA: TELÉFONO Y ESTADO */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                    TELÉFONO:
                  </label>
                  <input
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="+54 11 ..."
                    className="w-full bg-black border border-zinc-800 p-3.5 text-zinc-300 focus:outline-none focus:border-[#FF5A00] transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                    ESTADO:
                  </label>
                  <div className="relative">
                    <select
                      value={formEstado}
                      onChange={(e) => setFormEstado(e.target.value)}
                      className="w-full bg-black border border-zinc-800 p-3.5 text-white font-bold focus:outline-none focus:border-[#FF5A00] appearance-none cursor-pointer transition-colors"
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              {/* EMAIL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                  EMAIL:
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="ventas@proveedor.com"
                  className="w-full bg-black border border-zinc-800 p-3.5 text-zinc-300 focus:outline-none focus:border-[#FF5A00] transition-colors"
                />
              </div>

              {/* DIRECCIÓN */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">
                  DIRECCIÓN FÍSICA:
                </label>
                <input
                  type="text"
                  value={formDireccion}
                  onChange={(e) => setFormDireccion(e.target.value)}
                  placeholder="Av. Industrial 1234, Buenos Aires"
                  className="w-full bg-black border border-zinc-800 p-3.5 text-zinc-300 focus:outline-none focus:border-[#FF5A00] transition-colors"
                />
              </div>

              {/* BOTONES */}
              <div className="pt-6 border-t border-zinc-800/80 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalFormOpen(false)}
                  className="px-5 py-2.5 text-zinc-500 hover:text-white font-bold uppercase tracking-widest transition-colors cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#FFD700] hover:bg-white text-black font-bold uppercase tracking-widest transition-colors cursor-pointer"
                >
                  CONFIRMAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
