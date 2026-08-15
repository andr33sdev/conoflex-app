import { useState, useCallback, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import * as XLSX from "xlsx"
import {
  ArrowUp,
  X,
  Search,
  Pencil,
  Trash2,
  Save,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

const EXCLUDED_HEADERS = [
  "MATERIA PRIMA DESTACADA",
  "MASTERBATCHES",
  "MICRONIZADOS",
  "INSUMOS",
  "PARAGUAY",
  "CODIGO",
  "MATERIAL",
  "COD",
  "NOMBRE",
]

const ITEMS_PER_PAGE = 5

export default function Inventory({ isUploadModalOpen, onCloseUploadModal }) {
  const [dbItems, setDbItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  const [editingItem, setEditingItem] = useState(null)
  const [newStockValue, setNewStockValue] = useState("")
  const [deletingItem, setDeletingItem] = useState(null)

  const [excelData, setExcelData] = useState(null)
  const [diffAdditions, setDiffAdditions] = useState([])
  const [diffDeletions, setDiffDeletions] = useState([])
  const [selectedToAdd, setSelectedToAdd] = useState([])
  const [selectedToRemove, setSelectedToRemove] = useState([])

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const res = await fetch("http://localhost:3001/api/materias-primas")
      const data = await res.json()
      setDbItems(data)
    } catch (err) {
      console.error("Error conectando con backend local:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const filteredItems = dbItems.filter((item) => {
    const term = searchTerm.toLowerCase()
    return (
      (item.nombre && item.nombre.toLowerCase().includes(term)) ||
      (item.codigo && item.codigo.toLowerCase().includes(term))
    )
  })

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE
  const currentPaginatedItems = filteredItems.slice(
    indexOfFirstItem,
    indexOfLastItem,
  )

  const handleSaveStock = async () => {
    if (!editingItem) return
    const parsedStock = parseFloat(newStockValue)
    if (isNaN(parsedStock) || parsedStock < 0)
      return alert("Cantidad no válida.")

    try {
      const res = await fetch(
        `http://localhost:3001/api/materias-primas/${editingItem.id}/stock`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock: parsedStock }),
        },
      )

      if (res.ok) {
        setDbItems(
          dbItems.map((i) =>
            i.id === editingItem.id ? { ...i, stock_actual: parsedStock } : i,
          ),
        )
        setEditingItem(null)
      }
    } catch (err) {
      console.error("Error guardando stock:", err)
    }
  }

  const handleDeleteItem = async () => {
    if (!deletingItem) return

    try {
      const res = await fetch(
        `http://localhost:3001/api/materias-primas/${deletingItem.id}`,
        { method: "DELETE" },
      )

      if (res.ok) {
        setDbItems(dbItems.filter((i) => i.id !== deletingItem.id))
        setDeletingItem(null)
        if (currentPaginatedItems.length === 1 && currentPage > 1) {
          setCurrentPage((prev) => prev - 1)
        }
      }
    } catch (err) {
      console.error("Error eliminando materia prima:", err)
    }
  }

  const onDrop = useCallback(
    (acceptedFiles) => {
      const file = acceptedFiles[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        const buffer = e.target.result
        const workbook = XLSX.read(buffer, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
        })

        const parsedProducts = []

        rawRows.forEach((row) => {
          if (!row || row.length < 2) return
          const col0 = row[0] ? String(row[0]).trim() : ""
          const col1 = row[1] ? String(row[1]).trim() : ""
          const col2 = row[2] ? String(row[2]).trim() : ""

          if (!col0 || !col1) return
          if (EXCLUDED_HEADERS.includes(col0.toUpperCase())) return

          const codeUpper = col0.toUpperCase()

          if (!parsedProducts.some((p) => p.codigo === codeUpper)) {
            parsedProducts.push({
              codigo: codeUpper,
              nombre: col1,
              unidad: col2 || "Unidades",
              orden: parsedProducts.length,
            })
          }
        })

        const dbCodesUpper = dbItems.map((i) => i.codigo.toUpperCase())
        const toAdd = parsedProducts.filter(
          (p) => !dbCodesUpper.includes(p.codigo),
        )
        const excelCodesUpper = parsedProducts.map((p) => p.codigo)
        const toRemove = dbItems.filter(
          (i) => !excelCodesUpper.includes(i.codigo.toUpperCase()),
        )

        setExcelData(parsedProducts)
        setDiffAdditions(toAdd)
        setDiffDeletions(toRemove)
        setSelectedToAdd(toAdd.map((i) => i.codigo))
        setSelectedToRemove([])
      }
      reader.readAsBinaryString(file)
    },
    [dbItems],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  })

  const handleConfirmSync = async () => {
    const paraAgregar = diffAdditions.filter((i) =>
      selectedToAdd.includes(i.codigo),
    )

    try {
      const res = await fetch(
        "http://localhost:3001/api/materias-primas/sincronizar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paraAgregar,
            paraEliminarIds: selectedToRemove,
          }),
        },
      )

      if (res.ok) {
        await fetchInventory()
        handleCloseUploadModal()
        setCurrentPage(1)
      }
    } catch (err) {
      console.error("Error sincronizando:", err)
    }
  }

  const handleCloseUploadModal = () => {
    setExcelData(null)
    setDiffAdditions([])
    setDiffDeletions([])
    onCloseUploadModal()
  }

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none">
      {/* HEADER TIPO LA IMAGEN DE REFERENCIA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#1E2842] pb-3 shrink-0">
        <div>
          <h2 className="font-pixel text-2xl text-white">
            CATÁLOGO DE MATERIAS PRIMAS
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestión de stock en planta.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Filtrar por código o nombre..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none transition-colors"
            />
          </div>

          <div className="text-xs font-pixel bg-[#111625] border border-[#1E2842] px-3 py-1.5 text-[#00E5FF] whitespace-nowrap">
            ITEMS: {filteredItems.length} / {dbItems.length}
          </div>
        </div>
      </div>

      {/* TABLA DE MATERIAS PRIMAS */}
      <div className="flex-1 overflow-hidden pt-4 min-h-0">
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl h-full flex flex-col">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-pixel">
              Cargando materias primas...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-pixel">
              {searchTerm
                ? `Sin coincidencias para "${searchTerm}"`
                : 'Presiona "Cargar Excel" para sincronizar.'}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#161C2E] border-b-2 border-[#1E2842] shadow-sm">
                    <tr className="text-[#00E5FF] font-pixel text-sm">
                      <th className="p-3 border-r border-[#1E2842] w-44">
                        Código
                      </th>
                      <th className="p-3 border-r border-[#1E2842]">
                        Materia Prima
                      </th>
                      <th className="p-3 border-r border-[#1E2842] w-28">
                        Unidad
                      </th>
                      <th className="p-3 border-r border-[#1E2842] text-right w-36">
                        Stock Actual
                      </th>
                      <th className="p-3 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2842]/60">
                    {currentPaginatedItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[#161C2E]/50 text-slate-200 transition-colors"
                      >
                        <td className="p-3 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold">
                          {item.codigo}
                        </td>
                        <td className="p-3 border-r border-[#1E2842]/40 font-bold text-white">
                          {item.nombre}
                        </td>
                        <td className="p-3 border-r border-[#1E2842]/40 text-slate-400 uppercase font-pixel text-[11px]">
                          {item.unidad_medida || item.unidad || "Unidades"}
                        </td>
                        <td className="p-3 border-r border-[#1E2842]/40 text-right font-pixel text-sm text-white font-bold">
                          {item.stock_actual}
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setEditingItem(item)
                                setNewStockValue(item.stock_actual)
                              }}
                              className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-[#FF5500] hover:border-[#FF5500] transition-colors"
                              title="Editar Stock"
                            >
                              <Pencil size={13} />
                            </button>

                            <button
                              onClick={() => setDeletingItem(item)}
                              className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-red-400 hover:border-red-500 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINACIÓN */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                <div className="text-slate-400">
                  Mostrando{" "}
                  <span className="text-white font-bold">
                    {indexOfFirstItem + 1}
                  </span>{" "}
                  -{" "}
                  <span className="text-white font-bold">
                    {Math.min(indexOfLastItem, filteredItems.length)}
                  </span>{" "}
                  de{" "}
                  <span className="text-[#FF5500] font-bold">
                    {filteredItems.length}
                  </span>{" "}
                  ítems
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronsLeft size={14} />
                  </button>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronLeft size={14} />
                    <span>ANT</span>
                  </button>

                  <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">
                    {currentPage} / {totalPages}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <span>SIG</span>
                    <ChevronRight size={14} />
                  </button>

                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL EDITAR STOCK */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0E1322] border-2 border-[#FF5500] w-full max-w-md p-5 shadow-2xl space-y-4 relative font-mono">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="border-b border-[#1E2842] pb-2">
              <h3 className="font-pixel text-lg text-[#FF5500]">
                AJUSTAR CANTIDAD EN PLANTA
              </h3>
              <p className="text-xs text-white font-bold mt-1">
                [{editingItem.codigo}] {editingItem.nombre}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 block font-pixel">
                CANTIDAD ACTUAL ({editingItem.unidad_medida || "Unidades"}):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newStockValue}
                onChange={(e) => setNewStockValue(e.target.value)}
                className="w-full bg-[#070A12] border border-[#1E2842] text-[#FF5500] font-pixel text-2xl p-2 focus:border-[#FF5500] focus:outline-none"
                autoFocus
              />
            </div>

            <div className="pt-3 border-t border-[#1E2842] flex justify-end gap-3 font-pixel text-xs">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveStock}
                className="flex items-center gap-2 px-5 py-2 bg-[#FF5500] text-black font-bold border border-white hover:bg-[#FF6600]"
              >
                <Save size={14} />
                <span>GUARDAR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADVERTENCIA ELIMINAR */}
      {deletingItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0E1322] border-2 border-red-500 w-full max-w-md p-5 shadow-2xl space-y-4 relative font-mono">
            <div className="flex items-center gap-3 text-red-500 border-b border-[#1E2842] pb-3">
              <AlertTriangle size={24} />
              <div>
                <h3 className="font-pixel text-lg text-red-500">
                  ¿ELIMINAR MATERIA PRIMA?
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              ¿Seguro que deseas eliminar esta materia prima del catálogo?
              <span className="font-bold text-white text-xs block mt-2 p-2 bg-[#070A12] border border-[#1E2842]">
                [{deletingItem.codigo}] {deletingItem.nombre}
              </span>
            </p>

            <div className="pt-3 border-t border-[#1E2842] flex justify-end gap-3 font-pixel text-xs">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white"
              >
                CANCELAR
              </button>
              <button
                onClick={handleDeleteItem}
                className="px-5 py-2 bg-red-600 text-white font-bold hover:bg-red-500"
              >
                SÍ, ELIMINAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SINCRONIZAR EXCEL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0E1322] border-2 border-[#FF5500] w-full max-w-2xl p-6 shadow-2xl space-y-4 relative font-mono">
            <button
              onClick={handleCloseUploadModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="border-b border-[#1E2842] pb-2">
              <h3 className="font-pixel text-xl text-[#FF5500]">
                SINCRONIZAR MATERIAS PRIMAS
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Compara los códigos del Excel con la base local.
              </p>
            </div>

            {!excelData ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  isDragActive
                    ? "border-[#FF5500] bg-[#FF5500]/10"
                    : "border-[#1E2842] hover:border-[#FF5500]"
                }`}
              >
                <input {...getInputProps()} />
                <ArrowUp
                  size={32}
                  className="text-[#FF5500] mx-auto mb-3 animate-bounce"
                />
                <p className="font-pixel text-base text-white">
                  SUBIR PLANILLA DE MATERIAS PRIMAS
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Haz clic aquí o arrastra tu archivo `.xlsx` o `.xls`.
                </p>
                <button className="mt-4 px-4 py-2 bg-[#FF5500] text-black font-pixel font-bold text-xs">
                  [ SELECCIONAR PLANILLA ]
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-pixel text-[#00E5FF]">
                    + NUEVAS MATERIAS PRIMAS DETECTADAS ({diffAdditions.length})
                  </span>
                  <div className="max-h-36 overflow-y-auto border border-[#1E2842] bg-[#070A12] p-2 text-xs space-y-1">
                    {diffAdditions.length === 0 ? (
                      <p className="text-slate-500 italic">Sin novedades.</p>
                    ) : (
                      diffAdditions.map((item, idx) => (
                        <div key={idx} className="text-white">
                          <span className="text-[#FF5500] font-pixel font-bold">
                            [{item.codigo}]
                          </span>{" "}
                          {item.nombre}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1E2842] flex justify-end gap-3 font-pixel text-xs">
                  <button
                    onClick={handleCloseUploadModal}
                    className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={handleConfirmSync}
                    className="px-5 py-2 bg-[#FF5500] text-black font-bold border border-white hover:bg-[#FF6600]"
                  >
                    APLICAR SINCRONIZACIÓN
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
