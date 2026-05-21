import type { Tier, Intent } from './types'

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

export function calculateScore(
  ratings: Ratings,
  intent: Intent,
  options?: { vibeBoost?: number | null; retourBonus?: number },
): number {
  const w = INTENT_WEIGHTS[intent]
  const activeWeighted = WEIGHTED_RATING_KEYS
    .map(key => [key, ratings[key]] as const)
    .filter((entry): entry is readonly [WeightedRatingKey, number] => entry[1] !== null)
  const totalWeight = activeWeighted.reduce((sum, [key]) => sum + w[key], 0)
  const weighted = totalWeight === 0
    ? 3
    : activeWeighted.reduce((sum, [key, value]) => sum + value * w[key], 0) / totalWeight
  const neutralAxes = NEUTRAL_RATING_KEYS
    .map(key => ratings[key])
    .filter((value): value is number => value !== null && value !== undefined)
  const combined = neutralAxes.length === 0
    ? weighted
    : (weighted * totalWeight + neutralAxes.reduce((sum, value) => sum + value, 0)) / (totalWeight + neutralAxes.length)
  const withVibe = options && 'vibeBoost' in options
    ? combined + (options.vibeBoost ?? 3) * 0.2 * ((combined - 1) / 4)
    : combined
  return Math.min(5, Math.max(1, withVibe + (options?.retourBonus ?? 0)))
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
