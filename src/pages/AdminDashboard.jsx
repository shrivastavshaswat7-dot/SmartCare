import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './AdminDashboard.css'

function AdminDashboard() {
  const navigate = useNavigate()

  // Default to today's date in YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [departmentsMap, setDepartmentsMap] = useState({})
  const [profilesMap, setProfilesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all') // 'all', 'waiting', 'consulting', 'completed', 'emergency'
  const [searchQuery, setSearchQuery] = useState('')

  const adminNavItems = [
    { label: 'Overview', path: '/admin', icon: '📊' },
    { label: 'Queue Control', path: '/admin/queue', icon: '⚡' }
  ]

  const fetchAdminData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      // 1. Fetch lookup data: doctors, departments, profiles
      const [docsRes, deptsRes, profilesRes] = await Promise.all([
        supabase.from('doctors').select('*').order('name'),
        supabase.from('departments').select('*'),
        supabase.from('profiles').select('id, name, email, phone')
      ])

      if (docsRes.data) setDoctors(docsRes.data)

      const deptMap = {}
      if (deptsRes.data) {
        deptsRes.data.forEach(d => { deptMap[d.id] = d })
      }
      setDepartmentsMap(deptMap)

      const pMap = {}
      if (profilesRes.data) {
        profilesRes.data.forEach(p => { pMap[p.id] = p })
      }
      setProfilesMap(pMap)

      // 2. Fetch all appointments for the selected date
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('appointment_date', selectedDate)
        .order('token_number', { ascending: true })

      if (apptErr) {
        if (apptErr.code === '42501' || apptErr.message.includes('policy')) {
          setError(
            `RLS Policy Notice: ${apptErr.message}. Ensure the "Admin can read all appointments" RLS policy is executed in Supabase.`
          )
        } else {
          throw apptErr
        }
      }

      setAppointments(apptData || [])
    } catch (err) {
      console.error('Error fetching admin overview:', err)
      setError('Failed to load appointments: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDate])

  useEffect(() => {
    fetchAdminData()
  }, [fetchAdminData])

  // Aggregate Stats
  const totalCount = appointments.length
  const waitingCount = appointments.filter(a => a.status === 'waiting').length
  const consultingCount = appointments.filter(a => a.status === 'consulting').length
  const completedCount = appointments.filter(a => a.status === 'completed').length
  const emergencyCount = appointments.filter(
    a => (a.priority || '').toLowerCase() === 'emergency'
  ).length

  // Filtered Appointments
  const filteredAppointments = appointments.filter(appt => {
    // Filter pill check
    if (activeFilter === 'waiting' && appt.status !== 'waiting') return false
    if (activeFilter === 'consulting' && appt.status !== 'consulting') return false
    if (activeFilter === 'completed' && appt.status !== 'completed') return false
    if (activeFilter === 'emergency' && (appt.priority || '').toLowerCase() !== 'emergency') return false

    // Search query check (patient name or token number)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const patient = profilesMap[appt.patient_id]
      const patientName = (patient?.name || '').toLowerCase()
      const tokenMatch = String(appt.token_number).includes(q)
      const nameMatch = patientName.includes(q)
      return tokenMatch || nameMatch
    }

    return true
  })

  // Doctor-wise queue breakdown
  const doctorQueueStats = doctors.map(doc => {
    const docAppts = appointments.filter(a => String(a.doctor_id) === String(doc.id))
    const docWaiting = docAppts.filter(a => a.status === 'waiting').length
    const docConsulting = docAppts.find(a => a.status === 'consulting')
    const docCompleted = docAppts.filter(a => a.status === 'completed').length
    const docEmergency = docAppts.filter(
      a => a.status === 'waiting' && (a.priority || '').toLowerCase() === 'emergency'
    ).length

    return {
      doctor: doc,
      total: docAppts.length,
      waiting: docWaiting,
      consulting: docConsulting,
      completed: docCompleted,
      emergencyWaiting: docEmergency
    }
  })

  return (
    <DashboardLayout
      title="Hospital Admin Overview"
      subtitle="Monitor live appointments, department queues, and patient flow"
      navItems={adminNavItems}
      roleLabel="Admin / Reception"
      showBookCta={false}
    >
      <div className="admin-dashboard">
        {/* Header Controls: Date picker & Refresh */}
        <div className="admin-header-controls">
          <div className="admin-header-title">
            <h2>Appointments & Queue Status</h2>
            <p>Real-time queue operations for {selectedDate}</p>
          </div>

          <div className="admin-controls-right">
            <div className="date-filter-group">
              <label htmlFor="admin-date">Date:</label>
              <input
                id="admin-date"
                type="date"
                className="date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <button
              className="admin-btn admin-btn-outline"
              onClick={() => fetchAdminData(true)}
              disabled={refreshing || loading}
            >
              <span className={refreshing ? 'spinning' : ''}>↻</span>
              {refreshing ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="auth-error" style={{ margin: 0 }}>
            {error}
          </div>
        )}

        {/* Hero Queue Banner */}
        <section className="admin-queue-banner">
          <div className="banner-content">
            <h3>⚡ Live Queue Management Active</h3>
            <p>
              Call the next patient in line with automatic emergency prioritization,
              mark completed consultations, and keep the hospital running smoothly.
            </p>
          </div>
          <button
            className="banner-action-btn"
            onClick={() => navigate(`/admin/queue?date=${selectedDate}`)}
          >
            Open Live Queue Control →
          </button>
        </section>

        {/* Overall Stats Cards */}
        <section className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="stat-icon blue">📋</div>
            <div className="stat-details">
              <span className="stat-value">{totalCount}</span>
              <span className="stat-label">Total Bookings</span>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="stat-icon amber">⏳</div>
            <div className="stat-details">
              <span className="stat-value">{waitingCount}</span>
              <span className="stat-label">Waiting in Queue</span>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="stat-icon green">🩺</div>
            <div className="stat-details">
              <span className="stat-value">{consultingCount}</span>
              <span className="stat-label">Now Consulting</span>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="stat-icon teal">✅</div>
            <div className="stat-details">
              <span className="stat-value">{completedCount}</span>
              <span className="stat-label">Completed</span>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="stat-icon red">🚨</div>
            <div className="stat-details">
              <span className="stat-value">{emergencyCount}</span>
              <span className="stat-label">Emergency Priority</span>
            </div>
          </div>
        </section>

        {/* Doctor Queue Summary Section */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>👨‍⚕️ Doctor Queues Today</h3>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {doctors.length} Doctors Registered
            </span>
          </div>

          <div className="doctor-cards-grid">
            {doctorQueueStats.map(({ doctor, total, waiting, consulting, completed, emergencyWaiting }) => {
              const dept = departmentsMap[doctor.department_id]
              return (
                <div key={doctor.id} className="doctor-queue-card">
                  <div className="doctor-card-header">
                    <div className="doctor-name-group">
                      <h4>{doctor.name}</h4>
                      <span className="doctor-dept-badge">{dept?.name || 'Department'}</span>
                    </div>
                    {emergencyWaiting > 0 && (
                      <span className="priority-badge-emergency">
                        🚨 {emergencyWaiting} Emergency
                      </span>
                    )}
                  </div>

                  <div className="doctor-counts-row">
                    <div className="count-col">
                      <span className="count-number waiting">{waiting}</span>
                      <span className="count-label">Waiting</span>
                    </div>
                    <div className="count-col">
                      <span className="count-number consulting">
                        {consulting ? `#${consulting.token_number}` : '—'}
                      </span>
                      <span className="count-label">In Cabin</span>
                    </div>
                    <div className="count-col">
                      <span className="count-number completed">{completed}</span>
                      <span className="count-label">Done</span>
                    </div>
                  </div>

                  <div className="doctor-card-footer">
                    <span className="now-serving-tag">
                      {consulting ? (
                        <>Serving: <strong>Token #{consulting.token_number}</strong></>
                      ) : waiting > 0 ? (
                        `${waiting} in line`
                      ) : (
                        'Cabin idle'
                      )}
                    </span>
                    <button
                      className="manage-queue-btn"
                      onClick={() =>
                        navigate(`/admin/queue?doctor=${doctor.id}&date=${selectedDate}`)
                      }
                    >
                      Control Queue →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Today's Appointments Table */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>📅 All Appointments for {selectedDate}</h3>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Showing {filteredAppointments.length} of {appointments.length}
            </span>
          </div>

          <div className="admin-table-container">
            <div className="table-filter-toolbar">
              <div className="filter-pills">
                <button
                  className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All ({totalCount})
                </button>
                <button
                  className={`filter-pill ${activeFilter === 'waiting' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('waiting')}
                >
                  Waiting ({waitingCount})
                </button>
                <button
                  className={`filter-pill ${activeFilter === 'consulting' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('consulting')}
                >
                  Consulting ({consultingCount})
                </button>
                <button
                  className={`filter-pill ${activeFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('completed')}
                >
                  Completed ({completedCount})
                </button>
                <button
                  className={`filter-pill ${activeFilter === 'emergency' ? 'active-emergency' : ''}`}
                  onClick={() => setActiveFilter('emergency')}
                >
                  🚨 Emergency ({emergencyCount})
                </button>
              </div>

              <input
                type="text"
                className="table-search-input"
                placeholder="Search patient or token..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="table-scroll">
              <table className="admin-appts-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Time</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-state-row">
                        {loading
                          ? 'Loading appointments...'
                          : 'No appointments match the selected filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map(appt => {
                      const doctor = doctors.find(d => String(d.id) === String(appt.doctor_id))
                      const dept = doctor ? departmentsMap[doctor.department_id] : null
                      const patient = profilesMap[appt.patient_id]
                      const isEmergency = (appt.priority || '').toLowerCase() === 'emergency'

                      return (
                        <tr key={appt.id}>
                          <td>
                            <span className="table-token-badge">
                              #{appt.token_number}
                            </span>
                          </td>
                          <td>
                            <div className="table-patient-cell">
                              <span className="patient-cell-name">
                                {patient?.name || `Patient #${appt.patient_id?.slice(0, 6)}`}
                              </span>
                              <span className="patient-cell-contact">
                                {patient?.phone || patient?.email || '—'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="table-patient-cell">
                              <span className="patient-cell-name">{doctor?.name || '—'}</span>
                              <span className="patient-cell-contact">{dept?.name || '—'}</span>
                            </div>
                          </td>
                          <td>
                            {appt.appointment_time ? appt.appointment_time.slice(0, 5) : '—'}
                          </td>
                          <td>
                            {isEmergency ? (
                              <span className="priority-badge-emergency">
                                🚨 Emergency
                              </span>
                            ) : (
                              <span className="priority-badge-normal">
                                Normal
                              </span>
                            )}
                          </td>
                          <td>
                            {appt.status === 'consulting' && (
                              <span className="status-pill-consulting">
                                ● Consulting
                              </span>
                            )}
                            {appt.status === 'waiting' && (
                              <span className="status-pill-waiting">
                                Waiting
                              </span>
                            )}
                            {appt.status === 'completed' && (
                              <span className="status-pill-completed">
                                Completed
                              </span>
                            )}
                            {appt.status === 'cancelled' && (
                              <span className="status-pill-cancelled">
                                Cancelled
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              className="table-action-btn"
                              onClick={() =>
                                navigate(
                                  `/admin/queue?doctor=${appt.doctor_id}&date=${selectedDate}`
                                )
                              }
                            >
                              Manage Doctor Queue →
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default AdminDashboard
