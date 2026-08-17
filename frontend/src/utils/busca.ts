// ─── Busca textual com suporte a termo exato entre aspas ─────────────────────
//
// A busca padrão é por substring, o que confunde siglas com prefixo comum:
// procurar por `DEC` também traz `DECEx`, e `CMA` também traz `CMAO`.
//
// Regra: um termo **entre aspas** exige correspondência exata do campo inteiro.
//
//   DEC       → casa com DEC e DECEx   (substring, comportamento antigo)
//   "DEC"     → casa apenas com DEC    (exato)
//   "CMA"     → casa apenas com CMA, não com CMAO
//
// Vários termos podem ser combinados e todos precisam casar (E lógico):
//
//   "DEC" 2955   → órgão exatamente DEC E algum campo contendo 2955

/**
 * Remove acentos e caixa para comparação — "3ª Bda C Mec" casa com "3a bda c mec".
 * Usa NFKD (e não NFD) porque só a forma de compatibilidade converte os
 * indicadores ordinais `ª`/`º`, onipresentes na nomenclatura das OM ("3ª Bda",
 * "1º CGEO"), nas letras `a`/`o`.
 */
function normalizar(valor: string): string {
  return valor
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface TermoBusca {
  texto: string;
  /** true quando o termo veio entre aspas → exige campo idêntico. */
  exato: boolean;
}

/**
 * Divide a expressão de busca em termos, respeitando aspas duplas ou simples.
 * Aspas não fechadas são tratadas como texto comum (o usuário ainda está digitando).
 */
export function parseBusca(expressao: string): TermoBusca[] {
  const termos: TermoBusca[] = [];
  // Grupo 1/2: conteúdo entre aspas (duplas ou simples). Grupo 3: palavra solta.
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(expressao)) !== null) {
    const citado = m[1] ?? m[2];
    if (citado !== undefined) {
      const texto = normalizar(citado);
      if (texto) termos.push({ texto, exato: true });
    } else {
      // Aspas abertas e não fechadas: descarta o delimitador e busca por substring.
      const texto = normalizar((m[3] ?? "").replace(/^["']/, ""));
      if (texto) termos.push({ texto, exato: false });
    }
  }
  return termos;
}

/** Um termo casa se algum dos campos satisfizer o critério (exato ou substring). */
function termoCasa(termo: TermoBusca, campos: readonly (string | null | undefined)[]): boolean {
  return campos.some((campo) => {
    if (campo === null || campo === undefined) return false;
    const valor = normalizar(String(campo));
    return termo.exato ? valor === termo.texto : valor.includes(termo.texto);
  });
}

/**
 * Verifica se um registro atende à expressão de busca.
 * Expressão vazia casa com tudo. Todos os termos precisam casar (E lógico).
 */
export function casaBusca(
  expressao: string,
  campos: readonly (string | null | undefined)[],
): boolean {
  const termos = parseBusca(expressao);
  if (termos.length === 0) return true;
  return termos.every((t) => termoCasa(t, campos));
}
