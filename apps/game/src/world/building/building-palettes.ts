/**
 * Building palettes & architectural style definitions.
 * All colors and style mappings for OSM building types.
 */

export type ArchitecturalStyle =
  | 'haussmann'
  | 'glass_curtain'
  | 'brick'
  | 'commercial_boutique'
  | 'civic_classical'
  | 'industrial'
  | 'residential_house'
  | 'religious'
  | 'synagogue'
  | 'academic_school'
  | 'academic_university'
  | 'agricultural'
  | 'garage'
  | 'greenhouse'
  | 'hotel'
  | 'hospital'
  | 'townhall'
  | 'ruins'
  | 'render'

export interface Palette {
  facade: number
  frame: number
  roof: number
  style: ArchitecturalStyle
  isGlass: boolean
}

/**
 * Global neutral pool for untyped / residential buildings (building=yes|apartments|residential…).
 * Deliberately NOT keyed on region: every entry is plausible anywhere in the world, and the
 * pick is hash-stable per building id. Real facade colour/material tags override it.
 */
export const PALETTES: Palette[] = [
  { facade: 0xd6cebe, frame: 0xbaa490, roof: 0x48525e, style: 'haussmann', isGlass: false }, // limestone cream
  { facade: 0xe0d6c4, frame: 0xc4b8a4, roof: 0x4e5864, style: 'haussmann', isGlass: false }, // pale stone
  { facade: 0xcfc1a8, frame: 0xb0a088, roof: 0x5a4a3c, style: 'render',    isGlass: false }, // warm beige render
  { facade: 0xd8d8d4, frame: 0xb4b4b0, roof: 0x50545a, style: 'render',    isGlass: false }, // light grey render
  { facade: 0xe6e2da, frame: 0xc0bcb4, roof: 0x5c5650, style: 'render',    isGlass: false }, // white render
  { facade: 0x9a5a44, frame: 0x74402e, roof: 0x3a2e28, style: 'brick',     isGlass: false }, // red brick
  { facade: 0xb8845a, frame: 0x8e6440, roof: 0x4a3828, style: 'brick',     isGlass: false }, // buff brick
  { facade: 0xd9c08a, frame: 0xb89c68, roof: 0x6a4e3c, style: 'render',    isGlass: false }, // pale ochre
]

/** The only glass facade: office/commercial above 30 m or building:material=glass. */
export const GLASS_PALETTE: Palette = { facade: 0x243545, frame: 0x36485b, roof: 0x182430, style: 'glass_curtain', isGlass: true }

