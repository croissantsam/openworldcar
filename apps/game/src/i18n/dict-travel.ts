import type { TranslateFn } from './i18n.js'
import type { WorldDestination } from '../world/destinations.js'

/**
 * Localized curated-destination texts. Keys are `dest_<id>_name` /
 * `dest_<id>_desc` (filled below for every WORLD_DESTINATIONS entry).
 * Custom / search destinations have no keys and fall back to raw fields
 * (silently — their names already come from live Nominatim data).
 */
export function destName(dest: WorldDestination, t: TranslateFn): string {
  const key = `dest_${dest.id}_name`
  const value = t(key, undefined, undefined, { silent: true })
  return value === key ? dest.name : value
}

export function destDesc(dest: WorldDestination, t: TranslateFn): string {
  const key = `dest_${dest.id}_desc`
  const value = t(key, undefined, undefined, { silent: true })
  return value === key ? dest.description : value
}

// Convention: `fr` is the reference (exact current French copy), `en`/`es`
// are typed as `typeof fr` so a missing or extra key fails typecheck.
// NOTE: no `as const` here — with `as const`, `typeof fr` would freeze the
// French values as literal types and every translated value would fail
// typecheck. Without it, values widen to `string` while keys stay exact.

export const fr = {
  travel_title: 'VOYAGE MONDIAL & GÉNÉRATION EN DIRECT',
  travel_subtitle:
    'Explorez les métropoles mondiales et générez de nouveaux chunks OpenStreetMap en temps réel pendant que vous roulez.',
  travel_search_label: '📍 RECHERCHER UNE ADRESSE DANS LE MONDE (OPENSTREETMAP) :',
  travel_search_hint: 'Streaming 100% procédural au fur et à mesure',
  travel_search_placeholder:
    'Saisissez une adresse, rue ou monument (ex: 10 rue de la Paix, Tour Eiffel, Times Square)...',
  // Filter buttons ({count} = number of destinations in the filter)
  travel_filter_all: 'Toutes ({count})',
  travel_filter_france: '🇫🇷 France ({count})',
  travel_filter_europe: '🇪🇺 Europe ({count})',
  travel_filter_intl: '🌐 International ({count})',
  // Free-GPS drawer
  travel_gps_toggle: '🧭 Coordonnées GPS Libres',
  travel_gps_title: "Téléportation & Génération en temps réel n'importe où sur Terre",
  travel_lat_label: 'LATITUDE (-90° à +90°)',
  travel_lon_label: 'LONGITUDE (-180° à +180°)',
  travel_name_label: 'NOM DU LIEU (OPTIONNEL)',
  travel_lat_placeholder: 'Ex: 48.8584',
  travel_lon_placeholder: 'Ex: 2.2945',
  travel_name_placeholder: 'Ex: Mon Quartier, Circuit...',
  travel_submit: 'Téléporter & Rouler',
  travel_lat_error: 'Veuillez saisir une latitude valide entre -90 et 90.',
  travel_lon_error: 'Veuillez saisir une longitude valide entre -180 et 180.',
  // Destination cards
  travel_current_badge: 'ACTUEL',
  travel_current_btn: 'Position actuelle',
  travel_go_btn: 'Voyager ici',
  // Footer (highlight rendered bold, rest follows in the same line)
  travel_footer_highlight: 'Génération continue',
  travel_footer_rest:
    ' : Dès que vous conduisez vers les limites de la carte, les nouveaux chunks sont générés en direct !',
  travel_key_before: 'Touche',
  travel_key_after: 'pour voyager',
  // Curated destinations (fr = exact name/description from destinations.ts)
  dest_paris_etoile_name: "Paris — Place Charles de Gaulle",
  dest_paris_etoile_desc:
    "Le rond-point mythique de l’Arc de Triomphe, au sommet des Champs-Élysées.",
  dest_paris_2e_name: "Paris — 2e Arrondissement",
  dest_paris_2e_desc:
    "Le quartier historique de la Bourse, du Sentier et des passages couverts parisiens.",
  dest_paris_eiffel_name: "Paris — Tour Eiffel & Seine",
  dest_paris_eiffel_desc:
    "Conduisez au pied de la Dame de Fer, traversez le Pont d'Iéna et longez les quais de Seine.",
  dest_paris_champs_elysees_name: "Paris — Champs-Élysées & Étoile",
  dest_paris_champs_elysees_desc:
    "La plus belle avenue du monde avec le rond-point mythique de l'Arc de Triomphe.",
  dest_tokyo_shibuya_name: "Tokyo — Shibuya Crossing",
  dest_tokyo_shibuya_desc:
    "Le carrefour le plus célèbre du monde, entouré d’écrans géants néons et des ruelles de Center-Gai.",
  dest_nyc_times_square_name: "New York — Times Square",
  dest_nyc_times_square_desc:
    "Le cœur de Manhattan, ses gratte-ciels iconiques, Broadway et la 7ème Avenue.",
  dest_london_westminster_name: "London — Westminster & Big Ben",
  dest_london_westminster_desc:
    "Le Parlement britannique, Big Ben, Westminster Bridge et les rives de la Tamise.",
  dest_rome_colosseum_name: "Rome — Colisée & Centre Historique",
  dest_rome_colosseum_desc:
    "La cité éternelle, le Colisée et les avenues de la Rome impériale générés en temps réel.",
  dest_sf_downtown_name: "San Francisco — Downtown & Market St",
  dest_sf_downtown_desc:
    "Les rues pentues californiennes, Market Street et la skyline de la baie.",
  dest_dubai_burj_name: "Dubai — Downtown & Burj Khalifa",
  dest_dubai_burj_desc:
    "La métropole futuriste, le gratte-ciel le plus haut du monde et les boulevards géants.",
  dest_sydney_harbour_name: "Sydney — Opéra & Port",
  dest_sydney_harbour_desc:
    "La baie de Sydney, le célèbre opéra aux voiles blanches et Harbour Bridge.",
  dest_berlin_brandenburg_name: "Berlin — Porte de Brandebourg",
  dest_berlin_brandenburg_desc:
    "Le cœur historique allemand, Unter den Linden et le Tiergarten.",
}

