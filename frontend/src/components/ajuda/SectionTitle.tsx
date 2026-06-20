import { type ReactNode } from "react";

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
}

export function SectionTitle({ icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-emerald-400">{icon}</span>
      <h2 className="font-semibold text-zinc-100 text-base">{title}</h2>
    </div>
  );
}
