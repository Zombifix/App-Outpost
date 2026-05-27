import type { Destination, Tier, Intent } from './types'
import { COUNTRY_TO_CONTINENT, type Continent } from './data'

/**
 * Limite dynamique de coups de cœur : +1 tous les 6 destinations à partir de 14.
 * Exemples : ≤13 → 2 / 14 → 3 / 20 → 4 / 26 → 5 / 32 → 6
 */
export function getMaxCoupDeCoeur(totalDestinations: number): number {
  return Math.max(2, Math.floor((totalDestinations + 4) / 6))
}

export type WeightedRatingKey = 'food' | 'night' | 'culture' | 'nature' | 'value'
export type NeutralRatingKey = 'ease'
export type Ratings = Record<WeightedRatingKey, number | null> & Partial<Record<NeutralRatingKey, number | null>>
export type Weights = Record<WeightedRatingKey, number>

// Source unique des poids — importée par utils + AddDestinationWizard.
export const INTENT_WEIGHTS: Record<Intent, Weights> = {
  tourisme:   { culture: 1.5, nature: 1.2, food: 1.0, night: 1.0, value: 1.0 },
  sorties:    { night: 1.8, food: 1.2, culture: 1.0, nature: 1.0, value: 1.0 },
  gastro:     { food: 2.0, night: 1.0, culture: 1.0, nature: 1.0, value: 1.0 },
  nature:     { nature: 2.0, value: 1.1, food: 1.0, night: 1.0, culture: 1.0 },
  travail:    { value: 1.5, food: 1.1, culture: 1.0, night: 1.0, nature: 1.0 },
  'city-trip':{ culture: 1.0, food: 1.0, night: 1.0, nature: 1.0, value: 1.0 },
}

const WEIGHTED_RATING_KEYS: WeightedRatingKey[] = ['food', 'night', 'culture', 'nature', 'value']
const NEUTRAL_RATING_KEYS: NeutralRatingKey[] = ['ease']
const PRIMARY_RATING_BY_INTENT: Record<Intent, WeightedRatingKey> = {
  tourisme: 'culture',
  sorties: 'night',
  gastro: 'food',
  nature: 'nature',
  travail: 'value',
  'city-trip': 'culture',
}

function clampScore(score: number): number {
  return Math.min(5, Math.max(1, score))
}

function getWeakSpotCap(ratings: Ratings, intent: Intent, activeWeightedCount: number): number {
  let cap = 5
  const primaryKey = PRIMARY_RATING_BY_INTENT[intent]
  const importantKeys = new Set<WeightedRatingKey>([primaryKey, 'value', 'nature'])

  for (const key of WEIGHTED_RATING_KEYS) {
    const value = ratings[key]
    if (value === null || value === undefined) continue

    if (value <= 1) cap = Math.min(cap, importantKeys.has(key) ? 3.0 : 3.2)
    else if (value <= 2) cap = Math.min(cap, importantKeys.has(key) ? 3.9 : 4.2)
    else if (value <= 3 && importantKeys.has(key)) cap = Math.min(cap, 4.4)
  }

  if (activeWeightedCount < 3) cap = Math.min(cap, 3.8)
  else if (activeWeightedCount < 4) cap = Math.min(cap, 4.2)

  return cap
}