export type TravelDict = typeof fr

export const en: TravelDict = {
  travel_title: 'WORLD TRAVEL & LIVE GENERATION',
  travel_subtitle:
    'Explore world metropolises and generate new OpenStreetMap chunks in real time as you drive.',
  travel_search_label: '📍 SEARCH FOR AN ADDRESS ANYWHERE IN THE WORLD (OPENSTREETMAP):',
  travel_search_hint: '100% procedural streaming as you go',
  travel_search_placeholder:
    'Enter an address, street or landmark (e.g. 10 rue de la Paix, Eiffel Tower, Times Square)...',
  travel_filter_all: 'All ({count})',
  travel_filter_france: '🇫🇷 France ({count})',
  travel_filter_europe: '🇪🇺 Europe ({count})',
  travel_filter_intl: '🌐 International ({count})',
  travel_gps_toggle: '🧭 Free GPS Coordinates',
  travel_gps_title: 'Teleportation & real-time generation anywhere on Earth',
  travel_lat_label: 'LATITUDE (-90° to +90°)',
  travel_lon_label: 'LONGITUDE (-180° to +180°)',
  travel_name_label: 'PLACE NAME (OPTIONAL)',
  travel_lat_placeholder: 'E.g. 48.8584',
  travel_lon_placeholder: 'E.g. 2.2945',
  travel_name_placeholder: 'E.g. My Neighbourhood, Circuit...',
  travel_submit: 'Teleport & Drive',
  travel_lat_error: 'Please enter a valid latitude between -90 and 90.',
  travel_lon_error: 'Please enter a valid longitude between -180 and 180.',
  travel_current_badge: 'CURRENT',
  travel_current_btn: 'Current position',
  travel_go_btn: 'Travel here',
  travel_footer_highlight: 'Continuous generation',
  travel_footer_rest:
    ': as soon as you drive toward the edge of the map, new chunks are generated live!',
  travel_key_before: 'Press',
  travel_key_after: 'to travel',
  dest_paris_etoile_name: "Paris — Place Charles de Gaulle",
  dest_paris_etoile_desc:
    "The legendary Arc de Triomphe roundabout, crowning the Champs-Élysées.",
  dest_paris_2e_name: "Paris — 2nd Arrondissement",
  dest_paris_2e_desc:
    "The historic Bourse, Sentier and covered-passage district of Paris.",
  dest_paris_eiffel_name: "Paris — Eiffel Tower & Seine",
  dest_paris_eiffel_desc:
    "Drive to the foot of the Iron Lady, cross the Pont d'Iéna and cruise along the Seine quays.",
  dest_paris_champs_elysees_name: "Paris — Champs-Élysées & Étoile",
  dest_paris_champs_elysees_desc:
    "The world's most beautiful avenue with the legendary Arc de Triomphe roundabout.",
  dest_tokyo_shibuya_name: "Tokyo — Shibuya Crossing",
  dest_tokyo_shibuya_desc:
    "The world's most famous crossing, surrounded by giant neon screens and the Center-Gai back streets.",
  dest_nyc_times_square_name: "New York — Times Square",
  dest_nyc_times_square_desc:
    "The heart of Manhattan, its iconic skyscrapers, Broadway and 7th Avenue.",
  dest_london_westminster_name: "London — Westminster & Big Ben",
  dest_london_westminster_desc:
    "The British Parliament, Big Ben, Westminster Bridge and the banks of the Thames.",
  dest_rome_colosseum_name: "Rome — Colosseum & Historic Centre",
  dest_rome_colosseum_desc:
    "The Eternal City, the Colosseum and the avenues of imperial Rome generated in real time.",
  dest_sf_downtown_name: "San Francisco — Downtown & Market St",
  dest_sf_downtown_desc:
    "California's steep streets, Market Street and the Bay skyline.",
  dest_dubai_burj_name: "Dubai — Downtown & Burj Khalifa",
  dest_dubai_burj_desc:
    "The futuristic metropolis, the world's tallest skyscraper and giant boulevards.",
  dest_sydney_harbour_name: "Sydney — Opera House & Harbour",
  dest_sydney_harbour_desc:
    "Sydney Bay, the famous white-sailed Opera House and the Harbour Bridge.",
  dest_berlin_brandenburg_name: "Berlin — Brandenburg Gate",
  dest_berlin_brandenburg_desc:
    "Germany's historic heart, Unter den Linden and the Tiergarten.",
}

