import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './PatientQueue.css'

// Average consultation duration estimate (minutes)
const AVG_CONSULT_MINUTES = 10

function PatientQueue() {
  const { user } = useAuth()

  const [queueItems, setQueueItems] = useState([])
  const [doctorsMap, setDoctorsMap] = useState({})
  const [departmentsMap, setDepartmentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const fetchQueueData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      // 1. Fetch lookup tables for doctor / department names
      const { data: docData } = await supabase.from('doctors').select('*')
      const { data: deptData } = await supabase.from('departments').select('*')

      const dMap = {}
      if (docData) docData.forEach(d => { dMap[d.id] = d })
      setDoctorsMap(dMap)

      const dpMap = {}
      if (deptData) deptData.forEach(dp => { dpMap[dp.id] = dp })
      setDepartmentsMap(dpMap)

      // 2. Fetch the patient's own active appointments (waiting or consulting)
      const { data: myAppts, error: myErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', user.id)
        .in('status', ['waiting', 'consulting'])
        .order('appointment_date', { ascending: true })

      if (myErr) throw myErr
      if (!myAppts || myAppts.length === 0) {
        setQueueItems([])
        setLastRefreshed(new Date())
        return
      }

      // 3. For each active appointment, fetch the queue for that doctor + date
      const results = []

      for (const appt of myAppts) {
        // Fetch all appointments for the same doctor + date that are still relevant
        const { data: queueAppts, error: qErr } = await supabase
          .from('appointments')
          .select('id, token_number, priority, status')
          .eq('doctor_id', appt.doctor_id)
          .eq('appointment_date', appt.appointment_date)
          .in('status', ['waiting', 'consulting'])

        if (qErr) {
          console.warn('Queue fetch warning:', qErr.message)
          // If RLS blocks reading other patients' rows, report clearly
          if (qErr.message.includes('policy') || qErr.code === '42501') {
            setError(
              `RLS policy prevents reading queue data: ${qErr.message}. ` +
              'The appointments table RLS must allow patients to read rows ' +
              'for the same doctor_id and appointment_date to compute queue position.'
            )
            return
          }
        }

        const allQueue = queueAppts || [appt] // fallback to own appointment only

        // Sort: emergency first (priority DESC), then token_number ASC
        const sorted = [...allQueue].sort((a, b) => {
          const prioA = (a.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
          const prioB = (b.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
          if (prioA !== prioB) return prioA - prioB
          return (a.token_number || 0) - (b.token_number || 0)
        })

        // Determine currently serving token
        const consultingAppt = sorted.find(a => a.status === 'consulting')
        const currentlyServing = consultingAppt
          ? consultingAppt.token_number
          : sorted.length > 0
            ? sorted[0].token_number
            : null

        // Find this patient's position in the sorted queue
        const position = sorted.findIndex(a => a.id === appt.id) + 1
        const estimatedWait = Math.max(0, (position - 1)) * AVG_CONSULT_MINUTES

        results.push({
          ...appt,
          queuePosition: position,
          totalInQueue: sorted.length,
          currentlyServing,
          estimatedWait,
        })
      }

      // Sort displayed queue items: emergency first, then token_number ascending
      results.sort((a, b) => {
        const prioA = (a.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
        const prioB = (b.priority || 'normal').toLowerCase() === 'emergency' ? 0 : 1
        if (prioA !== prioB) return prioA - prioB
        return (a.token_number || 0) - (b.token_number || 0)
      })

      setQueueItems(results)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error loading queue data:', err)
      setError('Could not load queue data: ' + err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    if (user?.id) fetchQueueData()
  }, [user, fetchQueueData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!user?.id) return
    const interval = setInterval(() => fetchQueueData(true), 30000)
    return () => clearInterval(interval)
  }, [user, fetchQueueData])

  const formatOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  const formatWaitTime = (minutes) => {
    if (minutes <= 0) return 'Now'
    if (minutes < 60) return `~${minutes} min`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `~${hrs}h ${mins}m` : `~${hrs}h`
  }

  return (
    <DashboardLayout
      title="Live Queue Status"
      subtitle="Track your real-time queue position and estimated wait time"
    >
      <div className="queue-page">
        {/* Header bar with refresh */}
        <div className="queue-header-bar">
          <div className="queue-header-info">
            <h3>Your Active Queue{queueItems.length > 1 ? 's' : ''}</h3>
            {lastRefreshed && (
              <span className="last-refreshed">
                Last updated: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            className="refresh-btn"
            onClick={() => fetchQueueData(true)}
            disabled={refreshing}
          >
            <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Auto-refresh notice */}
        <div className="auto-refresh-notice">
          <span className="pulse-dot" />
          Auto-refreshes every 30 seconds
        </div>

        {error && <div className="queue-error">{error}</div>}

        {loading ? (
          <div className="queue-loading">
            <div className="loading-spinner" />
            <p>Loading queue information...</p>
          </div>
        ) : queueItems.length === 0 ? (
          <div className="queue-empty">
            <div className="queue-empty-icon">🎫</div>
            <h4>No Active Queue</h4>
            <p>You don't have any appointments currently in the queue. Book an appointment to get a queue token.</p>
          </div>
        ) : (
          <div className="queue-cards">
            {queueItems.map((item) => {
              const doc = doctorsMap[item.doctor_id]
              const docName = doc ? doc.name : 'Doctor'
              const dept = doc ? departmentsMap[doc.department_id] : null
              const deptName = dept ? dept.name : 'General'
              const isBeingServed = item.status === 'consulting'

              return (
                <div
                  key={item.id}
                  className={`queue-card ${isBeingServed ? 'serving' : ''}`}
                >
                  {/* Serving badge */}
                  {isBeingServed && (
                    <div className="serving-ribbon">Currently Being Served</div>
                  )}

                  {/* Token display */}
                  <div className="queue-token-section">
                    <span className="queue-token-label">Your Token</span>
                    <span className="queue-token-number">#{item.token_number}</span>
                    <span className={`queue-priority-tag ${(item.priority || 'normal').toLowerCase()}`}>
                      {item.priority || 'Normal'}
                    </span>
                  </div>

                  {/* Queue metrics grid */}
                  <div className="queue-metrics">
                    <div className="metric-card current">
                      <span className="metric-icon">🔔</span>
                      <div className="metric-info">
                        <span className="metric-value">
                          {item.currentlyServing != null ? `#${item.currentlyServing}` : '—'}
                        </span>
                        <span className="metric-label">Now Serving</span>
                      </div>
                    </div>

                    <div className="metric-card position">
                      <span className="metric-icon">📍</span>
                      <div className="metric-info">
                        <span className="metric-value">
                          {isBeingServed ? 'Your turn!' : formatOrdinal(item.queuePosition)}
                        </span>
                        <span className="metric-label">
                          {isBeingServed ? 'In consultation' : `of ${item.totalInQueue} in queue`}
                        </span>
                      </div>
                    </div>

                    <div className="metric-card wait">
                      <span className="metric-icon">⏱️</span>
                      <div className="metric-info">
                        <span className="metric-value">
                          {isBeingServed ? 'Now' : formatWaitTime(item.estimatedWait)}
                        </span>
                        <span className="metric-label">Est. Wait Time</span>
                      </div>
                    </div>

                    <div className="metric-card status">
                      <span className="metric-icon">📋</span>
                      <div className="metric-info">
                        <span className={`queue-status-badge ${(item.status || 'waiting').toLowerCase()}`}>
                          {item.status || 'waiting'}
                        </span>
                        <span className="metric-label">Status</span>
                      </div>
                    </div>
                  </div>

                  {/* Appointment details */}
                  <div className="queue-details">
                    <div className="queue-detail-row">
                      <span className="queue-detail-icon">👨‍⚕️</span>
                      <div className="queue-detail-text">
                        <span className="queue-detail-primary">{docName}</span>
                        <span className="queue-detail-secondary">{deptName}</span>
                      </div>
                    </div>
                    <div className="queue-detail-row">
                      <span className="queue-detail-icon">📅</span>
                      <div className="queue-detail-text">
                        <span className="queue-detail-primary">{item.appointment_date}</span>
                        <span className="queue-detail-secondary">{item.appointment_time}</span>
                      </div>
                    </div>
                  </div>

                  {/* Estimate disclaimer */}
                  <div className="queue-disclaimer">
                    ⓘ Wait times are estimates based on ~{AVG_CONSULT_MINUTES} min per consultation. Actual times may vary.
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default PatientQueue
