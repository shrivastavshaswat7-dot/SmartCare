// The guarded SQL runner must refuse bad input before it ever reads credentials or connects.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('../scripts/run-sql.mjs', import.meta.url))
const run = (...args) => spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8' })

test('refuses the already-applied one-booking migration', () => {
  const r = run('supabase_one_booking_per_day.sql', '--apply')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /Not an allowed file name/)
})

test('refuses paths, even when the file name is allowed', () => {
  for (const p of ['../supabase_queue_status.sql', 'C:/elsewhere/supabase_queue_status.sql', './supabase_queue_status.sql']) {
    const r = run(p)
    assert.equal(r.status, 2, p)
    assert.match(r.stderr, /Not an allowed file name/)
  }
})

test('refuses unknown options and missing or extra file names', () => {
  assert.match(run('supabase_queue_status.sql', '--aply').stderr, /Unknown option/)
  assert.match(run().stderr, /exactly one file/)
  assert.match(run('supabase_queue_status.sql', 'supabase_emergency_requests.sql').stderr, /exactly one file/)
})