export const es: TravelDict = {
  travel_title: 'VIAJE MUNDIAL Y GENERACIÓN EN DIRECTO',
  travel_subtitle:
    'Explore las metrópolis del mundo y genere nuevos chunks de OpenStreetMap en tiempo real mientras conduce.',
  travel_search_label: '📍 BUSCAR UNA DIRECCIÓN EN CUALQUIER LUGAR DEL MUNDO (OPENSTREETMAP):',
  travel_search_hint: 'Streaming 100% procedural sobre la marcha',
  travel_search_placeholder:
    'Escriba una dirección, calle o monumento (p. ej., 10 rue de la Paix, Torre Eiffel, Times Square)...',
  travel_filter_all: 'Todas ({count})',
  travel_filter_france: '🇫🇷 Francia ({count})',
  travel_filter_europe: '🇪🇺 Europa ({count})',
  travel_filter_intl: '🌐 Internacional ({count})',
  travel_gps_toggle: '🧭 Coordenadas GPS libres',
  travel_gps_title: 'Teletransporte y generación en tiempo real en cualquier lugar de la Tierra',
  travel_lat_label: 'LATITUD (-90° a +90°)',
  travel_lon_label: 'LONGITUD (-180° a +180°)',
  travel_name_label: 'NOMBRE DEL LUGAR (OPCIONAL)',
  travel_lat_placeholder: 'Ej.: 48.8584',
  travel_lon_placeholder: 'Ej.: 2.2945',
  travel_name_placeholder: 'Ej.: Mi Barrio, Circuito...',
  travel_submit: 'Teletransportar y conducir',
  travel_lat_error: 'Introduzca una latitud válida entre -90 y 90.',
  travel_lon_error: 'Introduzca una longitud válida entre -180 y 180.',
  travel_current_badge: 'ACTUAL',
  travel_current_btn: 'Posición actual',
  travel_go_btn: 'Viajar aquí',
  travel_footer_highlight: 'Generación continua',
  travel_footer_rest:
    ': en cuanto conduzca hacia los límites del mapa, ¡los nuevos chunks se generan en directo!',
  travel_key_before: 'Pulse',
  travel_key_after: 'para viajar',
  dest_paris_etoile_name: "París — Place Charles de Gaulle",
  dest_paris_etoile_desc:
    "La mítica rotonda del Arco del Triunfo, en lo alto de los Campos Elíseos.",
  dest_paris_2e_name: "París — Distrito 2",
  dest_paris_2e_desc:
    "El barrio histórico de la Bolsa, del Sentier y de los pasajes cubiertos parisinos.",
  dest_paris_eiffel_name: "París — Torre Eiffel y Sena",
  dest_paris_eiffel_desc:
    "Conduzca al pie de la Dama de Hierro, cruce el Pont d'Iéna y recorra los muelles del Sena.",
  dest_paris_champs_elysees_name: "París — Campos Elíseos y Estrella",
  dest_paris_champs_elysees_desc:
    "La avenida más bella del mundo con la mítica rotonda del Arco del Triunfo.",
  dest_tokyo_shibuya_name: "Tokio — Cruce de Shibuya",
  dest_tokyo_shibuya_desc:
    "El cruce más famoso del mundo, rodeado de pantallas gigantes de neón y de las callejuelas de Center-Gai.",
  dest_nyc_times_square_name: "Nueva York — Times Square",
  dest_nyc_times_square_desc:
    "El corazón de Manhattan, sus rascacielos icónicos, Broadway y la 7.ª Avenida.",
  dest_london_westminster_name: "Londres — Westminster y Big Ben",
  dest_london_westminster_desc:
    "El Parlamento británico, el Big Ben, el puente de Westminster y las orillas del Támesis.",
  dest_rome_colosseum_name: "Roma — Coliseo y Centro Histórico",
  dest_rome_colosseum_desc:
    "La Ciudad Eterna, el Coliseo y las avenidas de la Roma imperial generados en tiempo real.",
  dest_sf_downtown_name: "San Francisco — Centro y Market St",
  dest_sf_downtown_desc:
    "Las empinadas calles californianas, Market Street y el skyline de la bahía.",
  dest_dubai_burj_name: "Dubái — Centro y Burj Khalifa",
  dest_dubai_burj_desc:
    "La metrópolis futurista, el rascacielos más alto del mundo y los bulevares gigantes.",
  dest_sydney_harbour_name: "Sídney — Ópera y Puerto",
  dest_sydney_harbour_desc:
    "La bahía de Sídney, la famosa Ópera de las velas blancas y el Harbour Bridge.",
  dest_berlin_brandenburg_name: "Berlín — Puerta de Brandeburgo",
  dest_berlin_brandenburg_desc:
    "El corazón histórico alemán, Unter den Linden y el Tiergarten.",
}
