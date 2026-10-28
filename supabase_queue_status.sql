-- ====================================================================
-- SmartCare: patient queue position (get_my_queue_status)
-- Run in the Supabase SQL Editor. Safe to run more than once.
-- ====================================================================
-- Why: patients can only read their OWN appointment rows (RLS), so the
-- browser cannot count how many people are ahead of them. This function
-- runs with the owner's rights but returns only aggregate numbers for the
-- caller's own active appointments - never other patients' rows or ids.
--
-- Ordering rule (same as src/lib/queue.js compareQueueOrder):
--   emergency before normal, then token_number ascending.
--
-- Returns one row per active (waiting/consulting) appointment of auth.uid():
--   appointment_id  the caller's appointment
--   people_ahead    waiting patients ordered before it (0 while consulting)
--   waiting_total   all waiting patients for that doctor + date
--   now_serving     token currently in consultation, or NULL
--
-- Locking: CREATE OR REPLACE FUNCTION only; no table locks or data changes.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_my_queue_status();
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_my_queue_status()
RETURNS TABLE (
  appointment_id BIGINT,
  people_ahead   INT,
  waiting_total  INT,
  now_serving    INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.id,
    CASE WHEN me.status <> 'waiting' THEN 0 ELSE (
      SELECT COUNT(*)::int
        FROM public.appointments o
       WHERE o.doctor_id = me.doctor_id
         AND o.appointment_date = me.appointment_date
         AND o.status = 'waiting'
         AND o.id <> me.id
         AND (
           (COALESCE(o.priority, 'normal') = 'emergency' AND COALESCE(me.priority, 'normal') <> 'emergency')
           OR (
             (COALESCE(o.priority, 'normal') = 'emergency') = (COALESCE(me.priority, 'normal') = 'emergency')
             AND o.token_number < me.token_number
           )
         )
    ) END,
    (SELECT COUNT(*)::int
       FROM public.appointments o
      WHERE o.doctor_id = me.doctor_id
        AND o.appointment_date = me.appointment_date
        AND o.status = 'waiting'),
    (SELECT o.token_number
       FROM public.appointments o
      WHERE o.doctor_id = me.doctor_id
        AND o.appointment_date = me.appointment_date
        AND o.status = 'consulting'
      ORDER BY o.token_number
      LIMIT 1)
  FROM public.appointments me
  WHERE me.patient_id = auth.uid()
    AND me.status IN ('waiting', 'consulting');
$$;

REVOKE ALL ON FUNCTION public.get_my_queue_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_queue_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_queue_status() TO authenticated;

-- Make the API (PostgREST) see the new function immediately after commit
NOTIFY pgrst, 'reload schema';

-- Verify (read-only): expect one row, security_definer = true
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_my_queue_status';
