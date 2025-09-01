import { useAuth0 } from '@auth0/auth0-react'

export const useAuth = () => {
	const { loginWithRedirect, logout, getAccessTokenSilently, user, isAuthenticated, isLoading } = useAuth0()

	const getToken = async () => {
		return await getAccessTokenSilently()
	}

	return { loginWithRedirect, logout, getToken, user, isAuthenticated, isLoading }
}