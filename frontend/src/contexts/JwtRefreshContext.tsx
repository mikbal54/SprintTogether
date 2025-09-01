import { createContext, useContext, useEffect, useRef, useCallback } from 'react'
import api from '../api/axios'
import { useSession } from '../features/auth/hooks/useSession'
import { useAppDispatch } from '../store/hooks'
import { addNotification } from '../features/notifications/notificationsSlice'
import { useWebSocket } from './WebSocketContext'

interface JwtRefreshContextType {
  startRefreshCycle: (refreshBeforeExpiry?: number, showNotifications?: boolean) => void
  stopRefreshCycle: () => void
}

const JwtRefreshContext = createContext<JwtRefreshContextType | null>(null)

export function JwtRefreshProvider({ children }: { children: React.ReactNode }) {
	const { refresh: refreshSession } = useSession()
	const dispatch = useAppDispatch()
	const { sub, unsub, emit, reconnect, socket } = useWebSocket()
	
	
	
	const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isRefreshingRef = useRef(false)
	const isActiveRef = useRef(false)
	

  const refreshBeforeExpiryRef = useRef(60)
  const showNotificationsRef = useRef(false)

  const scheduleNextRefresh = useCallback((expiresIn: number) => {
    if (!isActiveRef.current) return
    
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Calculate when to refresh (refreshBeforeExpiry seconds before expiry)
    const refreshIn = Math.max(1000, (expiresIn - refreshBeforeExpiryRef.current) * 1000)
    

    
    refreshTimeoutRef.current = setTimeout(() => {
      refreshToken()
    }, refreshIn)
  }, [])

  const refreshToken = useCallback(async () => {
    if (!isActiveRef.current) return
    
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true

    try {
      
      const response = await api.post('/auth/refresh')
      

      
      if ((response.status === 200 || response.status === 201) && response.data?.expires_in) {
        const expiresIn = response.data.expires_in

        
        if (showNotificationsRef.current) {
          dispatch(addNotification({
            type: 'success',
            title: 'Token Refreshed',
            message: 'Token refreshed successfully',
            duration: 3000
          }))
        }
        
        // Schedule the next refresh
        scheduleNextRefresh(expiresIn)
        
        // Refresh the session to update user state if needed
        await refreshSession()
        
        // Reconnect WebSocket with new token
        if (socket) {
          socket.disconnect()
          setTimeout(() => {
            reconnect()
          }, 1000)
        }
      } else {
        console.warn('[JwtRefreshContext] Unexpected refresh response:', response.data)
        if (showNotificationsRef.current) {
          dispatch(addNotification({
            type: 'warning',
            title: 'Token Refresh Warning',
            message: 'Token refresh completed with unexpected response',
            duration: 5000
          }))
        }
      }
    } catch (error: any) {
      console.error('[JwtRefreshContext] Token refresh failed:', error)
      
      const isUnauthorized = error?.response?.status === 401
      const errorMessage = error?.response?.data?.message || error.message || 'Token refresh failed'
      
      if (isUnauthorized) {
        if (showNotificationsRef.current) {
          dispatch(addNotification({
            type: 'error',
            title: 'Session Expired',
            message: 'Session expired. Please log in again.',
            duration: 0 // Manual dismiss only
          }))
        }
        
        // Refresh session to clear user state
        await refreshSession()
        
        // Redirect to login or handle as needed
        // The session provider will handle the unauthenticated state
      } else {
        console.log('[JwtRefreshContext] Refresh failed with error, will retry on next interval')
        if (showNotificationsRef.current) {
          dispatch(addNotification({
            type: 'error',
            title: 'Token Refresh Failed',
            message: `Token refresh failed: ${errorMessage}`,
            duration: 5000
          }))
        }
        
        // For non-401 errors, schedule a retry after a shorter interval
        const retryIn = 30000 // 30 seconds
        
        refreshTimeoutRef.current = setTimeout(() => {
          refreshToken()
        }, retryIn)
      }
    } finally {
      isRefreshingRef.current = false
    }
  }, [scheduleNextRefresh, refreshSession, dispatch, socket, reconnect])

  // WebSocket auth event handlers
  const handleTokenExpired = useCallback(async (_data: { message: string; timestamp: string }) => {
    if (!isActiveRef.current) return
    

    
    // Don't show session expiring notification as toast - it will be handled silently
    
    // Attempt to refresh token silently
    
    try {
      const response = await api.post('/auth/refresh')
      
      if ((response.status === 200 || response.status === 201) && response.data?.expires_in) {

        
        if (showNotificationsRef.current) {
          dispatch(addNotification({
            type: 'success',
            title: 'Session Renewed',
            message: 'Your session has been automatically renewed',
            duration: 3000
          }))
        }
        
        // Schedule the next refresh
        scheduleNextRefresh(response.data.expires_in)
        
        // Refresh session state
        await refreshSession()
        
        // Reconnect WebSocket with new token
        if (socket) {
          socket.disconnect()
          setTimeout(() => {
            reconnect()
          }, 1000)
        }
        
        // Send acknowledgment to server
        setTimeout(() => {
          emit('auth:token_refresh_completed', {
            status: 'success',
            timestamp: new Date().toISOString()
          })
        }, 1500) // Wait for reconnection
        
      } else {
        throw new Error('Unexpected refresh response')
      }
    } catch (error: any) {

      
      if (showNotificationsRef.current) {
        dispatch(addNotification({
          type: 'error',
          title: 'Session Expired',
          message: 'Your session has expired. Please log in again.',
          duration: 0 // Manual dismiss only
        }))
      }
      
      // Clean up and redirect
      if (socket) {
        socket.disconnect()
      }
      
      // Clear session state
      await refreshSession()
      
      // Send failure acknowledgment
      emit('auth:token_refresh_completed', {
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message
      })
      
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/auth/login'
      }, 2000)
    }
  }, [scheduleNextRefresh, refreshSession, dispatch, socket, reconnect, emit])

  const handleAuthError = useCallback(async (data: { message: string }) => {
    if (!isActiveRef.current) return
    
    console.error('🚨 Authentication error from server:', data.message)
    
    if (showNotificationsRef.current) {
      dispatch(addNotification({
        type: 'error',
        title: 'Authentication Error',
        message: data.message,
        duration: 0 // Manual dismiss only
      }))
    }
    
    // Clean up session
    if (socket) {
      socket.disconnect()
    }
    
    await refreshSession()
    
    // Redirect to login
    setTimeout(() => {
      window.location.href = '/auth/login'
    }, 2000)
  }, [refreshSession, dispatch, socket])

  const initializeRefreshCycle = useCallback(async () => {
    if (!isActiveRef.current) return
    
    try {
      console.log('[JwtRefreshContext] Initializing refresh cycle')
      
      // Try to refresh immediately to get the current token expiry
      const response = await api.post('/auth/refresh')
      
      console.log('[JwtRefreshContext] Initial refresh response:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        dataType: typeof response.data,
        hasExpiresIn: response.data?.expires_in !== undefined,
        expiresInValue: response.data?.expires_in,
        expiresInType: typeof response.data?.expires_in
      })
      
      if ((response.status === 200 || response.status === 201) && response.data?.expires_in) {
        const expiresIn = response.data.expires_in

        
        // Schedule the next refresh
        scheduleNextRefresh(expiresIn)
      } else {
        console.warn('[JwtRefreshContext] Initial refresh returned unexpected response:', {
          status: response.status,
          data: response.data,
          expectedFormat: '{ expires_in: number }'
        })
      }
    } catch (error: any) {
      console.error('[JwtRefreshContext] Initial refresh failed:', error)
      
      if (error?.response?.status === 401) {

        // Don't schedule refreshes if we can't authenticate
        return
      }
      
      // For other errors, schedule a retry
      const retryIn = 30000 // 30 seconds
      
      refreshTimeoutRef.current = setTimeout(() => {
        initializeRefreshCycle()
      }, retryIn)
    }
  }, [scheduleNextRefresh])

  const startRefreshCycle = useCallback((refreshBeforeExpiry: number = 60, showNotifications: boolean = false) => {
    isActiveRef.current = true
    refreshBeforeExpiryRef.current = refreshBeforeExpiry
    showNotificationsRef.current = showNotifications
    
    // Subscribe to WebSocket auth events
    sub('auth:token_expired', handleTokenExpired)
    sub('auth:error', handleAuthError)
    

    
    // Start the refresh cycle
    initializeRefreshCycle()
  }, [sub, handleTokenExpired, handleAuthError, initializeRefreshCycle])

  const stopRefreshCycle = useCallback(() => {
    isActiveRef.current = false
    
    // Clear refresh timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
    
    // Unsubscribe from WebSocket events
    unsub('auth:token_expired', handleTokenExpired)
    unsub('auth:error', handleAuthError)
    

  }, [unsub, handleTokenExpired, handleAuthError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRefreshCycle()
    }
  }, [stopRefreshCycle])

  const value: JwtRefreshContextType = {
    startRefreshCycle,
    stopRefreshCycle
  }

  return (
    <JwtRefreshContext.Provider value={value}>
      {children}
    </JwtRefreshContext.Provider>
  )
}

export function useJwtRefresh() {
  const context = useContext(JwtRefreshContext)
  if (!context) {
    throw new Error('useJwtRefresh must be used within a JwtRefreshProvider')
  }
  return context
}
