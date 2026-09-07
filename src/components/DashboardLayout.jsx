import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './DashboardLayout.css'

function DashboardLayout({ children, title, subtitle }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const patientName = user?.user_metadata?.name || 'Patient'
  const patientEmail = user?.email || ''
  const avatarInitial = patientName.charAt(0).toUpperCase()

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  const navItems = [
    { label: 'Dashboard', path: '/', icon: '📊' },
    { label: 'Book Appointment', path: '/book-appointment', icon: '➕' },
    { label: 'Live Queue Status', path: '/queue', icon: '⏳', disabled: false },
    { label: 'Medical History', path: '/#history', icon: '📁', disabled: false }
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="layout-container">
      {/* Mobile Header Bar */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <span className="brand-icon">🏥</span>
          <span className="brand-name">SmartCare</span>
        </div>
        <button
          className="mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">
            <span className="logo-icon">🏥</span>
            <div className="logo-text">
              <span className="logo-title">SmartCare</span>
              <span className="logo-subtitle">Medical Portal</span>
            </div>
          </div>
        </div>

        {/* Patient Profile Card */}
        <div className="patient-chip">
          <div className="avatar-circle">{avatarInitial}</div>
          <div className="patient-info">
            <span className="patient-name">{patientName}</span>
            <span className="patient-email">{patientEmail}</span>
            <span className="patient-role">Patient Portal</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-group-label">Main Menu</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {isActive && <span className="active-indicator" />}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="hospital-status">
            <span className="status-dot"></span>
            <span className="status-text">Emergency Services 24/7</span>
          </div>
          <button onClick={handleSignOut} className="sidebar-logout-btn">
            <span className="btn-icon">🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main Area */}
      <div className="main-wrapper">
        <header className="top-navbar">
          <div className="header-titles">
            <h1>{title || 'Dashboard'}</h1>
            {subtitle && <p className="header-subtitle">{subtitle}</p>}
          </div>

          <div className="header-actions">
            <div className="date-badge">
              <span className="calendar-icon">📅</span>
              <span>{todayStr}</span>
            </div>

            {location.pathname !== '/book-appointment' && (
              <button
                onClick={() => navigate('/book-appointment')}
                className="header-cta-btn"
              >
                <span>+ Book Appointment</span>
              </button>
            )}
          </div>
        </header>

        <main className="content-area">{children}</main>
      </div>
    </div>
  )
}

export default DashboardLayout
