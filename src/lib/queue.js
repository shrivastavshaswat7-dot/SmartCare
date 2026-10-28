// Queue ordering rules shared by the patient, doctor and admin views.
// Must stay in sync with public.get_my_queue_status() in supabase_queue_status.sql.

export const AVG_CONSULT_MINUTES = 10

export const isEmergency = (appt) => (appt?.priority || 'normal').toLowerCase() === 'emergency'

// Emergency first, then token number ascending
export function compareQueueOrder(a, b) {
  const prioA = isEmergency(a) ? 0 : 1
  const prioB = isEmergency(b) ? 0 : 1
  if (prioA !== prioB) return prioA - prioB
  return (a?.token_number || 0) - (b?.token_number || 0)
}

// Patient asked for emergency review and staff have not decided yet
export const hasPendingEmergencyRequest = (appt) =>
  appt?.emergency_requested === true && !isEmergency(appt) && appt?.status === 'waiting'

// Estimated wait: everyone waiting ahead, plus whoever is in the cabin now
export function estimateWaitMinutes({ status, peopleAhead = 0, nowServing = null }, avg = AVG_CONSULT_MINUTES) {
  if (status === 'consulting') return 0
  return (Math.max(0, peopleAhead) + (nowServing != null ? 1 : 0)) * avg
}
