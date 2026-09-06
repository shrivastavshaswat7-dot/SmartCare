import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import './App.css'

function Dashboard() {
  const { user, signOut } = useAuth()

  return (
    <div className="dashboard-placeholder">
      <h1>🏥 SmartCare</h1>
      <p>Welcome! You are logged in as <strong>{user?.email}</strong></p>
      <button onClick={signOut} className="logout-button">Sign Out</button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
