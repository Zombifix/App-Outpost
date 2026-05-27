import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const INTENT_WEIGHTS = {
  tourisme: { culture: 1.5, nature: 1.2, food: 1.0, night: 1.0, value: 1.0 },
  sorties: { night: 1.8, food: 1.2, culture: 1.0, nature: 1.0, value: 1.0 },
  gastro: { food: 2.0, night: 1.0, culture: 1.0, nature: 1.0, value: 1.0 },
  nature: { nature: 2.0, value: 1.1, food: 1.0, night: 1.0, culture: 1.0 },
  travail: { value: 1.5, food: 1.1, culture: 1.0, night: 1.0, nature: 1.0 },
  'city-trip': { culture: 1.0, food: 1.0, night: 1.0, nature: 1.0, value: 1.0 },
}

const WEIGHTED_RATING_KEYS = ['food', 'night', 'culture', 'nature', 'value']
const PRIMARY_RATING_BY_INTENT = {
  tourisme: 'culture',
  sorties: 'night',
  gastro: 'food',
  nature: 'nature',
  travail: 'value',
  'city-trip': 'culture',
}
const VALID_INTENTS = new Set(Object.keys(INTENT_WEIGHTS))

function parseArgs(argv) {
  const options = {
    apply: false,
    id: null,
    userId: null,
    name: null,
    limit: null,
    snapshotDir: path.resolve(process.cwd(), 'tmp', 'score-recalc-snapshots'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') options.apply = true
    else if (arg === '--id') options.id = argv[++index] ?? null
    else if (arg === '--user-id') options.userId = argv[++index] ?? null
    else if (arg === '--name') options.name = argv[++index] ?? null
    else if (arg === '--limit') options.limit = Number(argv[++index] ?? NaN)
    else if (arg === '--snapshot-dir') options.snapshotDir = path.resolve(process.cwd(), argv[++index] ?? '')
    else if (arg === '--help') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive integer')
  }
  if ((options.userId && !options.name) || (!options.userId && options.name)) {
    throw new Error('Use --user-id and --name together when targeting by destination name')
  }
  return options
}

function printHelp() {
  console.log(`
Usage:
  npm run recalculate:scores -- [--apply] [--id <uuid> | --user-id <uuid> --name "<destination>"] [--limit <n>] [--snapshot-dir <dir>]

Examples:
  npm run recalculate:scores -- --id 00000000-0000-0000-0000-000000000000
  npm run recalculate:scores -- --user-id 00000000-0000-0000-0000-000000000000 --name "Kyoto"
  npm run recalculate:scores -- --apply --limit 25
  npm run recalculate:scores -- --apply

Behavior:
  - dry-run by default
  - ignores legacy memorability in score recalculation
  - writes a local snapshot before any applied update
`)
}

function toNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampScore(score) {
  return Math.min(5, Math.max(1, score))
}

function getWeakSpotCap(ratings, intent, activeWeightedCount) {
  let cap = 5
  const primaryKey = PRIMARY_RATING_BY_INTENT[intent] ?? 'culture'
  const importantKeys = new Set([primaryKey, 'value', 'nature'])

  for (const key of WEIGHTED_RATING_KEYS) {
    const value = ratings[key]
    if (value == null) continue

    if (value <= 1) cap = Math.min(cap, importantKeys.has(key) ? 3.0 : 3.2)
    else if (value <= 2) cap = Math.min(cap, importantKeys.has(key) ? 3.9 : 4.2)
    else if (value <= 3 && importantKeys.has(key)) cap = Math.min(cap, 4.4)
  }

  if (activeWeightedCount < 3) cap = Math.min(cap, 3.8)
  else if (activeWeightedCount < 4) cap = Math.min(cap, 4.2)

  return cap
}

function calculateScore(row) {
  const intent = VALID_INTENTS.has(row.intent) ? row.intent : 'tourisme'
  const weights = INTENT_WEIGHTS[intent]
  const ratings = {
    food: toNumberOrNull(row.food),
    night: toNumberOrNull(row.night),
    culture: toNumberOrNull(row.culture),
    nature: toNumberOrNull(row.nature),
    value: toNumberOrNull(row.value),
    ease: toNumberOrNull(row.ease),
  }

  const activeWeighted = WEIGHTED_RATING_KEYS
    .map(key => [key, ratings[key]])
    .filter((entry) => entry[1] != null)
  const totalWeight = activeWeighted.reduce((sum, [key]) => sum + weights[key], 0)
  const rawWeighted = totalWeight === 0
    ? 3
    : activeWeighted.reduce((sum, [key, value]) => sum + value * weights[key], 0) / totalWeight
  const confidence = Math.min(1, activeWeighted.length / 4)
  const weighted = 3 + (rawWeighted - 3) * confidence * 1.15
  const neutralAxes = [ratings.ease].filter((value) => value != null)
  const combined = neutralAxes.length === 0
    ? weighted
    : (weighted * totalWeight + neutralAxes.reduce((sum, value) => sum + value, 0)) / (totalWeight + neutralAxes.length)
  const withVibe = combined + (((toNumberOrNull(row.vibe_boost) ?? 3) - 3) * 0.12)
  const withRetour = withVibe + (toNumberOrNull(row.retour_bonus) ?? 0)
  const capped = Math.min(withRetour, getWeakSpotCap(ratings, intent, activeWeighted.length))
  const withCoupBonus = capped + (row.coup_de_coeur ? 0.3 : 0)
  return clampScore(withCoupBonus)
}

function scoreToTier(score) {
  if (score >= 4.3) return 'S'
  if (score >= 3.7) return 'A'
  if (score >= 3.0) return 'B'
  if (score >= 2.2) return 'C'
  return 'D'
}

function roundScore(score) {
  return Math.round(score * 10) / 10
}

function makeCsv(rows) {
  const headers = ['id', 'user_id', 'name', 'previous_score', 'previous_tier', 'memorability', 'updated_at']
  const escape = (value) => {
    if (value == null) return ''
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => escape(row[header])).join(',')),
  ].join('\n')
}

