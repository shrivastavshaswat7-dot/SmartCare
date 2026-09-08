import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './AdminQueueControl.css'

function AdminQueueControl() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialDoctor = searchParams.get('doctor') || ''
  const initialDate = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const [selectedDoctor, setSelectedDoctor] = useState(initialDoctor)
  const [selectedDate, setSelectedDate] = useState(initialDate)

  const [doctors, setDoctors] = useState([])
  const [departmentsMap, setDepartmentsMap] = useState({})
  const [profilesMap, setProfilesMap] = useState({})
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'error', message: '' }
  const [showPastSection, setShowPastSection] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const adminNavItems = [
    { label: 'Overview', path: '/admin', icon: '📊' },
    { label: 'Queue Control', path: '/admin/queue', icon: '⚡' }
  ]

  // Keep URL search params in sync when doctor or date changes
  const updateUrlParams = (docId, dateVal) => {
    const params = {}
    if (docId) params.doctor = docId
    if (dateVal) params.date = dateVal
    setSearchParams(params)
  }

  // 1. Initial lookup fetch: doctors, departments, profiles
  useEffect(() => {
    async function loadInitialLookups() {
      try {
        const [docsRes, deptsRes, profsRes] = await Promise.all([
          supabase.from('doctors').select('*').order('name'),
          supabase.from('departments').select('*'),
          supabase.from('profiles').select('id, name, email, phone')
        ])

        if (docsRes.data && docsRes.data.length > 0) {
          setDoctors(docsRes.data)
          // If no doctor selected yet, default to the first one or URL param
          if (!selectedDoctor) {
            const firstDocId = initialDoctor || String(docsRes.data[0].id)
            setSelectedDoctor(firstDocId)
            updateUrlParams(firstDocId, selectedDate)
          }
        }

        if (deptsRes.data) {
          const dMap = {}
          deptsRes.data.forEach(d => { dMap[d.id] = d })
          setDepartmentsMap(dMap)
        }

        if (profsRes.data) {
          const pMap = {}
          profsRes.data.forEach(p => { pMap[p.id] = p })
          setProfilesMap(pMap)
        }
      } catch (err) {
        console.error('Error loading lookups:', err)
        setFeedback({ type: 'error', message: 'Failed to load doctors list: ' + err.message })
      }
    }

    loadInitialLookups()
  }, [])

  // 2. Fetch appointments for selected doctor + date
  const fetchQueueData = useCallback(async (isManual = false) => {
    if (!selectedDoctor) return
    if (isManual) setRefreshing(true)
    else setLoading(true)

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', selectedDoctor)
        .eq('appointment_date', selectedDate)
        .order('token_number', { ascending: true })

      if (error) {
        if (error.code === '42501' || error.message.includes('policy')) {
          setFeedback({
            type: 'error',
            message: `RLS Error: ${error.message}. Please apply the Admin RLS policies to allow reading/updating appointments.`
          })
        } else {
          throw error
        }
      }

      setAppointments(data || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching queue:', err)
      setFeedback({ type: 'error', message: 'Failed to load queue: ' + (err.message || 'Unknown error') })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDoctor, selectedDate])

  useEffect(() => {
    if (selectedDoctor) {
      fetchQueueData()
    }
  }, [selectedDoctor, selectedDate, fetchQueueData])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!selectedDoctor) return
    const interval = setInterval(() => {
      fetchQueueData(true)
    }, 15000)
    return () => clearInterval(interval)
  }, [selectedDoctor, selectedDate, fetchQueueData])

  // Split appointments into categories
  const currentConsulting = appointments.find(a => a.status === 'consulting')

  // Waiting appointments sorted by emergency priority first, then token number ascending
  const waitingAppointments = appointments
    .filter(a => a.status === 'waiting')
    .sort((a, b) => {
      const prioA = (a.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
      const prioB = (b.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
      if (prioA !== prioB) return prioA - prioB
      return (a.token_number || 0) - (b.token_number || 0)
    })

  const pastAppointments = appointments.filter(
    a => a.status === 'completed' || a.status === 'cancelled'
  )

  const emergencyWaitingCount = waitingAppointments.filter(
    a => (a.priority || '').toLowerCase() === 'emergency'
  ).length

  // Handlers
  const handleDoctorChange = (e) => {
    const docId = e.target.value
    setSelectedDoctor(docId)
    updateUrlParams(docId, selectedDate)
  }

  const handleDateChange = (e) => {
    const dVal = e.target.value
    setSelectedDate(dVal)
    updateUrlParams(selectedDoctor, dVal)
  }

  // Safest "Call Next Patient" Flow (from Section 4 of implementation plan)
  const handleCallNextPatient = async () => {
    if (waitingAppointments.length === 0) {
      setFeedback({ type: 'error', message: 'No waiting patients in queue for this doctor today.' })
      return
    }

    const nextPatient = waitingAppointments[0]
    const nextPatientProfile = profilesMap[nextPatient.patient_id]
    const nextPatientName = nextPatientProfile?.name || `Token #${nextPatient.token_number}`
    const isEmergency = (nextPatient.priority || '').toLowerCase() === 'emergency'

    setActionLoading(true)
    setFeedback(null)

    try {
      // Step 1: If there is a patient currently consulting, mark them as completed
      if (currentConsulting) {
        const { error: compErr } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', currentConsulting.id)

        if (compErr) throw compErr
      }

      // Step 2: Set next waiting patient to 'consulting'
      const { error: callErr } = await supabase
        .from('appointments')
        .update({ status: 'consulting' })
        .eq('id', nextPatient.id)

      if (callErr) throw callErr

      // Step 3: Success feedback and refresh
      setFeedback({
        type: 'success',
        message: `Now Consulting: Token #${nextPatient.token_number} (${nextPatientName})${
          isEmergency ? ' — 🚨 EMERGENCY CASE' : ''
        }`
      })

      await fetchQueueData(true)
    } catch (err) {
      console.error('Error calling next patient:', err)
      setFeedback({
        type: 'error',
        message: 'Could not call next patient: ' + (err.message || 'Check Supabase RLS UPDATE policy')
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Mark Consultation Completed
  const handleCompleteConsultation = async (apptId) => {
    const appt = appointments.find(a => a.id === apptId)
    const token = appt?.token_number || ''

    setActionLoading(true)
    setFeedback(null)

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', apptId)

      if (error) throw error

      setFeedback({
        type: 'success',
        message: `Consultation for Token #${token} marked as completed.`
      })

      await fetchQueueData(true)
    } catch (err) {
      console.error('Error completing consultation:', err)
      setFeedback({
        type: 'error',
        message: 'Could not complete consultation: ' + (err.message || 'Check Supabase RLS UPDATE policy')
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Call a specific patient directly from the queue table
  const handleCallSpecificPatient = async (targetAppt) => {
    const targetProfile = profilesMap[targetAppt.patient_id]
    const targetName = targetProfile?.name || `Token #${targetAppt.token_number}`

    setActionLoading(true)
    setFeedback(null)

    try {
      // Step 1: Complete current consulting if any
      if (currentConsulting && currentConsulting.id !== targetAppt.id) {
        const { error: compErr } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', currentConsulting.id)

        if (compErr) throw compErr
      }

      // Step 2: Set target to consulting
      const { error: callErr } = await supabase
        .from('appointments')
        .update({ status: 'consulting' })
        .eq('id', targetAppt.id)

      if (callErr) throw callErr

      setFeedback({
        type: 'success',
        message: `Called Token #${targetAppt.token_number} (${targetName}) into consultation cabin.`
      })

      await fetchQueueData(true)
    } catch (err) {
      console.error('Error calling patient:', err)
      setFeedback({
        type: 'error',
        message: 'Could not call patient: ' + (err.message || 'Check Supabase RLS UPDATE policy')
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Cancel / Skip patient
  const handleCancelAppointment = async (apptId) => {
    const appt = appointments.find(a => a.id === apptId)
    const token = appt?.token_number || ''

    if (!window.confirm(`Are you sure you want to mark Token #${token} as Absent / Cancelled?`)) {
      return
    }

    setActionLoading(true)
    setFeedback(null)

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apptId)

      if (error) throw error

      setFeedback({
        type: 'success',
        message: `Token #${token} has been marked as cancelled.`
      })

      await fetchQueueData(true)
    } catch (err) {
      console.error('Error cancelling appointment:', err)
      setFeedback({
        type: 'error',
        message: 'Could not cancel appointment: ' + (err.message || 'Check Supabase RLS UPDATE policy')
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Selected doctor details
  const activeDoctorObj = doctors.find(d => String(d.id) === String(selectedDoctor))
  const activeDeptObj = activeDoctorObj ? departmentsMap[activeDoctorObj.department_id] : null

  return (
    <DashboardLayout
      title="Admin Queue Control"
      subtitle="Live consultation control, call next patient, and triage emergency queues"
      navItems={adminNavItems}
      roleLabel="Admin / Reception"
      showBookCta={false}
    >
      <div className="queue-control-container">
        {/* Selector & Sync Bar */}
        <div className="qc-selector-bar">
          <div className="qc-selectors-left">
            <div className="qc-field-group">
              <label htmlFor="qc-doctor">Doctor Cabin</label>
              <select
                id="qc-doctor"
                className="qc-select"
                value={selectedDoctor}
                onChange={handleDoctorChange}
              >
                {doctors.map(doc => {
                  const dept = departmentsMap[doc.department_id]
                  return (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} {dept ? `(${dept.name})` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="qc-field-group">
              <label htmlFor="qc-date">Queue Date</label>
              <input
                id="qc-date"
                type="date"
                className="qc-date-input"
                value={selectedDate}
                onChange={handleDateChange}
              />
            </div>
          </div>

          <div className="qc-controls-right">
            <div className="qc-sync-badge">
              <span className="sync-dot" />
              <span>Live Auto-Sync (15s)</span>
            </div>

            <button
              className="qc-refresh-btn"
              onClick={() => fetchQueueData(true)}
              disabled={refreshing || loading || actionLoading}
            >
              <span className={refreshing ? 'spinning' : ''}>↻</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Feedback Alert Banners */}
        {feedback && (
          <div className={`qc-alert qc-alert-${feedback.type}`}>
            <span>{feedback.message}</span>
            <button
              className="qc-alert-close"
              onClick={() => setFeedback(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Doctor Summary Stats */}
        <div className="qc-stats-row">
          <div className="qc-mini-stat">
            <div className="qc-mini-stat-icon">📋</div>
            <div className="qc-mini-stat-info">
              <span className="qc-mini-stat-val">{appointments.length}</span>
              <span className="qc-mini-stat-lbl">Total Booked</span>
            </div>
          </div>

          <div className="qc-mini-stat">
            <div className="qc-mini-stat-icon">⏳</div>
            <div className="qc-mini-stat-info">
              <span className="qc-mini-stat-val" style={{ color: '#d97706' }}>
                {waitingAppointments.length}
              </span>
              <span className="qc-mini-stat-lbl">In Waiting Line</span>
            </div>
          </div>

          <div className="qc-mini-stat">
            <div className="qc-mini-stat-icon">🩺</div>
            <div className="qc-mini-stat-info">
              <span className="qc-mini-stat-val" style={{ color: '#16a34a' }}>
                {currentConsulting ? `#${currentConsulting.token_number}` : 'Idle'}
              </span>
              <span className="qc-mini-stat-lbl">Currently Consulting</span>
            </div>
          </div>

          <div className="qc-mini-stat">
            <div className="qc-mini-stat-icon">✅</div>
            <div className="qc-mini-stat-info">
              <span className="qc-mini-stat-val" style={{ color: '#64748b' }}>
                {pastAppointments.filter(a => a.status === 'completed').length}
              </span>
              <span className="qc-mini-stat-lbl">Completed Today</span>
            </div>
          </div>

          {emergencyWaitingCount > 0 && (
            <div className="qc-mini-stat" style={{ border: '1px solid #fecaca', background: '#fff5f5' }}>
              <div className="qc-mini-stat-icon">🚨</div>
              <div className="qc-mini-stat-info">
                <span className="qc-mini-stat-val" style={{ color: '#dc2626' }}>
                  {emergencyWaitingCount}
                </span>
                <span className="qc-mini-stat-lbl" style={{ color: '#dc2626' }}>
                  Emergency Waiting
                </span>
              </div>
            </div>
          )}
        </div>

        {/* HERO SECTION: Currently Consulting In Cabin */}
        <section
          className={`qc-consulting-card ${
            currentConsulting ? 'qc-consulting-active' : 'qc-consulting-idle'
          }`}
        >
          {currentConsulting ? (
            (() => {
              const patient = profilesMap[currentConsulting.patient_id]
              const isEmergency =
                (currentConsulting.priority || '').toLowerCase() === 'emergency'

              return (
                <div className="qc-active-consultation">
                  <div className="qc-patient-summary">
                    <div className="qc-token-huge">
                      <span className="qc-token-huge-lbl">Token</span>
                      <span className="qc-token-huge-num">
                        #{currentConsulting.token_number}
                      </span>
                    </div>

                    <div className="qc-patient-details">
                      <h3>
                        <span>{patient?.name || `Patient #${currentConsulting.patient_id?.slice(0, 6)}`}</span>
                        <span className="qc-live-badge">● In Consultation</span>
                        {isEmergency && (
                          <span className="priority-badge-emergency">🚨 Emergency</span>
                        )}
                      </h3>

                      <div className="qc-patient-meta">
                        <span><strong>Phone:</strong> {patient?.phone || patient?.email || 'N/A'}</span>
                        <span><strong>Scheduled:</strong> {currentConsulting.appointment_time?.slice(0, 5) || '—'}</span>
                        <span><strong>Doctor:</strong> {activeDoctorObj?.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="qc-consultation-actions">
                    <button
                      className="qc-btn-complete"
                      onClick={() => handleCompleteConsultation(currentConsulting.id)}
                      disabled={actionLoading}
                    >
                      ✓ Complete Consultation
                    </button>

                    <button
                      className="qc-btn-call-next"
                      onClick={handleCallNextPatient}
                      disabled={actionLoading || waitingAppointments.length === 0}
                      title={waitingAppointments.length === 0 ? 'No waiting patients' : 'Complete current and call next'}
                    >
                      Call Next Patient →
                    </button>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="qc-idle-content">
              <div className="qc-idle-icon">🚪</div>
              <h3>Cabin is Currently Free</h3>
              <p>
                {activeDoctorObj
                  ? `${activeDoctorObj.name} has no patient in consultation right now.`
                  : 'Select a doctor to manage queue.'}
              </p>
              <button
                className="qc-btn-call-next"
                onClick={handleCallNextPatient}
                disabled={actionLoading || waitingAppointments.length === 0}
                style={{ padding: '14px 28px', fontSize: '1rem', marginTop: '8px' }}
              >
                ⚡ Call Next Patient in Line
                {waitingAppointments.length > 0
                  ? ` (Token #${waitingAppointments[0].token_number})`
                  : ' (0 Waiting)'}
              </button>
            </div>
          )}
        </section>

        {/* ACTIVE WAITING QUEUE LIST */}
        <section className="qc-queue-section">
          <div className="qc-section-header">
            <div className="qc-section-title-group">
              <h3>
                <span>⏳ Active Waiting Queue</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>
                  ({waitingAppointments.length} Waiting)
                </span>
              </h3>
              <p>Sorted by Emergency Priority first, then Token Number ascending</p>
            </div>

            <div className="qc-priority-note">
              <span>🚨 Emergency cases automatically take precedence in queue order</span>
            </div>
          </div>

          <div className="table-scroll">
            <table className="qc-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Order</th>
                  <th>Token</th>
                  <th>Patient Name</th>
                  <th>Contact</th>
                  <th>Scheduled</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {waitingAppointments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state-row">
                      {loading
                        ? 'Loading queue...'
                        : 'No patients currently waiting in line for this doctor.'}
                    </td>
                  </tr>
                ) : (
                  waitingAppointments.map((appt, idx) => {
                    const patient = profilesMap[appt.patient_id]
                    const isEmergency = (appt.priority || '').toLowerCase() === 'emergency'
                    const isNextInLine = idx === 0

                    return (
                      <tr
                        key={appt.id}
                        className={isEmergency ? 'row-emergency' : ''}
                      >
                        <td>
                          <span
                            className={`qc-pos-badge ${isNextInLine ? 'pos-next' : ''}`}
                            title={isNextInLine ? 'Next patient to be called' : `Position ${idx + 1}`}
                          >
                            {isNextInLine ? 'Next' : `#${idx + 1}`}
                          </span>
                        </td>
                        <td>
                          <span className="table-token-badge">
                            #{appt.token_number}
                          </span>
                        </td>
                        <td>
                          <div className="patient-cell-name">
                            {patient?.name || `Patient #${appt.patient_id?.slice(0, 6)}`}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {patient?.phone || patient?.email || '—'}
                          </span>
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
                          <span className="status-pill-waiting">
                            Waiting
                          </span>
                        </td>
                        <td>
                          <div className="qc-action-group">
                            <button
                              className="qc-btn-call-row"
                              onClick={() => handleCallSpecificPatient(appt)}
                              disabled={actionLoading}
                              title="Call this patient into cabin now"
                            >
                              Call Now →
                            </button>
                            <button
                              className="qc-btn-cancel-row"
                              onClick={() => handleCancelAppointment(appt.id)}
                              disabled={actionLoading}
                              title="Mark as absent or cancelled"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* PAST & COMPLETED APPOINTMENTS (Collapsible) */}
        <section className="qc-past-section">
          <div
            className="qc-past-header"
            onClick={() => setShowPastSection(!showPastSection)}
          >
            <h4>
              📋 Completed & Past Consultations ({pastAppointments.length})
            </h4>
            <span className="qc-toggle-arrow">
              {showPastSection ? '▲ Hide Past' : '▼ View Past'}
            </span>
          </div>

          {showPastSection && (
            <div className="table-scroll">
              <table className="qc-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient Name</th>
                    <th>Time</th>
                    <th>Priority</th>
                    <th>Final Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pastAppointments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-state-row">
                        No completed or cancelled appointments yet for this date.
                      </td>
                    </tr>
                  ) : (
                    pastAppointments.map(appt => {
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
                            {patient?.name || `Patient #${appt.patient_id?.slice(0, 6)}`}
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
                            {appt.status === 'completed' && (
                              <span className="status-pill-completed">
                                ✓ Completed
                              </span>
                            )}
                            {appt.status === 'cancelled' && (
                              <span className="status-pill-cancelled">
                                ✕ Cancelled
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

export default AdminQueueControl
