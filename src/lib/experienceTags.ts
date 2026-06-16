import { t } from '../i18n'

/**
 * Stable, persisted IDs for the wizard's experience tags. `Destination.tripTypes`
 * stores these IDs (plus ROAD_TRIP_TAG_ID) — never the translated label text — so
 * the same destination renders correctly regardless of the viewer's language.
 */
interface ExperienceTagDef {
  id: string
  en: string
  fr: string
}

export const ROAD_TRIP_TAG_ID = 'roadtrip'
const ROAD_TRIP_LABEL_EN = '🚗 Road trip'
const ROAD_TRIP_LABEL_FR = '🚗 Road trip'

const EXPERIENCE_TAG_DEFS: ExperienceTagDef[] = [
  { id: 'food',        en: '🍜 Food trip',           fr: '🍜 Food trip' },
  { id: 'patrimoine',  en: '🏛️ Striking heritage',    fr: '🏛️ Patrimoine marquant' },
  { id: 'flanerie',    en: '🏘️ City to wander',       fr: '🏘️ Ville à flâner' },
  { id: 'beau',        en: '✨ Beautiful everywhere',  fr: '✨ Beau partout' },
  { id: 'paysages',    en: '⛰️ Big landscapes',       fr: '⛰️ Grands paysages' },
  { id: 'plage',       en: '🏖️ Beach & swimming',     fr: '🏖️ Plage & baignade' },
  { id: 'nightlife',   en: '🌙 Nightlife',            fr: '🌙 Nightlife' },
  { id: 'ambiance',    en: '🎭 Local vibe',           fr: '🎭 Ambiance locale' },
  { id: 'facile',      en: '🧘 Easygoing',            fr: '🧘 Facile à vivre' },
  { id: 'pas-cher',    en: '💸 Cheap',                fr: '💸 Pas cher' },
  { id: 'trop-cher',   en: '💰 Pricey',               fr: '💰 Trop cher' },
  { id: 'transports',  en: '🚇 Rough transit',        fr: '🚇 Transports galère' },
  { id: 'touristique', en: '📍 Too touristy',         fr: '📍 Trop touristique' },
  { id: 'pieges',      en: '🪤 Tourist traps',        fr: '🪤 Pièges à touristes' },
  { id: 'craignos',    en: '⚠️ Sketchy',              fr: '⚠️ Craignos' },
  { id: 'surprise',    en: '😮 Pleasant surprise',    fr: '😮 Belle surprise' },
  { id: 'surcote',     en: '📉 Overrated',            fr: '📉 Surcoté' },
]

/** Tags for the wizard's chip picker: stable `id` to store, translated `label` to show. */
export const EXPERIENCE_TAGS: { id: string; label: string }[] =
  EXPERIENCE_TAG_DEFS.map(def => ({ id: def.id, label: t(def.en, def.fr) }))

export const ROAD_TRIP_LABEL = t(ROAD_TRIP_LABEL_EN, ROAD_TRIP_LABEL_FR)

const LABEL_TO_ID = new Map<string, string>()
for (const def of EXPERIENCE_TAG_DEFS) {
  LABEL_TO_ID.set(def.en, def.id)
  LABEL_TO_ID.set(def.fr, def.id)
}
LABEL_TO_ID.set(ROAD_TRIP_LABEL_EN, ROAD_TRIP_TAG_ID)
LABEL_TO_ID.set(ROAD_TRIP_LABEL_FR, ROAD_TRIP_TAG_ID)

const VALID_IDS = new Set<string>([...EXPERIENCE_TAG_DEFS.map(def => def.id), ROAD_TRIP_TAG_ID])

/** Resolves a stored `tripTypes` entry — a current ID or a pre-migration label string — to its ID. */
function normalizeExperienceTagValue(value: string): string {
  if (VALID_IDS.has(value)) return value
  return LABEL_TO_ID.get(value) ?? value
}

/**
 * Migrates a `tripTypes` array that may still hold old French label strings
 * (saved before tags became ID-based) into the current ID-based format.
 * Unrecognized entries pass through unchanged so unknown legacy data isn't dropped.
 */
export function normalizeStoredTripTypes(tripTypes: string[] | undefined): string[] | undefined {
  if (!tripTypes?.length) return tripTypes
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tripTypes) {
    const id = normalizeExperienceTagValue(raw)
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/** Resolves a stored tripTypes ID to its translated display label. Falls back to the raw value for unknown/legacy entries. */
export function getExperienceTagLabel(id: string): string {
  if (id === ROAD_TRIP_TAG_ID) return ROAD_TRIP_LABEL
  const def = EXPERIENCE_TAG_DEFS.find(d => d.id === id)
  return def ? t(def.en, def.fr) : id
}
