import {
  Boxes,
  Layers,
  Sparkles,
  Cpu,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Bot,
  ClipboardList,
  ShieldCheck,
  Truck,
  Building2,
  ListChecks,
  Fingerprint,
  Wrench,
  Smartphone,
  ScanFace,
  ShoppingCart,
  MessageSquareText,
  LayoutGrid,
  UsersRound,
  Lightbulb,
  Radar,
} from "lucide-react";

export const INICIO = {
  id: "inicio",
  label: "Inicio",
  icon: LayoutGrid,
  grupo: "inicio",
};

export const GRUPOS = [
  { id: "produccion", label: "Producción" },
  { id: "abastecimiento", label: "Stock y compras" },
  { id: "comercial", corto: "Comercial", label: "Ventas y despacho" },
  { id: "inteligencia", label: "Análisis e IA" },
  { id: "personas", label: "Personas" },
  { id: "laboratorio", label: "Laboratorio 3D y AR" },
];

export const ALL_MENU_ITEMS = [
  {
    id: "planificacion",
    corto: "Planif.",
    grupo: "produccion",
    label: "Planificación OT",
    icon: CalendarDays,
    desc: "Órdenes de trabajo y calendario de planta",
    kw: "ot ordenes calendario",
  },
  {
    id: "carga-produccion",
    corto: "Carga",
    grupo: "produccion",
    label: "Carga Producción",
    icon: ClipboardCheck,
    desc: "Registrá lo producido en cada turno",
    kw: "produccion turno",
  },
  {
    id: "ingenieria",
    corto: "Ingeniería",
    grupo: "produccion",
    label: "Ingeniería & BOM",
    icon: Cpu,
    desc: "Qué lleva cada producto terminado",
    kw: "bom composicion recetas",
  },
  {
    id: "semielaborados",
    corto: "Semielab.",
    grupo: "produccion",
    label: "Semielaborados",
    icon: Layers,
    desc: "Stock y planificación de semielaborados",
    kw: "stock",
  },
  {
    id: "reflectivas",
    corto: "Reflectivas",
    grupo: "produccion",
    label: "Reflectivas & Pegado",
    icon: Sparkles,
    desc: "Láminas reflectivas y pegado",
    kw: "laminas",
  },

  {
    id: "materias-primas",
    corto: "Materias",
    grupo: "abastecimiento",
    label: "Materias Primas",
    icon: Boxes,
    desc: "Inventario y movimientos",
    kw: "inventario stock insumos",
  },
  {
    id: "proveedores",
    grupo: "abastecimiento",
    label: "Proveedores",
    icon: Building2,
    desc: "Contactos y condiciones de compra",
    kw: "compras",
  },
  {
    id: "solicitudes-compra",
    corto: "Compras",
    grupo: "abastecimiento",
    label: "Solicitudes de Compra",
    icon: ShoppingCart,
    desc: "Pedidos de compra y su aprobación",
    kw: "sc compras aprobar firma",
  },
  {
    id: "sugerencias-compra",
    corto: "Sugerencias",
    grupo: "abastecimiento",
    label: "Sugerencias de Compra",
    icon: Lightbulb,
    desc: "Sugerí qué comprar y con qué urgencia",
    kw: "sugerir comprar faltante urgencia pedido",
  },
  {
    id: "solicitudes-internas",
    corto: "Internas",
    grupo: "abastecimiento",
    label: "Solicitudes Internas",
    icon: ClipboardList,
    desc: "Pedidos entre áreas de la planta",
    kw: "si internas",
  },

  {
    id: "pedidos",
    grupo: "comercial",
    label: "Pedidos",
    icon: ListChecks,
    desc: "Ventas, estados y seguimiento",
    kw: "ventas clientes",
  },
  {
    id: "despachar-pedidos",
    corto: "Despacho",
    grupo: "comercial",
    label: "Despachar Pedidos",
    icon: Truck,
    desc: "Preparar y despachar lo vendido",
    kw: "despacho envios",
  },
  {
    id: "clientes-nuevos",
    corto: "Clientes",
    grupo: "comercial",
    label: "Clientes nuevos",
    icon: Radar,
    desc: "La IA busca licitaciones, obras y empresas para vender",
    kw: "clientes nuevos prospectos licitaciones obras oportunidades vender",
  },
  {
    id: "comercial",
    grupo: "comercial",
    label: "IA Comercial",
    icon: Bot,
    desc: "Presupuestos y mensajes con ayuda de IA",
    kw: "presupuesto cotizacion whatsapp",
  },

  {
    id: "connie",
    corto: "Connie",
    grupo: "inteligencia",
    label: "Connie IA",
    icon: MessageSquareText,
    desc: "Preguntale a Connie: liquidaciones, ventas, demanda",
    kw: "asistente chat ia liquidar",
    highlight: true,
  },
  {
    id: "agentes",
    corto: "Agentes",
    grupo: "inteligencia",
    label: "Agentes IA",
    icon: UsersRound,
    desc: "Tu equipo de agentes: liquidaciones, avisos y más",
    kw: "agentes lia rrhh liquidacion horas extra presentismo feriados",
    highlight: true,
    porAgente: true,
  },
  {
    id: "metricas",
    corto: "Métricas",
    grupo: "inteligencia",
    label: "Métricas & KPI",
    icon: BarChart3,
    desc: "Tablero de indicadores del negocio",
    kw: "kpi tablero indicadores",
    highlight: true,
  },

  {
    id: "control-asistencia",
    corto: "Asistencia",
    grupo: "personas",
    label: "Control Asistencia",
    icon: Fingerprint,
    desc: "Fichadas, horas y liquidación",
    kw: "fichero horas presentismo liquidacion",
  },
  {
    id: "admin-usuarios",
    corto: "Admin",
    grupo: "personas",
    label: "Panel Administrador",
    icon: ShieldCheck,
    desc: "Usuarios, roles y permisos",
    kw: "usuarios roles permisos",
    adminOnly: true,
  },

  {
    id: "lab-ensamblaje",
    corto: "Lab 3D",
    grupo: "laboratorio",
    label: "Laboratorio 3D",
    icon: Wrench,
    desc: "Armado de productos en 3D",
    kw: "ensamblaje",
  },
  {
    id: "lab-ar",
    corto: "AR",
    grupo: "laboratorio",
    label: "AR (Manual WebXR)",
    icon: ScanFace,
    desc: "Realidad aumentada manual",
    kw: "webxr",
  },
  {
    id: "visor-ar",
    corto: "Visor",
    grupo: "laboratorio",
    label: "Visor AR (Nativo)",
    icon: Smartphone,
    desc: "Visor de realidad aumentada",
    kw: "realidad aumentada",
    highlight: true,
  },
];

