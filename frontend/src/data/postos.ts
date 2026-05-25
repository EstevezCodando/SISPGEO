/** Postos e graduações do Exército Brasileiro — 3º Sgt a Gen Ex */
export interface PostoGraduacao {
  id: number
  nome: string
  abrev: string
}

export const POSTOS: PostoGraduacao[] = [
  { id:  6, nome: 'Terceiro Sargento',       abrev: '3º Sgt'  },
  { id:  7, nome: 'Segundo Sargento',        abrev: '2º Sgt'  },
  { id:  8, nome: 'Primeiro Sargento',       abrev: '1º Sgt'  },
  { id:  9, nome: 'Subtenente',              abrev: 'ST'      },
  { id: 10, nome: 'Aspirante',               abrev: 'Asp'     },
  { id: 11, nome: 'Segundo Tenente',         abrev: '2º Ten'  },
  { id: 12, nome: 'Primeiro Tenente',        abrev: '1º Ten'  },
  { id: 13, nome: 'Capitão',                 abrev: 'Cap'     },
  { id: 14, nome: 'Major',                   abrev: 'Maj'     },
  { id: 15, nome: 'Tenente Coronel',         abrev: 'TC'      },
  { id: 16, nome: 'Coronel',                 abrev: 'Cel'     },
  { id: 17, nome: 'General de Brigada',      abrev: 'Gen Bda' },
  { id: 18, nome: 'General de Divisão',      abrev: 'Gen Div' },
  { id: 19, nome: 'General de Exército',     abrev: 'Gen Ex'  },
]

/** Mapa nome completo → abreviatura */
export const POSTO_ABREV: Record<string, string> = Object.fromEntries(
  POSTOS.map(p => [p.nome, p.abrev])
)

/**
 * Formata referência ao usuário: "Abrev. Posto + Nome de Guerra" (ou nome completo como fallback).
 * Ex.: formatNomeComPosto("Gustavo Silva", "Capitão", "Silva") → "Cap Silva"
 */
export function formatNomeComPosto(
  nome: string,
  posto: string | null | undefined,
  nomeDeGuerra?: string | null,
): string {
  const displayName = nomeDeGuerra?.trim() || nome
  if (!posto) return displayName
  const abrev = POSTO_ABREV[posto]
  return abrev ? `${abrev} ${displayName}` : displayName
}
