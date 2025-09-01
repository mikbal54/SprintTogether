import { useEffect, useRef } from 'react'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useAppDispatch } from '../../store/hooks'
import { useSession } from '../../features/auth/hooks/useSession'
import { setOnlineUsers, addOnlineUser, removeOnlineUser } from '../../features/onlineUsers/onlineUsersSlice'
import { addNotification } from '../../features/notifications/notificationsSlice'
import type { User } from '../../types'

// This component handles WebSocket events for online users
// It doesn't render anything, just manages state and notifications
function OnlineUsersWebSocketHandler() {
  const dispatch = useAppDispatch()
  const { sub, unsub } = useWebSocket()
  const { user: currentUser } = useSession()
  const previousOnlineUsersRef = useRef<User[]>([])
  const isFirstLoadRef = useRef(true)

  useEffect(() => {
    // Handle online users event
    const handleOnlineUsers = (data: { users: User[]; count: number }) => {
      
      
      // Dispatch to Redux
      dispatch(setOnlineUsers(data.users))
      
      // Skip notifications on first load to avoid showing all users as "new"
      if (isFirstLoadRef.current) {
        previousOnlineUsersRef.current = data.users
        isFirstLoadRef.current = false
        return
      }
      
      // Show notifications for changes
      const currentUsers = data.users
      const previousUsers = previousOnlineUsersRef.current
      
      // Find new users (came online) - exclude current user
      const newUsers = currentUsers.filter((user: User) => 
        !previousUsers.some(prevUser => prevUser.id === user.id) &&
        user.id !== currentUser?.id // Don't show notification for current user
      )
      
      // Find users who went offline - exclude current user
      const offlineUsers = previousUsers.filter((user: User) => 
        !currentUsers.some(currentUser => currentUser.id === user.id) &&
        user.id !== currentUser?.id // Don't show notification for current user
      )
      
      // Show notifications for new users
      newUsers.forEach((user: User) => {
        dispatch(addNotification({
          type: 'success',
          title: 'User Online',
          message: `${user.name || 'Anonymous'} is now online`,
          duration: 4000, // 4 seconds
        }))
      })
      
      // Show notifications for offline users
      offlineUsers.forEach((user: User) => {
        dispatch(addNotification({
          type: 'info',
          title: 'User Offline',
          message: `${user.name || 'Anonymous'} went offline`,
          duration: 4000, // 4 seconds
        }))
      })
      
      // Update the previous users reference
      previousOnlineUsersRef.current = currentUsers
    }

    // Handle individual user online event
    const handleUserOnline = (data: { user: User }) => {
      
      // Don't show notification if it's the current user
      if (data.user.id === currentUser?.id) {
        dispatch(addOnlineUser(data.user))
        return
      }
      
      dispatch(addOnlineUser(data.user))
      dispatch(addNotification({
        type: 'success',
        title: 'User Online',
        message: `${data.user.name || 'Anonymous'} is now online`,
        duration: 4000,
      }))
    }

    // Handle individual user offline event
    const handleUserOffline = (data: { user: User }) => {
      
      // Don't show notification if it's the current user
      if (data.user.id === currentUser?.id) {
        dispatch(removeOnlineUser(data.user.id))
        return
      }
      
      dispatch(removeOnlineUser(data.user.id))
      dispatch(addNotification({
        type: 'info',
        title: 'User Offline',
        message: `${data.user.name || 'Anonymous'} went offline`,
        duration: 4000,
      }))
    }

    // Subscribe to events
    sub('user:online_users', handleOnlineUsers)
    sub('user:online', handleUserOnline)
    sub('user:offline', handleUserOffline)

    // Cleanup function
    return () => {
      unsub('user:online_users', handleOnlineUsers)
      unsub('user:online', handleUserOnline)
      unsub('user:offline', handleUserOffline)
    }
  }, [sub, unsub, dispatch, currentUser?.id])

  // This component doesn't render anything
  return null
}

export default OnlineUsersWebSocketHandler
