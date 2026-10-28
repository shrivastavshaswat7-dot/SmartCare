-- ====================================================================
-- SmartCare: One active booking per patient / doctor / day
-- Run in the Supabase SQL Editor AFTER supabase_time_slots.sql.
-- Safe to run more than once.
-- ====================================================================
-- Rule: a patient may hold at most ONE non-cancelled appointment with a
-- given doctor on a given date. Different patients are unaffected, and
-- cancelling an appointment frees the patient to book again.
--
-- A unique index is enforced inside PostgreSQL, so two simultaneous
-- booking requests cannot both succeed (the second fails with 23505).
--
-- Works alongside (does not replace):
--   * idx_uq_appointments_slot  -> one patient per doctor/date/slot
--   * uq_doctor_date_token      -> unique token per doctor/date
--   * trg_assign_token_number   -> a rejected insert rolls back, so no
--                                  token number is consumed
-- ====================================================================

-- 1. Pre-check: must return 0 rows, otherwise step 2 will fail.
--    Run this statement ON ITS OWN first: the SQL Editor only shows the
--    result of the last statement in a batch.
SELECT patient_id, doctor_id, appointment_date, COUNT(*) AS active_count
FROM public.appointments
WHERE status <> 'cancelled'
GROUP BY patient_id, doctor_id, appointment_date
HAVING COUNT(*) > 1;

-- 2. Enforce the rule (partial index: cancelled rows are ignored).
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_doctor_day_active
  ON public.appointments (patient_id, doctor_id, appointment_date)
  WHERE status <> 'cancelled';

-- 3. Verify: IF NOT EXISTS skips creation when ANY index already has this
--    name, so confirm the definition matches step 2.
SELECT indexdef FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'uq_patient_doctor_day_active';

-- Rollback:
-- DROP INDEX IF EXISTS public.uq_patient_doctor_day_active;
