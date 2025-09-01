import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../store'
import type { Sprint, Task, Status } from '../../types'

// Basic selectors
export const selectSprints = (state: RootState): Sprint[] => state.sprints.sprints
export const selectSelectedSprint = (state: RootState): Sprint | null => state.sprints.selectedSprint
export const selectSelectedTask = (state: RootState): Task | null => state.sprints.selectedTask
export const selectHideCompletedSprints = (state: RootState): boolean => state.sprints.hideCompletedSprints
export const selectHideCompletedTasks = (state: RootState): boolean => state.sprints.hideCompletedTasks
export const selectSprintsLoading = (state: RootState): boolean => state.sprints.loading
export const selectSprintsError = (state: RootState): string | null => state.sprints.error

// Computed selectors
export const selectFilteredSprints = createSelector(
  [selectSprints, selectHideCompletedSprints],
  (sprints, hideCompletedSprints): Sprint[] => {
    if (!hideCompletedSprints) return sprints
    return sprints.filter(sprint => sprint.status !== 'COMPLETED')
  }
)

export const selectFilteredTasks = createSelector(
  [selectHideCompletedTasks],
  (hideCompletedTasks) => {
    return (tasks: Task[]): Task[] => {
      if (!hideCompletedTasks) return tasks
      return tasks.filter(task => task.status !== 'COMPLETED')
    }
  }
)

export const selectCurrentStatus = createSelector(
  [selectSelectedSprint, selectSelectedTask],
  (selectedSprint, selectedTask): Status | undefined => {
    if (selectedTask) {
      return selectedTask.status
    } else if (selectedSprint) {
      return selectedSprint.status
    }
    return undefined
  }
)

export const selectSprintById = createSelector(
  [selectSprints, (_state: RootState, sprintId: string) => sprintId],
  (sprints, sprintId): Sprint | undefined => sprints.find(sprint => sprint.id === sprintId)
)

export const selectTaskById = createSelector(
  [selectSprints, (_state: RootState, taskId: string) => taskId],
  (sprints, taskId): Task | null => {
    for (const sprint of sprints) {
      if (sprint.tasks) {
        const task = sprint.tasks.find(task => task.id === taskId)
        if (task) return task
      }
    }
    return null
  }
)
