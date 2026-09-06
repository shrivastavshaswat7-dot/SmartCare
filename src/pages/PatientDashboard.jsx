import { useAuth } from '../context/AuthContext'
import './PatientDashboard.css'

function PatientDashboard() {
  const { user, signOut } = useAuth()
  const name = user?.user_metadata?.name || 'Patient'
  const email = user?.email || ''

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">🏥 SmartCare</div>
        <button onClick={signOut} className="sign-out-btn">Sign Out</button>
      </nav>

      <main className="dashboard-main">
        <section className="welcome-section">
          <h1>Welcome, {name}</h1>
          <p className="welcome-email">{email}</p>
        </section>

        <section className="dashboard-cards">
          <div className="card">
            <div className="card-icon">📋</div>
            <h2>Book Appointment</h2>
            <p>Schedule a visit with a doctor in any department</p>
            <button className="card-btn" disabled>Coming Soon</button>
          </div>

          <div className="card">
            <div className="card-icon">⏳</div>
            <h2>My Queue</h2>
            <p>View your current queue position and estimated wait time</p>
            <button className="card-btn" disabled>Coming Soon</button>
          </div>

          <div className="card">
            <div className="card-icon">📁</div>
            <h2>Appointment History</h2>
            <p>View your past appointments and consultation notes</p>
            <button className="card-btn" disabled>Coming Soon</button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default PatientDashboard
