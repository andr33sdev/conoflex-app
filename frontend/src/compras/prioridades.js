// Niveles de prioridad (1 a 5) con sus colores. Los usa la pantalla y el PDF.
export const NIVELES_PRIORIDAD = [
  {
    valor: 1,
    label: "1 - Baja",
    badgeBg: "bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  {
    valor: 2,
    label: "2 - Normal",
    badgeBg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  {
    valor: 3,
    label: "3 - Media",
    badgeBg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  {
    valor: 4,
    label: "4 - Alta",
    badgeBg: "bg-orange-500/20",
    border: "border-orange-500/40",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  {
    valor: 5,
    label: "5 - Urgente",
    badgeBg: "bg-rose-500/25",
    border: "border-rose-500/50",
    text: "text-rose-400",
    dot: "bg-rose-400 shadow-[0_0_8px_#f43f5e]",
  },
];
