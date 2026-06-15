import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const VALID_INTENTS = new Set(['tourisme', 'sorties', 'gastro', 'nature', 'travail', 'city-trip'])

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

function retourBonusToVerdict(rb) {
  if (rb == null) return null
  if (rb >= 0.3) return 5
  if (rb >= 0.1) return 4
  if (rb >= 0) return 2.5
  return 1
}

function normalizeTagText(label) {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .trim()
}

function computeTagBonus(tags, coupDeCoeur) {
  let bonus = coupDeCoeur ? 0.5 : 0
  for (const raw of tags) {
    const t = normalizeTagText(raw)
    if (t.includes('belle surprise')) bonus += 0.30
    else if (t.includes('facile a vivre')) bonus += 0.15
    else if (t.includes('ambiance locale')) bonus += 0.05
    else if (t.includes('pas cher')) bonus += 0.25
    else if (t.includes('ville a flaner') || t.includes('ville a flaneur')) bonus += 0.10
    else if (t.includes('beau partout')) bonus += 0.15
    else if (t.includes('patrimoine marquant')) bonus += 0.15
    else if (t.includes('craignos')) bonus -= 0.70
    else if (t.includes('surcote')) bonus -= 0.50
    else if (t.includes('trop cher')) bonus -= 0.35
    else if (t.includes('transports galere') || t.includes('transports galre')) bonus -= 0.20
    else if (t.includes('pieges a touristes') || t.includes('piges a touristes')) bonus -= 0.30
  }
  return bonus
}

function calculateScore(row) {
  const verdictFinal = retourBonusToVerdict(toNumberOrNull(row.retour_bonus))
  const ambianceRessentie = toNumberOrNull(row.vibe_boost)
  const faciliteSurPlace = toNumberOrNull(row.ease)
  const rapportQualitePrix = toNumberOrNull(row.value)

  const components = []
  if (verdictFinal !== null) components.push({ weight: 0.45, value: verdictFinal })
  if (ambianceRessentie !== null) components.push({ weight: 0.25, value: ambianceRessentie })
  if (faciliteSurPlace !== null) components.push({ weight: 0.15, value: faciliteSurPlace })
  if (rapportQualitePrix !== null) components.push({ weight: 0.15, value: rapportQualitePrix })

  let baseScore
  if (components.length === 0) {
    const legacyValues = [row.food, row.night, row.culture, row.nature, row.value]
      .map(toNumberOrNull)
      .filter((v) => v != null)
    baseScore = legacyValues.length > 0
      ? legacyValues.reduce((s, v) => s + v, 0) / legacyValues.length
      : 3
  } else {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0)
    baseScore = components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight
  }

  const allTags = [...(row.standout_tags ?? []), ...(row.trip_types ?? [])]
  let score = baseScore + computeTagBonus(allTags, row.coup_de_coeur)

  const hasCraignos = allTags.some(t => normalizeTagText(t).includes('craignos'))

  if (verdictFinal !== null && verdictFinal <= 2.5) {
    score = Math.min(score, 3.19)
  }
  if (
    rapportQualitePrix !== null && rapportQualitePrix <= 2
    && faciliteSurPlace !== null && faciliteSurPlace <= 2
    && !row.coup_de_coeur
    && (verdictFinal === null || verdictFinal < 4.5)
  ) {
    score = Math.min(score, 3.19)
  }
  if (hasCraignos && !(row.coup_de_coeur && verdictFinal !== null && verdictFinal >= 4.5)) {
    score = Math.min(score, 3.99)
  }
  if (row.coup_de_coeur && verdictFinal !== null && verdictFinal >= 4 && ambianceRessentie !== null && ambianceRessentie >= 4) {
    score = Math.max(score, 4.0)
  }

  return clampScore(score)
}

function scoreToTier(score) {
  if (score >= 4.5) return 'S'
  if (score >= 4.0) return 'A'
  if (score >= 3.2) return 'B'
  if (score >= 2.4) return 'C'
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
    .select('id, user_id, name, intent, food, night, culture, nature, value, ease, vibe_boost, retour_bonus, coup_de_coeur, standout_tags, trip_types, score, tier, updated_at')

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
