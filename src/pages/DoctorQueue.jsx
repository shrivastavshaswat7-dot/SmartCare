import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './DoctorQueue.css'

const formatTimeRange = (start, end, fallback) => {
  if (!start || !end) return fallback ? fallback.slice(0, 5) : '—';
  const format12 = (time24) => {
    const [h, m] = time24.split(':')
    let hrs = parseInt(h, 10)
    const ampm = hrs >= 12 ? 'PM' : 'AM'
    hrs = hrs % 12 || 12
    return `${hrs}:${m} ${ampm}`
  }
  return `${format12(start)} – ${format12(end)}`
}

function DoctorQueue() {
  const { user } = useAuth()

  const [doctorRecord, setDoctorRecord] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [profilesMap, setProfilesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Consultation modal state
  const [consultingApptId, setConsultingApptId] = useState(null)
  const [consultNotes, setConsultNotes] = useState('')
  const [consultPrescription, setConsultPrescription] = useState('')
  const [savingConsult, setSavingConsult] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  const doctorNavItems = [
    { label: 'Dashboard', path: '/doctor', icon: '📊' },
    { label: "Today's Queue", path: '/doctor/queue', icon: '⏳' },
    { label: 'Consultation History', path: '/doctor/history', icon: '📁' }
  ]

  const fetchQueueData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      // 1. Get doctor record
      const { data: docData, error: docErr } = await supabase
        .from('doctors')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (docErr || !docData) {
        setError('No doctor record found for your account.')
        return
      }
      setDoctorRecord(docData)

      // 2. Get today's appointments
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', docData.id)
        .eq('appointment_date', todayStr)
        .order('token_number', { ascending: true })

      if (apptErr) throw apptErr
      setAppointments(apptData || [])

      // 3. Fetch patient profiles
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

      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching queue:', err)
      setError('Failed to load queue: ' + err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user.id, todayStr])

  useEffect(() => {
    fetchQueueData()
  }, [fetchQueueData])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQueueData(true)
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchQueueData])

  // Split appointments
  const currentConsulting = appointments.find(a => a.status === 'consulting')

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

  // Start consultation for a specific patient
  const handleStartConsultation = async (appt) => {
    setActionLoading(true)
    setFeedback(null)

    try {
      // Complete current consulting patient if any
      if (currentConsulting && currentConsulting.id !== appt.id) {
        const { error: compErr } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', currentConsulting.id)

        if (compErr) throw compErr
      }

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

      await fetchQueueData(true)
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

  // Open consultation modal
  const handleOpenConsultation = async (appt) => {
    setConsultingApptId(appt.id)
    setConsultNotes('')
    setConsultPrescription('')

    try {
      const { data, error } = await supabase
        .from('consultations')
        .select('notes, prescription')
        .eq('appointment_id', appt.id)
        .maybeSingle()
        
      if (data && !error) {
        setConsultNotes(data.notes || '')
        setConsultPrescription(data.prescription || '')
      }
    } catch (err) {
      console.error('Error loading existing consultation:', err)
    }
  }

  // Close consultation modal
  const handleCloseConsultation = () => {
    setConsultingApptId(null)
    setConsultNotes('')
    setConsultPrescription('')
  }

  // Save consultation and mark as completed
  const handleSaveConsultation = async (markComplete = true) => {
    if (!consultingApptId) return

    setSavingConsult(true)
    setFeedback(null)

    try {
      // Upsert consultation record (prevent duplicates)
      const { error: consultErr } = await supabase
        .from('consultations')
        .upsert(
          {
            appointment_id: consultingApptId,
            doctor_id: doctorRecord.id,
            notes: consultNotes,
            prescription: consultPrescription
          },
          { onConflict: 'appointment_id' }
        )

      if (consultErr) throw consultErr

      // Mark appointment as completed if requested
      if (markComplete) {
        const { error: updateErr } = await supabase
          .from('appointments')
          .update({ status: 'completed' })
          .eq('id', consultingApptId)

        if (updateErr) throw updateErr
      }

      setFeedback({
        type: 'success',
        message: markComplete
          ? 'Consultation saved and patient marked as completed.'
          : 'Consultation notes saved.'
      })

      handleCloseConsultation()
      await fetchQueueData(true)
    } catch (err) {
      console.error('Error saving consultation:', err)
      setFeedback({
        type: 'error',
        message: 'Could not save consultation: ' + err.message
      })
    } finally {
      setSavingConsult(false)
    }
  }

  // Mark appointment as cancelled
  const handleCancelAppointment = async (apptId) => {
    const appt = appointments.find(a => a.id === apptId)
    if (!window.confirm(`Mark Token #${appt?.token_number} as Absent / Cancelled?`)) return

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
        message: `Token #${appt?.token_number} marked as cancelled.`
      })

      await fetchQueueData(true)
    } catch (err) {
      setFeedback({
        type: 'error',
        message: 'Could not cancel appointment: ' + err.message
      })
    } finally {
      setActionLoading(false)
    }
  }

  // Find the appointment for the consultation modal
  const consultModalAppt = appointments.find(a => a.id === consultingApptId)

  return (
    <DashboardLayout
      title="Today's Queue"
      subtitle={doctorRecord ? `${doctorRecord.name} — ${todayStr}` : 'Loading...'}
      navItems={doctorNavItems}
      roleLabel="Doctor Portal"
      showBookCta={false}
    >
      <div className="doctor-queue">
        {loading ? (
          <div className="doctor-loading">Loading queue data...</div>
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

            {/* Controls */}
            <div className="queue-controls-bar">
              <div className="queue-controls-left">
                <h3>⚡ Queue Control</h3>
                {lastRefreshed && (
                  <span className="last-refreshed-text">
                    Last refreshed: {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="queue-controls-right">
                <button
                  className="doc-btn doc-btn-outline"
                  onClick={() => fetchQueueData(true)}
                  disabled={refreshing}
                >
                  {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
                </button>
                {!currentConsulting && waitingAppointments.length > 0 && (
                  <button
                    className="doc-btn doc-btn-primary"
                    onClick={() => handleStartConsultation(waitingAppointments[0])}
                    disabled={actionLoading}
                  >
                    ▶ Call Next Patient
                  </button>
                )}
              </div>
            </div>

            {/* Currently Consulting */}
            {currentConsulting && (
              <div className="consulting-banner">
                <div className="consulting-banner-info">
                  <div className="consulting-banner-avatar">
                    {(profilesMap[currentConsulting.patient_id]?.name || 'P').charAt(0).toUpperCase()}
                  </div>
                  <div className="consulting-banner-details">
                    <h4>
                      🟢 Now Consulting: {profilesMap[currentConsulting.patient_id]?.name || 'Patient'}
                    </h4>
                    <div className="consulting-banner-meta">
                      <span>Token #{currentConsulting.token_number}</span>
                      <span>🕐 {formatTimeRange(currentConsulting.slot_start, currentConsulting.slot_end, currentConsulting.appointment_time)}</span>
                      <span>{currentConsulting.visit_type === 'follow_up' ? 'Follow-up' : 'New'}</span>
                      {(currentConsulting.priority || '').toLowerCase() === 'emergency' && (
                        <span>🚨 Emergency</span>
                      )}
                      {profilesMap[currentConsulting.patient_id]?.phone && (
                        <span>📱 {profilesMap[currentConsulting.patient_id].phone}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="consulting-banner-actions">
                  <button
                    className="doc-btn"
                    onClick={() => handleOpenConsultation(currentConsulting)}
                    disabled={actionLoading}
                  >
                    📝 Write Notes
                  </button>
                  <button
                    className="doc-btn doc-btn-complete"
                    onClick={() => handleOpenConsultation(currentConsulting)}
                    disabled={actionLoading}
                  >
                    ✅ Complete Consultation
                  </button>
                </div>
              </div>
            )}

            {/* Waiting Queue Table */}
            <div className="queue-table-container">
              <div className="queue-table-header">
                <h4>
                  ⏳ Waiting Patients
                  {waitingAppointments.length > 0 && (
                    <span className="queue-count-badge">{waitingAppointments.length}</span>
                  )}
                </h4>
              </div>
              <div className="queue-table-scroll">
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Patient</th>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingAppointments.length === 0 ? (
                      <tr className="queue-empty-row">
                        <td colSpan="5">
                          🎉 No patients waiting — all caught up!
                        </td>
                      </tr>
                    ) : (
                      waitingAppointments.map((appt) => {
                        const isEmergency = (appt.priority || '').toLowerCase() === 'emergency'
                        const patient = profilesMap[appt.patient_id]
                        return (
                          <tr key={appt.id} className={isEmergency ? 'emergency-table-row' : ''}>
                            <td>
                              <span className="table-token-badge">#{appt.token_number}</span>
                            </td>
                            <td>
                              <div className="table-patient-cell">
                                <span className="patient-cell-name">{patient?.name || 'Patient'}</span>
                                {patient?.phone && (
                                  <span className="patient-cell-contact">{patient.phone}</span>
                                )}
                              </div>
                            </td>
                            <td>{formatTimeRange(appt.slot_start, appt.slot_end, appt.appointment_time)}</td>
                            <td>
                              <span className={`type-badge ${appt.visit_type === 'follow_up' ? 'follow-up' : 'new'}`}>
                                {appt.visit_type === 'follow_up' ? 'Follow-up' : 'New'}
                              </span>
                            </td>
                            <td>
                              {isEmergency ? (
                                <span className="priority-badge-emergency">🚨 Emergency</span>
                              ) : (
                                <span className="priority-badge-normal">Normal</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="doc-btn doc-btn-primary"
                                  onClick={() => handleStartConsultation(appt)}
                                  disabled={actionLoading}
                                  title="Start consultation with this patient"
                                >
                                  ▶ Start
                                </button>
                                <button
                                  className="doc-btn doc-btn-danger"
                                  onClick={() => handleCancelAppointment(appt.id)}
                                  disabled={actionLoading}
                                  title="Mark as absent / cancel"
                                >
                                  ✕
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
            </div>

            {/* Past Appointments */}
            {pastAppointments.length > 0 && (
              <div className="past-section">
                <button
                  className="past-toggle-btn"
                  onClick={() => setShowPast(!showPast)}
                >
                  {showPast ? '▲ Hide' : '▼ Show'} Completed / Cancelled ({pastAppointments.length})
                </button>

                {showPast && (
                  <div className="queue-table-container">
                    <div className="queue-table-scroll">
                      <table className="queue-table">
                        <thead>
                          <tr>
                            <th>Token</th>
                            <th>Patient</th>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Priority</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pastAppointments.map((appt) => {
                            const patient = profilesMap[appt.patient_id]
                            const isEmergency = (appt.priority || '').toLowerCase() === 'emergency'
                            return (
                              <tr key={appt.id}>
                                <td>
                                  <span className="table-token-badge">#{appt.token_number}</span>
                                </td>
                                <td>{patient?.name || 'Patient'}</td>
                                <td>{formatTimeRange(appt.slot_start, appt.slot_end, appt.appointment_time)}</td>
                                <td>
                                  <span className={`type-badge ${appt.visit_type === 'follow_up' ? 'follow-up' : 'new'}`}>
                                    {appt.visit_type === 'follow_up' ? 'Follow-up' : 'New'}
                                  </span>
                                </td>
                                <td>
                                  {isEmergency ? (
                                    <span className="priority-badge-emergency">🚨 Emergency</span>
                                  ) : (
                                    <span className="priority-badge-normal">Normal</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`status-pill-${appt.status}`}>
                                    {appt.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Consultation Modal */}
        {consultModalAppt && (
          <div className="consultation-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseConsultation()
          }}>
            <div className="consultation-modal">
              <div className="modal-header">
                <h3>📝 Consultation — Token #{consultModalAppt.token_number}</h3>
                <button className="modal-close-btn" onClick={handleCloseConsultation}>✕</button>
              </div>

              <div className="modal-body">
                {/* Patient Info */}
                <div className="modal-patient-info">
                  <div className="modal-info-row">
                    <span className="modal-info-label">Patient</span>
                    <span className="modal-info-value">
                      {profilesMap[consultModalAppt.patient_id]?.name || 'Patient'}
                    </span>
                  </div>
                  {profilesMap[consultModalAppt.patient_id]?.phone && (
                    <div className="modal-info-row">
                      <span className="modal-info-label">Phone</span>
                      <span className="modal-info-value">
                        {profilesMap[consultModalAppt.patient_id].phone}
                      </span>
                    </div>
                  )}
                  <div className="modal-info-row">
                    <span className="modal-info-label">Token</span>
                    <span className="modal-info-value">#{consultModalAppt.token_number}</span>
                  </div>
                  <div className="modal-info-row">
                    <span className="modal-info-label">Date</span>
                    <span className="modal-info-value">{consultModalAppt.appointment_date}</span>
                  </div>
                  <div className="modal-info-row">
                    <span className="modal-info-label">Time</span>
                    <span className="modal-info-value">{formatTimeRange(consultModalAppt.slot_start, consultModalAppt.slot_end, consultModalAppt.appointment_time)}</span>
                  </div>
                  <div className="modal-info-row">
                    <span className="modal-info-label">Type</span>
                    <span className="modal-info-value">{consultModalAppt.visit_type === 'follow_up' ? 'Follow-up' : 'New Consultation'}</span>
                  </div>
                  <div className="modal-info-row">
                    <span className="modal-info-label">Priority</span>
                    <span className="modal-info-value">
                      {(consultModalAppt.priority || 'normal').toLowerCase() === 'emergency'
                        ? '🚨 Emergency'
                        : 'Normal'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div className="modal-field">
                  <label htmlFor="consult-notes">Consultation Notes</label>
                  <textarea
                    id="consult-notes"
                    value={consultNotes}
                    onChange={(e) => setConsultNotes(e.target.value)}
                    placeholder="Enter diagnosis, observations, follow-up instructions..."
                    rows={4}
                  />
                </div>

                {/* Prescription */}
                <div className="modal-field">
                  <label htmlFor="consult-prescription">Prescription</label>
                  <textarea
                    id="consult-prescription"
                    value={consultPrescription}
                    onChange={(e) => setConsultPrescription(e.target.value)}
                    placeholder="Enter prescribed medications, dosage, and instructions..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="doc-btn doc-btn-outline"
                  onClick={handleCloseConsultation}
                  disabled={savingConsult}
                >
                  Cancel
                </button>
                <button
                  className="doc-btn doc-btn-primary"
                  onClick={() => handleSaveConsultation(false)}
                  disabled={savingConsult}
                >
                  {savingConsult ? 'Saving...' : '💾 Save Notes'}
                </button>
                <button
                  className="doc-btn doc-btn-success"
                  onClick={() => handleSaveConsultation(true)}
                  disabled={savingConsult}
                >
                  {savingConsult ? 'Saving...' : '✅ Complete & Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default DoctorQueue
