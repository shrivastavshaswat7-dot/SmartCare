import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './Auth.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState('patient') // 'patient' or 'doctor'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: signInError } = await signIn({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    // Fetch role to determine where to redirect
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profile?.role === 'admin') {
        navigate('/admin')
        return
      }

      if (loginRole === 'doctor') {
        if (profile?.role === 'doctor') {
          navigate('/doctor')
        } else {
          // If they try to log in as doctor but aren't one, block access and sign out
          await supabase.auth.signOut()
          setError('This account is not registered as a doctor.')
          setLoading(false)
        }
      } else {
        // Patient login selected
        navigate('/')
      }
    } catch {
      navigate('/')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">🏥 SmartCare</h1>
        <h2 className="auth-subtitle">Welcome back</h2>

        <div className="role-selector">
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
            {loading ? 'Signing in...' : `Sign In as ${loginRole === 'doctor' ? 'Doctor' : 'Patient'}`}
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
