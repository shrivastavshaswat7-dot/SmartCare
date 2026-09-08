import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DashboardLayout from '../components/DashboardLayout'
import './BookAppointment.css'

// Fallback seed data in case database tables are empty
const FALLBACK_DEPARTMENTS = [
  { id: 1, name: 'Cardiology' },
  { id: 2, name: 'Neurology' },
  { id: 3, name: 'Orthopedics' },
  { id: 4, name: 'Pediatrics' },
  { id: 5, name: 'General Medicine' }
]

const FALLBACK_DOCTORS = [
  { id: 1, name: 'Dr. Robert Chen', department_id: 1, specialization: 'Interventional Cardiology' },
  { id: 2, name: 'Dr. Sarah Jenkins', department_id: 1, specialization: 'Electrophysiology' },
  { id: 3, name: 'Dr. Michael Vance', department_id: 2, specialization: 'Stroke & Neurological Disorders' },
  { id: 4, name: 'Dr. Priya Sharma', department_id: 2, specialization: 'Pediatric Neurology' },
  { id: 5, name: 'Dr. James Wilson', department_id: 3, specialization: 'Joint Replacement & Sports Medicine' },
  { id: 6, name: 'Dr. Elena Rostova', department_id: 3, specialization: 'Spine Surgery' },
  { id: 7, name: 'Dr. Emily Carter', department_id: 4, specialization: 'General Pediatrics' },
  { id: 8, name: 'Dr. David Kim', department_id: 4, specialization: 'Pediatric Critical Care' },
  { id: 9, name: 'Dr. Aris Thorne', department_id: 5, specialization: 'Internal Medicine' },
  { id: 10, name: 'Dr. Maya Lin', department_id: 5, specialization: 'Preventive Healthcare' }
]

