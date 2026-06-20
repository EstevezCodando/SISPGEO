import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface JornadaGuia {
  perfil: string;
  cor: string;
  passos: { n: string; title: string; desc: string }[];
}

const COR_JORNADA: Record<string, string> = {
  emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  amber: "bg-amber-500/10   border-amber-500/30   text-amber-400",
  yellow: "bg-yellow-500/10  border-yellow-500/30  text-yellow-400",
  orange: "bg-orange-500/10  border-orange-500/30  text-orange-400",
  blue: "bg-blue-500/10    border-blue-500/30    text-blue-400",
};

interface JornadaCardProps {
  jornada: JornadaGuia;
}

export function JornadaCard({ jornada }: JornadaCardProps) {
  const [open, setOpen] = useState(false);
  const cls = COR_JORNADA[jornada.cor] ?? COR_JORNADA.emerald;
  return (
    <div className={`rounded-xl border overflow-hidden ${cls}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:opacity-80 transition-opacity gap-4"
      >
        <span className="text-sm font-semibold">{jornada.perfil}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-current/20 pt-3 bg-zinc-900/60">
          <ol className="space-y-3">
            {jornada.passos.map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="w-5 h-5 shrink-0 rounded-full bg-current/10 border border-current/30 text-[10px] font-bold flex items-center justify-center">
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{s.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
