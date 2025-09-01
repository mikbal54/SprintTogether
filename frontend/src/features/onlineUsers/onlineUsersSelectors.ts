import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../store'
import type { User } from '../../types'

// Basic selectors
export const selectOnlineUsers = (state: RootState): User[] => state.onlineUsers.users
export const selectOnlineUsersLoading = (state: RootState): boolean => state.onlineUsers.loading
export const selectOnlineUsersError = (state: RootState): string | null => state.onlineUsers.error
export const selectOnlineUsersLastUpdated = (state: RootState): number | null => state.onlineUsers.lastUpdated

// Derived selectors
export const selectOnlineUsersCount = createSelector(
  [selectOnlineUsers],
  (users: User[]): number => users.length
)



export const selectOnlineUsersByName = createSelector(
  [selectOnlineUsers],
  (users: User[]): User[] => users.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
)

export const selectOnlineUserById = createSelector(
  [selectOnlineUsers, (_state: RootState, userId: string) => userId],
  (users: User[], userId: string): User | undefined => users.find(user => user.id === userId)
)