/** Agentes que tiene habilitados el usuario (permisos "agente:<id>"; ADMIN y "*" ven todos). */
export function agentesPermitidos(usuario, todos = []) {
  const rol = (usuario?.rol || "").toUpperCase();
  const permisos = usuario?.permisos || [];
  if (rol === "ADMIN" || permisos.includes("*")) return todos;
  return todos.filter((a) => permisos.includes(`agente:${a}`));
}

export const tieneAlgunAgente = (usuario) =>
  (usuario?.rol || "").toUpperCase() === "ADMIN" ||
  (usuario?.permisos || []).some((p) => p === "*" || String(p).startsWith("agente:"));

/** Módulos que ve el usuario (misma regla que antes). */
export function itemsPermitidos(usuario) {
  const rol = (usuario?.rol || "").toUpperCase();
  const permisos = usuario?.permisos || [];
  return ALL_MENU_ITEMS.filter((it) => {
    if (rol === "ADMIN") return true;
    if (it.adminOnly) return false;
    if (it.porAgente) return tieneAlgunAgente(usuario);
    return permisos.includes(it.id) || permisos.includes("*");
  });
}

export function itemPorId(id) {
  return id === "inicio" ? INICIO : ALL_MENU_ITEMS.find((i) => i.id === id);
}

const CLAVE_RECIENTES = "cf_recientes_v1";
export function leerRecientes() {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || "[]");
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
export function anotarReciente(id) {
  if (!id || id === "inicio") return;
  try {
    const r = [id, ...leerRecientes().filter((x) => x !== id)].slice(0, 6);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(r));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
