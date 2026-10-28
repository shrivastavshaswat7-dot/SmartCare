// Role-based routing rules used by the route guards and the login page.

const HOME_BY_ROLE = { admin: '/admin', doctor: '/doctor', patient: '/' }

export const homeForRole = (role) => HOME_BY_ROLE[role] || '/'

// Returns the path to redirect to, or null when the user may view the area.
// area: 'patient' | 'doctor' | 'admin'
export function guardRedirect(area, { user, role }) {
  if (!user) return '/login'
  const effectiveRole = role === 'admin' || role === 'doctor' ? role : 'patient'
  if (effectiveRole === area) return null
  return homeForRole(effectiveRole)
}
