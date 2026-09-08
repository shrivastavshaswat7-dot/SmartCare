import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './DoctorDashboard.css'

function DoctorDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [doctorRecord, setDoctorRecord] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [profilesMap, setProfilesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  const doctorNavItems = [
    { label: 'Dashboard', path: '/doctor', icon: '📊' },
    { label: "Today's Queue", path: '/doctor/queue', icon: '⏳' },
    { label: 'Consultation History', path: '/doctor/history', icon: '📁' }
  ]

  // Fetch doctor record linked to this profile via user_id
  const fetchDoctorData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Find the doctor record linked to this auth user
      const { data: docData, error: docErr } = await supabase
        .from('doctors')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (docErr || !docData) {
        setError(
          'No doctor record found linked to your account. ' +
          'Please ensure the doctors table has a row with user_id = your auth user ID.'
        )
        setLoading(false)
        return
      }

      setDoctorRecord(docData)

      // 2. Fetch today's appointments for this doctor
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', docData.id)
        .eq('appointment_date', todayStr)
        .order('token_number', { ascending: true })

      if (apptErr) throw apptErr
      setAppointments(apptData || [])

      // 3. Fetch patient profiles for display names
      const patientIds = [...new Set((apptData || []).map(a => a.patient_id))]
      if (patientIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email, phone')
          .in('id', patientIds)

        const pMap = {}
        if (profiles) profiles.forEach(p => { pMap[p.id] = p })
        setProfilesMap(pMap)
      }
    } catch (err) {
      console.error('Error loading doctor dashboard:', err)
      setError('Failed to load dashboard data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [user.id, todayStr])

  useEffect(() => {
    fetchDoctorData()
  }, [fetchDoctorData])

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDoctorData()
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchDoctorData])

  // Stats
  const totalToday = appointments.length
  const waitingCount = appointments.filter(a => a.status === 'waiting').length
  const consultingAppt = appointments.find(a => a.status === 'consulting')
  const completedCount = appointments.filter(a => a.status === 'completed').length
  const emergencyCount = appointments.filter(
    a => (a.priority || '').toLowerCase() === 'emergency' && a.status !== 'completed' && a.status !== 'cancelled'
  ).length

  // Waiting queue sorted: emergency first, then by token
  const waitingQueue = appointments
    .filter(a => a.status === 'waiting')
    .sort((a, b) => {
      const prioA = (a.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
      const prioB = (b.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
      if (prioA !== prioB) return prioA - prioB
      return (a.token_number || 0) - (b.token_number || 0)
    })

  // Start consultation for next patient
  const handleStartConsultation = async (appt) => {
    setActionLoading(true)
    setFeedback(null)

    try {
      // If another patient is currently consulting, complete them first
      if (consultingAppt && consultingAppt.id !== appt.id) {
        const { error: compErr } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', consultingAppt.id)

        if (compErr) throw compErr
      }

      // Set this patient to consulting
      const { error: callErr } = await supabase
        .from('appointments')
        .update({ status: 'consulting' })
        .eq('id', appt.id)

      if (callErr) throw callErr

      const patientName = profilesMap[appt.patient_id]?.name || `Token #${appt.token_number}`
      setFeedback({
        type: 'success',
        message: `Now consulting: ${patientName} (Token #${appt.token_number})`
      })

      await fetchDoctorData()
    } catch (err) {
      console.error('Error starting consultation:', err)
      setFeedback({
        type: 'error',
        message: 'Could not start consultation: ' + err.message
      })
    } finally {
      setActionLoading(false)
    }
  }

  const doctorName = doctorRecord?.name || user?.user_metadata?.name || 'Doctor'
  const specialization = doctorRecord?.specialization || ''

  return (
    <DashboardLayout
      title="Doctor Dashboard"
      subtitle={`Welcome, ${doctorName}`}
      navItems={doctorNavItems}
      roleLabel="Doctor Portal"
      showBookCta={false}
    >
      <div className="doctor-dashboard">
        {loading ? (
          <div className="doctor-loading">Loading dashboard data...</div>
        ) : error ? (
          <div className="doctor-error">{error}</div>
        ) : (
          <>
            {/* Feedback */}
            {feedback && (
              <div className={`doctor-feedback ${feedback.type}`}>
                {feedback.type === 'success' ? '✅' : '❌'} {feedback.message}
              </div>
            )}

            {/* Welcome Banner */}
            <section className="doctor-welcome-banner">
              <div className="doctor-banner-text">
                <h2>🩺 Hello, {doctorName}</h2>
                <p>
                  {waitingCount > 0
                    ? `You have ${waitingCount} patient${waitingCount > 1 ? 's' : ''} waiting for consultation today.`
                    : completedCount > 0
                    ? `Great work! You've completed ${completedCount} consultation${completedCount > 1 ? 's' : ''} today.`
                    : 'No appointments scheduled for today yet.'
                  }
                </p>
                {specialization && (
                  <span className="specialization-tag">{specialization}</span>
                )}
              </div>
              <button className="banner-queue-btn" onClick={() => navigate('/doctor/queue')}>
                ⚡ View Full Queue
              </button>
            </section>

            {/* Stats Grid */}
            <section className="doctor-stats-grid">
              <div className="doctor-stat-card">
                <div className="doctor-stat-icon blue">📅</div>
                <div className="doctor-stat-details">
                  <span className="doctor-stat-value">{totalToday}</span>
                  <span className="doctor-stat-label">Total Today</span>
                </div>
              </div>
              <div className="doctor-stat-card">
                <div className="doctor-stat-icon amber">⏳</div>
                <div className="doctor-stat-details">
                  <span className="doctor-stat-value">{waitingCount}</span>
                  <span className="doctor-stat-label">Waiting</span>
                </div>
              </div>
              <div className="doctor-stat-card">
                <div className="doctor-stat-icon green">🩺</div>
                <div className="doctor-stat-details">
                  <span className="doctor-stat-value">{consultingAppt ? 1 : 0}</span>
                  <span className="doctor-stat-label">Consulting</span>
                </div>
              </div>
              <div className="doctor-stat-card">
                <div className="doctor-stat-icon purple">✅</div>
                <div className="doctor-stat-details">
                  <span className="doctor-stat-value">{completedCount}</span>
                  <span className="doctor-stat-label">Completed</span>
                </div>
              </div>
              <div className="doctor-stat-card">
                <div className="doctor-stat-icon red">🚨</div>
                <div className="doctor-stat-details">
                  <span className="doctor-stat-value">{emergencyCount}</span>
                  <span className="doctor-stat-label">Emergency</span>
                </div>
              </div>
            </section>

            {/* Currently Consulting */}
            <section className="current-patient-section">
              <h3>🟢 Currently Consulting</h3>
              {consultingAppt ? (
                <div className="current-patient-card">
                  <div className="current-patient-info">
                    <div className="consulting-avatar">
                      {(profilesMap[consultingAppt.patient_id]?.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div className="consulting-details">
                      <h4>{profilesMap[consultingAppt.patient_id]?.name || 'Patient'}</h4>
                      <div className="consulting-meta">
                        <span className="token-tag">Token #{consultingAppt.token_number}</span>
                        <span>🕐 {consultingAppt.appointment_time}</span>
                        {(consultingAppt.priority || '').toLowerCase() === 'emergency' && (
                          <span className="emergency-tag">🚨 Emergency</span>
                        )}
                        {profilesMap[consultingAppt.patient_id]?.phone && (
                          <span>📱 {profilesMap[consultingAppt.patient_id].phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="current-patient-actions">
                    <button
                      className="doc-btn doc-btn-success"
                      onClick={() => navigate('/doctor/queue')}
                    >
                      📝 Open Consultation
                    </button>
                  </div>
                </div>
              ) : (
                <div className="no-current-patient">
                  No patient is currently being consulted.
                  {waitingCount > 0 && ' Call the next patient from the queue below.'}
                </div>
              )}
            </section>

            {/* Upcoming Queue Preview */}
            <section className="upcoming-queue-section">
              <div className="section-header">
                <h3>
                  ⏳ Waiting Queue
                  {waitingCount > 0 && (
                    <span className="queue-count-badge">{waitingCount} waiting</span>
                  )}
                </h3>
                <button
                  className="doc-btn doc-btn-outline"
                  onClick={() => navigate('/doctor/queue')}
                >
                  View Full Queue →
                </button>
              </div>

              {waitingQueue.length === 0 ? (
                <div className="doctor-empty">
                  <div className="empty-icon">🎉</div>
                  <h4>Queue Empty</h4>
                  <p>No patients are waiting. Great job!</p>
                </div>
              ) : (
                <div className="upcoming-queue-list">
                  {waitingQueue.slice(0, 5).map((appt) => {
                    const isEmergency = (appt.priority || '').toLowerCase() === 'emergency'
                    const patientName = profilesMap[appt.patient_id]?.name || 'Patient'
                    return (
                      <div
                        key={appt.id}
                        className={`queue-patient-row ${isEmergency ? 'emergency-row' : ''}`}
                      >
                        <div className="queue-patient-left">
                          <span className="queue-token">#{appt.token_number}</span>
                          <div>
                            <div className="queue-patient-name">{patientName}</div>
                            <div className="queue-patient-time">🕐 {appt.appointment_time}</div>
                          </div>
                        </div>
                        <div className="queue-patient-right">
                          {isEmergency ? (
                            <span className="priority-tag-emergency">🚨 Emergency</span>
                          ) : (
                            <span className="priority-tag-normal">Normal</span>
                          )}
                          <button
                            className="doc-btn doc-btn-primary"
                            onClick={() => handleStartConsultation(appt)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Starting...' : '▶ Start'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {waitingQueue.length > 5 && (
                    <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      +{waitingQueue.length - 5} more patients waiting...
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default DoctorDashboard
