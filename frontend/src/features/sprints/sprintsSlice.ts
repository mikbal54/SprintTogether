import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { Sprint, Task, Status } from '../../types'

interface SprintsState {
  sprints: Sprint[]
  selectedSprint: Sprint | null
  selectedTask: Task | null
  hideCompletedSprints: boolean
  hideCompletedTasks: boolean
  loading: boolean
  error: string | null
  expandedSprints: string[]
}

const initialState: SprintsState = {
  sprints: [],
  selectedSprint: null,
  selectedTask: null,
  hideCompletedSprints: false,
  hideCompletedTasks: false,
  loading: false,
  error: null,
  expandedSprints: []
}

const sprintsSlice = createSlice({
  name: 'sprints',
  initialState,
  reducers: {
    // Set all sprints
    setSprints: (state, action: PayloadAction<Sprint[]>) => {
      state.sprints = action.payload
      state.loading = false
      state.error = null
    },

    // Set selected sprint
    setSelectedSprint: (state, action: PayloadAction<Sprint | null>) => {
      state.selectedSprint = action.payload
      // Clear selected task when sprint is selected
      if (action.payload) {
        state.selectedTask = null
      }
    },

    // Set selected task
    setSelectedTask: (state, action: PayloadAction<Task | null>) => {
      state.selectedTask = action.payload
    },

    // Update sprint tasks
    updateSprintTasks: (state, action: PayloadAction<{ sprintId: string; tasks: Task[] }>) => {
      const { sprintId, tasks } = action.payload
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1) {
        state.sprints[sprintIndex].tasks = tasks
      }
    },

    // Update sprint hasChildren property
    updateSprintHasChildren: (state, action: PayloadAction<{ sprintId: string; hasChildren: boolean }>) => {
      const { sprintId, hasChildren } = action.payload
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1) {
        state.sprints[sprintIndex].hasChildren = hasChildren
      }
      
      // Also update selected sprint if it's the same
      if (state.selectedSprint?.id === sprintId) {
        state.selectedSprint.hasChildren = hasChildren
      }
    },

    // Update sprint status
    updateSprintStatus: (state, action: PayloadAction<{ sprintId: string; status: Status }>) => {
      const { sprintId, status } = action.payload
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1) {
        state.sprints[sprintIndex].status = status
      }
      
      // Also update selected sprint if it's the same
      if (state.selectedSprint?.id === sprintId) {
        state.selectedSprint.status = status
      }
    },

    // Update sprint description
    updateSprintDescription: (state, action: PayloadAction<{ sprintId: string; description: string }>) => {
      const { sprintId, description } = action.payload
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1) {
        state.sprints[sprintIndex].description = description
      }
      
      // Also update selected sprint if it's the same
      if (state.selectedSprint?.id === sprintId) {
        state.selectedSprint.description = description
      }
    },

    // Update sprint name
    updateSprintName: (state, action: PayloadAction<{ sprintId: string; name: string }>) => {
      const { sprintId, name } = action.payload
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1) {
        state.sprints[sprintIndex].name = name
      }
      
      // Also update selected sprint if it's the same
      if (state.selectedSprint?.id === sprintId) {
        state.selectedSprint.name = name
      }
    },

    // Update task status
    updateTaskStatus: (state, action: PayloadAction<{ taskId: string; status: Status }>) => {
      const { taskId, status } = action.payload
      
      // Update task in all sprints
      state.sprints.forEach(sprint => {
        if (sprint.tasks) {
          const taskIndex = sprint.tasks.findIndex(task => task.id === taskId)
          if (taskIndex !== -1) {
            sprint.tasks[taskIndex].status = status
          }
        }
      })
      
      // Also update selected task if it's the same
      if (state.selectedTask?.id === taskId) {
        state.selectedTask.status = status
      }
    },

    // Update task description
    updateTaskDescription: (state, action: PayloadAction<{ taskId: string; description: string }>) => {
      const { taskId, description } = action.payload
      
      // Update task in all sprints
      state.sprints.forEach(sprint => {
        if (sprint.tasks) {
          const taskIndex = sprint.tasks.findIndex(task => task.id === taskId)
          if (taskIndex !== -1) {
            sprint.tasks[taskIndex].description = description
          }
        }
      })
      
      // Also update selected task if it's the same
      if (state.selectedTask?.id === taskId) {
        state.selectedTask.description = description
      }
    },

    // Update task name
    updateTaskName: (state, action: PayloadAction<{ taskId: string; name: string }>) => {
      const { taskId, name } = action.payload
      
      // Update task in all sprints
      state.sprints.forEach(sprint => {
        if (sprint.tasks) {
          const taskIndex = sprint.tasks.findIndex(task => task.id === taskId)
          if (taskIndex !== -1) {
            sprint.tasks[taskIndex].title = name
          }
        }
      })
      
      // Also update selected task if it's the same
      if (state.selectedTask?.id === taskId) {
        state.selectedTask.title = name
      }
    },

    // Update task assignee
    updateTaskAssignee: (state, action: PayloadAction<{ taskId: string; assigneeId: string; assigneeName: string }>) => {
      const { taskId, assigneeId, assigneeName } = action.payload
      
      // Update task in all sprints
      state.sprints.forEach(sprint => {
        if (sprint.tasks) {
          const taskIndex = sprint.tasks.findIndex(task => task.id === taskId)
          if (taskIndex !== -1) {
            sprint.tasks[taskIndex].assignedTo = assigneeId
            sprint.tasks[taskIndex].assigneeName = assigneeName
          }
        }
      })
      
      // Also update selected task if it's the same
      if (state.selectedTask?.id === taskId) {
        state.selectedTask.assignedTo = assigneeId
        state.selectedTask.assigneeName = assigneeName
      }
    },

    // Remove task
    removeTask: (state, action: PayloadAction<{ sprintId: string; taskId: string }>) => {
      const { sprintId, taskId } = action.payload
      
      // Remove task from sprints
      const sprintIndex = state.sprints.findIndex(sprint => sprint.id === sprintId)
      if (sprintIndex !== -1 && state.sprints[sprintIndex].tasks) {
        state.sprints[sprintIndex].tasks = state.sprints[sprintIndex].tasks!.filter(task => task.id !== taskId)
        
        // Update hasChildren if this was the last task
        if (state.sprints[sprintIndex].tasks!.length === 0) {
          state.sprints[sprintIndex].hasChildren = false
        }
      }
      
      // Clear selected task if it was the deleted one
      if (state.selectedTask?.id === taskId) {
        state.selectedTask = null
      }
    },

    // Toggle filter states
    setHideCompletedSprints: (state, action: PayloadAction<boolean>) => {
      state.hideCompletedSprints = action.payload
    },

    setHideCompletedTasks: (state, action: PayloadAction<boolean>) => {
      state.hideCompletedTasks = action.payload
    },

    // Manage expanded sprints
    setExpandedSprints: (state, action: PayloadAction<string[]>) => {
      state.expandedSprints = action.payload
    },

    addExpandedSprint: (state, action: PayloadAction<string>) => {
      if (!state.expandedSprints.includes(action.payload)) {
        state.expandedSprints.push(action.payload)
      }
    },

    removeExpandedSprint: (state, action: PayloadAction<string>) => {
      state.expandedSprints = state.expandedSprints.filter(id => id !== action.payload)
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },

    // Set error state
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    // Clear selections
    clearSelections: (state) => {
      state.selectedSprint = null
      state.selectedTask = null
    }
  }
})

export const {
  setSprints,
  setSelectedSprint,
  setSelectedTask,
  updateSprintTasks,
  updateSprintHasChildren,
  updateSprintStatus,
  updateSprintDescription,
  updateSprintName,
  updateTaskStatus,
  updateTaskDescription,
  updateTaskName,
  updateTaskAssignee,
  removeTask,
  setHideCompletedSprints,
  setHideCompletedTasks,
  setExpandedSprints,
  addExpandedSprint,
  removeExpandedSprint,
  setLoading,
  setError,
  clearSelections
} = sprintsSlice.actions

export default sprintsSlice.reducer
