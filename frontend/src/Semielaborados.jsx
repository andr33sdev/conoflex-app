import { useState, useEffect } from "react"
import {
  Search,
  Pencil,
  Trash2,
  Save,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  CheckSquare,
  Square,
  X,
  AlertCircle,
} from "lucide-react"

const ITEMS_PER_PAGE = 5

const TABS = [
  { id: "general", label: "STOCK GENERAL" },
  { id: "stock_33", label: "STOCK 33" },
  { id: "stock_26", label: "STOCK 26" },
  { id: "stock_ayolas", label: "STOCK AYOLAS" },
  { id: "stock_37", label: "STOCK 37" },
]

export default function Semielaborados() {
  const [dbItems, setDbItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTab, setActiveTab] = useState("general")
  const [selectedWarehouses, setSelectedWarehouses] = useState({
    stock_33: false,
    stock_26: false,
    stock_ayolas: false,
    stock_37: false,
  })

  const [editingItem, setEditingItem] = useState(null)
  const [newStockValue, setNewStockValue] = useState("")
  const [deletingItem, setDeletingItem] = useState(null)

  const fetchSemielaborados = async () => {
    setLoading(true)
    try {
      const res = await fetch("http://localhost:3001/api/semielaborados")
      setDbItems(await res.json())
    } catch (err) {
      console.error("Error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSemielaborados()
  }, [])

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }
  const toggleWarehouse = (whKey) =>
    setSelectedWarehouses((prev) => ({ ...prev, [whKey]: !prev[whKey] }))

  const getDisplayedStock = (item) => {
    if (activeTab === "general") {
      let sum = 0
      if (selectedWarehouses.stock_33) sum += item.stock_33 || 0
      if (selectedWarehouses.stock_26) sum += item.stock_26 || 0
      if (selectedWarehouses.stock_ayolas) sum += item.stock_ayolas || 0
      if (selectedWarehouses.stock_37) sum += item.stock_37 || 0
      return sum
    } else return item[activeTab] || 0
  }

  const filteredItems = dbItems.filter(
    (item) =>
      (item.nombre &&
        item.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.codigo &&
        item.codigo.toLowerCase().includes(searchTerm.toLowerCase())),
  )
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE
  const currentPaginatedItems = filteredItems.slice(
    indexOfFirstItem,
    indexOfLastItem,
  )

  const handleSaveStock = async () => {
    if (!editingItem || activeTab === "general") return
    const parsedStock = parseFloat(newStockValue)
    if (isNaN(parsedStock) || parsedStock < 0) return alert("Número no válido.")
    try {
      const res = await fetch(
        `http://localhost:3001/api/semielaborados/${editingItem.id}/stock`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campoDeposito: activeTab,
            stock: parsedStock,
          }),
        },
      )
      if (res.ok) {
        setDbItems(
          dbItems.map((i) =>
            i.id === editingItem.id ? { ...i, [activeTab]: parsedStock } : i,
          ),
        )
        setEditingItem(null)
      }
    } catch (err) {}
  }

  const handleDeleteItem = async () => {
    if (!deletingItem) return
    try {
      const res = await fetch(
        `http://localhost:3001/api/semielaborados/${deletingItem.id}`,
        { method: "DELETE" },
      )
      if (res.ok) {
        setDbItems(dbItems.filter((i) => i.id !== deletingItem.id))
        setDeletingItem(null)
      }
    } catch (err) {}
  }

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#1E2842] pb-1 shrink-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setCurrentPage(1)
              }}
              className={`px-4 py-1.5 font-pixel text-xs tracking-wider border-2 transition-all ${isActive ? "bg-[#FF5500] text-black font-bold border-white shadow-[2px_2px_0px_#000] -translate-y-0.5" : "bg-[#0E1322] border-[#1E2842] text-slate-400 hover:text-white hover:border-[#FF5500]"}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0E1322] p-2.5 border border-[#1E2842] shrink-0">
        {activeTab === "general" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-pixel text-[#FF5500] font-bold uppercase mr-1">
              SUMAR STOCKS:
            </span>
            {[
              { key: "stock_33", label: "STOCK 33" },
              { key: "stock_26", label: "STOCK 26" },
              { key: "stock_ayolas", label: "STOCK AYOLAS" },
              { key: "stock_37", label: "STOCK 37" },
            ].map((wh) => (
              <button
                key={wh.key}
                onClick={() => toggleWarehouse(wh.key)}
                className={`flex items-center gap-1.5 px-2 py-1 border font-pixel text-xs transition-colors ${selectedWarehouses[wh.key] ? "bg-[#FF5500]/20 border-[#FF5500] text-white" : "bg-[#111625] border-[#1E2842] text-slate-400 hover:text-white"}`}
              >
                {selectedWarehouses[wh.key] ? (
                  <CheckSquare size={14} className="text-[#FF5500]" />
                ) : (
                  <Square size={14} />
                )}{" "}
                <span>{wh.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 flex items-center gap-2 font-pixel">
            <Layers size={16} className="text-[#FF5500]" />
            <span>
              SUCURSAL:{" "}
              <strong className="text-white uppercase">
                {activeTab.replace("stock_", "")}
              </strong>
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-60">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Filtrar por código..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none"
            />
          </div>
          <div className="text-xs font-pixel bg-[#111625] border border-[#1E2842] px-3 py-1.5 text-[#00E5FF] whitespace-nowrap">
            ITEMS: {filteredItems.length} / {dbItems.length}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl h-full flex flex-col justify-between overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-pixel">
              Cargando...
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#161C2E] border-b-2 border-[#1E2842]">
                    <tr className="text-[#00E5FF] font-pixel text-sm">
                      <th className="p-3 border-r border-[#1E2842] w-44">
                        Código
                      </th>
                      <th className="p-3 border-r border-[#1E2842]">
                        Artículo
                      </th>
                      {activeTab === "general" && (
                        <th className="p-3 border-r border-[#1E2842] text-center w-36">
                          Demanda / Mes
                        </th>
                      )}
                      {activeTab === "general" && (
                        <th className="p-3 border-r border-[#1E2842] text-center w-32">
                          Días Stock
                        </th>
                      )}
                      <th className="p-3 border-r border-[#1E2842] text-right w-36">
                        {activeTab === "general"
                          ? "Stock Sumado"
                          : "Stock Sucursal"}
                      </th>
                      <th className="p-3 text-center w-24">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2842]/60">
                    {currentPaginatedItems.map((item) => {
                      const stockVal = getDisplayedStock(item)
                      let diasColor = "text-slate-500"
                      if (item.dias_stock !== null) {
                        if (item.dias_stock <= 15)
                          diasColor =
                            "bg-red-500/20 text-red-500 border border-red-500/50"
                        else if (item.dias_stock <= 30)
                          diasColor =
                            "bg-amber-500/20 text-amber-500 border border-amber-500/50"
                        else
                          diasColor =
                            "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      }
                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[#161C2E]/50 text-slate-200 transition-colors"
                        >
                          <td className="p-2.5 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold">
                            {item.codigo}
                          </td>
                          <td className="p-2.5 border-r border-[#1E2842]/40 font-bold text-white">
                            {item.nombre}
                          </td>
                          {activeTab === "general" && (
                            <td className="p-2.5 border-r border-[#1E2842]/40 text-center font-pixel font-bold">
                              {item.demanda_mensual > 0 ? (
                                item.demanda_mensual
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          )}
                          {activeTab === "general" && (
                            <td className="p-2.5 border-r border-[#1E2842]/40 text-center font-pixel font-bold">
                              {item.dias_stock !== null ? (
                                <span className={`px-2 py-0.5 ${diasColor}`}>
                                  {item.dias_stock}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          )}
                          <td className="p-2.5 border-r border-[#1E2842]/40 text-right font-pixel text-sm text-white font-bold">
                            {stockVal}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {activeTab !== "general" ? (
                                <button
                                  onClick={() => {
                                    setEditingItem(item)
                                    setNewStockValue(item[activeTab] || 0)
                                  }}
                                  className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-[#FF5500]"
                                >
                                  <Pencil size={13} />
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-pixel">
                                  -
                                </span>
                              )}
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-red-400"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                <div className="text-slate-400">
                  PÁG <span className="text-white">{currentPage}</span> /{" "}
                  {totalPages}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronLeft size={14} /> ANT
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    SIG <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {editingItem && activeTab !== "general" && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0E1322] border-2 border-[#FF5500] w-full max-w-md p-5 font-mono">
            <h3 className="font-pixel text-lg text-[#FF5500] border-b border-[#1E2842] pb-2 mb-4">
              AJUSTAR STOCK
            </h3>
            <input
              type="number"
              value={newStockValue}
              onChange={(e) => setNewStockValue(e.target.value)}
              className="w-full bg-[#070A12] border border-[#1E2842] text-[#FF5500] font-pixel text-2xl p-2 mb-4 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 font-pixel text-xs">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 border border-[#1E2842] text-slate-400"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveStock}
                className="px-5 py-2 bg-[#FF5500] text-black font-bold"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
