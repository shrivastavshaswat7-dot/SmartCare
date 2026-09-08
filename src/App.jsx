import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import PatientDashboard from './pages/PatientDashboard'
import BookAppointment from './pages/BookAppointment'
import PatientQueue from './pages/PatientQueue'
import AdminDashboard from './pages/AdminDashboard'
import AdminQueueControl from './pages/AdminQueueControl'
import DoctorDashboard from './pages/DoctorDashboard'
import DoctorQueue from './pages/DoctorQueue'
import DoctorHistory from './pages/DoctorHistory'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import DoctorRoute from './components/DoctorRoute'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <PatientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/book-appointment"
        element={
          <ProtectedRoute>
            <BookAppointment />
          </ProtectedRoute>
        }
      />
      <Route
        path="/queue"
        element={
          <ProtectedRoute>
            <PatientQueue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/queue"
        element={
          <AdminRoute>
            <AdminQueueControl />
          </AdminRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <DoctorRoute>
            <DoctorDashboard />
          </DoctorRoute>
        }
      />
      <Route
        path="/doctor/queue"
        element={
          <DoctorRoute>
            <DoctorQueue />
          </DoctorRoute>
        }
      />
      <Route
        path="/doctor/history"
        element={
          <DoctorRoute>
            <DoctorHistory />
          </DoctorRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
