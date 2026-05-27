import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'
import type { TipoProduto } from '../../types/pedido'

const TIPO_COLORS: Record<string, string> = {
  CARTA_TOPOGRAFICA:  '#3b82f6',
  CARTA_ORTOIMAGEM:   '#8b5cf6',
  ORTOIMAGEM:         '#f59e0b',
  MDT:                '#10b981',
  MDS:                '#06b6d4',
  CDGV:               '#f97316',
  IMPRESSAO:          '#ec4899',
}

interface PedidosMapProps {
  className?: string
}

export function PedidosMap({ className = '' }: PedidosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      center: [-15.78, -47.93],
      zoom: 5,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    import('../../api/pedidos').then(({ pedidosApi }) => {
      pedidosApi.mapFeatures().then((r) => {
        if (layerRef.current) {
          layerRef.current.remove()
        }

        const geojson = r.data as GeoJSON.FeatureCollection
        if (!geojson.features?.length) return

        // Pre-group features by INOM to detect duplicates across pedidos
        type FProps = Record<string, unknown>
        const inomGroups: Record<string, FProps[]> = {}
        for (const f of geojson.features) {
          const fp = (f.properties ?? {}) as FProps
          const key = fp.inom as string
          if (!inomGroups[key]) inomGroups[key] = []
          // Deduplicate same pedido_id + tipo_produto in the same INOM group
          const alreadyIn = inomGroups[key].some(
            x => x.pedido_id === fp.pedido_id && x.tipo_produto === fp.tipo_produto
          )
          if (!alreadyIn) inomGroups[key].push(fp)
        }

        const layer = L.geoJSON(geojson, {
          style: (feature) => {
            const tipo = feature?.properties?.tipo_produto as string
            const isDuplicate = (inomGroups[feature?.properties?.inom as string]?.length ?? 0) > 1
            return {
              color: isDuplicate ? '#f59e0b' : (TIPO_COLORS[tipo] ?? '#94a3b8'),
              fillColor: isDuplicate ? '#f59e0b' : (TIPO_COLORS[tipo] ?? '#94a3b8'),
              fillOpacity: isDuplicate ? 0.35 : 0.4,
              weight: isDuplicate ? 2 : 1.5,
              dashArray: isDuplicate ? '6 3' : undefined,
            }
          },
          onEachFeature: (feature, lyr) => {
            const p = (feature.properties ?? {}) as FProps
            const entries = inomGroups[p.inom as string] ?? [p]
            const isMulti = entries.length > 1

            const renderCard = (e: FProps, bordered: boolean) => {
              const tipoLabel = TIPO_PRODUTO_LABELS[e.tipo_produto as TipoProduto] ?? (e.tipo_produto as string)
              const dataFmt = e.data_entrega
                ? format(new Date((e.data_entrega as string) + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                : '—'
              const dispBdgex = e.disponivel_bdgex as boolean | undefined
              const idadeAnos  = e.idade_anos  as number | null | undefined
              const ageStr = idadeAnos != null
                ? (idadeAnos < 1
                    ? `${Math.round(idadeAnos * 12)} meses`
                    : `${idadeAnos} ano${idadeAnos !== 1 ? 's' : ''}`)
                : null
              const bdgexRow = dispBdgex === true
                ? `<div style="font-size:10px"><span style="color:#71717a">BDGEx:</span> <span style="color:#10b981">Sim${ageStr ? ` &middot; Produto com ${ageStr}` : ''}</span></div>`
                : dispBdgex === false
                  ? `<div style="font-size:10px"><span style="color:#71717a">BDGEx:</span> <span style="color:#71717a">Não disponível</span></div>`
                  : ''
              return `
                <div style="min-width:160px${bordered ? ';border-left:1px solid #3f3f46;padding-left:10px' : ''}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
                    <span style="font-weight:600;color:#f4f4f5;font-size:11px">${e.inom as string}</span>
                    <span style="color:#34d399;font-family:monospace;font-weight:700;font-size:11px;white-space:nowrap">
                      #${e.pedido_id as number}
                    </span>
                  </div>
                  ${e.mi ? `<div style="font-size:10px"><span style="color:#71717a">MI:</span> <span style="color:#34d399;font-family:monospace">${e.mi as string}</span></div>` : ''}
                  <div style="font-size:10px"><span style="color:#71717a">Produto:</span> ${tipoLabel}</div>
                  <div style="font-size:10px"><span style="color:#71717a">Escala:</span> ${e.escala as string}</div>
                  <div style="font-size:10px"><span style="color:#71717a">Entrega:</span> ${dataFmt}</div>
                  <div style="font-size:10px"><span style="color:#71717a">Solicitante:</span> ${(e.usuario_nome as string) ?? '—'}</div>
                  ${e.operacao_nome ? `<div style="font-size:10px"><span style="color:#71717a">Operação:</span> ${e.operacao_nome as string}</div>` : ''}
                  ${bdgexRow}
                </div>
              `
            }

            const duplicateHeader = isMulti
              ? `<div style="font-size:10px;color:#fbbf24;font-weight:600;margin-bottom:6px">⚠ ${entries.length} pedidos com este INOM</div>`
              : ''

            const cards = entries.map((e, i) => renderCard(e, i > 0)).join('')

            lyr.bindTooltip(`
              <div>
                ${duplicateHeader}
                <div style="display:flex;gap:10px">${cards}</div>
              </div>
            `, { sticky: true, className: 'leaflet-dark-tooltip' })
          },
        }).addTo(map)

        layerRef.current = layer

        const bounds = layer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] })
        }
      }).catch(() => {})
    })
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg p-2.5 text-xs shadow-lg space-y-1">
        <div className="font-medium text-zinc-300 mb-1.5">Tipo de Produto</div>
        {Object.entries(TIPO_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-3 h-3 rounded-sm inline-block border border-white/10 shrink-0" style={{ background: color }} />
            {TIPO_PRODUTO_LABELS[key as TipoProduto] ?? key}
          </div>
        ))}
      </div>
    </div>
  )
}
