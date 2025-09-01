/**
 * Centralized logout utility function
 * Handles logout by redirecting to the server's logout endpoint
 */
export const logout = (returnTo?: string) => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'
  const defaultReturnTo = window.location.origin
  const returnUrl = returnTo || defaultReturnTo
  
  // Redirect to server logout endpoint
  window.location.href = `${apiUrl}/auth/logout?returnTo=${encodeURIComponent(returnUrl)}`
}

/**
 * Logout and redirect to a specific URL
 */
export const logoutAndRedirect = (redirectUrl: string) => {
  logout(redirectUrl)
}
