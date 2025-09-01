import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../store'

// Basic selectors
export const selectNotifications = (state: RootState) => state.notifications.notifications

// Derived selectors
export const selectNotificationCount = createSelector(
  [selectNotifications],
  (notifications) => notifications.length
)

export const selectNotificationsByType = createSelector(
  [selectNotifications, (_state: RootState, type: 'success' | 'error' | 'warning' | 'info') => type],
  (notifications, type) => notifications.filter(notification => notification.type === type)
)

export const selectActiveNotifications = createSelector(
  [selectNotifications],
  (notifications) => {
    const now = Date.now()
    return notifications.filter(notification => {
      if (notification.duration === undefined) {
        return true // Keep notifications without duration
      }
      const expirationTime = notification.timestamp + notification.duration
      return now < expirationTime
    })
  }
)
