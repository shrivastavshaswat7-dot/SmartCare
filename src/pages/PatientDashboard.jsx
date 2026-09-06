import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './PatientDashboard.css'

function PatientDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const patientName = user?.user_metadata?.name || 'Patient'

  const [appointments, setAppointments] = useState([])
  const [doctorsMap, setDoctorsMap] = useState({})
  const [departmentsMap, setDepartmentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.id) {
      fetchPatientData()
    }
  }, [user])

  const fetchPatientData = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Fetch doctors & departments to map IDs to names
      const { data: docData } = await supabase.from('doctors').select('*')
      const { data: deptData } = await supabase.from('departments').select('*')

      const dMap = {}
      if (docData) {
        docData.forEach(d => { dMap[d.id] = d })
      }
      setDoctorsMap(dMap)

      const deptMap = {}
      if (deptData) {
        deptData.forEach(dp => { deptMap[dp.id] = dp })
      }
      setDepartmentsMap(deptMap)

      // 2. Fetch patient appointments
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', user.id)
        .order('appointment_date', { ascending: true })

      if (apptErr) throw apptErr
      setAppointments(apptData || [])
    } catch (err) {
      console.error('Error loading dashboard data:', err)
      setError('Could not load appointments data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Calculate stats
  const totalAppointments = appointments.length
  const upcomingCount = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length
  const emergencyCount = appointments.filter(a => a.priority === 'Emergency').length
  const activeToken = appointments.find(a => a.status === 'pending' || a.status === 'waiting')

  return (
    <DashboardLayout
      title="Patient Overview"
      subtitle={`Welcome back, ${patientName}`}
    >
      <div className="dashboard-content">
        {/* Banner */}
        <section className="welcome-banner">
          <div className="banner-text">
            <h2>Hello, {patientName} 👋</h2>
            <p>Track your appointments, monitor queue status, and manage your health consultations in one place.</p>
          </div>
          <button className="banner-cta" onClick={() => navigate('/book-appointment')}>
            + Book Appointment
          </button>
        </section>

        {/* Stats Grid */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">📅</div>
            <div className="stat-details">
              <span className="stat-value">{totalAppointments}</span>
              <span className="stat-label">Total Appointments</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon teal">⏳</div>
            <div className="stat-details">
              <span className="stat-value">{upcomingCount}</span>
              <span className="stat-label">Upcoming Scheduled</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon orange">🔢</div>
            <div className="stat-details">
              <span className="stat-value">{activeToken ? `#${activeToken.token_number}` : 'None'}</span>
              <span className="stat-label">Active Queue Token</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon red">🚨</div>
            <div className="stat-details">
              <span className="stat-value">{emergencyCount}</span>
              <span className="stat-label">Emergency Visits</span>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="quick-actions-section">
          <h3 className="section-title">Quick Actions</h3>
          <div className="actions-grid">
            <div className="action-card" onClick={() => navigate('/book-appointment')}>
              <div className="action-icon">📋</div>
              <h4>Book Appointment</h4>
              <p>Schedule a new doctor consultation</p>
              <span className="action-link">Book Now →</span>
            </div>

            <div className="action-card">
              <div className="action-icon">⏳</div>
              <h4>Live Queue Tracker</h4>
              <p>Check real-time queue position & wait time</p>
              <span className="action-badge">Live System</span>
            </div>

            <div className="action-card">
              <div className="action-icon">📁</div>
              <h4>Consultation Records</h4>
              <p>Access prescriptions and past history</p>
              <span className="action-badge">History</span>
            </div>
          </div>
        </section>

        {/* Upcoming Appointments List */}
        <section className="appointments-section">
          <div className="section-header">
            <h3 className="section-title">Your Appointments</h3>
            <button onClick={() => navigate('/book-appointment')} className="link-btn">
              + New Appointment
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}

          {loading ? (
            <div className="loading-card">Loading appointment schedule...</div>
          ) : appointments.length === 0 ? (
            <div className="empty-appointments">
              <div className="empty-icon">🗓️</div>
              <h4>No Appointments Scheduled</h4>
              <p>You have no upcoming or past doctor consultations booked yet.</p>
              <button
                onClick={() => navigate('/book-appointment')}
                className="empty-cta-btn"
              >
                Book Your First Appointment
              </button>
            </div>
          ) : (
            <div className="appointments-list-card">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Doctor</th>
                    <th>Department</th>
                    <th>Date & Time</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appt) => {
                    const doc = doctorsMap[appt.doctor_id]
                    const docName = doc ? doc.name : 'Doctor'
                    const dept = doc ? departmentsMap[doc.department_id] : null
                    const deptName = dept ? dept.name : 'General'

                    return (
                      <tr key={appt.id}>
                        <td>
                          <span className="table-token">#{appt.token_number}</span>
                        </td>
                        <td>
                          <div className="table-doctor-info">
                            <span className="doc-name">{docName}</span>
                          </div>
                        </td>
                        <td>
                          <span className="dept-tag">{deptName}</span>
                        </td>
                        <td>
                          <div className="datetime-cell">
                            <span className="date-text">{appt.appointment_date}</span>
                            <span className="time-text">{appt.appointment_time}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`priority-badge ${(appt.priority || 'Normal').toLowerCase()}`}>
                            {appt.priority || 'Normal'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${(appt.status || 'pending').toLowerCase()}`}>
                            {appt.status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

export default PatientDashboard
