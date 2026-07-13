import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { FeatureCollection } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, X } from 'lucide-react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { pedidosApi } from '../../api/pedidos'
import type { Pedido } from '../../types/pedido'
import { TIPO_PRODUTO_LABELS } from '../../types/pedido'

function GeoJSONLayer({ geojson }: { geojson: FeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.18,
      }),
      onEachFeature: (feature, lyr) => {
        const p = feature.properties ?? {}
        const inom = p.inom ?? '-'
        const mi = p.mi ?? null
        let tip = `<b>${inom}</b>`
        if (mi) tip += `<br><span style="color:#a1a1aa">MI:</span> <span style="color:#34d399;font-weight:600">${mi}</span>`
        if (p.tipo_produto) {
          tip += `<br>${TIPO_PRODUTO_LABELS[p.tipo_produto as keyof typeof TIPO_PRODUTO_LABELS] ?? p.tipo_produto}`
        }
        if (p.escala) tip += `<br>${p.escala}`
        if (p.disponivel_bdgex === true) {
          const idadeAnos: number | null = p.idade_anos ?? null
          const ageStr = idadeAnos != null
            ? (idadeAnos < 1 ? `${Math.round(idadeAnos * 12)} meses` : `${idadeAnos} ano${idadeAnos !== 1 ? 's' : ''}`)
            : null
          tip += `<br><span style="color:#10b981">BDGEx: Sim${ageStr ? ` &middot; Produto com ${ageStr}` : ''}</span>`
        } else if (p.disponivel_bdgex === false) {
          tip += '<br><span style="color:#71717a">BDGEx: Nao disponivel</span>'
        }
        lyr.bindTooltip(tip, { sticky: true, className: 'leaflet-dark-tooltip' })
      },
    }).addTo(map)

    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] })

    return () => {
      layer.remove()
    }
  }, [geojson, map])

  return null
}

interface PedidoSpatializeModalProps {
  pedido: Pedido
  onClose: () => void
}

export function PedidoSpatializeModal({ pedido, onClose }: PedidoSpatializeModalProps) {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const produtosAtivos = pedido.itens.filter((item) => !item.removido).length

  useEffect(() => {
    setLoading(true)
    pedidosApi
      .features(pedido.id)
      .then((res) => setGeojson(res.data as FeatureCollection))
      .catch(() => toast.error('Erro ao carregar geometrias'))
      .finally(() => setLoading(false))
  }, [pedido.id])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Pedido #{pedido.id} - Ver no mapa
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {produtosAtivos} produto{produtosAtivos !== 1 ? 's' : ''} ativo{produtosAtivos !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-5">
          {loading ? (
            <div className="h-72 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
            </div>
          ) : geojson && geojson.features.length > 0 ? (
            <div className="h-72 rounded-xl overflow-hidden border border-white/10">
              <MapContainer
                center={[-15, -52]}
                zoom={5}
                style={{ height: '100%', width: '100%', background: '#18181b' }}
                zoomControl
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <GeoJSONLayer geojson={geojson} />
              </MapContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-zinc-500 text-sm">
              Nenhuma geometria disponivel para este pedido
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
