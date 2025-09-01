import { createContext, useContext, useEffect, useState } from 'react'
import api from '../../../api/axios'

type Session = {
	user: { id: string } | null
	isAuthenticated: boolean
	isLoading: boolean
	refresh: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<{ id: string } | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	

    // src/features/auth/hooks/useSession.tsx
    const refresh = async () => {
        try {
            const res = await api.get('/auth/me')
            const ct = (res.headers?.['content-type'] || '') as string
    
            if (!ct.includes('application/json') || !res.data || typeof res.data.id !== 'string') {
                console.warn('[session] invalid /auth/me payload; treating as unauthenticated')
                setUser(null)
            } else {
                setUser({ id: res.data.id })
            }
        } catch (err: any) {
            console.warn('[session] /auth/me error', {
                message: err?.message,
                status: err?.response?.status,
                data: err?.response?.data,
                headers: err?.response?.headers,
            })
            setUser(null)
        } finally {
            setIsLoading(false)
        }
    }

	useEffect(() => {
		refresh()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<SessionContext.Provider
			value={{ user, isAuthenticated: !!user, isLoading, refresh }}
		>
			{children}
		</SessionContext.Provider>
	)
}

export function useSession() {
	const ctx = useContext(SessionContext)
	if (!ctx) throw new Error('useSession must be used within SessionProvider')
	return ctx
}