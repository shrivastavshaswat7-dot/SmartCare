# SmartCare Hospital Management System

SmartCare is a modern, responsive Hospital Management System built with React, Vite, and Supabase. It provides dedicated portals and secure routing for Patients, Doctors, and Hospital Administrators to streamline daily medical operations.

## Features

### 🧑‍⚕️ For Patients
- **Authentication:** Secure Registration and Login.
- **Dashboard:** Overview of active appointments.
- **Booking System:** Book appointments with dynamic department-to-doctor filtering.
- **Live Queue:** Monitor live queue position and estimated waiting time.
- **Priority Access:** Built-in emergency priority handling.

### 🩺 For Doctors
- **Dedicated Dashboard:** Secure doctor-only access.
- **Queue Management:** Manage today's patients, call the next patient, and view queue statistics.
- **Consultation Hub:** Add consultation notes and digital prescriptions directly during the appointment.
- **Medical History:** View past patient history securely restricted via Row Level Security (RLS).

### ⚙️ For Administrators
- **Admin Dashboard:** High-level hospital overview and real-time statistics.
- **Queue Control:** Global queue management, manual overrides, and cancellation control.

## Tech Stack
- **Frontend:** React, Vite, JavaScript, CSS (Vanilla)
- **Backend/Database:** Supabase (PostgreSQL, Auth, RLS)
- **Deployment:** Vercel

## Security
- Utilizes strict **Row Level Security (RLS)** in Supabase to ensure data isolation.
- Patients can only access their own appointments.
- Doctors can only access data pertaining to their specific consultations.
- Secure token generation using database triggers and advisory locks for absolute concurrency safety.

## Setup Instructions

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Duplicate `.env.example` to `.env` and configure your Supabase URL and Anon Key.
4. Run the provided `supabase_rls.sql` in your Supabase SQL editor to set up the database schema, triggers, and RLS policies.
5. Run `npm run dev` to start the local development server.

## License
MIT License
