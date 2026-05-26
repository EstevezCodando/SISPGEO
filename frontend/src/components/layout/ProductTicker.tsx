const PRODUCTS = [
  { label: "Carta Topográfica", color: "#3b82f6" },
  { label: "Carta Ortoimagem", color: "#8b5cf6" },
  { label: "Ortoimagem", color: "#f59e0b" },
  { label: "Modelo Digital do Terreno (MDT)", color: "#10b981" },
  { label: "Modelo Digital de Superfície (MDS)", color: "#06b6d4" },
  {
    label: "Conjunto de Dados Geoespaciais Vetoriais (CDGV)",
    color: "#f97316",
  },
  { label: "Impressão de Carta Topográfica", color: "#ec4899" },
  { label: "Impressão de Carta Ortoimagem", color: "#db2777" },
];

// Separator between products
const SEP = <span className="mx-6 text-white/15 select-none">◆</span>;

export function ProductTicker() {
  // Duplicate items so the loop is seamless
  const items = [...PRODUCTS, ...PRODUCTS];

  return (
    <div
      className="shrink-0 bg-zinc-900/60 border-b border-white/5 overflow-hidden"
      style={{ height: "28px" }}
      aria-hidden="true"
    >
      <div
        className="flex items-center h-full whitespace-nowrap"
        style={{ animation: "sipgeo-ticker 32s linear infinite" }}
      >
        {items.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center text-xs font-medium tracking-wide"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-2 shrink-0"
              style={{ background: p.color }}
            />
            <span style={{ color: p.color + "cc" }}>{p.label}</span>
            {SEP}
          </span>
        ))}
      </div>
    </div>
  );
}