// Type-specific palette overrides
export const TYPE_PALETTES: Partial<Record<string, Palette>> = {
  // Residential
  house:              { facade: 0x8b5e3c, frame: 0x6a4530, roof: 0x6a3020, style: 'residential_house', isGlass: false },
  detached:           { facade: 0x9e7255, frame: 0x7a5840, roof: 0x624030, style: 'residential_house', isGlass: false },
  semidetached_house: { facade: 0x8b6545, frame: 0x6e5036, roof: 0x5a3825, style: 'residential_house', isGlass: false },
  terrace:            { facade: 0x7a5a3a, frame: 0x5e4428, roof: 0x4a3020, style: 'brick', isGlass: false },
  bungalow:           { facade: 0xa07850, frame: 0x806040, roof: 0x654832, style: 'residential_house', isGlass: false },
  hut:                { facade: 0x6a4e32, frame: 0x4e3820, roof: 0x382c18, style: 'residential_house', isGlass: false },
  cabin:              { facade: 0x6a4e32, frame: 0x4e3820, roof: 0x382c18, style: 'residential_house', isGlass: false },
  shed:               { facade: 0x756858, frame: 0x554a3a, roof: 0x443a2c, style: 'garage', isGlass: false },
  kiosk:              { facade: 0x2e4258, frame: 0x1e2e42, roof: 0x182430, style: 'commercial_boutique', isGlass: false },

  // Commercial / Retail / Offices
  office:             { facade: 0xc9c5bd, frame: 0x8a8680, roof: 0x3a3e46, style: 'render', isGlass: false },
  commercial:         { facade: 0xbdb7ac, frame: 0x7e7872, roof: 0x363a42, style: 'commercial_boutique', isGlass: false },
  retail:             { facade: 0xd2cbbe, frame: 0x485260, roof: 0x343a44, style: 'commercial_boutique', isGlass: false },
  supermarket:        { facade: 0x354b6e, frame: 0x223652, roof: 0x1a2434, style: 'commercial_boutique', isGlass: false },
  hotel:              { facade: 0xd6ccba, frame: 0xb8a892, roof: 0x3e4854, style: 'hotel', isGlass: false },
  motel:              { facade: 0xd8c8b0, frame: 0x9e8870, roof: 0x48423c, style: 'hotel', isGlass: false },
  hostel:             { facade: 0xd0c4b2, frame: 0xa49280, roof: 0x40444c, style: 'hotel', isGlass: false },
  guest_house:        { facade: 0xd4c8b6, frame: 0xaa9884, roof: 0x44464e, style: 'hotel', isGlass: false },
  restaurant:         { facade: 0x2c3540, frame: 0x384552, roof: 0x222a32, style: 'commercial_boutique', isGlass: false },
  bank:               { facade: 0xdedcd4, frame: 0xaaa69a, roof: 0x3e4248, style: 'civic_classical', isGlass: false },

  // Industrial / Logistics / Garages
  warehouse:          { facade: 0x7a7e88, frame: 0x5a5e68, roof: 0x3a3e48, style: 'industrial', isGlass: false },
  industrial:         { facade: 0x6e7280, frame: 0x525660, roof: 0x363a44, style: 'industrial', isGlass: false },
  factory:            { facade: 0x686c78, frame: 0x4c505c, roof: 0x323640, style: 'industrial', isGlass: false },
  hangar:             { facade: 0x848a94, frame: 0x626872, roof: 0x3c424a, style: 'industrial', isGlass: false },
  garage:             { facade: 0x888888, frame: 0x686868, roof: 0x505050, style: 'garage', isGlass: false },
  garages:            { facade: 0x808080, frame: 0x606060, roof: 0x484848, style: 'garage', isGlass: false },
  carport:            { facade: 0x96989c, frame: 0x52565c, roof: 0x383a40, style: 'industrial', isGlass: false },
  parking:            { facade: 0x8e8e8e, frame: 0x646464, roof: 0x4c4c4c, style: 'industrial', isGlass: false },
  service:            { facade: 0x828488, frame: 0x626468, roof: 0x44464a, style: 'industrial', isGlass: false },

  // Religious / Monuments
  church:             { facade: 0xc8bfa6, frame: 0xa8a08a, roof: 0x544e42, style: 'religious', isGlass: false },
  cathedral:          { facade: 0xc0b898, frame: 0xa09880, roof: 0x4a4438, style: 'religious', isGlass: false },
  chapel:             { facade: 0xc5bc9e, frame: 0xa29a84, roof: 0x504a3e, style: 'religious', isGlass: false },
  mosque:             { facade: 0xd0c8b0, frame: 0xb0a890, roof: 0x3e5e48, style: 'religious', isGlass: false },
  temple:             { facade: 0xd8c8a8, frame: 0xb8a888, roof: 0x784830, style: 'religious', isGlass: false },
  synagogue:          { facade: 0xd6caa6, frame: 0xb4a482, roof: 0x385450, style: 'synagogue', isGlass: false },
  monument:           { facade: 0xdad2c4, frame: 0xb8b0a2, roof: 0x8c8476, style: 'civic_classical', isGlass: false },
  castle:             { facade: 0x8e8880, frame: 0x6e6860, roof: 0x444240, style: 'civic_classical', isGlass: false },
  manor:              { facade: 0xbaa490, frame: 0x948270, roof: 0x544034, style: 'haussmann', isGlass: false },
  ruins:              { facade: 0x7c7872, frame: 0x5e5a56, roof: 0x484440, style: 'ruins', isGlass: false },

  // Public / Civic / Health / Education
  government:         { facade: 0xc6bea8, frame: 0xa49c86, roof: 0x4c4842, style: 'civic_classical', isGlass: false },
  civic:              { facade: 0xc0b8a4, frame: 0x9e9682, roof: 0x46423c, style: 'civic_classical', isGlass: false },
  public:             { facade: 0xb8b09c, frame: 0x98907c, roof: 0x403c36, style: 'civic_classical', isGlass: false },
  townhall:           { facade: 0xdcd4be, frame: 0xb4a488, roof: 0x3e4a56, style: 'townhall', isGlass: false },
  courthouse:         { facade: 0xd0c6b0, frame: 0xa8a088, roof: 0x484c54, style: 'civic_classical', isGlass: false },
  hospital:           { facade: 0xe8eef2, frame: 0x889caa, roof: 0x3a4652, style: 'hospital', isGlass: false },
  clinic:             { facade: 0xe2e9ee, frame: 0x8296a4, roof: 0x36424e, style: 'hospital', isGlass: false },
  school:             { facade: 0xb44a38, frame: 0xdecbb0, roof: 0x48423e, style: 'academic_school', isGlass: false },
  university:         { facade: 0xd2c6ae, frame: 0xa89c84, roof: 0x485660, style: 'academic_university', isGlass: false },
  kindergarten:       { facade: 0xda8e44, frame: 0xf0dca8, roof: 0x6e4428, style: 'academic_school', isGlass: false },
  college:            { facade: 0xba5242, frame: 0xe0cca6, roof: 0x443e3c, style: 'academic_school', isGlass: false },
  fire_station:       { facade: 0x823228, frame: 0xa82018, roof: 0x381814, style: 'industrial', isGlass: false },
  police:             { facade: 0x32445a, frame: 0x223244, roof: 0x1a2636, style: 'civic_classical', isGlass: false },
  train_station:      { facade: 0xb4aa8e, frame: 0x948a6e, roof: 0x444240, style: 'civic_classical', isGlass: false },
  stadium:            { facade: 0x484e5a, frame: 0x383c48, roof: 0x282c38, style: 'industrial', isGlass: false },
  sports_hall:        { facade: 0x5a6478, frame: 0x444c5e, roof: 0x2c3444, style: 'industrial', isGlass: false },

  // Agricultural
  farm:               { facade: 0x8c5e38, frame: 0x6e4624, roof: 0x4c2e1a, style: 'agricultural', isGlass: false },
  farm_auxiliary:     { facade: 0x7a5432, frame: 0x5e3e20, roof: 0x3e2614, style: 'agricultural', isGlass: false },
  barn:               { facade: 0x8b3a2b, frame: 0x642418, roof: 0x4a2216, style: 'agricultural', isGlass: false },
  stable:             { facade: 0x6e4828, frame: 0x54341a, roof: 0x362010, style: 'agricultural', isGlass: false },
  greenhouse:         { facade: 0xa8c2bc, frame: 0x344642, roof: 0x2c3c38, style: 'greenhouse', isGlass: true },

  // Cultural / Civic additions
  library:            { facade: 0xc0b8a4, frame: 0x9e9682, roof: 0x46423c, style: 'civic_classical', isGlass: false },
  museum:             { facade: 0xb8b09c, frame: 0x98907c, roof: 0x403c36, style: 'civic_classical', isGlass: false },
  theatre:            { facade: 0x6e2c38, frame: 0x4e1c26, roof: 0x2e181e, style: 'civic_classical', isGlass: false },
  cinema:             { facade: 0x3e3240, frame: 0x2a222e, roof: 0x1e1820, style: 'commercial_boutique', isGlass: false },
  post_office:        { facade: 0xd8d4cc, frame: 0xb0aa9c, roof: 0x3a3c42, style: 'commercial_boutique', isGlass: false },
  apartments:         { facade: 0xd6cebe, frame: 0xbaa490, roof: 0x48525e, style: 'haussmann', isGlass: false },
  residential:        { facade: 0xc8bea8, frame: 0xa49c86, roof: 0x4c4842, style: 'haussmann', isGlass: false },

  // Fuel / Charging
  fuel:               { facade: 0xffffff, frame: 0xcccccc, roof: 0xff0000, style: 'commercial_boutique', isGlass: false },
  charging_station:   { facade: 0x00aaff, frame: 0x0088cc, roof: 0x004466, style: 'commercial_boutique', isGlass: true },

  // Canopy
  roof:               { facade: 0x909296, frame: 0x606268, roof: 0x3c3e44, style: 'industrial', isGlass: false },
}

// Material color overrides based on building:material
export const MATERIAL_COLORS: Record<string, number> = {
  brick:            0x7c382b,
  stone:            0xc8beae,
  limestone:        0xd8d0be,
  sandstone:        0xd4b886,
  concrete:         0x949290,
  glass:            0x243545,
  wood:             0x8b6545,
  plaster:          0xd8d4cc,
  masonry:          0xa8a090,
  metal:            0x6e747c,
  steel:            0x5c626a,
  corrugated_iron:  0x787e86,
  timber_framing:   0x7d5a3c,
  marble:           0xe8e6e0,
  granite:          0x848286,
}

// Roof material color overrides based on roof:material
export const ROOF_MATERIAL_COLORS: Record<string, number> = {
  roof_tiles: 0xb24d35,
  slate:      0x343942,
  zinc:       0x5a6674,
  copper:     0x4fa37b,
  tar_paper:  0x292b2e,
  concrete:   0x76787c,
  glass:      0x365874,
  thatch:     0x8a7248,
  metal:      0x6e747c,
}