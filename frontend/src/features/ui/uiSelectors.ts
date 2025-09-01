import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../store'
import { EditorState } from 'draft-js'
import { serializableToEditorState } from './uiSlice'

// Basic selectors
export const selectIsCreateOpen = (state: RootState): boolean => state.ui.isCreateOpen
export const selectIsChangeAssigneeOpen = (state: RootState): boolean => state.ui.isChangeAssigneeOpen
export const selectIsSprintCreateOpen = (state: RootState): boolean => state.ui.isSprintCreateOpen

export const selectSprintForNewTask = (state: RootState): string | undefined => state.ui.sprintForNewTask
export const selectParentTaskForNewTask = (state: RootState): string | undefined => state.ui.parentTaskForNewTask
export const selectParentTaskNameForNewTask = (state: RootState): string | undefined => state.ui.parentTaskNameForNewTask

export const selectIsEditingSprintDescription = (state: RootState): boolean => state.ui.isEditingSprintDescription
export const selectIsEditingTaskDescription = (state: RootState): boolean => state.ui.isEditingTaskDescription
export const selectIsEditingSprintName = (state: RootState): boolean => state.ui.isEditingSprintName
export const selectIsEditingTaskName = (state: RootState): boolean => state.ui.isEditingTaskName

export const selectSprintNameValue = (state: RootState): string => state.ui.sprintNameValue
export const selectTaskNameValue = (state: RootState): string => state.ui.taskNameValue

// Convert serializable data back to EditorState
export const selectSprintEditorState = createSelector(
  [(state: RootState) => state.ui.sprintEditorStateRaw],
  (sprintEditorStateRaw): EditorState => 
    serializableToEditorState(sprintEditorStateRaw)
)

export const selectTaskEditorState = createSelector(
  [(state: RootState) => state.ui.taskEditorStateRaw],
  (taskEditorStateRaw): EditorState => 
    serializableToEditorState(taskEditorStateRaw)
)

export const selectShowColorPicker = (state: RootState): boolean => state.ui.showColorPicker
export const selectShowSizeSelector = (state: RootState): boolean => state.ui.showSizeSelector
export const selectCurrentEditorType = (state: RootState): 'sprint' | 'task' | null => state.ui.currentEditorType

// Computed selectors
export const selectTaskCreationData = createSelector(
  [selectSprintForNewTask, selectParentTaskForNewTask, selectParentTaskNameForNewTask],
  (sprintId, parentTaskId, parentTaskName) => ({
    sprintId,
    parentTaskId,
    parentTaskName
  })
)

export const selectIsAnyModalOpen = createSelector(
  [selectIsCreateOpen, selectIsChangeAssigneeOpen, selectIsSprintCreateOpen],
  (isCreateOpen, isChangeAssigneeOpen, isSprintCreateOpen): boolean => 
    isCreateOpen || isChangeAssigneeOpen || isSprintCreateOpen
)

export const selectIsAnyEditing = createSelector(
  [selectIsEditingSprintDescription, selectIsEditingTaskDescription, selectIsEditingSprintName, selectIsEditingTaskName],
  (isEditingSprintDescription, isEditingTaskDescription, isEditingSprintName, isEditingTaskName): boolean =>
    isEditingSprintDescription || isEditingTaskDescription || isEditingSprintName || isEditingTaskName
)