export function calculateScore(
  ratings: Ratings,
  intent: Intent,
  options?: { vibeBoost?: number | null; retourBonus?: number },
): number {
  const w = INTENT_WEIGHTS[intent]
  const activeWeighted = WEIGHTED_RATING_KEYS
    .map(key => [key, ratings[key]] as const)
    .filter((entry): entry is readonly [WeightedRatingKey, number] => (
      entry[1] !== null && entry[1] !== undefined && Number.isFinite(entry[1])
    ))
  const totalWeight = activeWeighted.reduce((sum, [key]) => sum + w[key], 0)
  const rawWeighted = totalWeight === 0
    ? 3
    : activeWeighted.reduce((sum, [key, value]) => sum + value * w[key], 0) / totalWeight
  const confidence = Math.min(1, activeWeighted.length / 4)
  const weighted = 3 + (rawWeighted - 3) * confidence * 1.15
  const neutralAxes = NEUTRAL_RATING_KEYS
    .map(key => ratings[key])
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  const combined = neutralAxes.length === 0
    ? weighted
    : (weighted * totalWeight + neutralAxes.reduce((sum, value) => sum + value, 0)) / (totalWeight + neutralAxes.length)
  const withVibe = options && 'vibeBoost' in options
    ? combined + ((options.vibeBoost ?? 3) - 3) * 0.12
    : combined
  const capped = Math.min(withVibe + (options?.retourBonus ?? 0), getWeakSpotCap(ratings, intent, activeWeighted.length))
  return clampScore(capped)
}

export function scoreToTier(score: number): Tier {
  if (score >= 4.3) return 'S'
  if (score >= 3.7) return 'A'
  if (score >= 3.0) return 'B'
  if (score >= 2.2) return 'C'
  return 'D'
}

export function calculateTier(ratings: Ratings, intent: Intent): Tier {
  return scoreToTier(calculateScore(ratings, intent))
}

export function getDestinationScore(destination: Destination): number {
  const base = calculateScore({
    food: destination.food,
    night: destination.night,
    culture: destination.culture,
    nature: destination.nature,
    value: destination.value,
    ease: destination.ease,
  }, destination.intent, {
    vibeBoost: destination.vibeBoost,
    retourBonus: destination.retourBonus,
  })
  const withCoupBonus = base + (destination.coupDeCoeur ? 0.3 : 0)
  return clampScore(withCoupBonus)
}

export function getDestinationTier(destination: Destination): Tier {
  return scoreToTier(getDestinationScore(destination))
}

export function withRecalculatedScore(destination: Destination): Destination {
  const score = getDestinationScore(destination)
  return {
    ...destination,
    score: Math.round(score * 10) / 10,
    tier: scoreToTier(score),
  }
}

// ─── Profil voyageur (Fiche signalétique) ─────────────────────────────────────
// Stats descriptives, sans IA, avec seuils explicites pour ne rien forcer.

export type ProfileConfidence = 'empty' | 'light' | 'mid' | 'full'
export type ContinentBucket = Continent | 'Autre'

export interface TravelerSignature {
  key: 'geo' | 'year' | 'coeur' | 'format' | 'budget' | 'notes' | 'companion' | 'intent'
  icon: string
  label: string
  detail?: string
}

export interface ContinentShare {
  continent: ContinentBucket
  count: number
  pct: number
}

export interface TravelerProfile {
  total: number              // tous les pins (livedThere inclus)
  travelCount: number        // hors livedThere
  countries: number
  coupDeCoeurCount: number
  confidence: ProfileConfidence
  /** Verdict auto-généré, null si données insuffisantes */
  archetype: string | null
  signatures: TravelerSignature[]
  continents: ContinentShare[]
}

