import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './DoctorHistory.css'

function DoctorHistory() {
  const { user } = useAuth()

  const [doctorRecord, setDoctorRecord] = useState(null)
  const [consultations, setConsultations] = useState([])
  const [profilesMap, setProfilesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const doctorNavItems = [
    { label: 'Dashboard', path: '/doctor', icon: '📊' },
    { label: "Today's Queue", path: '/doctor/queue', icon: '⏳' },
    { label: 'Consultation History', path: '/doctor/history', icon: '📁' }
  ]

  const fetchHistory = useCallback(async () => {
    setLoading(true)
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
        setLoading(false)
        return
      }
      setDoctorRecord(docData)

      // 2. Fetch consultations with appointment data
      //    Join consultations → appointments to get date, token, patient_id, priority
      let query = supabase
        .from('consultations')
        .select(`
          id,
          notes,
          prescription,
          created_at,
          appointment_id,
          appointments (
            id,
            token_number,
            appointment_date,
            appointment_time,
            patient_id,
            priority,
            status
          )
        `)
        .eq('doctor_id', docData.id)
        .order('created_at', { ascending: false })

      const { data: consultData, error: consultErr } = await query
      if (consultErr) throw consultErr

      setConsultations(consultData || [])

      // 3. Fetch patient profiles for names
      const patientIds = [
        ...new Set(
          (consultData || [])
            .map(c => c.appointments?.patient_id)
            .filter(Boolean)
        )
      ]
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
      console.error('Error loading history:', err)
      setError('Failed to load consultation history: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Filter consultations by search and date
  const filteredConsultations = consultations.filter(c => {
    const appt = c.appointments
    if (!appt) return false

    // Date filter
    if (dateFilter && appt.appointment_date !== dateFilter) return false

    // Search filter (patient name, notes, prescription)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const patientName = (profilesMap[appt.patient_id]?.name || '').toLowerCase()
      const notes = (c.notes || '').toLowerCase()
      const prescription = (c.prescription || '').toLowerCase()
      const token = String(appt.token_number || '')

      if (
        !patientName.includes(query) &&
        !notes.includes(query) &&
        !prescription.includes(query) &&
        !token.includes(query)
      ) {
        return false
      }
    }

    return true
  })

  return (
    <DashboardLayout
      title="Consultation History"
      subtitle={doctorRecord ? `${doctorRecord.name} — Past Consultations` : 'Loading...'}
      navItems={doctorNavItems}
      roleLabel="Doctor Portal"
      showBookCta={false}
    >
      <div className="doctor-history">
        {loading ? (
          <div className="doctor-loading">Loading consultation history...</div>
        ) : error ? (
          <div className="doctor-error">{error}</div>
        ) : (
          <>
            {/* Filters */}
            <div className="history-filters">
              <div className="history-filters-left">
                <h3>📁 History</h3>
                <input
                  type="text"
                  className="history-search-input"
                  placeholder="Search patient, notes, prescription..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <input
                  type="date"
                  className="history-date-input"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
                {dateFilter && (
                  <button
                    className="doc-btn doc-btn-outline"
                    onClick={() => setDateFilter('')}
                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  >
                    ✕ Clear Date
                  </button>
                )}
              </div>
              <span className="history-count">
                {filteredConsultations.length} consultation{filteredConsultations.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* History Table */}
            <div className="history-table-container">
              <div className="history-table-scroll">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Patient</th>
                      <th>Date</th>
                      <th>Notes</th>
                      <th>Prescription</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConsultations.length === 0 ? (
                      <tr className="history-empty-row">
                        <td colSpan="6">
                          <span className="history-empty-icon">📋</span>
                          {searchQuery || dateFilter
                            ? 'No consultations match your filters.'
                            : 'No consultations recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredConsultations.map((c) => {
                        const appt = c.appointments
                        const patient = profilesMap[appt?.patient_id]
                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="table-token-badge">#{appt?.token_number}</span>
                            </td>
                            <td>
                              <div className="table-patient-cell">
                                <span className="patient-cell-name">{patient?.name || 'Patient'}</span>
                                {patient?.phone && (
                                  <span className="patient-cell-contact">{patient.phone}</span>
                                )}
                              </div>
                            </td>
                            <td>{appt?.appointment_date || '—'}</td>
                            <td>
                              <div className="history-notes-cell">
                                {c.notes || <em style={{ color: 'var(--text-light)' }}>No notes</em>}
                              </div>
                            </td>
                            <td>
                              <div className="history-prescription-cell">
                                {c.prescription || <em style={{ color: 'var(--text-light)' }}>No prescription</em>}
                              </div>
                            </td>
                            <td>
                              {c.created_at
                                ? new Date(c.created_at).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

export default DoctorHistory
