import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import './Auth.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState('patient') // 'patient', 'doctor', or 'admin'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError, role: actualRole } = await signIn({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const formatRole = (r) => r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Unknown'

    // Strict role matching
    if (loginRole !== actualRole) {
      await signOut()
      setError(`This account is registered as a ${formatRole(actualRole)}. Please use ${formatRole(actualRole)} Login.`)
      setLoading(false)
      return
    }

    // Navigate to appropriate dashboard based on exact role match
    if (actualRole === 'admin') {
      navigate('/admin')
    } else if (actualRole === 'doctor') {
      navigate('/doctor')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">🏥 SmartCare</h1>
        <h2 className="auth-subtitle">Welcome back</h2>

        <div className="role-selector" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button 
            className={`role-btn ${loginRole === 'patient' ? 'active' : ''}`}
            onClick={() => { setLoginRole('patient'); setError(''); }}
          >
            🧑‍⚕️ Patient Login
          </button>
          <button 
            className={`role-btn ${loginRole === 'doctor' ? 'active' : ''}`}
            onClick={() => { setLoginRole('doctor'); setError(''); }}
          >
            🩺 Doctor Login
          </button>
          <button 
            className={`role-btn ${loginRole === 'admin' ? 'active' : ''}`}
            onClick={() => { setLoginRole('admin'); setError(''); }}
          >
            ⚙️ Admin Login
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : `Sign In as ${loginRole === 'admin' ? 'Admin' : loginRole === 'doctor' ? 'Doctor' : 'Patient'}`}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
