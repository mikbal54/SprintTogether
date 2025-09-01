import { configureStore } from '@reduxjs/toolkit'
import onlineUsersReducer from '../features/onlineUsers/onlineUsersSlice'
import notificationsReducer from '../features/notifications/notificationsSlice'
import sprintsReducer from '../features/sprints/sprintsSlice'
import uiReducer from '../features/ui/uiSlice'

export const store = configureStore({
  reducer: {
    onlineUsers: onlineUsersReducer,
    notifications: notificationsReducer,
    sprints: sprintsReducer,
    ui: uiReducer,
    // Add other reducers here as you migrate more features
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['persist/PERSIST', 'ui/setSprintEditorState', 'ui/setTaskEditorState'],
      },
    })
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
