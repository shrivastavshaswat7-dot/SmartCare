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

function BookAppointment() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [departments, setDepartments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [filteredDoctors, setFilteredDoctors] = useState([])

  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [priority, setPriority] = useState('Normal')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [bookingSuccess, setBookingSuccess] = useState(null)

  // Today's date YYYY-MM-DD for min date
  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      // Fetch departments from Supabase
      const { data: deptData, error: deptErr } = await supabase
        .from('departments')
        .select('*')
        .order('name')

      if (deptErr) console.warn('Departments fetch warning:', deptErr.message)

      // Fetch doctors from Supabase
      const { data: docData, error: docErr } = await supabase
        .from('doctors')
        .select('*')
        .order('name')

      if (docErr) console.warn('Doctors fetch warning:', docErr.message)

      // Use database data if present, otherwise fallback to seed catalog
      const finalDepts = (deptData && deptData.length > 0) ? deptData : FALLBACK_DEPARTMENTS
      const finalDocs = (docData && docData.length > 0) ? docData : FALLBACK_DOCTORS

      setDepartments(finalDepts)
      setDoctors(finalDocs)
    } catch (err) {
      console.error('Error fetching departments/doctors:', err)
      setDepartments(FALLBACK_DEPARTMENTS)
      setDoctors(FALLBACK_DOCTORS)
    } finally {
      setLoading(false)
    }
  }

  const handleDepartmentChange = (deptId) => {
    setSelectedDepartment(deptId)
    setSelectedDoctor('')
    if (deptId) {
      const filtered = doctors.filter(doc => String(doc.department_id) === String(deptId))
      setFilteredDoctors(filtered)
    } else {
      setFilteredDoctors([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDoctor || !appointmentDate || !appointmentTime) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // 1. Calculate highest token number for selected doctor and date
      const { data: existingAppts, error: tokenErr } = await supabase
        .from('appointments')
        .select('token_number')
        .eq('doctor_id', selectedDoctor)
        .eq('appointment_date', appointmentDate)
        .order('token_number', { ascending: false })
        .limit(1)

      if (tokenErr) console.warn('Token calculation warning:', tokenErr.message)

      const highestToken = existingAppts && existingAppts.length > 0 ? (existingAppts[0].token_number || 0) : 0
      const nextToken = highestToken + 1

      // 2. Insert appointment using PostgreSQL-compliant constraint values
      // priority: 'normal' | 'emergency' (lowercase)
      // status: 'waiting'
      const dbPriority = priority.toLowerCase()

      const { data: newAppt, error: insertErr } = await supabase
        .from('appointments')
        .insert({
          patient_id: user.id,
          doctor_id: selectedDoctor,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          priority: dbPriority,
          status: 'waiting',
          token_number: nextToken
        })
        .select()

      if (insertErr) throw insertErr

      const doctorObj = doctors.find(d => String(d.id) === String(selectedDoctor))
      const deptObj = departments.find(d => String(d.id) === String(selectedDepartment))

      setBookingSuccess({
        tokenNumber: nextToken,
        doctorName: doctorObj ? doctorObj.name : 'Selected Doctor',
        departmentName: deptObj ? deptObj.name : 'Selected Department',
        date: appointmentDate,
        time: appointmentTime,
        priority: priority,
        appointmentId: newAppt?.[0]?.id
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
    setAppointmentTime('')
    setPriority('Normal')
    setError('')
  }

  return (
    <DashboardLayout
      title="Book Appointment"
      subtitle="Select a department and doctor to schedule your visit"
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
                  <span className="detail-label">Date</span>
                  <span className="detail-value">{bookingSuccess.date}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Time</span>
                  <span className="detail-value">{bookingSuccess.time}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Priority</span>
                  <span className={`priority-tag ${bookingSuccess.priority.toLowerCase()}`}>
                    {bookingSuccess.priority}
                  </span>
                </div>
              </div>

              <div className="success-actions">
                <button onClick={handleReset} className="secondary-btn">
                  Book Another Appointment
                </button>
                <button onClick={() => navigate('/')} className="primary-btn">
                  View in Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="booking-header">
                <h3>Appointment Details</h3>
                <p>Please select your preferred department, doctor, date and time slot.</p>
              </div>

              {error && <div className="error-banner">{error}</div>}

              {loading ? (
                <div className="loading-state">Loading hospital department catalog...</div>
              ) : (
                <form onSubmit={handleSubmit} className="appointment-form">
                  <div className="form-group">
                    <label htmlFor="department">Medical Department *</label>
                    <select
                      id="department"
                      value={selectedDepartment}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      required
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="doctor">Attending Specialist / Doctor *</label>
                    <select
                      id="doctor"
                      value={selectedDoctor}
                      onChange={(e) => setSelectedDoctor(e.target.value)}
                      disabled={!selectedDepartment || filteredDoctors.length === 0}
                      required
                    >
                      <option value="">
                        {!selectedDepartment
                          ? 'Select a department first'
                          : filteredDoctors.length === 0
                          ? 'No doctors available in this department'
                          : 'Select Doctor'}
                      </option>
                      {filteredDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name} {doc.specialization ? `(${doc.specialization})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="date">Preferred Date *</label>
                      <input
                        type="date"
                        id="date"
                        min={todayStr}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="time">Preferred Time Slot *</label>
                      <input
                        type="time"
                        id="time"
                        value={appointmentTime}
                        onChange={(e) => setAppointmentTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="priority">Consultation Priority *</label>
                    <select
                      id="priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      required
                    >
                      <option value="Normal">Normal Consultation</option>
                      <option value="Emergency">Emergency / Urgent Visit</option>
                    </select>
                  </div>

                  <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? 'Generating Queue Token...' : 'Confirm & Book Appointment'}
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
