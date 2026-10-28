-- ====================================================================
-- SmartCare: behaviour tests for the queue function, emergency requests
-- and the one-booking-per-day index.
-- Run AFTER supabase_queue_status.sql and supabase_emergency_requests.sql.
--
-- The whole script is ONE DO statement that ALWAYS ends by raising an
-- error that carries the results. Raising the error rolls back every test
-- row, so nothing is ever saved. The "error" message IS the test report:
--   SMARTCARE TEST REPORT: A=PASS; B=PASS; ...
-- Test rows use the far-future date 2099-01-06. Existing profile ids are
-- borrowed as test patients only inside this rolled-back statement.
-- Identity ids consumed by the test inserts are not reused (harmless gaps).
-- ====================================================================
DO $$
DECLARE
  test_day CONSTANT date := DATE '2099-01-06';
  doc bigint; doc2 bigint; admin_id uuid; pat_id uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  a1 bigint; a3 bigint; ins record;
  r record; report text := ''; cname text;
BEGIN
  IF to_regprocedure('public.get_my_queue_status()') IS NULL
     OR to_regprocedure('public.enforce_patient_booking_rules()') IS NULL THEN
    RAISE EXCEPTION 'SMARTCARE TEST REPORT: SKIPPED - run supabase_queue_status.sql and supabase_emergency_requests.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE appointment_date = test_day) THEN
    RAISE EXCEPTION 'SMARTCARE TEST REPORT: SKIPPED - real appointments exist on %', test_day;
  END IF;

  SELECT id INTO doc FROM public.doctors ORDER BY id LIMIT 1;
  SELECT id INTO doc2 FROM public.doctors WHERE id <> doc ORDER BY id LIMIT 1;
  SELECT id INTO admin_id FROM public.profiles WHERE role = 'admin' ORDER BY id LIMIT 1;
  SELECT id INTO pat_id FROM public.profiles WHERE role = 'patient' ORDER BY id LIMIT 1;
  SELECT id INTO p1 FROM public.profiles ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO p2 FROM public.profiles ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO p3 FROM public.profiles ORDER BY id OFFSET 2 LIMIT 1;
  SELECT id INTO p4 FROM public.profiles ORDER BY id OFFSET 3 LIMIT 1;
  IF doc IS NULL OR doc2 IS NULL OR p4 IS NULL THEN
    RAISE EXCEPTION 'SMARTCARE TEST REPORT: SKIPPED - need 2 doctors and 4 profiles';
  END IF;

  -- Inserts below run with no signed-in user (auth.uid() IS NULL), so the
  -- emergency trigger leaves them untouched. Tokens: p1=1, p2=2, p3=3, p4=4.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
    VALUES (p1, doc, test_day, '09:00', '09:00', '09:15', 'waiting', 'normal', 'new') RETURNING id INTO a1;
  INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
    VALUES (p2, doc, test_day, '09:15', '09:15', '09:30', 'waiting', 'emergency', 'new');
  INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
    VALUES (p3, doc, test_day, '09:30', '09:30', '09:45', 'waiting', 'normal', 'new') RETURNING id INTO a3;
  INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
    VALUES (p4, doc, test_day, '09:45', '09:45', '10:00', 'consulting', 'normal', 'new');

  -- Q1: p3 (normal, token 3) has p1 (normal, token 1) and p2 (emergency) ahead
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p3, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p3::text, true);
  SELECT * INTO r FROM public.get_my_queue_status() WHERE appointment_id = a3;
  report := report || 'Q1 position=' || CASE WHEN r.people_ahead = 2 AND r.waiting_total = 3 AND r.now_serving = 4
                                            THEN 'PASS' ELSE 'FAIL(' || COALESCE(r.people_ahead::text, 'null') || ')' END || '; ';

  -- Q2: p1 (normal, token 1) only has the emergency patient ahead
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p1::text, true);
  SELECT * INTO r FROM public.get_my_queue_status() WHERE appointment_id = a1;
  report := report || 'Q2 emergency-first=' || CASE WHEN r.people_ahead = 1 THEN 'PASS' ELSE 'FAIL' END || '; ';

  -- Q3: the function only returns the caller's own appointments
  report := report || 'Q3 own-rows-only=' || CASE WHEN (SELECT COUNT(*) FROM public.get_my_queue_status()) = 1
                                                  THEN 'PASS' ELSE 'FAIL' END || '; ';

  -- E1/E2: a patient booking "emergency" + "completed" is stored as a normal waiting request
  IF pat_id IS NULL THEN
    report := report || 'E1-E2 SKIPPED (no profile with role=patient); ';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', pat_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', pat_id::text, true);
    INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
      VALUES (pat_id, doc2, test_day, '11:00', '11:00', '11:15', 'completed', 'emergency', 'new')
      RETURNING priority, status, emergency_requested INTO ins;
    report := report || 'E1 patient-insert-sanitised=' || CASE WHEN ins.priority = 'normal' AND ins.status = 'waiting' AND ins.emergency_requested
                                                              THEN 'PASS' ELSE 'FAIL' END || '; ';
    BEGIN
      UPDATE public.appointments SET priority = 'emergency'
       WHERE patient_id = pat_id AND doctor_id = doc2 AND appointment_date = test_day AND slot_start = '11:00';
      report := report || 'E2 patient-update-blocked=FAIL; ';
    EXCEPTION WHEN insufficient_privilege THEN
      report := report || 'E2 patient-update-blocked=PASS; ';
    END;
  END IF;

  -- E3: an admin can still set emergency priority
  IF admin_id IS NULL THEN
    report := report || 'E3 SKIPPED (no admin profile); ';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
    UPDATE public.appointments SET priority = 'emergency', emergency_requested = false WHERE id = a3
      RETURNING priority INTO ins;
    report := report || 'E3 admin-approve=' || CASE WHEN ins.priority = 'emergency' THEN 'PASS' ELSE 'FAIL' END || '; ';
  END IF;

  -- D1: same patient, doctor and day is rejected by uq_patient_doctor_day_active
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, slot_start, slot_end, status, priority, visit_type)
      VALUES (p1, doc, test_day, '12:00', '12:00', '12:15', 'waiting', 'normal', 'new');
    report := report || 'D1 duplicate-day=FAIL; ';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS cname = CONSTRAINT_NAME;
    report := report || 'D1 duplicate-day=' || CASE WHEN cname = 'uq_patient_doctor_day_active' THEN 'PASS' ELSE 'FAIL(' || cname || ')' END || '; ';
  END;

  -- Always roll everything back and show the report
  RAISE EXCEPTION 'SMARTCARE TEST REPORT (all test rows rolled back): %', report;
END $$;
