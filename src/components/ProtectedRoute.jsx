import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  if (role === 'doctor') {
    return <Navigate to="/doctor" replace />
  }

  return children
}

export default ProtectedRoute
