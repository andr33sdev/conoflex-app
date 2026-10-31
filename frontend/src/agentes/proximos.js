// Agentes en preparación: se muestran para que se vea el equipo que viene. No hacen nada todavía.
export const PROXIMOS = [
  {
    id: "compras", nombre: "Vera", puesto: "Compras y proveedores", color: "#3b82f6",
    queHara: ["Avisarte cuando una solicitud de compra espera firma hace días", "Comparar precios de un mismo insumo entre proveedores", "Detectar materias primas que se acaban antes de que llegue la próxima compra"],
  },
  {
    id: "stock", nombre: "Nati", puesto: "Stock y depósito", color: "#22c55e",
    queHara: ["Vigilar el stock mínimo de materias primas y semielaborados", "Detectar movimientos raros o diferencias de inventario", "Proponerte qué producir según lo que falta"],
  },
  {
    id: "ventas", nombre: "Cata", puesto: "Ventas y pedidos", color: "#a855f7",
    queHara: ["Seguir pedidos atrasados y clientes que no recompran", "Resumir cada mañana qué hay para despachar", "Armarte presupuestos y mensajes para clientes"],
  },
];
