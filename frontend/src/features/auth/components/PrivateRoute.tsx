import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { useSession } from '../hooks/useSession'

function RedirectToBackendLogin() {
	useEffect(() => {
		const returnTo = encodeURIComponent(window.location.href)
		window.location.href = 'http://localhost:3000/auth/login?returnTo=' + returnTo
	}, [])
	return <p>Redirecting to login…</p>
}

export const PrivateRoute = ({ children }: { children: ReactElement}) => {
	const { isAuthenticated, isLoading } = useSession()
	
	if (isLoading) return <p>Loading...</p>
	if (!isAuthenticated) return <RedirectToBackendLogin />

	return children
}

