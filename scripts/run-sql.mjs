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
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

// Files are always read from the repository root, never from a caller-supplied path
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED = new Set([
  'supabase_queue_status.sql',
  'supabase_emergency_requests.sql',
  'supabase_verify_readonly.sql',
  'supabase_verify_behaviour.sql',
])

const usage = (reason) => {
  console.error(reason)
  console.error('Usage: npm run db -- <file.sql> [--apply]')
  console.error('Allowed files (repository root only): ' + [...ALLOWED].join(', '))
  process.exit(2)
}

const args = process.argv.slice(2)
const files = args.filter(a => !a.startsWith('--'))
const flags = args.filter(a => a.startsWith('--'))
if (files.length !== 1) usage('Give exactly one file name.')
if (flags.some(f => f !== '--apply')) usage('Unknown option: ' + flags.find(f => f !== '--apply'))
const file = files[0]
// Exact bare file name: no directories, so ../elsewhere/<allowed name> is refused
if (!ALLOWED.has(file)) usage('Not an allowed file name: ' + file)
const apply = flags.includes('--apply')

// Minimal .env.local reader (same approach as provision_doctors.mjs)
function readEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // file is optional
  }
}
readEnv(resolve(ROOT, '.env.local'))

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Missing SUPABASE_DB_URL in .env.local.')
  console.error('Supabase Dashboard -> Connect -> Session pooler connection string (with your database password).')
  process.exit(2)
}

const sql = readFileSync(resolve(ROOT, file), 'utf8')

// The runner owns the transaction; a file that commits or rolls back itself would
// escape it. (PL/pgSQL "BEGIN"/"END;" inside DO blocks are block markers, not these.)
if (/^\s*(?:(?:COMMIT|ROLLBACK|ABORT)\b|(?:END|START)\s+TRANSACTION\b|BEGIN\s*;|BEGIN\s+(?:TRANSACTION|WORK)\b)/im.test(sql)) {
  console.error(`Refusing ${file}: it contains its own transaction control statement.`)
  process.exit(2)
}
const ca = process.env.SUPABASE_DB_CA_FILE ? readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') : null
const client = new pg.Client({
  connectionString: url,
  // Verify the server certificate when the Supabase CA file is provided
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})

const host = (() => { try { return new URL(url).hostname } catch { return 'unknown host' } })()
if (!ca) console.log('Note: TLS is encrypted but the server certificate is not verified (set SUPABASE_DB_CA_FILE to verify it).')

// Belt and braces: never echo the connection string or its password, even inside an error
const secrets = [url]
try {
  const pw = decodeURIComponent(new URL(url).password)
  if (pw) secrets.push(pw)
} catch {
  // unparsable URL: the whole string is still redacted
}
const redact = (text) => secrets.reduce((t, s) => t.split(s).join('<redacted>'), String(text))
const printRows = (res) => {
  for (const r of [].concat(res)) {
    if (r?.command === 'SELECT' && r.rows.length) console.table(r.rows)
  }
}

let exitCode = 0
try {
  await client.connect()
  console.log(`Connected to ${host}. ${apply ? 'APPLY' : 'DRY RUN (will roll back)'}: ${file}`)
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout = '5s'")
  await client.query("SET LOCAL statement_timeout = '60s'")
  const res = await client.query(sql)
  printRows(res)
  if (apply) {
    // PostgreSQL answers ROLLBACK to COMMIT if the transaction had failed
    const done = await client.query('COMMIT')
    if (done.command !== 'COMMIT') throw new Error('Transaction was not committed (' + done.command + ')')
    console.log('COMMITTED.')
  } else {
    await client.query('ROLLBACK')
    console.log('Rolled back (dry run). Re-run with --apply to commit.')
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  const msg = redact(err?.message || String(err))
  if (msg.startsWith('SMARTCARE TEST REPORT')) {
    console.log(msg)
    exitCode = /FAIL/.test(msg) ? 1 : 0
  } else {
    console.error(`ERROR (${err?.code || 'no code'}): ${msg}`)
    console.error('Nothing was committed: the transaction was rolled back (or never started).')
    exitCode = 1
  }
} finally {
  await client.end().catch(() => {})
}
process.exit(exitCode)
