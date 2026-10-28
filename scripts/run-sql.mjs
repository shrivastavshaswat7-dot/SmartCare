#!/usr/bin/env node
/**
 * SmartCare guarded SQL runner.
 *
 *   npm run db -- <file.sql>            dry run: execute inside a transaction, then ROLL BACK
 *   npm run db -- <file.sql> --apply    execute inside a transaction and COMMIT
 *
 * Only the files in ALLOWED can be run; everything runs in ONE transaction, so
 * any error rolls the whole file back. The connection string is read from
 * SUPABASE_DB_URL in .env.local (gitignored) and is never printed.
 *
 * supabase_verify_behaviour.sql always raises its report as an error (that is
 * how it guarantees a rollback); the runner prints that report and exits 0
 * when it contains no FAIL.
 */
import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import pg from 'pg'

const ALLOWED = new Set([
  'supabase_queue_status.sql',
  'supabase_emergency_requests.sql',
  'supabase_verify_readonly.sql',
  'supabase_verify_behaviour.sql',
])

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const apply = args.includes('--apply')

if (!file || !ALLOWED.has(basename(file))) {
  console.error('Usage: npm run db -- <file.sql> [--apply]')
  console.error('Allowed files: ' + [...ALLOWED].join(', '))
  process.exit(2)
}

// Minimal .env.local reader (same approach as provision_doctors.mjs)
function readEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // file is optional
  }
}
readEnv(resolve(process.cwd(), '.env.local'))

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Missing SUPABASE_DB_URL in .env.local.')
  console.error('Supabase Dashboard -> Connect -> Session pooler connection string (with your database password).')
  process.exit(2)
}

const sql = readFileSync(resolve(process.cwd(), file), 'utf8')
const ca = process.env.SUPABASE_DB_CA_FILE ? readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') : null
const client = new pg.Client({
  connectionString: url,
  // Verify the server certificate when the Supabase CA file is provided
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})

const host = (() => { try { return new URL(url).hostname } catch { return 'unknown host' } })()
const printRows = (res) => {
  for (const r of [].concat(res)) {
    if (r?.command === 'SELECT' && r.rows.length) console.table(r.rows)
  }
}

let exitCode = 0
try {
  await client.connect()
  console.log(`Connected to ${host}. ${apply ? 'APPLY' : 'DRY RUN (will roll back)'}: ${basename(file)}`)
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout = '5s'")
  await client.query("SET LOCAL statement_timeout = '60s'")
  const res = await client.query(sql)
  printRows(res)
  if (apply) {
    await client.query('COMMIT')
    console.log('COMMITTED.')
  } else {
    await client.query('ROLLBACK')
    console.log('Rolled back (dry run). Re-run with --apply to commit.')
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  const msg = err?.message || String(err)
  if (msg.startsWith('SMARTCARE TEST REPORT')) {
    console.log(msg)
    exitCode = /FAIL/.test(msg) ? 1 : 0
  } else {
    console.error(`ERROR (${err?.code || 'no code'}): ${msg}`)
    console.error('Everything in this file was rolled back.')
    exitCode = 1
  }
} finally {
  await client.end().catch(() => {})
}
process.exit(exitCode)
