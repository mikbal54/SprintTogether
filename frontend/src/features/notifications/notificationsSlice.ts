import { createSlice } from '@reduxjs/toolkit'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number // in milliseconds, undefined means manual dismiss only
  timestamp: number // Store as number (milliseconds since epoch) instead of Date object
}

interface NotificationsState {
  notifications: Notification[]
}

const initialState: NotificationsState = {
  notifications: []
}

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // Add a new notification
    addNotification: (state, action) => {
      const newNotification: Notification = {
        ...action.payload,
        id: `notification-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(), // Store as number instead of Date object
      }
      state.notifications.push(newNotification)
    },
    
    // Remove a specific notification by ID
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        notification => notification.id !== action.payload
      )
    },
    
    // Clear all notifications
    clearAllNotifications: (state) => {
      state.notifications = []
    },
    
    // Remove expired notifications (for auto-removal)
    removeExpiredNotifications: (state) => {
      const now = Date.now()
      state.notifications = state.notifications.filter(notification => {
        if (notification.duration === undefined) {
          return true // Keep notifications without duration
        }
        const expirationTime = notification.timestamp + notification.duration
        return now < expirationTime
      })
    }
  }
})

export const {
  addNotification,
  removeNotification,
  clearAllNotifications,
  removeExpiredNotifications
} = notificationsSlice.actions

export default notificationsSlice.reducer
