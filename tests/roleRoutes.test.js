import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardRedirect, homeForRole } from '../src/lib/roleRoutes.js'

const user = { id: 'test-user' }

test('signed-out visitors are sent to login from every area', () => {
  for (const area of ['patient', 'doctor', 'admin']) {
    assert.equal(guardRedirect(area, { user: null, role: null }), '/login')
  }
})

test('each role can only open its own area', () => {
  assert.equal(guardRedirect('patient', { user, role: 'patient' }), null)
  assert.equal(guardRedirect('doctor', { user, role: 'doctor' }), null)
  assert.equal(guardRedirect('admin', { user, role: 'admin' }), null)

  assert.equal(guardRedirect('admin', { user, role: 'patient' }), '/')
  assert.equal(guardRedirect('doctor', { user, role: 'patient' }), '/')
  assert.equal(guardRedirect('admin', { user, role: 'doctor' }), '/doctor')
  assert.equal(guardRedirect('patient', { user, role: 'doctor' }), '/doctor')
  assert.equal(guardRedirect('doctor', { user, role: 'admin' }), '/admin')
  assert.equal(guardRedirect('patient', { user, role: 'admin' }), '/admin')
})

test('unknown or missing roles get the least privileged (patient) area', () => {
  assert.equal(guardRedirect('patient', { user, role: null }), null)
  assert.equal(guardRedirect('admin', { user, role: 'superuser' }), '/')
  assert.equal(homeForRole(undefined), '/')
})

test('home routes per role', () => {
  assert.equal(homeForRole('admin'), '/admin')
  assert.equal(homeForRole('doctor'), '/doctor')
  assert.equal(homeForRole('patient'), '/')
})
