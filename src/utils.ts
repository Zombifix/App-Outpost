import type { Destination, Tier, Intent } from './types'

export type WeightedRatingKey = 'food' | 'night' | 'culture' | 'nature' | 'value'
export type NeutralRatingKey = 'ease' | 'memorability'
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
const NEUTRAL_RATING_KEYS: NeutralRatingKey[] = ['ease', 'memorability']
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
  const weighted = 3 + (rawWeighted - 3) * confidence
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
  if (score >= 4.5) return 'S'
  if (score >= 3.5) return 'A'
  if (score >= 2.5) return 'B'
  if (score >= 1.5) return 'C'
  return 'D'
}

export function calculateTier(ratings: Ratings, intent: Intent): Tier {
  return scoreToTier(calculateScore(ratings, intent))
}

export function getDestinationScore(destination: Destination): number {
  return calculateScore({
    food: destination.food,
    night: destination.night,
    culture: destination.culture,
    nature: destination.nature,
    value: destination.value,
    ease: destination.ease,
    memorability: destination.memorability,
  }, destination.intent, {
    vibeBoost: destination.vibeBoost,
    retourBonus: destination.retourBonus,
  })
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
