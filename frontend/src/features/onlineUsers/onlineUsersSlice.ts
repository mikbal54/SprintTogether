import { createSlice } from '@reduxjs/toolkit'
import type { User } from '../../types'

interface OnlineUsersState {
  users: User[]
  loading: boolean
  error: string | null
  lastUpdated: number | null
}

const initialState: OnlineUsersState = {
  users: [],
  loading: false,
  error: null,
  lastUpdated: null
}

const onlineUsersSlice = createSlice({
  name: 'onlineUsers',
  initialState,
  reducers: {
    // Update the entire list of online users
    setOnlineUsers: (state, action) => {
      state.users = action.payload
      state.lastUpdated = Date.now()
      state.error = null
    },
    
    // Add a single user (when they come online)
    addOnlineUser: (state, action) => {
      const existingUserIndex = state.users.findIndex(user => user.id === action.payload.id)
      if (existingUserIndex === -1) {
        state.users.push(action.payload)
        state.lastUpdated = Date.now()
      }
    },
    
    // Remove a single user (when they go offline)
    removeOnlineUser: (state, action) => {
      state.users = state.users.filter(user => user.id !== action.payload)
      state.lastUpdated = Date.now()
    },
    
    // Update a specific user (e.g., last seen time)
    updateOnlineUser: (state, action) => {
      const userIndex = state.users.findIndex(user => user.id === action.payload.id)
      if (userIndex !== -1) {
        state.users[userIndex] = { ...state.users[userIndex], ...action.payload }
        state.lastUpdated = Date.now()
      }
    },
    
    // Clear all users
    clearOnlineUsers: (state) => {
      state.users = []
      state.lastUpdated = Date.now()
    },
    
    // Set loading state
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    
    // Set error state
    setError: (state, action) => {
      state.error = action.payload
    }
  }
})

export const {
  setOnlineUsers,
  addOnlineUser,
  removeOnlineUser,
  updateOnlineUser,
  clearOnlineUsers,
  setLoading,
  setError
} = onlineUsersSlice.actions

export default onlineUsersSlice.reducer
