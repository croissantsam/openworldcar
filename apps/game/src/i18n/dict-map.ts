/**
 * Minimap / GPS-map strings (`map_` prefix): section titles, POI fallback
 * hint, GPS remaining bar, button titles, expanded-map hint.
 * City names, flags, OSM kinds, distances and key hints ([M], [T]) are
 * data — interpolated via `{var}` placeholders, never translated. Only the
 * surrounding chrome is translated. Canvas-drawn N/E/S/W stay universal.
 * Convention: `fr` is the reference (exact current French copy); `en`/`es`
 * are typed as `typeof fr` so a missing or extra key fails typecheck.
 * NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
 * French values as literal types and every translated value would fail
 * typecheck. Without it, values widen to `string` while keys stay exact.
 */

export const fr = {
  // POI row description ({kind} = raw OSM kind/category, {dist} = meters)
  map_poi_desc: '{kind} · à {dist} m',
  // Expanded-map headers ({city} stays raw, already uppercased by caller)
  map_header_gps: 'CARTE GPS — {city}',
  map_quick_dests: '{flag} DESTINATIONS RAPIDES — {city}',
  map_oneclick_title: 'DESTINATIONS 1-CLIC :',
  // POI empty state ({key} = raw "T" key hint)
  map_pois_loading: 'Chargement des lieux autour de vous… ou touche {key} pour voyager.',
  // GPS remaining bar ({m} = meters)
  map_gps_label: 'GPS: {m}m',
  map_cancel_gps_title: 'Annuler GPS',
  // Radar container titles (key hints stay raw inside the template)
  map_title_expanded: 'Cliquez pour définir une destination GPS (molette pour zoomer)',
  map_title_radar: 'Agrandir la carte [M] (molette pour zoomer)',
  map_btn_map: 'CARTE [M]',
  map_zoom_in_title: 'Zoom avant (+)',
  map_zoom_out_title: 'Zoom arrière (−)',
  // Sidebar travel link ([T] key hint stays raw)
  map_travel_other: '[T] Voyager vers une autre ville',
  // Fallback header city when no destination is set
  map_world: 'MONDE',
}

export type MapDict = typeof fr

export const en: MapDict = {
  map_poi_desc: '{kind} · {dist} m away',
  map_header_gps: 'GPS MAP — {city}',
  map_quick_dests: '{flag} QUICK DESTINATIONS — {city}',
  map_oneclick_title: '1-CLICK DESTINATIONS:',
  map_pois_loading: 'Loading places around you… or press {key} to travel.',
  map_gps_label: 'GPS: {m}m',
  map_cancel_gps_title: 'Cancel GPS',
  map_title_expanded: 'Click to set a GPS destination (scroll to zoom)',
  map_title_radar: 'Enlarge the map [M] (scroll to zoom)',
  map_btn_map: 'MAP [M]',
  map_zoom_in_title: 'Zoom in (+)',
  map_zoom_out_title: 'Zoom out (−)',
  map_travel_other: '[T] Travel to another city',
  map_world: 'WORLD',
}

export const es: MapDict = {
  map_poi_desc: '{kind} · a {dist} m',
  map_header_gps: 'MAPA GPS — {city}',
  map_quick_dests: '{flag} DESTINOS RÁPIDOS — {city}',
  map_oneclick_title: 'DESTINOS EN 1 CLIC:',
  map_pois_loading: 'Cargando lugares a tu alrededor… o pulsa {key} para viajar.',
  map_gps_label: 'GPS: {m}m',
  map_cancel_gps_title: 'Cancelar GPS',
  map_title_expanded: 'Clic para fijar un destino GPS (rueda para zoom)',
  map_title_radar: 'Ampliar el mapa [M] (rueda para zoom)',
  map_btn_map: 'MAPA [M]',
  map_zoom_in_title: 'Acercar (+)',
  map_zoom_out_title: 'Alejar (−)',
  map_travel_other: '[T] Viajar a otra ciudad',
  map_world: 'MUNDO',
}
