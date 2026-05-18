import type { Tier, Intent } from './types'

export type Ratings = { food: number; night: number; culture: number; nature: number; value: number }
export type Weights = Record<keyof Ratings, number>

// Source unique des poids — importée par utils + AddDestinationWizard.
export const INTENT_WEIGHTS: Record<Intent, Weights> = {
  tourisme:   { culture: 1.5, nature: 1.2, food: 1.0, night: 1.0, value: 1.0 },
  sorties:    { night: 1.8, food: 1.2, culture: 1.0, nature: 1.0, value: 1.0 },
  gastro:     { food: 2.0, night: 1.0, culture: 1.0, nature: 1.0, value: 1.0 },
  nature:     { nature: 2.0, value: 1.1, food: 1.0, night: 1.0, culture: 1.0 },
  travail:    { value: 1.5, food: 1.1, culture: 1.0, night: 1.0, nature: 1.0 },
  'city-trip':{ culture: 1.0, food: 1.0, night: 1.0, nature: 1.0, value: 1.0 },
}

export function calculateScore(ratings: Ratings, intent: Intent): number {
  const w = INTENT_WEIGHTS[intent]
  const raw =
    ratings.food * w.food +
    ratings.night * w.night +
    ratings.culture * w.culture +
    ratings.nature * w.nature +
    ratings.value * w.value
  const maxRaw = 5 * (w.food + w.night + w.culture + w.nature + w.value)
  return (raw / maxRaw) * 5
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
