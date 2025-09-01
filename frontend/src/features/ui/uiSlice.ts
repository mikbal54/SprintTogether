import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { EditorState, convertToRaw, convertFromRaw, SelectionState } from 'draft-js'

// Utility function to convert EditorState to serializable data
const editorStateToSerializable = (editorState: EditorState) => {
  const contentState = editorState.getCurrentContent()
  const selectionState = editorState.getSelection()
  
  return {
    content: convertToRaw(contentState),
    selection: {
      anchorKey: selectionState.getAnchorKey(),
      anchorOffset: selectionState.getAnchorOffset(),
      focusKey: selectionState.getFocusKey(),
      focusOffset: selectionState.getFocusOffset(),
      hasFocus: selectionState.getHasFocus(),
      isBackward: selectionState.getIsBackward()
    }
  }
}

// Utility function to convert serializable data back to EditorState
const serializableToEditorState = (rawData: any) => {
  if (!rawData || !rawData.content || !rawData.content.blocks) {
    return EditorState.createEmpty()
  }
  
  const contentState = convertFromRaw(rawData.content)
  let editorState = EditorState.createWithContent(contentState)
  
  // Restore selection if available
  if (rawData.selection) {
    const selectionState = SelectionState.createEmpty(rawData.selection.anchorKey)
      .merge({
        anchorOffset: rawData.selection.anchorOffset,
        focusKey: rawData.selection.focusKey,
        focusOffset: rawData.selection.focusOffset,
        hasFocus: rawData.selection.hasFocus,
        isBackward: rawData.selection.isBackward
      })
    editorState = EditorState.forceSelection(editorState, selectionState)
  }
  
  return editorState
}

interface UIState {
  // Modal states
  isCreateOpen: boolean
  isChangeAssigneeOpen: boolean
  isSprintCreateOpen: boolean
  
  // Task creation modal data
  sprintForNewTask: string | undefined
  parentTaskForNewTask: string | undefined
  parentTaskNameForNewTask: string | undefined
  
  // Editor states
  isEditingSprintDescription: boolean
  isEditingTaskDescription: boolean
  isEditingSprintName: boolean
  isEditingTaskName: boolean
  
  // Editor values
  sprintNameValue: string
  taskNameValue: string
  sprintEditorStateRaw: any // Store as serializable raw content
  taskEditorStateRaw: any // Store as serializable raw content
  
  // UI controls
  showColorPicker: boolean
  showSizeSelector: boolean
  currentEditorType: 'sprint' | 'task' | null
}

const initialState: UIState = {
  // Modal states
  isCreateOpen: false,
  isChangeAssigneeOpen: false,
  isSprintCreateOpen: false,
  
  // Task creation modal data
  sprintForNewTask: undefined,
  parentTaskForNewTask: undefined,
  parentTaskNameForNewTask: undefined,
  
  // Editor states
  isEditingSprintDescription: false,
  isEditingTaskDescription: false,
  isEditingSprintName: false,
  isEditingTaskName: false,
  
  // Editor values
  sprintNameValue: '',
  taskNameValue: '',
  sprintEditorStateRaw: null,
  taskEditorStateRaw: null,
  
  // UI controls
  showColorPicker: false,
  showSizeSelector: false,
  currentEditorType: null
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Modal actions
    setCreateModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isCreateOpen = action.payload
    },
    
    setChangeAssigneeModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isChangeAssigneeOpen = action.payload
    },
    
    setSprintCreateModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isSprintCreateOpen = action.payload
    },
    
    // Task creation modal data
    setTaskCreationData: (state, action: PayloadAction<{
      sprintId?: string
      parentTaskId?: string
      parentTaskName?: string
    }>) => {
      state.sprintForNewTask = action.payload.sprintId
      state.parentTaskForNewTask = action.payload.parentTaskId
      state.parentTaskNameForNewTask = action.payload.parentTaskName
    },
    
    clearTaskCreationData: (state) => {
      state.sprintForNewTask = undefined
      state.parentTaskForNewTask = undefined
      state.parentTaskNameForNewTask = undefined
    },
    
    // Editor states
    setEditingSprintDescription: (state, action: PayloadAction<boolean>) => {
      state.isEditingSprintDescription = action.payload
    },
    
    setEditingTaskDescription: (state, action: PayloadAction<boolean>) => {
      state.isEditingTaskDescription = action.payload
    },
    
    setEditingSprintName: (state, action: PayloadAction<boolean>) => {
      state.isEditingSprintName = action.payload
    },
    
    setEditingTaskName: (state, action: PayloadAction<boolean>) => {
      state.isEditingTaskName = action.payload
    },
    
    // Editor values
    setSprintNameValue: (state, action: PayloadAction<string>) => {
      state.sprintNameValue = action.payload
    },
    
    setTaskNameValue: (state, action: PayloadAction<string>) => {
      state.taskNameValue = action.payload
    },
    
    setSprintEditorState: (state, action: PayloadAction<EditorState>) => {
      state.sprintEditorStateRaw = editorStateToSerializable(action.payload)
    },
    
    setTaskEditorState: (state, action: PayloadAction<EditorState>) => {
      state.taskEditorStateRaw = editorStateToSerializable(action.payload)
    },
    
    // UI controls
    setShowColorPicker: (state, action: PayloadAction<boolean>) => {
      state.showColorPicker = action.payload
    },
    
    setShowSizeSelector: (state, action: PayloadAction<boolean>) => {
      state.showSizeSelector = action.payload
    },
    
    setCurrentEditorType: (state, action: PayloadAction<'sprint' | 'task' | null>) => {
      state.currentEditorType = action.payload
    },
    
    // Reset all editing states
    resetEditingStates: (state) => {
      state.isEditingSprintDescription = false
      state.isEditingTaskDescription = false
      state.isEditingSprintName = false
      state.isEditingTaskName = false
      state.sprintNameValue = ''
      state.taskNameValue = ''
      state.sprintEditorStateRaw = null
      state.taskEditorStateRaw = null
      state.currentEditorType = null
    },
    
    // Reset all UI state
    resetUI: (state) => {
      state.isCreateOpen = false
      state.isChangeAssigneeOpen = false
      state.isSprintCreateOpen = false
      state.sprintForNewTask = undefined
      state.parentTaskForNewTask = undefined
      state.parentTaskNameForNewTask = undefined
      state.isEditingSprintDescription = false
      state.isEditingTaskDescription = false
      state.isEditingSprintName = false
      state.isEditingTaskName = false
      state.sprintNameValue = ''
      state.taskNameValue = ''
      state.sprintEditorStateRaw = null
      state.taskEditorStateRaw = null
      state.showColorPicker = false
      state.showSizeSelector = false
      state.currentEditorType = null
    }
  }
})

export const {
  setCreateModalOpen,
  setChangeAssigneeModalOpen,
  setSprintCreateModalOpen,
  setTaskCreationData,
  clearTaskCreationData,
  setEditingSprintDescription,
  setEditingTaskDescription,
  setEditingSprintName,
  setEditingTaskName,
  setSprintNameValue,
  setTaskNameValue,
  setSprintEditorState,
  setTaskEditorState,
  setShowColorPicker,
  setShowSizeSelector,
  setCurrentEditorType,
  resetEditingStates,
  resetUI
} = uiSlice.actions

// Export utility functions for use in components
export { editorStateToSerializable, serializableToEditorState }

export default uiSlice.reducer
