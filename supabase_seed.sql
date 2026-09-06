-- =======================================================
-- SmartCare Database Seed Script
-- Run this in your Supabase SQL Editor to populate sample
-- departments and doctors into your database.
-- =======================================================

-- 1. Insert Departments (if not existing)
INSERT INTO departments (name)
SELECT name FROM (VALUES
  ('Cardiology'),
  ('Neurology'),
  ('Orthopedics'),
  ('Pediatrics'),
  ('General Medicine')
) AS d(name)
WHERE NOT EXISTS (
  SELECT 1 FROM departments WHERE name = d.name
);

-- 2. Insert Doctors for each department (if not existing)
INSERT INTO doctors (name, department_id, specialization)
SELECT doc.name, dep.id, doc.specialization
FROM (VALUES
  ('Cardiology', 'Dr. Robert Chen', 'Interventional Cardiology'),
  ('Cardiology', 'Dr. Sarah Jenkins', 'Electrophysiology'),
  ('Neurology', 'Dr. Michael Vance', 'Stroke & Neurological Disorders'),
  ('Neurology', 'Dr. Priya Sharma', 'Pediatric Neurology'),
  ('Orthopedics', 'Dr. James Wilson', 'Joint Replacement & Sports Medicine'),
  ('Orthopedics', 'Dr. Elena Rostova', 'Spine Surgery'),
  ('Pediatrics', 'Dr. Emily Carter', 'General Pediatrics'),
  ('Pediatrics', 'Dr. David Kim', 'Pediatric Critical Care'),
  ('General Medicine', 'Dr. Aris Thorne', 'Internal Medicine'),
  ('General Medicine', 'Dr. Maya Lin', 'Preventive Healthcare')
) AS doc(dept_name, name, specialization)
JOIN departments dep ON dep.name = doc.dept_name
WHERE NOT EXISTS (
  SELECT 1 FROM doctors WHERE name = doc.name AND department_id = dep.id
);