const parseTime = (timeStr) => {
  const [h, m] = timeStr.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

const formatTimeStr = (mins) => {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}:00`
}

const formatTimeRange = (start, end) => {
  const format12 = (time24) => {
    const [h, m] = time24.split(':')
    let hrs = parseInt(h, 10)
    const ampm = hrs >= 12 ? 'PM' : 'AM'
    hrs = hrs % 12 || 12
    return `${hrs}:${m} ${ampm}`
  }
  return `${format12(start)} – ${format12(end)}`
}

function BookAppointment() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [departments, setDepartments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [schedules, setSchedules] = useState([])
  const [filteredDoctors, setFilteredDoctors] = useState([])

  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [visitType, setVisitType] = useState('new')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [priority, setPriority] = useState('Normal')

  const [availableSlots, setAvailableSlots] = useState([])
  const [previousAppointment, setPreviousAppointment] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingSuccess, setBookingSuccess] = useState(null)

  // Today's date YYYY-MM-DD for min date
  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (visitType === 'follow_up' && selectedDepartment) {
      findPreviousDoctor()
    } else {
      setPreviousAppointment(null)
      setSelectedDoctor('')
      setAvailableSlots([])
      setSelectedSlot(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitType, selectedDepartment])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: deptData, error: deptErr } = await supabase.from('departments').select('*').order('name')
      if (deptErr) console.warn('Departments fetch warning:', deptErr.message)

      const { data: docData, error: docErr } = await supabase.from('doctors').select('*').order('name')
      if (docErr) console.warn('Doctors fetch warning:', docErr.message)

      const finalDepts = (deptData && deptData.length > 0) ? deptData : FALLBACK_DEPARTMENTS
      const finalDocs = (docData && docData.length > 0) ? docData : FALLBACK_DOCTORS

      const { data: schedData, error: schedErr } = await supabase.from('doctor_schedules').select('*').eq('active', true)
      if (schedErr) console.warn('Schedules fetch warning:', schedErr.message)
      
      const defaultSchedules = finalDocs.flatMap(doc => 
        [1,2,3,4,5].map(day => ({
          doctor_id: doc.id, day_of_week: day, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 15, active: true
        }))
      )
      const finalSchedules = (schedData && schedData.length > 0) ? schedData : defaultSchedules

      setDepartments(finalDepts)
      setDoctors(finalDocs)
      setSchedules(finalSchedules)
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const findPreviousDoctor = async () => {
    try {
      const { data } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
        
      if (data && data.length > 0) {
        const pastInDept = data.find(appt => {
          const doc = doctors.find(d => String(d.id) === String(appt.doctor_id))
          return doc && String(doc.department_id) === String(selectedDepartment)
        })
        
        if (pastInDept) {
          setPreviousAppointment(pastInDept)
          setSelectedDoctor(pastInDept.doctor_id)
        } else {
          setPreviousAppointment({ notFound: true })
          setSelectedDoctor('')
        }
      } else {
        setPreviousAppointment({ notFound: true })
        setSelectedDoctor('')
      }
    } catch (err) {
      console.error('Failed to find previous doctor', err)
      setPreviousAppointment({ notFound: true })
    }
  }

  const loadAvailableSlots = async (docId, dateStr) => {
    if (!docId || !dateStr) return []
    const dateObj = new Date(dateStr)
    const dayOfWeek = dateObj.getDay()
    
    const schedule = schedules.find(s => String(s.doctor_id) === String(docId) && s.day_of_week === dayOfWeek && s.active)
    if (!schedule) return []
    
    const { data: booked } = await supabase
      .from('appointments')
      .select('slot_start')
      .eq('doctor_id', docId)
      .eq('appointment_date', dateStr)
      .neq('status', 'cancelled')
      
    const bookedTimes = (booked || []).map(b => b.slot_start ? b.slot_start.slice(0, 5) : null).filter(Boolean)
    
    const slots = []
    let current = parseTime(schedule.start_time)
    const end = parseTime(schedule.end_time)
    const dur = schedule.slot_duration_minutes
    
    while (current + dur <= end) {
      const slotStartStr = formatTimeStr(current).slice(0, 5)
      const slotEndStr = formatTimeStr(current + dur).slice(0, 5)
      if (!bookedTimes.includes(slotStartStr)) {
        slots.push({ start: formatTimeStr(current), end: formatTimeStr(current + dur) })
      }
      current += dur
    }
    return slots
  }

  const handleDepartmentChange = (deptId) => {
    setSelectedDepartment(deptId)
    setSelectedDoctor('')
    setAppointmentDate('')
    setAvailableSlots([])
    setSelectedSlot(null)
    setPreviousAppointment(null)
    if (deptId) {
      setFilteredDoctors(doctors.filter(doc => String(doc.department_id) === String(deptId)))
    } else {
      setFilteredDoctors([])
    }
  }

  const handleDateChange = async (dateStr) => {
    setAppointmentDate(dateStr)
    setSelectedSlot(null)
    setAvailableSlots([])
    
    if (!dateStr) return
    
    if (visitType === 'new') {
       setLoadingSlots(true)
       let earliestMins = 99999
       let bestDoc = ''
       let bestSlots = []
       
       for (const doc of filteredDoctors) {
          const slots = await loadAvailableSlots(doc.id, dateStr)
          if (slots.length > 0) {
             const mins = parseTime(slots[0].start)
             if (mins < earliestMins) {
                earliestMins = mins
                bestDoc = doc.id
                bestSlots = slots
             }
          }
       }
       if (bestDoc) {
          setSelectedDoctor(bestDoc)
          setAvailableSlots(bestSlots)
       } else {
          setSelectedDoctor('')
          setAvailableSlots([])
       }
       setLoadingSlots(false)
    } else if (visitType === 'follow_up' && selectedDoctor) {
       setLoadingSlots(true)
       const slots = await loadAvailableSlots(selectedDoctor, dateStr)
       setAvailableSlots(slots)
       setLoadingSlots(false)
    }
  }

  const handleDoctorChange = async (docId) => {
    setSelectedDoctor(docId)
    setSelectedSlot(null)
    if (docId && appointmentDate) {
       setLoadingSlots(true)
       const slots = await loadAvailableSlots(docId, appointmentDate)
       setAvailableSlots(slots)
       setLoadingSlots(false)
    } else {
       setAvailableSlots([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDoctor || !appointmentDate || !selectedSlot) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const dbPriority = priority.toLowerCase()
      const { data: newAppt, error: insertErr } = await supabase
        .from('appointments')
        .insert({
          patient_id: user.id,
          doctor_id: selectedDoctor,
          appointment_date: appointmentDate,
          appointment_time: selectedSlot.start, // Backward compatibility
          slot_start: selectedSlot.start,
          slot_end: selectedSlot.end,
          priority: dbPriority,
          status: 'waiting',
          visit_type: visitType,
          follow_up_of: (visitType === 'follow_up' && previousAppointment && !previousAppointment.notFound) ? previousAppointment.id : null
        })
        .select()

      if (insertErr) {
        if (insertErr.code === '23505') throw new Error('This exact time slot has just been booked. Please choose another.')
        throw insertErr
      }

      const assignedToken = newAppt?.[0]?.token_number
      const doctorObj = doctors.find(d => String(d.id) === String(selectedDoctor))
      const deptObj = departments.find(d => String(d.id) === String(selectedDepartment))

      setBookingSuccess({
        tokenNumber: assignedToken,
        doctorName: doctorObj ? doctorObj.name : 'Selected Doctor',
        departmentName: deptObj ? deptObj.name : 'Selected Department',
        date: appointmentDate,
        timeRange: formatTimeRange(selectedSlot.start, selectedSlot.end),
        visitType: visitType === 'new' ? 'New Consultation' : 'Follow-up',
        priority: priority
      })
    } catch (err) {
      console.error('Error booking appointment:', err)
      setError('Failed to book appointment: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setBookingSuccess(null)
    setSelectedDepartment('')
    setSelectedDoctor('')
    setAppointmentDate('')
    setSelectedSlot(null)
    setPriority('Normal')
    setVisitType('new')
    setError('')
  }

  return (
    <DashboardLayout
      title="Book Appointment"
      subtitle="Select a department and available time slot to schedule your visit"
    >
      <div className="book-appointment-wrapper">
        <div className="booking-card">
          {bookingSuccess ? (
            <div className="success-container">
              <div className="success-badge">✓ Appointment Confirmed</div>
              <h2>Token Generated Successfully</h2>

              <div className="token-display">
                <span className="token-label">Queue Token Number</span>
                <span className="token-number">#{bookingSuccess.tokenNumber}</span>
              </div>

              <div className="booking-details">
                <div className="detail-row">
                  <span className="detail-label">Department</span>
                  <span className="detail-value">{bookingSuccess.departmentName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Doctor</span>
                  <span className="detail-value">{bookingSuccess.doctorName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Type</span>
                  <span className="detail-value">{bookingSuccess.visitType}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Date</span>
                  <span className="detail-value">{bookingSuccess.date}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Time Slot</span>
                  <span className="detail-value">{bookingSuccess.timeRange}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Priority</span>
                  <span className={`priority-tag ${bookingSuccess.priority.toLowerCase()}`}>
                    {bookingSuccess.priority}
                  </span>
                </div>
              </div>

              <div className="success-actions">
                <button onClick={handleReset} className="secondary-btn">Book Another Appointment</button>
                <button onClick={() => navigate('/')} className="primary-btn">View in Dashboard</button>
              </div>
            </div>
          ) : (
            <>
              <div className="booking-header">
                <h3>Appointment Details</h3>
                <p>Complete the steps below to confirm your schedule.</p>
              </div>

              {error && <div className="error-banner">{error}</div>}

              {loading ? (
                <div className="loading-state">Loading hospital catalog...</div>
              ) : (
                <form onSubmit={handleSubmit} className="appointment-form">
                  <div className="form-group">
                    <label>Medical Department *</label>
                    <select
                      value={selectedDepartment}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      required
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Consultation Type *</label>
                    <select
                      value={visitType}
                      onChange={(e) => setVisitType(e.target.value)}
                      disabled={!selectedDepartment}
                      required
                    >
                      <option value="new">New Consultation</option>
                      <option value="follow_up">Follow-up / Revisit</option>
                    </select>
                  </div>

                  {visitType === 'follow_up' && previousAppointment && (
                    <div className="follow-up-banner">
                      {previousAppointment.notFound ? (
                        <span className="text-amber">No previous completed appointments found in this department. Please choose New Consultation.</span>
                      ) : (
                        <span className="text-green">✓ Previous doctor found: {doctors.find(d => String(d.id) === String(previousAppointment.doctor_id))?.name}. Please select a date to view their availability.</span>
                      )}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Preferred Date *</label>
                    <input
                      type="date"
                      min={todayStr}
                      value={appointmentDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      disabled={!selectedDepartment || (visitType === 'follow_up' && previousAppointment?.notFound)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Attending Doctor *</label>
                    <select
                      value={selectedDoctor}
                      onChange={(e) => handleDoctorChange(e.target.value)}
                      disabled={!appointmentDate || visitType === 'follow_up'}
                      required
                    >
                      <option value="">
                        {!appointmentDate 
                          ? 'Select a date first' 
                          : filteredDoctors.length === 0 
                          ? 'No doctors available' 
                          : 'Select Doctor'}
                      </option>
                      {filteredDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} {doc.specialization ? `(${doc.specialization})` : ''}
                        </option>
                      ))}
                    </select>
                    {visitType === 'new' && appointmentDate && selectedDoctor && (
                      <div className="recommendation-note">
                         ✓ Showing earliest available doctor. You may change this selection if desired.
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Available Time Slots *</label>
                    {loadingSlots ? (
                      <div className="slot-loading">Checking availability...</div>
                    ) : appointmentDate && selectedDoctor ? (
                      availableSlots.length > 0 ? (
                        <div className="slots-grid">
                          {availableSlots.map((slot, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className={`slot-btn ${selectedSlot?.start === slot.start ? 'selected' : ''}`}
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {formatTimeRange(slot.start, slot.end)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="no-slots-error">
                          Doctor is unavailable on this date. Please select another date or doctor.
                        </div>
                      )
                    ) : (
                      <div className="slot-placeholder">Please complete previous steps to see available times.</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Consultation Priority *</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      required
                    >
                      <option value="Normal">Normal</option>
                      <option value="Emergency">Emergency / Urgent Visit</option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="submit-btn" 
                    disabled={submitting || !selectedSlot || (visitType === 'follow_up' && previousAppointment?.notFound)}
                  >
                    {submitting ? 'Booking Slot...' : 'Confirm & Book Slot'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

export default BookAppointment
