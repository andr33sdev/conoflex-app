import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { 
  ArrowUp, X, Check, Search, Pencil, Save, 
  FileSpreadsheet, AlertCircle, RefreshCw 
} from 'lucide-react';

export default function Inventory({ isUploadModalOpen, onCloseUploadModal }) {
  // Estado local del inventario
  const [dbItems, setDbItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado del Filtro de Búsqueda
  const [searchTerm, setSearchTerm] = useState('');

  // Estados del Modal de Edición de Stock (Lápiz)
  const [editingItem, setEditingItem] = useState(null); // Ítem siendo editado
  const [newStockValue, setNewStockValue] = useState('');

  // Estados para el Modal de Sincronización Excel
  const [excelData, setExcelData] = useState(null);
  const [diffAdditions, setDiffAdditions] = useState([]);
  const [diffDeletions, setDiffDeletions] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [selectedToRemove, setSelectedToRemove] = useState([]);

  // Cargar datos desde el backend local al iniciar
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/materias-primas');
      const data = await res.json();
      setDbItems(data);
    } catch (err) {
      console.error("Error conectando con backend local:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // FILTRADOR EN VIVO (Por Código o Nombre)
  const filteredItems = dbItems.filter(item => {
    const term = searchTerm.toLowerCase();
    const nombreMatch = item.nombre ? item.nombre.toLowerCase().includes(term) : false;
    const codigoMatch = item.codigo ? item.codigo.toLowerCase().includes(term) : false;
    return nombreMatch || codigoMatch;
  });

  // Abrir modal de edición con el lápiz
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setNewStockValue(item.stock_actual);
  };

  // Guardar nuevo stock (Diskette)
  const handleSaveStock = async () => {
    if (!editingItem) return;

    const parsedStock = parseFloat(newStockValue);
    if (isNaN(parsedStock) || parsedStock < 0) {
      alert("Por favor ingresa un número válido.");
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/materias-primas/${editingItem.id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: parsedStock })
      });

      if (res.ok) {
        setDbItems(dbItems.map(i => i.id === editingItem.id ? { ...i, stock_actual: parsedStock } : i));
        setEditingItem(null);
      } else {
        alert("Error al actualizar stock.");
      }
    } catch (err) {
      console.error("Error al guardar stock:", err);
    }
  };

  // Lógica Dropzone Excel (Sincronización de Catálogo)
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const workbook = XLSX.read(buffer, { type: 'binary' });
      const parsedSheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      const excelNames = parsedSheet.map(i => i.Nombre || i.MateriaPrima || i.Descripcion);
      const dbNames = dbItems.map(i => i.nombre);

      const toAdd = parsedSheet.filter(i => {
        const name = i.Nombre || i.MateriaPrima || i.Descripcion;
        return name && !dbNames.includes(name);
      });

      const toRemove = dbItems.filter(i => !excelNames.includes(i.nombre));

      setExcelData(parsedSheet);
      setDiffAdditions(toAdd);
      setDiffDeletions(toRemove);
      setSelectedToAdd(toAdd.map(i => i.Nombre || i.MateriaPrima || i.Descripcion));
      setSelectedToRemove([]);
    };
    reader.readAsBinaryString(file);
  }, [dbItems]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    multiple: false
  });

  const handleConfirmSync = async () => {
    const paraAgregar = diffAdditions
      .filter(i => selectedToAdd.includes(i.Nombre || i.MateriaPrima || i.Descripcion))
      .map((i, idx) => ({
        codigo: i.Codigo || `MP-${Date.now().toString().slice(-4)}-${idx}`,
        nombre: i.Nombre || i.MateriaPrima || i.Descripcion,
        unidad: i.Unidad || 'Unidades'
      }));

    try {
      const res = await fetch('http://localhost:3001/api/materias-primas/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paraAgregar, paraEliminarIds: selectedToRemove })
      });

      if (res.ok) {
        await fetchInventory();
        handleCloseUploadModal();
        alert("¡Catálogo sincronizado exitosamente con la base de datos local!");
      }
    } catch (err) {
      console.error("Error sincronizando catálogo:", err);
    }
  };

  const handleCloseUploadModal = () => {
    setExcelData(null);
    setDiffAdditions([]);
    setDiffDeletions([]);
    onCloseUploadModal();
  };

  return (
    <div className="space-y-5 font-mono">
      
      {/* CABECERA DE TABLA + FILTRADOR EN VIVO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-conoflex-border pb-4">
        <div>
          <h2 className="font-pixel text-2xl text-white">CATÁLOGO DE MATERIAS PRIMAS</h2>
          <p className="text-xs text-conoflex-muted">Gestión directa de cantidades e inventario en planta.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* BARRA DE BÚSQUEDA EN VIVO */}
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-conoflex-muted" />
            <input 
              type="text" 
              placeholder="Filtrar código o nombre..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-conoflex-card border border-conoflex-border text-xs text-white pl-8 pr-3 py-1.5 focus:border-conoflex-orange focus:outline-none transition-colors"
            />
          </div>

          <div className="text-xs font-pixel bg-conoflex-card border border-conoflex-border px-3 py-1.5 text-conoflex-orange whitespace-nowrap">
            MOSTRANDO: {filteredItems.length} / {dbItems.length}
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-conoflex-panel border-2 border-conoflex-border shadow-pixel-dark overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-conoflex-muted font-pixel">Cargando inventario local...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-conoflex-muted font-pixel">
            {searchTerm ? `No se encontraron artículos con "${searchTerm}"` : 'Sin datos en la base de datos.'}
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-conoflex-card text-conoflex-orange font-pixel text-sm border-b border-conoflex-border">
                <th className="p-3 border-r border-conoflex-border">Código</th>
                <th className="p-3 border-r border-conoflex-border">Materia Prima</th>
                <th className="p-3 border-r border-conoflex-border">Unidad</th>
                <th className="p-3 border-r border-conoflex-border text-right">Stock Actual</th>
                <th className="p-3 text-center">Ajuste Rápido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-conoflex-border/60">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-conoflex-card/50 text-conoflex-text transition-colors">
                  <td className="p-3 border-r border-conoflex-border/40 font-pixel text-conoflex-muted">{item.codigo}</td>
                  <td className="p-3 border-r border-conoflex-border/40 font-bold text-white">{item.nombre}</td>
                  <td className="p-3 border-r border-conoflex-border/40 text-conoflex-muted">{item.unidad_medida || item.unidad}</td>
                  <td className="p-3 border-r border-conoflex-border/40 text-right font-pixel text-base text-conoflex-orange">
                    {item.stock_actual}
                  </td>
                  
                  {/* COLUMNA AJUSTE RÁPIDO CON LÁPIZ ANIMADO */}
                  <td className="p-3 text-center">
                    <button 
                      onClick={() => handleOpenEditModal(item)}
                      title="Editar cantidad"
                      className="p-1.5 bg-conoflex-card border border-conoflex-border text-conoflex-muted hover:text-conoflex-orange hover:border-conoflex-orange hover:scale-110 active:translate-y-0.5 transition-all shadow-pixel-dark"
                    >
                      <Pencil size={14} className="hover:rotate-12 transition-transform" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL 1: EDITAR CANTIDAD DE STOCK (LÁPIZ) */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-conoflex-panel border-2 border-conoflex-orange w-full max-w-md p-6 shadow-2xl space-y-4 relative font-mono">
            <button onClick={() => setEditingItem(null)} className="absolute top-4 right-4 text-conoflex-muted hover:text-white">
              <X size={18} />
            </button>

            <div className="border-b border-conoflex-border pb-2">
              <h3 className="font-pixel text-xl text-conoflex-orange">AJUSTAR CANTIDAD EN PLANTA</h3>
              <p className="text-xs text-white font-bold mt-1">{editingItem.nombre} ({editingItem.codigo})</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-conoflex-muted block">Stock Actual ({editingItem.unidad_medida || 'Unidades'}):</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={newStockValue}
                onChange={(e) => setNewStockValue(e.target.value)}
                className="w-full bg-conoflex-card border border-conoflex-border text-conoflex-orange font-pixel text-2xl p-2 focus:border-conoflex-orange focus:outline-none"
                autoFocus
              />
            </div>

            {/* BOTONES GUARDAR CON DISKETTE / CANCELAR */}
            <div className="pt-3 border-t border-conoflex-border flex justify-end gap-3 font-pixel">
              <button 
                onClick={() => setEditingItem(null)}
                className="px-4 py-1.5 border border-conoflex-border text-conoflex-muted hover:text-white"
              >
                CANCELAR
              </button>
              
              <button 
                onClick={handleSaveStock}
                className="flex items-center gap-2 px-5 py-1.5 bg-conoflex-orange text-black font-bold border border-white hover:bg-conoflex-orange-hover active:translate-y-0.5 transition-all"
              >
                <Save size={16} />
                <span>GUARDAR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SINCRONIZACIÓN EXCEL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-conoflex-panel border-2 border-conoflex-orange w-full max-w-2xl p-6 shadow-2xl space-y-5 relative font-mono">
            <button onClick={handleCloseUploadModal} className="absolute top-4 right-4 text-conoflex-muted hover:text-white">
              <X size={20} />
            </button>

            <div className="border-b border-conoflex-border pb-2">
              <h3 className="font-pixel text-2xl text-conoflex-orange">SINCRONIZAR CATÁLOGO DESDE EXCEL</h3>
              <p className="text-xs text-conoflex-muted">Compara artículos del Sheets. Los nuevos se agregarán con Stock = 0.</p>
            </div>

            {!excelData ? (
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  isDragActive ? 'border-conoflex-orange bg-conoflex-orange/10' : 'border-conoflex-border hover:border-conoflex-orange'
                }`}
              >
                <input {...getInputProps()} />
                <ArrowUp size={32} className="text-conoflex-orange mx-auto mb-3 animate-bounce" />
                <p className="font-pixel text-lg text-white">ARRASTRA TU EXCEL `.XLSX` O HAZ CLIC</p>
                <p className="text-xs text-conoflex-muted mt-1">Exportado desde Google Sheets</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-pixel text-conoflex-green">
                    <span>+ NUEVAS MATERIAS PRIMAS ({diffAdditions.length})</span>
                    <label className="cursor-pointer flex items-center gap-1 text-[10px] text-conoflex-muted">
                      <input 
                        type="checkbox" 
                        checked={selectedToAdd.length === diffAdditions.length && diffAdditions.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedToAdd(diffAdditions.map(i => i.Nombre || i.MateriaPrima || i.Descripcion));
                          else setSelectedToAdd([]);
                        }}
                      />
                      Seleccionar Todos
                    </label>
                  </div>

                  <div className="max-h-32 overflow-y-auto border border-conoflex-border bg-conoflex-card p-2 space-y-1 text-xs">
                    {diffAdditions.length === 0 ? (
                      <p className="text-conoflex-muted text-[11px] italic">No hay productos nuevos.</p>
                    ) : (
                      diffAdditions.map((item, idx) => {
                        const name = item.Nombre || item.MateriaPrima || item.Descripcion;
                        return (
                          <label key={idx} className="flex items-center gap-2 hover:bg-black/30 p-1 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={selectedToAdd.includes(name)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedToAdd([...selectedToAdd, name]);
                                else setSelectedToAdd(selectedToAdd.filter(n => n !== name));
                              }}
                            />
                            <span className="text-white">{name}</span>
                            <span className="text-[10px] text-conoflex-orange ml-auto font-pixel">[ STOCK INICIAL: 0 ]</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-pixel text-red-400">
                    <span>- FALTANTES EN EXCEL / DAR DE BAJA ({diffDeletions.length})</span>
                  </div>

                  <div className="max-h-28 overflow-y-auto border border-conoflex-border bg-conoflex-card p-2 space-y-1 text-xs">
                    {diffDeletions.length === 0 ? (
                      <p className="text-conoflex-muted text-[11px] italic">Coincidencia completa.</p>
                    ) : (
                      diffDeletions.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 hover:bg-black/30 p-1 cursor-pointer text-red-300">
                          <input 
                            type="checkbox" 
                            checked={selectedToRemove.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedToRemove([...selectedToRemove, item.id]);
                              else setSelectedToRemove(selectedToRemove.filter(id => id !== item.id));
                            }}
                          />
                          <span>{item.nombre}</span>
                          <span className="text-[10px] text-conoflex-muted ml-auto">(Stock actual: {item.stock_actual})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-conoflex-border flex justify-end gap-3 font-pixel">
                  <button onClick={handleCloseUploadModal} className="px-4 py-1.5 border border-conoflex-border text-conoflex-muted hover:text-white">
                    CANCELAR
                  </button>
                  <button 
                    onClick={handleConfirmSync} 
                    className="px-5 py-1.5 bg-conoflex-orange text-black font-bold border border-white hover:bg-conoflex-orange-hover"
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
  );
}