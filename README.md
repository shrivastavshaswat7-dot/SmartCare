# SmartCare — Hospital Appointment & Queue Management System

SmartCare is a role-based hospital appointment and queue management system designed to simplify appointment booking, token generation, queue management, and consultation workflows.

The system provides separate workflows for **Patients, Doctors, and Administrators**, with authentication and database access secured using Supabase Authentication and Row Level Security (RLS).

## 🚀 Live Demo

[SmartCare — Live Demo](https://smart-care-ixtawacsw-shrivastavshaswat7-8842.vercel.app/login)

> Demo application for educational/project purposes. Use dummy credentials and data.

## ✨ Features

### 👤 Patient

* Patient registration and login
* Browse departments and doctors
* Book appointments
* Select appointment date and time
* Normal and emergency priority handling
* Automatic appointment token generation
* View queue status and estimated waiting time
* View appointment and consultation information
* Secure patient-specific data access

### 👨‍⚕️ Doctor

* Dedicated doctor authentication
* Doctor dashboard
* View assigned appointments and queue
* Call the next patient
* Manage consultation workflow
* Add consultation notes and prescription
* Access doctor-specific appointment information

### 🛠️ Administrator

* Dedicated admin authentication
* Monitor hospital appointments and queues
* Manage queue operations
* View operational statistics
* Administrative access protected by role-based authorization

## 🔐 Security

* Supabase Authentication for user authentication
* Role-based access control for Patient, Doctor, and Admin users
* PostgreSQL Row Level Security (RLS)
* Patient data restricted to the authenticated patient
* Doctor access restricted to assigned appointments
* Consultation records protected against cross-doctor access
* Protected frontend routes for role-specific dashboards

## 🧠 Queue & Token Management

SmartCare generates doctor-specific appointment tokens and maintains queue ordering based on appointment priority and token number.

Example:

```text
Emergency
   ↓
Priority-based queue
   ↓
Token ordering
   ↓
Doctor calls next patient
   ↓
Consultation
   ↓
Completed
```

The system also provides an estimated waiting time based on the current queue. This is an estimate and not a guaranteed waiting time.

## 🏗️ System Architecture

```text
┌──────────────────────┐
│    React Frontend    │
│      Vite + JSX      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Supabase Services  │
│ Auth + Database + RLS│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  PostgreSQL Database │
└──────────────────────┘

GitHub ───────► Vercel
                  │
                  ▼
             Production App
```

## 🛠️ Tech Stack

| Technology       | Purpose                     |
| ---------------- | --------------------------- |
| React            | Frontend UI                 |
| Vite             | Development & build tooling |
| JavaScript / JSX | Application logic           |
| CSS              | Styling & responsive UI     |
| Supabase Auth    | Authentication              |
| PostgreSQL       | Database                    |
| Supabase RLS     | Data access control         |
| Git & GitHub     | Version control             |
| Vercel           | Deployment                  |

## 📂 Project Structure

```text
src/
├── components/
├── context/
├── lib/
├── pages/
├── App.jsx
├── App.css
├── index.css
└── main.jsx

public/
```

## ⚙️ Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/shrivastavshaswat7-dot/SmartCare
cd SmartCare
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Duplicate `.env.example` as `.env` and add your Supabase project credentials.

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Never commit your `.env` file or private credentials.

### 4. Set up the database

Run the provided `supabase_rls.sql` through the Supabase SQL Editor to configure the required database policies, triggers, and security rules.

### 5. Start the development server

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

## 🎯 Project Scope

SmartCare focuses on:

* Hospital appointment scheduling
* Doctor-wise token generation
* Queue management
* Priority-based queue handling
* Doctor consultation records
* Role-based hospital workflows

The project does not attempt to replace a complete hospital ERP system and intentionally excludes areas such as billing, pharmacy management, ambulance management, and online payments.

## 📌 Project Status

**Production deployed and functional.**

Built as a college project to explore full-stack application development, authentication, PostgreSQL database design, Row Level Security, queue management, and production deployment.

## 📄 License

MIT License
