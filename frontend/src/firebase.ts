/**
 * Firebase removido — nenhum dado é enviado ao Google.
 * Telemetria interna implementada via /api/v1/metricas (backend próprio).
 */
export function trackEvent(_name: string, _params?: Record<string, unknown>): void {
  // no-op: mantido apenas para compatibilidade de imports existentes
}
