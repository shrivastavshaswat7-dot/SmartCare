import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookingErrorMessage } from '../src/lib/bookingErrors.js'

// Shapes match what supabase-js returns from PostgREST
const uniqueViolation = (name) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${name}"`,
})

test('same patient, doctor and day gets a clear message', () => {
  const msg = bookingErrorMessage(uniqueViolation('uq_patient_doctor_day_active'))
  assert.match(msg, /already have an appointment with this doctor on this date/)
  assert.doesNotMatch(msg, /duplicate key/)
})

test('slot clash keeps its existing message', () => {
  assert.equal(
    bookingErrorMessage(uniqueViolation('idx_uq_appointments_slot')),
    'This exact time slot has just been booked. Please choose another.'
  )
})

test('other unique violations get a neutral message, never a raw database error', () => {
  const msg = bookingErrorMessage(uniqueViolation('uq_doctor_date_token'))
  assert.match(msg, /conflicts with an existing booking/)
  assert.doesNotMatch(msg, /uq_doctor_date_token/)
})

test('permission and foreign-key errors are explained', () => {
  assert.match(bookingErrorMessage({ code: '42501', message: 'new row violates row-level security policy' }), /not allowed/)
  assert.match(bookingErrorMessage({ code: '23503', message: 'violates foreign key constraint' }), /no longer available/)
})

test('unknown errors fall back to their message', () => {
  assert.equal(bookingErrorMessage({ code: 'XX000', message: 'network down' }), 'network down')
  assert.equal(bookingErrorMessage(undefined), 'Unknown error')
})
