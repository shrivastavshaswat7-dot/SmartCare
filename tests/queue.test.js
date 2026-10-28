import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareQueueOrder, estimateWaitMinutes, hasPendingEmergencyRequest, isEmergency } from '../src/lib/queue.js'

test('emergency patients are ordered before normal ones, then by token', () => {
  const queue = [
    { id: 1, token_number: 3, priority: 'normal' },
    { id: 2, token_number: 5, priority: 'emergency' },
    { id: 3, token_number: 1, priority: 'normal' },
    { id: 4, token_number: 2, priority: 'emergency' },
  ]
  assert.deepEqual([...queue].sort(compareQueueOrder).map(a => a.id), [4, 2, 3, 1])
})

test('missing priority counts as normal and priority is case-insensitive', () => {
  assert.equal(isEmergency({}), false)
  assert.equal(isEmergency({ priority: 'Emergency' }), true)
  const queue = [{ id: 1, token_number: 2 }, { id: 2, token_number: 1, priority: 'normal' }]
  assert.deepEqual([...queue].sort(compareQueueOrder).map(a => a.id), [2, 1])
})

test('estimated wait counts people ahead plus the patient in the cabin', () => {
  assert.equal(estimateWaitMinutes({ status: 'waiting', peopleAhead: 0, nowServing: null }), 0)
  assert.equal(estimateWaitMinutes({ status: 'waiting', peopleAhead: 0, nowServing: 7 }), 10)
  assert.equal(estimateWaitMinutes({ status: 'waiting', peopleAhead: 2, nowServing: 7 }), 30)
  assert.equal(estimateWaitMinutes({ status: 'consulting', peopleAhead: 4, nowServing: 7 }), 0)
  assert.equal(estimateWaitMinutes({ status: 'waiting', peopleAhead: -1 }), 0)
})

test('pending emergency request only while waiting and not yet approved', () => {
  assert.equal(hasPendingEmergencyRequest({ emergency_requested: true, priority: 'normal', status: 'waiting' }), true)
  assert.equal(hasPendingEmergencyRequest({ emergency_requested: true, priority: 'emergency', status: 'waiting' }), false)
  assert.equal(hasPendingEmergencyRequest({ emergency_requested: true, priority: 'normal', status: 'completed' }), false)
  // Before the emergency migration the column does not exist
  assert.equal(hasPendingEmergencyRequest({ priority: 'normal', status: 'waiting' }), false)
})
