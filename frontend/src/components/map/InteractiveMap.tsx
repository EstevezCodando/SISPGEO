import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FeatureCollection, Feature } from 'geojson'
import type { CartItem, TipoProduto, Escala } from '../../types/pedido'
import { useCartStore } from '../../store/cartStore'

/**
 * Colore cada folha pela idade do produto conforme dados do BDGEx (fonte SOPEGEO).
 * Paleta idêntica à legenda da página de solicitação.
 */
function getAgeColor(idadeAnos: number | null | undefined): string {
  if (idadeAnos === null || idadeAnos === undefined) return 'transparent'
  if (idadeAnos < 5)  return '#10b981'
  if (idadeAnos < 10) return '#84cc16'
  if (idadeAnos < 20) return '#eab308'
  if (idadeAnos < 30) return '#f97316'
  return '#ef4444'
}

export type Basemap = 'osm' | 'satellite'

const TILE_LAYERS: Record<Basemap, { url: string; attribution: string; maxZoom: number }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
}

interface Props {
  inomGrid: FeatureCollection | null
  showData?: boolean    // controla visibilidade dos dados do BDGEx (padrão: true)
  basemap?: Basemap     // camada base (padrão: osm)
  somenteBdgex?: boolean // quando true, bloqueia clique em células sem dado BDGEx
}

export function InteractiveMap({ inomGrid, showData = true, basemap = 'osm', somenteBdgex = false }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inomLayerRef = useRef<L.GeoJSON | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const { addItem, removeItem, hasItem, items, tipoProduto, escala } = useCartStore()

  // ── Inicializa o mapa (sem tileLayer — adicionado separadamente) ──────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, {
      center: [-15.0, -47.0],
      zoom: 5,
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      tileRef.current = null
    }
  }, [])

  // ── Troca de basemap ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    tileRef.current?.remove()
    const cfg = TILE_LAYERS[basemap]
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(mapRef.current)
  }, [basemap])

  // ── Camada INOM ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    inomLayerRef.current?.remove()
    inomLayerRef.current = null
    if (!inomGrid) return

    inomLayerRef.current = L.geoJSON(inomGrid, {
      // @ts-ignore — renderer é opção válida de Path no Leaflet; ausente no GeoJSONOptions do @types/leaflet
      renderer: L.canvas(),
      style: (feature) => {
        const props = (feature as Feature)?.properties ?? {}
        const { inom, idade_anos, disponivel } = props as { inom: string; idade_anos?: number | null; disponivel?: boolean }
        const selected = hasItem(inom, tipoProduto as TipoProduto, escala as Escala)
        const bloqueada = somenteBdgex && !disponivel

        if (selected) {
          return { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.45 }
        }
        if (bloqueada) {
          return { color: '#3f3f46', weight: 0.5, fillColor: '#3f3f46', fillOpacity: 0.25, dashArray: '3,3' }
        }
        if (showData) {
          const fill = getAgeColor(idade_anos)
          return {
            color: '#444', weight: 0.5,
            fillColor: fill,
            fillOpacity: fill === 'transparent' ? 0 : 0.55,
          }
        }
        return { color: '#555', weight: 0.5, fillColor: 'transparent', fillOpacity: 0 }
      },
      onEachFeature: (feature, layer) => {
        const { inom, mi, data_conclusao, idade_anos, disponivel } = feature.properties as {
          inom: string; mi?: string; data_conclusao?: string; idade_anos?: number; disponivel?: boolean
        }
        const bloqueada = somenteBdgex && !disponivel
        let tip = mi
          ? `<b style="color:#34d399">${mi}</b><br><span style="color:#a1a1aa;font-size:11px">${inom}</span>`
          : `<b>${inom}</b>`
        if (disponivel) {
          const ageStr = (idade_anos !== undefined && idade_anos !== null)
            ? (idade_anos < 1
                ? `${Math.round(idade_anos * 12)} meses`
                : `${idade_anos} ano${idade_anos !== 1 ? 's' : ''}`)
            : null
          tip += `<br><span style="color:#10b981">BDGEx: Sim${ageStr ? ` &middot; Produto com ${ageStr}` : ''}</span>`
        } else {
          tip += `<br><span style="color:#71717a">BDGEx: Não disponível${bloqueada ? ' (bloqueado)' : ''}</span>`
        }
        layer.bindTooltip(tip, { sticky: true })

        layer.on('click', () => {
          if (!tipoProduto || !escala) return
          if (somenteBdgex && !disponivel) return  // bloqueia clique se não há dado BDGEx
          if (hasItem(inom, tipoProduto as TipoProduto, escala as Escala)) {
            removeItem(inom, tipoProduto as TipoProduto, escala as Escala)
          } else {
            addItem({
              inom,
              mi: mi ?? null,
              tipo_produto: tipoProduto as TipoProduto,
              escala: escala as Escala,
              solicitar_mesmo_disponivel: false,
              disponivel_bdgex: disponivel === true,
              data_producao_bdgex: data_conclusao ?? null,
            })
          }
          const path = layer as L.Path
          const nowSelected = hasItem(inom, tipoProduto as TipoProduto, escala as Escala)
          path.setStyle(
            nowSelected
              ? { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.45 }
              : showData
                ? {
                    color: '#444', weight: 0.5,
                    fillColor: getAgeColor((feature.properties as { idade_anos?: number }).idade_anos),
                    fillOpacity: 0.55,
                  }
                : { color: '#555', weight: 0.5, fillColor: 'transparent', fillOpacity: 0 },
          )
        })
      },
    }).addTo(mapRef.current)
  }, [inomGrid, showData, somenteBdgex])

  // Sincroniza estilos do mapa quando itens são removidos externamente (sidebar ou modal)
  useEffect(() => {
    const layer = inomLayerRef.current
    if (!layer) return
    layer.eachLayer((sublayer) => {
      const path = sublayer as L.Path & { feature?: Feature }
      const props = path.feature?.properties as { inom?: string; idade_anos?: number | null; disponivel?: boolean } | undefined
      if (!props?.inom) return
      const { inom, idade_anos, disponivel } = props
      const selected = hasItem(inom, tipoProduto as TipoProduto, escala as Escala)
      const bloqueada = somenteBdgex && !disponivel
      const fill = getAgeColor(idade_anos)
      path.setStyle(
        selected
          ? { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.45 }
          : bloqueada
            ? { color: '#3f3f46', weight: 0.5, fillColor: '#3f3f46', fillOpacity: 0.25, dashArray: '3,3' }
            : showData
              ? { color: '#444', weight: 0.5, fillColor: fill, fillOpacity: fill === 'transparent' ? 0 : 0.55 }
              : { color: '#555', weight: 0.5, fillColor: 'transparent', fillOpacity: 0 },
      )
    })
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />
}
