import { useEffect } from 'react'
import { logout } from '../../../utils/logout'

export default function LogoutPage() {
  useEffect(() => {
    logout()
  }, [])

  return <p>Logging out...</p>
}