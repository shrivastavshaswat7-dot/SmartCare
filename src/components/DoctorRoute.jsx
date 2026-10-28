import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { guardRedirect } from '../lib/roleRoutes'

function DoctorRoute({ children }) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  const redirect = guardRedirect('doctor', { user, role })
  if (redirect) {
    return <Navigate to={redirect} replace />
  }

  return children
}

export default DoctorRoute
