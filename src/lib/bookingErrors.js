// Turns Supabase/PostgreSQL errors from an appointment insert into a message for the patient.

export const DUPLICATE_DAY_INDEX = 'uq_patient_doctor_day_active'
export const SLOT_INDEX = 'idx_uq_appointments_slot'

export function bookingErrorMessage(err) {
  const message = err?.message || ''

  if (err?.code === '23505') {
    if (message.includes(DUPLICATE_DAY_INDEX)) {
      return 'You already have an appointment with this doctor on this date. Please choose another date or doctor.'
    }
    if (message.includes(SLOT_INDEX)) {
      return 'This exact time slot has just been booked. Please choose another.'
    }
    return 'This appointment conflicts with an existing booking. Please refresh and try again.'
  }
  if (err?.code === '23503') {
    return 'The selected doctor or appointment is no longer available. Please refresh and try again.'
  }
  if (err?.code === '42501') {
    return 'You are not allowed to make this booking. Please sign in again.'
  }
  return message || 'Unknown error'
}