function continentOf(country: string): ContinentBucket {
  return COUNTRY_TO_CONTINENT[country] ?? 'Autre'
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function topEntry<K extends string>(counts: Record<K, number>): { key: K, count: number, total: number, second: number } {
  let topKey: K | null = null
  let topCount = 0
  let secondCount = 0
  let total = 0
  for (const k of Object.keys(counts) as K[]) {
    const c = counts[k]
    total += c
    if (c > topCount) { secondCount = topCount; topCount = c; topKey = k }
    else if (c > secondCount) { secondCount = c }
  }
  return { key: (topKey ?? ('' as K)), count: topCount, total, second: secondCount }
}

export function computeTravelerProfile(destinations: Destination[]): TravelerProfile {
  const total = destinations.length
  const travels = destinations.filter(d => !d.livedThere)
  const travelCount = travels.length
  const countries = new Set(destinations.map(d => d.country).filter(Boolean)).size
  const coupDeCoeurCount = travels.filter(d => d.coupDeCoeur).length

  // Continent share = pays uniques par continent / total pays uniques
  const continentCountrySets: Record<ContinentBucket, Set<string>> = {
    Europe: new Set(), Asie: new Set(), Ameriques: new Set(), Afrique: new Set(), Oceanie: new Set(), Autre: new Set(),
  }
  for (const d of destinations) {
    if (d.country) continentCountrySets[continentOf(d.country)].add(d.country)
  }
  const totalCountries = countries || 1
  const continents: ContinentShare[] = (Object.keys(continentCountrySets) as ContinentBucket[])
    .map(c => ({ continent: c, count: continentCountrySets[c].size, pct: (continentCountrySets[c].size / totalCountries) * 100 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  let confidence: ProfileConfidence = 'empty'
  if (total > 0 && total < 3) confidence = 'light'
  else if (total >= 3 && total < 8) confidence = 'mid'
  else if (total >= 8) confidence = 'full'

  // ── Données brutes ───────────────────────────────────────────────────────────

  // Pays (voyages uniquement, hors livedThere)
  const countryCounts: Record<string, number> = {}
  for (const d of travels) if (d.country) countryCounts[d.country] = (countryCounts[d.country] ?? 0) + 1
  const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])
  const topCountryName = sortedCountries[0]?.[0] ?? null
  const topCountryN = sortedCountries[0]?.[1] ?? 0
  const topCountryPct = travelCount > 0 ? (topCountryN / travelCount) * 100 : 0

  // Intent (brut, non pondéré)
  const intentCounts: Record<Intent, number> = { 'city-trip': 0, tourisme: 0, sorties: 0, gastro: 0, nature: 0, travail: 0 }
  for (const d of travels) intentCounts[d.intent]++
  const intentSorted = (Object.keys(intentCounts) as Intent[]).map(k => ({ k, n: intentCounts[k] })).sort((a, b) => b.n - a.n)
  const topIntent = intentSorted[0]
  const topIntentPct = travelCount > 0 && topIntent ? (topIntent.n / travelCount) * 100 : 0
  const hasStrongIntent = topIntentPct >= 38 && travelCount >= 3

  // Durée (médiane)
  const dayValues = travels.map(d => d.tripDays).filter((v): v is number => typeof v === 'number' && v > 0)
  const medDays = dayValues.length >= 3 ? median(dayValues) : null

  // Budget (médiane par jour)
  const perDayValues = travels
    .map(d => (d.personalBudget && d.tripDays && d.tripDays > 0 ? d.personalBudget / d.tripDays : null))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  const medBudget = perDayValues.length >= 3 ? median(perDayValues) : null

  // Notes (moyenne)
  const scoreValues = travels.map(d => d.score ?? getDestinationScore(d)).filter(v => Number.isFinite(v) && v > 0)
  const avgScore = scoreValues.length >= 3 ? scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length : null

  // Coups de cœur par pays (archétype)
  const coeurByCountry: Record<string, number> = {}
  for (const d of travels) if (d.coupDeCoeur && d.country) coeurByCountry[d.country] = (coeurByCountry[d.country] ?? 0) + 1
  const topCoeurEntry = Object.entries(coeurByCountry).sort((a, b) => b[1] - a[1])[0] ?? null
  const topCoeurMatchesTop = topCoeurEntry?.[0] === topCountryName
  const topCoeurPct = topCoeurEntry && coupDeCoeurCount > 0 ? (topCoeurEntry[1] / coupDeCoeurCount) * 100 : 0

  // Notes moyennes dans le pays dominant (archétype 4)
  const scoresInTopCountry: number[] = []
  if (topCountryName) {
    for (const d of travels) {
      if (d.country === topCountryName) {
        const s = d.score ?? getDestinationScore(d)
        if (Number.isFinite(s) && s > 0) scoresInTopCountry.push(s)
      }
    }
  }
  const avgScoreTopCountry = scoresInTopCountry.length >= 2
    ? scoresInTopCountry.reduce((s, v) => s + v, 0) / scoresInTopCountry.length
    : null

  // Continent dominant
  const dominantContinent = continents[0] ?? null
  const dominantContinentPct = dominantContinent?.pct ?? 0

  // Companions
  const compCounts: Record<string, number> = {}
  for (const d of travels) if (d.companions) compCounts[d.companions] = (compCounts[d.companions] ?? 0) + 1
  const compSorted = Object.entries(compCounts).sort((a, b) => b[1] - a[1])
  const topComp = compSorted[0] ?? null
  const topCompPct = topComp && travelCount > 0 ? (topComp[1] / travelCount) * 100 : 0
  const COMP_SUFFIX: Record<string, string> = {
    solo: ' · en solo', couple: ' · à deux', amis: ' · entre amis', famille: ' · en famille',
  }
  const formatCompSuffix = topComp && topCompPct >= 50 ? (COMP_SUFFIX[topComp[0]] ?? '') : ''

  // ── Archétype (37 conditions, première qui matche gagne) ─────────────────────
  let archetype: string | null = null

  if (confidence !== 'empty' && confidence !== 'light') {

    // 1. Pays ultra dominant
    if (topCountryName && (topCountryN >= 5 || topCountryPct >= 50)) {
      archetype = `${topCountryName} commence à le reconnaître`
    }
    // 3. Pays + coups de cœur (plus spécifique que 2 → testé avant)
    else if (topCountryName && topCountryN >= 3 && coupDeCoeurCount >= 2 && topCoeurMatchesTop && topCoeurPct >= 50) {
      archetype = `A clairement un faible pour ${topCountryName}`
    }
    // 4. Pays + notes très hautes (plus spécifique que 2 → testé avant)
    else if (topCountryName && topCountryN >= 3 && avgScoreTopCountry !== null && avgScoreTopCountry >= 4.2) {
      archetype = `A arrêté de faire semblant d'être objectif`
    }
    // 2. Pays récurrent
    else if (topCountryName && topCountryN >= 3) {
      archetype = `Retourne souvent en ${topCountryName}, "par hasard"`
    }
    // 5. City-trip + courts séjours
    else if (hasStrongIntent && topIntent.k === 'city-trip' && medDays !== null && medDays <= 4) {
      archetype = `Part 48 h et appelle ça une immersion`
    }
    // 6. City-trip + Europe dominante
    else if (hasStrongIntent && topIntent.k === 'city-trip' && dominantContinent?.continent === 'Europe' && dominantContinentPct >= 50) {
      archetype = `Transforme l'Europe en planning de week-end`
    }
    // 7. City-trip seul
    else if (hasStrongIntent && topIntent.k === 'city-trip') {
      archetype = `Aime les villes qui fatiguent un peu`
    }
    // 8. Patrimoine + notes hautes
    else if (hasStrongIntent && topIntent.k === 'tourisme' && avgScore !== null && avgScore >= 3.8) {
      archetype = `Prend les vieilles pierres très au sérieux`
    }
    // 9. Patrimoine seul
    else if (hasStrongIntent && topIntent.k === 'tourisme') {
      archetype = `Lit vraiment les panneaux explicatifs`
    }
    // 11. Sorties + budget élevé (plus spécifique que 10 → testé avant)
    else if (hasStrongIntent && topIntent.k === 'sorties' && medBudget !== null && medBudget > 140) {
      archetype = `Le lendemain coûte parfois plus cher que prévu`
    }
    // 10. Sorties seul
    else if (hasStrongIntent && topIntent.k === 'sorties') {
      archetype = `Découvre la culture locale après minuit`
    }
    // 12. Gastro + budget élevé
    else if (hasStrongIntent && topIntent.k === 'gastro' && medBudget !== null && medBudget > 120) {
      archetype = `Confond itinéraire et réservation`
    }
    // 13. Gastro + budget malin
    else if (hasStrongIntent && topIntent.k === 'gastro' && medBudget !== null && medBudget < 90) {
      archetype = `Mange bien, mais surveille l'addition`
    }
    // 14. Gastro seul
    else if (hasStrongIntent && topIntent.k === 'gastro') {
      archetype = `Le repas décide souvent du planning`
    }
    // 15. Nature + longs séjours
    else if (hasStrongIntent && topIntent.k === 'nature' && medDays !== null && medDays > 5) {
      archetype = `Va là où le Wi-Fi perd confiance`
    }
    // 16. Nature seul
    else if (hasStrongIntent && topIntent.k === 'nature') {
      archetype = `Fuit le béton dès que possible`
    }
    // 17. Travail + courts séjours
    else if (hasStrongIntent && topIntent.k === 'travail' && medDays !== null && medDays <= 4) {
      archetype = `Travaille, mais ne gâche pas le décor`
    }
    // 18. Travail seul
    else if (hasStrongIntent && topIntent.k === 'travail') {
      archetype = `Appelle ça pro, regarde quand même les restos`
    }
    // 19. Courts séjours dominants
    else if (travelCount >= 5 && medDays !== null && medDays <= 4) {
      archetype = `A fait du pont une discipline olympique`
    }
    // 20. Séjours d'une semaine
    else if (travelCount >= 5 && medDays !== null && medDays >= 5 && medDays <= 10) {
      archetype = `Reste assez pour juger, pas pour s'attacher`
    }
    // 21. Longs voyages
    else if (travelCount >= 5 && medDays !== null && medDays > 10) {
      archetype = `Ne part pas juste pour voir vite fait`
    }
    // 22. Budget malin
    else if (travelCount >= 5 && medBudget !== null && medBudget < 80) {
      archetype = `Fait souffrir le budget avec élégance`
    }
    // 23. Budget confort
    else if (travelCount >= 5 && medBudget !== null && medBudget >= 80 && medBudget <= 180) {
      archetype = `Se prive rarement, mais avec retenue`
    }
    // 24. Budget large
    else if (travelCount >= 5 && medBudget !== null && medBudget > 180) {
      archetype = `A une définition souple du raisonnable`
    }
    // 25. Notes généreuses
    else if (travelCount >= 5 && scoreValues.length >= 5 && avgScore !== null && avgScore > 4.2) {
      archetype = `Aime presque tout, c'est suspect`
    }
    // 26. Notes critiques
    else if (travelCount >= 5 && scoreValues.length >= 5 && avgScore !== null && avgScore < 2.8) {
      archetype = `N'accorde pas son enthousiasme gratuitement`
    }
    // 27. Beaucoup de coups de cœur
    else if (travelCount >= 5 && coupDeCoeurCount / travelCount >= 0.4) {
      archetype = `Tombe amoureux plus souvent qu'il ne l'avoue`
    }
    // 28. Très peu de coups de cœur
    else if (travelCount >= 8 && coupDeCoeurCount / travelCount <= 0.1) {
      archetype = `Garde ses émotions en bagage cabine`
    }
    // 29–33. Continent dominant (uniquement si aucun intent fort)
    else if (!hasStrongIntent && dominantContinent && dominantContinentPct >= 50) {
      const CONTINENT_ARCHETYPE: Partial<Record<ContinentBucket, string>> = {
        Europe:    `Reste près, mais fait comme si c'était loin`,
        Asie:      `Regarde souvent vers l'Est, l'air de rien`,
        Ameriques: `Traverse l'Atlantique sans trop se justifier`,
        Afrique:   `Cherche autre chose qu'un simple city-break`,
        Oceanie:   `Trouve que « loin » reste négociable`,
      }
      archetype = CONTINENT_ARCHETYPE[dominantContinent.continent] ?? null
    }
    // 34. Plusieurs continents équilibrés
    else if (continents.filter(c => c.pct >= 12).length >= 4) {
      archetype = `Refuse de laisser les stats choisir un camp`
    }
    // 35. Profil très dispersé
    else if (travelCount >= 12) {
      archetype = `Même les données ont lâché l'affaire`
    }
    // 36. Profil en construction (mid confidence, rien de net)
    else if (confidence === 'mid') {
      archetype = `Le carnet n'a pas encore assez de dossiers`
    }
    // 37. Fallback → null (déjà null)
  }

  // ── Signaux (3 slots max : géo / comportemental / humain) ────────────────────

  // Slot 1 — Géographique fort
  const slot1: TravelerSignature | null = (() => {
    if (topCountryName && topCountryN >= 4) {
      return { key: 'geo' as const, icon: '📍', label: `Le contrôle frontière doit le connaître`, detail: `${topCountryName} · ${topCountryN} voyages` }
    }
    if (topCountryName && topCountryN >= 2) {
      return { key: 'geo' as const, icon: '📍', label: `Revient souvent sur ses pas`, detail: `${topCountryName} · ${topCountryN} voyages` }
    }
    const yearCounts: Record<string, number> = {}
    for (const d of travels) if (d.tripYear) yearCounts[String(d.tripYear)] = (yearCounts[String(d.tripYear)] ?? 0) + 1
    const topYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0] ?? null
    if (topYear && topYear[1] >= 5) {
      return { key: 'year' as const, icon: '📅', label: `A sérieusement malmené son calendrier`, detail: `${topYear[0]} · ${topYear[1]} voyages` }
    }
    if (topYear && topYear[1] >= 3) {
      return { key: 'year' as const, icon: '📅', label: `Année peu compatible avec le repos`, detail: `${topYear[0]} · ${topYear[1]} voyages` }
    }
    return null
  })()

  // Slot 2 — Comportemental (notes > budget > format)
  const slot2: TravelerSignature | null = (() => {
    if (scoreValues.length >= 5 && avgScore !== null) {
      if (avgScore < 2.3) return { key: 'notes' as const, icon: '🧐', label: `Même les belles vues doivent argumenter`,   detail: `moy. ${avgScore.toFixed(1)}/5` }
      if (avgScore < 2.8) return { key: 'notes' as const, icon: '🧐', label: `Ne valide pas pour faire plaisir`,          detail: `moy. ${avgScore.toFixed(1)}/5` }
      if (avgScore > 4.3) return { key: 'notes' as const, icon: '⭐', label: `Voit le charme même quand il se cache`,     detail: `moy. ${avgScore.toFixed(1)}/5` }
      if (avgScore > 3.8) return { key: 'notes' as const, icon: '⭐', label: `A la note facile`,                          detail: `moy. ${avgScore.toFixed(1)}/5` }
    }
    if (perDayValues.length >= 3 && medBudget !== null) {
      if (medBudget > 180) return { key: 'budget' as const, icon: '💳', label: `La carte bleue participe aussi au voyage`, detail: `~${Math.round(medBudget)} €/j` }
      if (medBudget < 80)  return { key: 'budget' as const, icon: '💳', label: `Serre le budget sans le dire trop fort`,   detail: `~${Math.round(medBudget)} €/j` }
      return              { key: 'budget' as const, icon: '💳', label: `Le confort reste dans la conversation`,           detail: `~${Math.round(medBudget)} €/j` }
    }
    if (dayValues.length >= 3 && medDays !== null) {
      if (medDays > 10) return { key: 'format' as const, icon: '🧳', label: `Part avec une vraie intention`,       detail: `~${Math.round(medDays)} j${formatCompSuffix}` }
      if (medDays <= 4) return { key: 'format' as const, icon: '🧳', label: `Passe vite, juge quand même`,        detail: `~${Math.round(medDays)} j${formatCompSuffix}` }
      return            { key: 'format' as const, icon: '🧳', label: `S'installe juste avant de repartir`,       detail: `~${Math.round(medDays)} j${formatCompSuffix}` }
    }
    return null
  })()

  // Slot 3 — Humain (coups de cœur > companion > intent)
  const slot3: TravelerSignature | null = (() => {
    if (travelCount >= 5 && coupDeCoeurCount >= 2) {
      const cdcByCont: Record<ContinentBucket, number> = { Europe: 0, Asie: 0, Ameriques: 0, Afrique: 0, Oceanie: 0, Autre: 0 }
      for (const d of travels) if (d.coupDeCoeur && d.country) cdcByCont[continentOf(d.country)]++
      const topCdc = (Object.entries(cdcByCont) as [ContinentBucket, number][]).sort((a, b) => b[1] - a[1])[0]
      if (topCdc && topCdc[1] / coupDeCoeurCount >= 0.5) {
        const CONT_LABEL: Record<ContinentBucket, string> = { Europe: 'Europe', Asie: 'Asie', Ameriques: 'Amériques', Afrique: 'Afrique', Oceanie: 'Océanie', Autre: 'Autre' }
        return { key: 'coeur' as const, icon: '💛', label: `Le cœur manque un peu de neutralité`, detail: `${CONT_LABEL[topCdc[0]]} · ${topCdc[1]}/${coupDeCoeurCount} coups de cœur` }
      }
    }
    if (travelCount >= 5 && coupDeCoeurCount / travelCount >= 0.4) {
      return { key: 'coeur' as const, icon: '💛', label: `S'attache plus vite que prévu`, detail: `${coupDeCoeurCount}/${travelCount} coups de cœur` }
    }
    if (travelCount >= 8 && coupDeCoeurCount > 0 && coupDeCoeurCount / travelCount <= 0.1) {
      return { key: 'coeur' as const, icon: '🖤', label: `Distribue peu les grands frissons`, detail: `${coupDeCoeurCount}/${travelCount} coups de cœur` }
    }
    if (topComp && topCompPct >= 50 && travelCount >= 5) {
      type CompKey = 'solo' | 'couple' | 'amis' | 'famille'
      const COMP_SIG: Record<CompKey, { icon: string; label: string; detail: string }> = {
        solo:    { icon: '🚶', label: `N'attend pas que le groupe soit prêt`,   detail: `${topComp[1]}/${travelCount} en solo` },
        couple:  { icon: '👥', label: `Part souvent avec son témoin principal`, detail: `${topComp[1]}/${travelCount} à deux` },
        amis:    { icon: '🍻', label: `Voyage rarement sans comité`,            detail: `${topComp[1]}/${travelCount} entre amis` },
        famille: { icon: '🏡', label: `Embarque la tribu dans l'histoire`,      detail: `${topComp[1]}/${travelCount} en famille` },
      }
      const sig = COMP_SIG[topComp[0] as CompKey]
      if (sig) return { key: 'companion' as const, icon: sig.icon, label: sig.label, detail: sig.detail }
    }
    if (hasStrongIntent && topIntent) {
      const INTENT_SIG: Record<Intent, { icon: string; label: string }> = {
        'city-trip': { icon: '🏛️', label: `Cherche vite le centre et un bon café` },
        tourisme:    { icon: '🏺', label: `Fait semblant de ne pas aimer les musées` },
        sorties:     { icon: '🌙', label: `Garde de l'énergie pour les mauvaises idées` },
        gastro:      { icon: '🍽️', label: `Le repas décide souvent du planning` },
        nature:      { icon: '🌿', label: `Fuit le béton dès que possible` },
        travail:     { icon: '💼', label: `Optimise le déplacement, évidemment` },
      }
      const INTENT_DETAIL: Record<Intent, string> = {
        'city-trip': 'city-trip', tourisme: 'patrimoine', sorties: 'sorties', gastro: 'gastro', nature: 'nature', travail: 'pro',
      }
      const sig = INTENT_SIG[topIntent.k]
      return { key: 'intent' as const, icon: sig.icon, label: sig.label, detail: `${Math.round(topIntentPct)}% ${INTENT_DETAIL[topIntent.k]}` }
    }
    return null
  })()

  return {
    total,
    travelCount,
    countries,
    coupDeCoeurCount,
    confidence,
    archetype,
    signatures: [slot1, slot2, slot3].filter((s): s is TravelerSignature => s !== null),
    continents,
  }
}
