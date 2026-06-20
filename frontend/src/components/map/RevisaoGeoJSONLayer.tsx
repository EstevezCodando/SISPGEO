/**
 * Camada GeoJSON vanilla Leaflet (dentro de MapContainer).
 * Usa L.geoJSON + useMap para garantir tooltips funcionando 100%.
 * O prop `itemMap` fornece o MI do CartItem como fallback quando
 * feature.properties.mi está nulo (comum em escalas sem dado MI no BDGEx).
 */
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { TIPO_PRODUTO_LABELS } from "../../types/pedido";
import type { CartItem } from "../../types/pedido";

interface RevisaoGeoJSONLayerProps {
  geojson: FeatureCollection;
  itemMap: Map<string, CartItem>;
}

export function RevisaoGeoJSONLayer({
  geojson,
  itemMap,
}: RevisaoGeoJSONLayerProps) {
  const map = useMap();

  useEffect(() => {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: "#3b82f6",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.35,
      }),
      onEachFeature: (feature: Feature, lyr: L.Layer) => {
        const props = (feature.properties ?? {}) as {
          inom?: string;
          mi?: string | null;
        };
        const inom = props.inom ?? "—";
        const cartItem = itemMap.get(inom);
        // Prioridade: feature.properties.mi → CartItem.mi → ausente
        const mi = props.mi ?? cartItem?.mi ?? null;
        const tip = mi
          ? `<b style="color:#34d399">${mi}</b><br><span style="color:#a1a1aa;font-size:11px">${inom}</span>` +
            (cartItem
              ? `<br><span style="color:#71717a">${TIPO_PRODUTO_LABELS[cartItem.tipo_produto]} · ${cartItem.escala}</span>`
              : "")
          : `<b>${inom}</b>` +
            (cartItem
              ? `<br><span style="color:#71717a">${TIPO_PRODUTO_LABELS[cartItem.tipo_produto]} · ${cartItem.escala}</span>`
              : "");
        lyr.bindTooltip(tip, {
          sticky: true,
          className: "leaflet-dark-tooltip",
        });
      },
    }).addTo(map);

    // Ajusta o zoom para as células selecionadas
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      /* ignore */
    }

    return () => {
      layer.remove();
    };
  }, [geojson, map, itemMap]);

  return null;
}
