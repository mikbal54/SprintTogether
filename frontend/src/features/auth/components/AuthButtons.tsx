import { useSession } from '../hooks/useSession'
import { logout } from '../../../utils/logout'

export function AuthButtons() {
	const { isAuthenticated, user } = useSession()

	if (!isAuthenticated) {
		return <button onClick={() =>
            window.location.href = 'http://localhost:3000/auth/login'
        }>Login</button>
	}

	return (
		<div>
			<span>{user?.id}</span>
			<button onClick={() => logout()}>
				Logout
			</button>
		</div>
	)
}