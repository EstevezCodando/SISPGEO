/** Postos e graduações do Exército Brasileiro - Civil a Gen Ex */
export interface PostoGraduacao {
  id: number;
  nome: string;
  abrev: string;
}

export const POSTOS: PostoGraduacao[] = [
  { id: 6, nome: "Terceiro Sargento", abrev: "3º Sgt" },
  { id: 7, nome: "Segundo Sargento", abrev: "2º Sgt" },
  { id: 8, nome: "Primeiro Sargento", abrev: "1º Sgt" },
  { id: 9, nome: "Subtenente", abrev: "STen" },
  { id: 10, nome: "Aspirante", abrev: "Asp" },
  { id: 11, nome: "Segundo Tenente", abrev: "2º Ten" },
  { id: 12, nome: "Primeiro Tenente", abrev: "1º Ten" },
  { id: 13, nome: "Capitão", abrev: "Cap" },
  { id: 14, nome: "Major", abrev: "Maj" },
  { id: 15, nome: "Tenente Coronel", abrev: "TC" },
  { id: 16, nome: "Coronel", abrev: "Cel" },
];

/** Mapa nome completo → abreviatura (cobre todos os valores do enum Python + legado) */
export const POSTO_ABREV: Record<string, string> = {
  ...Object.fromEntries(POSTOS.map((p) => [p.nome, p.abrev])),
  // Legado: registros criados antes da padronização para "Aspirante"
  "Aspirante a Oficial": "Asp Of",
};

/**
 * Formata referência ao usuário: "Abrev. Posto + Nome de Guerra" (ou nome completo como fallback).
 * Ex.: formatNomeComPosto("Gustavo Silva", "Capitão", "Silva") → "Cap Silva"
 */
export function formatNomeComPosto(
  nome: string,
  posto: string | null | undefined,
  nomeDeGuerra?: string | null,
): string {
  const displayName = nomeDeGuerra?.trim() || nome;
  if (!posto) return displayName;
  const abrev = POSTO_ABREV[posto];
  return abrev ? `${abrev} ${displayName}` : displayName;
}