async function writeSnapshot(snapshotDir, rows) {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  await fs.mkdir(snapshotDir, { recursive: true })
  const jsonPath = path.join(snapshotDir, `destination-score-snapshot-${stamp}.json`)
  const csvPath = path.join(snapshotDir, `destination-score-snapshot-${stamp}.csv`)
  const snapshotRows = rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    previous_score: row.score,
    previous_tier: row.tier,
    memorability: row.memorability,
    updated_at: row.updated_at,
  }))
  await fs.writeFile(jsonPath, `${JSON.stringify(snapshotRows, null, 2)}\n`, 'utf8')
  await fs.writeFile(csvPath, `${makeCsv(snapshotRows)}\n`, 'utf8')
  return { jsonPath, csvPath }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for dry-run)')
  }

  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  let query = client
    .from('destinations')
    .select('id, user_id, name, intent, food, night, culture, nature, value, ease, memorability, vibe_boost, retour_bonus, coup_de_coeur, score, tier, updated_at')

  if (options.id) query = query.eq('id', options.id)
  if (options.userId) query = query.eq('user_id', options.userId)
  if (options.name) query = query.eq('name', options.name)
  if (options.limit != null) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  if (rows.length === 0) {
    console.log('No matching destinations found.')
    return
  }

  const changes = rows.map(row => {
    const nextScore = roundScore(calculateScore(row))
    const nextTier = scoreToTier(nextScore)
    return {
      ...row,
      nextScore,
      nextTier,
      changed: row.score !== nextScore || row.tier !== nextTier,
    }
  })

  const impacted = changes.filter(row => row.changed)

  console.log(`Scanned ${rows.length} destination(s).`)
  console.log(`Would update ${impacted.length} destination(s).`)
  for (const row of impacted.slice(0, 20)) {
    console.log(`- ${row.id} | ${row.name} | ${row.score ?? 'null'} ${row.tier ?? '-'} -> ${row.nextScore} ${row.nextTier}`)
  }
  if (impacted.length > 20) {
    console.log(`... ${impacted.length - 20} more`)
  }

  if (!options.apply) {
    console.log('Dry-run only. Re-run with --apply to persist score/tier updates.')
    return
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY == null) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --apply')
  }

  if (impacted.length === 0) {
    console.log('No updates to apply.')
    return
  }

  const snapshot = await writeSnapshot(options.snapshotDir, impacted)
  console.log(`Snapshot written to ${snapshot.jsonPath}`)
  console.log(`Snapshot CSV written to ${snapshot.csvPath}`)

  for (const row of impacted) {
    const { error: updateError } = await client
      .from('destinations')
      .update({ score: row.nextScore, tier: row.nextTier })
      .eq('id', row.id)
    if (updateError) throw updateError
  }

  console.log(`Applied ${impacted.length} update(s).`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
