import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function DoctorRoute({ children }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role !== 'doctor') {
    return <Navigate to="/" replace />
  }

  return children
}

export default DoctorRoute
