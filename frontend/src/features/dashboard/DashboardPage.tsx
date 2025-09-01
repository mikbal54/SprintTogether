import { useEffect, useCallback } from 'react'
import { Box, Paper, Typography, Chip, FormControl, InputLabel, Select, MenuItem, Button, TextField, IconButton, Fab } from '@mui/material'
import { Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon, FormatColorText as ColorIcon, FormatSize as SizeIcon, Add as AddIcon } from '@mui/icons-material'
import TaskCreationModal from '../../components/dashboard/TaskAddModal'
import ChangeAssigneeModal from '../../components/dashboard/ChangeAssigneeModal'
import SprintCreationModal from '../../components/dashboard/SprintCreationModal'
import SprintTreeView from '../../components/dashboard/SprintTreeView'
import OnlineUsersDisplay from '../../components/dashboard/OnlineUsersDisplay'
import OnlineUsersWebSocketHandler from '../../components/dashboard/OnlineUsersWebSocketHandler'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useJwtRefresh } from '../../contexts/JwtRefreshContext'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { Sprint, Task, Status } from '../../types'
import { Status as StatusEnum } from '../../types'
import { Editor, EditorState, convertToRaw, convertFromRaw, RichUtils, Modifier } from 'draft-js'
import 'draft-js/dist/Draft.css'
import {
	setSprints,
	setSelectedSprint,
	setSelectedTask,
	updateSprintStatus,
	updateTaskStatus,
	updateTaskName,
	updateTaskDescription,
	updateSprintDescription,
	updateSprintName,
	updateSprintHasChildren,
	setHideCompletedSprints,
	setHideCompletedTasks
} from '../sprints/sprintsSlice'
import {
	selectSprints,
	selectSelectedSprint,
	selectSelectedTask,
	selectCurrentStatus,
	selectHideCompletedSprints,
	selectHideCompletedTasks
} from '../sprints/sprintsSelectors'
import {
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
	setCurrentEditorType
} from '../ui/uiSlice'
import {
	selectIsCreateOpen,
	selectIsChangeAssigneeOpen,
	selectIsSprintCreateOpen,
	selectTaskCreationData,
	selectIsEditingSprintDescription,
	selectIsEditingTaskDescription,
	selectIsEditingSprintName,
	selectIsEditingTaskName,
	selectSprintNameValue,
	selectTaskNameValue,
	selectSprintEditorState,
	selectTaskEditorState,
	selectShowColorPicker,
	selectShowSizeSelector,
	selectCurrentEditorType
} from '../ui/uiSelectors'

// Custom style maps for colors and font sizes
const colorStyleMap = {
	'COLOR_RED': { color: '#e74c3c' },
	'COLOR_ORANGE': { color: '#f39c12' },
	'COLOR_YELLOW': { color: '#f1c40f' },
	'COLOR_GREEN': { color: '#27ae60' },
	'COLOR_BLUE': { color: '#3498db' },
	'COLOR_PURPLE': { color: '#9b59b6' },
	'COLOR_PINK': { color: '#e91e63' },
	'COLOR_BLACK': { color: '#2c3e50' },
	'COLOR_GRAY': { color: '#7f8c8d' },
}

const fontSizeStyleMap = {
	'FONT_SIZE_SMALL': { fontSize: '12px' },
	'FONT_SIZE_NORMAL': { fontSize: '16px' },
	'FONT_SIZE_LARGE': { fontSize: '20px' },
}

// Combined style map
const customStyleMap = {
	...colorStyleMap,
	...fontSizeStyleMap,
}

// Utility functions for rich text conversion
const convertRichTextToPlainString = (editorState: EditorState): string => {
	const contentState = editorState.getCurrentContent()
	const rawContent = convertToRaw(contentState)
	
	// Convert the raw content to a plain string with formatting markers
	let plainString = ''
	const blocks = rawContent.blocks
	
	blocks.forEach((block, blockIndex) => {
		if (blockIndex > 0) {
			plainString += '\n' // Add newline between blocks
		}
		
		// Process each character in the block
		let currentStyles: string[] = []
		
		block.text.split('').forEach((char, charIndex) => {
			
			const inlineStyleRanges = block.inlineStyleRanges.filter(range => 
				charIndex >= range.offset && charIndex < range.offset + range.length
			)
			
			// Get all styles for this character
			const styles = inlineStyleRanges.map(range => range.style)
			
			// Add character with style markers
			if (styles.length > 0) {
				// Add opening style markers
				styles.forEach(style => {
					if (!currentStyles.includes(style)) {
						plainString += `<${style}>`
						currentStyles.push(style)
					}
				})
			}
			
			plainString += char
			
			// Remove closing style markers for styles that end here
			const nextCharStyles = block.inlineStyleRanges.filter(range => 
				charIndex + 1 >= range.offset && charIndex + 1 < range.offset + range.length
			).map(range => range.style)
			
			currentStyles.forEach(style => {
				if (!nextCharStyles.includes(style as any)) {
					plainString += `</${style}>`
					currentStyles = currentStyles.filter(s => s !== style)
				}
			})
		})
		
		// Close any remaining open styles
		currentStyles.reverse().forEach(style => {
			plainString += `</${style}>`
		})
	})
	
	return plainString
}

const convertPlainStringToRichText = (plainString: string): EditorState => {
	if (!plainString) {
		return EditorState.createEmpty()
	}
	
	// Parse the plain string with style markers
	const blocks = plainString.split('\n')
	const rawBlocks: any[] = []
	
	blocks.forEach((blockText, blockIndex) => {
		const text = blockText.replace(/<[^>]*>/g, '') // Remove all style markers
		const inlineStyleRanges: any[] = []
		
		const openStyles: { style: string; start: number }[] = []
		let textIndex = 0
		
		// Process the block character by character
		for (let i = 0; i < blockText.length; i++) {
			const char = blockText[i]
			
			if (char === '<') {
				// Check if it's an opening style marker
				const openMatch = blockText.slice(i).match(/^<(BOLD|ITALIC|UNDERLINE|COLOR_[A-Z_]+|FONT_SIZE_[A-Z_]+)>/)
				if (openMatch) {
					openStyles.push({ style: openMatch[1], start: textIndex })
					i += openMatch[0].length - 1
					continue
				}
				
				// Check if it's a closing style marker
				const closeMatch = blockText.slice(i).match(/^<\/(BOLD|ITALIC|UNDERLINE|COLOR_[A-Z_]+|FONT_SIZE_[A-Z_]+)>/)
				if (closeMatch) {
					const style = closeMatch[1]
					const openStyleIndex = openStyles.findIndex(s => s.style === style)
					if (openStyleIndex !== -1) {
						const openStyle = openStyles[openStyleIndex]
						inlineStyleRanges.push({
							style: openStyle.style,
							offset: openStyle.start,
							length: textIndex - openStyle.start
						})
						openStyles.splice(openStyleIndex, 1)
					}
					i += closeMatch[0].length - 1
					continue
				}
			}
			
			// If it's not a style marker, it's part of the text
			textIndex++
		}
		
		// Close any remaining open styles
		openStyles.forEach(openStyle => {
			inlineStyleRanges.push({
				style: openStyle.style,
				offset: openStyle.start,
				length: text.length - openStyle.start
			})
		})
		
		rawBlocks.push({
			key: `block-${blockIndex}`,
			text: text,
			type: 'unstyled',
			depth: 0,
			inlineStyleRanges: inlineStyleRanges,
			entityRanges: []
		})
	})
	
	const rawContent = {
		blocks: rawBlocks,
		entityMap: {}
	}
	
	const contentState = convertFromRaw(rawContent)
	return EditorState.createWithContent(contentState)
}

export default function DashboardPage() {
	const dispatch = useAppDispatch()
	const { startRefreshCycle } = useJwtRefresh()
	
	// Get state from Redux
	const sprints = useAppSelector(selectSprints) as Sprint[]
	const selectedSprint = useAppSelector(selectSelectedSprint) as Sprint | null
	const selectedTask = useAppSelector(selectSelectedTask) as Task | null
	const hideCompletedSprints = useAppSelector(selectHideCompletedSprints) as boolean
	const hideCompletedTasks = useAppSelector(selectHideCompletedTasks) as boolean
	

	
	// UI state from Redux
	const isCreateOpen = useAppSelector(selectIsCreateOpen) as boolean
	const isChangeAssigneeOpen = useAppSelector(selectIsChangeAssigneeOpen) as boolean
	const isSprintCreateOpen = useAppSelector(selectIsSprintCreateOpen) as boolean
	const taskCreationData = useAppSelector(selectTaskCreationData) as { sprintId?: string; parentTaskId?: string; parentTaskName?: string }
	

	
	const isEditingSprintDescription = useAppSelector(selectIsEditingSprintDescription) as boolean
	const isEditingTaskDescription = useAppSelector(selectIsEditingTaskDescription) as boolean
	const isEditingSprintName = useAppSelector(selectIsEditingSprintName) as boolean
	const isEditingTaskName = useAppSelector(selectIsEditingTaskName) as boolean
	
	const sprintNameValue = useAppSelector(selectSprintNameValue) as string
	const taskNameValue = useAppSelector(selectTaskNameValue) as string
	const sprintEditorState = useAppSelector(selectSprintEditorState) as EditorState
	const taskEditorState = useAppSelector(selectTaskEditorState) as EditorState
	
	const showColorPicker = useAppSelector(selectShowColorPicker) as boolean
	const showSizeSelector = useAppSelector(selectShowSizeSelector) as boolean
	const currentEditorType = useAppSelector(selectCurrentEditorType) as 'sprint' | 'task' | null
	

	
	// Toolbar functions for Draft.js
	const handleKeyCommand = (command: string, editorState: EditorState) => {
		const newState = RichUtils.handleKeyCommand(editorState, command)
		if (newState) {
			return 'handled'
		}
		return 'not-handled'
	}

	const onBoldClick = (editorState: EditorState, setEditorState: (state: EditorState) => void) => {
		setEditorState(RichUtils.toggleInlineStyle(editorState, 'BOLD'))
	}

	const onItalicClick = (editorState: EditorState, setEditorState: (state: EditorState) => void) => {
		setEditorState(RichUtils.toggleInlineStyle(editorState, 'ITALIC'))
	}

	const onUnderlineClick = (editorState: EditorState, setEditorState: (state: EditorState) => void) => {
		setEditorState(RichUtils.toggleInlineStyle(editorState, 'UNDERLINE'))
	}

	// Color selection function
	const onColorClick = (color: string, editorState: EditorState, setEditorState: (state: EditorState) => void) => {
		const selection = editorState.getSelection()
		if (!selection.isCollapsed()) {
			// First, remove all existing color styles from the selection
			let newContentState = editorState.getCurrentContent()
			Object.keys(colorStyleMap).forEach(colorStyle => {
				newContentState = Modifier.removeInlineStyle(newContentState, selection, colorStyle as any)
			})
			
			// Then apply the new color style
			newContentState = Modifier.applyInlineStyle(newContentState, selection, color as any)
			const newEditorState = EditorState.push(editorState, newContentState, 'change-inline-style')
			setEditorState(newEditorState)
		}
		dispatch(setShowColorPicker(false))
	}

	// Font size selection function
	const onFontSizeClick = (fontSize: string, editorState: EditorState, setEditorState: (state: EditorState) => void) => {
		const selection = editorState.getSelection()
		if (!selection.isCollapsed()) {
			// First, remove all existing font size styles from the selection
			let newContentState = editorState.getCurrentContent()
			Object.keys(fontSizeStyleMap).forEach(sizeStyle => {
				newContentState = Modifier.removeInlineStyle(newContentState, selection, sizeStyle as any)
			})
			
			// Then apply the new font size style
			newContentState = Modifier.applyInlineStyle(newContentState, selection, fontSize as any)
			const newEditorState = EditorState.push(editorState, newContentState, 'change-inline-style')
			setEditorState(newEditorState)
		}
		dispatch(setShowSizeSelector(false))
	}

	// Helper function to get current editor state and setter
	const getCurrentEditorState = (): { state: EditorState; setState: (state: EditorState) => void } | null => {
		if (currentEditorType === 'sprint') {
			return { state: sprintEditorState, setState: (state: EditorState) => dispatch(setSprintEditorState(state)) }
		} else if (currentEditorType === 'task') {
			return { state: taskEditorState, setState: (state: EditorState) => dispatch(setTaskEditorState(state)) }
		}
		return null
	}

	// Create onChange handlers for the editors
	const handleSprintEditorChange = (newEditorState: EditorState) => {
		dispatch(setSprintEditorState(newEditorState))
	}

	const handleTaskEditorChange = (newEditorState: EditorState) => {
		dispatch(setTaskEditorState(newEditorState))
	}

	// Helper function to check if a style is applied to current selection
	const isStyleActive = (style: string) => {
		const editorInfo = getCurrentEditorState()
		if (!editorInfo) return false
		return editorInfo.state.getCurrentInlineStyle().has(style)
	}

	// Click outside handler to close color picker and size selector
	useEffect(() => {
		
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Element
			if (!target.closest('[data-color-picker]') && !target.closest('[data-size-selector]')) {
				dispatch(setShowColorPicker(false))
				dispatch(setShowSizeSelector(false))
			}
		}

		if (showColorPicker || showSizeSelector) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showColorPicker, showSizeSelector, dispatch])
	
	const { sub, unsub, emit } = useWebSocket()
	


	useEffect(() => {
		
		// Subscribe to WebSocket events using the context
		const handleSprintGetAll = (data: any) => {
			
			// Ensure we have an array of sprints
			let sprintsArray: Sprint[]
			if (Array.isArray(data)) {
				sprintsArray = data
			} else if (data && Array.isArray(data.sprints)) {
				sprintsArray = data.sprints
			} else if (data && Array.isArray(data.data)) {
				sprintsArray = data.data
			} else {
				console.warn('Unexpected sprints data format:', data)
				sprintsArray = []
			}
			
			dispatch(setSprints(sprintsArray))
		}

		const handleTaskSetStatus = (data: { event: string; id: string; result: any }) => {
			// Update the task status in Redux
			dispatch(updateTaskStatus({ taskId: data.id, status: data.result.status }))
		}

		const handleSprintSetStatus = (data: { event: string; id: string; result: any }) => {
			// Update the sprint status in Redux
			dispatch(updateSprintStatus({ sprintId: data.id, status: data.result.status }))
		}

		// Add handler for task:refresh events
		const handleTaskRefresh = (data: { sprintId: string; taskId: string; action?: string; new_assignee?: string; new_assignee_name?: string; new_description?: string; new_status?: string; new_name?: string }) => {
			
			// If the refreshed task is currently selected, update it
			if (selectedTask && selectedTask.id === data.taskId) {
				if (data.action === 'assignee_updated' && data.new_assignee) {
					// For assignee updates, update the task with new assignee ID and name
					const updatedTask = selectedTask ? { 
						...selectedTask, 
						assignedTo: data.new_assignee,
						assigneeName: data.new_assignee_name
					} as Task : null
					dispatch(setSelectedTask(updatedTask))
				} else if (data.action === 'description_updated' && data.new_description) {
					// For description updates, update the task with new description
					const updatedTask = selectedTask ? { 
						...selectedTask, 
						description: data.new_description
					} as Task : null
					dispatch(setSelectedTask(updatedTask))
				} else if (data.action === 'status_updated' && data.new_status) {
					// For status updates, update the task with new status
					const updatedTask = selectedTask ? { 
						...selectedTask, 
						status: data.new_status as Status
					} as Task : null
					dispatch(setSelectedTask(updatedTask))
				} else if (data.action === 'name_updated' && data.new_name) {
					// For name updates, update the task with new name
					const updatedTask = selectedTask ? { 
						...selectedTask, 
						title: data.new_name
					} as Task : null
					dispatch(setSelectedTask(updatedTask))
				} else if (data.action === 'created') {
					// For created actions, update the task's hasChildren property to true if it's a parent task
					const updatedTask = selectedTask ? { 
						...selectedTask, 
						hasChildren: true
					} as Task : null
					dispatch(setSelectedTask(updatedTask))
				} else {
					// For other actions, find the updated task in the sprints data
					const updatedTask = sprints
						.flatMap(sprint => sprint.tasks || [])
						.find(task => task.id === data.taskId)
					
					if (updatedTask) {
											dispatch(setSelectedTask(updatedTask))
					}
				}
			}
			
			// Update the task in the sprints list using proper Redux actions
			if (data.action === 'description_updated' && data.new_description) {
				dispatch(updateTaskDescription({ taskId: data.taskId, description: data.new_description }))
			}
			
			// Update the task in the sprints list for status updates
			if (data.action === 'status_updated' && data.new_status) {
				dispatch(updateTaskStatus({ taskId: data.taskId, status: data.new_status as Status }))
			}
			
			// Update the task in the sprints list for name updates
			if (data.action === 'name_updated' && data.new_name) {
				dispatch(updateTaskName({ taskId: data.taskId, name: data.new_name }))
			}
			
			// Update the task in the sprints list for created actions
			if (data.action === 'created') {
				const updatedSprints = (sprints as Sprint[]).map(sprint => ({
					...sprint,
					tasks: sprint.tasks?.map(task => 
						task.id === data.taskId ? { ...task, hasChildren: true } : task
					)
				}))
				dispatch(setSprints(updatedSprints))
			}
		}

		// Add handler for sprint:refresh events
		const handleSprintRefresh = (data: { sprintId: string; action?: string; new_description?: string; new_name?: string }) => {
			
			// If the refreshed sprint is currently selected, update it
			if (selectedSprint && selectedSprint.id === data.sprintId) {
							if (data.action === 'description_updated' && data.new_description) {
				// For description updates, update the sprint with new description
					const updatedSprint = selectedSprint ? { 
						...selectedSprint, 
						description: data.new_description
					} as Sprint : null
					dispatch(setSelectedSprint(updatedSprint))
				} else if (data.action === 'name_updated' && data.new_name) {
					// For name updates, update the sprint with new name
					const updatedSprint = selectedSprint ? { 
						...selectedSprint, 
						name: data.new_name
					} as Sprint : null
					dispatch(setSelectedSprint(updatedSprint))
				} else if (data.action === 'created') {
					// For created actions, update the sprint's hasChildren property to true
					const updatedSprint = selectedSprint ? { 
						...selectedSprint, 
						hasChildren: true
					} as Sprint : null
					dispatch(setSelectedSprint(updatedSprint))
				}
			}
			
			// Update the sprint in the sprints list using proper Redux actions
			if (data.action === 'description_updated' && data.new_description) {
				dispatch(updateSprintDescription({ sprintId: data.sprintId, description: data.new_description }))
			} else if (data.action === 'name_updated' && data.new_name) {
				dispatch(updateSprintName({ sprintId: data.sprintId, name: data.new_name }))
			} else if (data.action === 'created') {
				// For created actions, update the sprint's hasChildren property to true
				dispatch(updateSprintHasChildren({ sprintId: data.sprintId, hasChildren: true }))
			}
		}

		// Add handler for description update events
		const handleSprintDescriptionUpdate = (data: { id: string; description: string }) => {
			// Update the selected sprint with new description
			if (selectedSprint && selectedSprint.id === data.id) {
				const updatedSprint = { ...selectedSprint, description: data.description } as Sprint
				dispatch(setSelectedSprint(updatedSprint))
			}
			// Update the sprint in the sprints list
			const updatedSprints = (sprints as Sprint[]).map(sprint => 
				sprint.id === data.id ? { ...sprint, description: data.description } : sprint
			)
			dispatch(setSprints(updatedSprints))
		}

		const handleTaskDescriptionUpdate = (data: { id: string; description: string }) => {
			// Update the selected task with new description
			if (selectedTask && selectedTask.id === data.id) {
				const updatedTask = { ...selectedTask, description: data.description } as Task
				dispatch(setSelectedTask(updatedTask))
			}
			// Update the task in the sprints list
			const updatedSprints = (sprints as Sprint[]).map(sprint => ({
				...sprint,
				tasks: sprint.tasks?.map(task => 
					task.id === data.id ? { ...task, description: data.description } : task
				)
			}))
			dispatch(setSprints(updatedSprints))
		}

		const handleTaskDeleted = (data: { sprintId: string; taskId: string; action: string }) => {
			
			// If the deleted task is currently selected, unselect it
			if (selectedTask && selectedTask.id === data.taskId) {
				dispatch(setSelectedTask(null))
			}
			
			// Remove the task from the sprints data and update hasChildren if needed
			const updatedSprints = (sprints as Sprint[]).map(sprint => {
				if (sprint.id === data.sprintId) {
					const updatedTasks = sprint.tasks?.filter(task => task.id !== data.taskId) || []
					// If this was the last task in the sprint, set hasChildren to false
					const hasChildren = updatedTasks.length > 0
					return {
						...sprint,
						tasks: updatedTasks,
						hasChildren: hasChildren
					}
				}
				return sprint
			})
			dispatch(setSprints(updatedSprints))
			
			// If the deleted task was from the selected sprint, update the selected sprint too
			if (selectedSprint && selectedSprint.id === data.sprintId) {
				const updatedSprint = (sprints as Sprint[]).find(s => s.id === data.sprintId)
				if (updatedSprint) {
					const updatedTasks = updatedSprint.tasks?.filter(task => task.id !== data.taskId) || []
					const hasChildren = updatedTasks.length > 0
					const newSelectedSprint = { 
						...selectedSprint, 
						tasks: updatedTasks,
						hasChildren: hasChildren
					} as Sprint
					dispatch(setSelectedSprint(newSelectedSprint))
				}
			}
		}

		// Subscribe to events
		sub('sprint:get_all', handleSprintGetAll)
		sub('task:set_status', handleTaskSetStatus)
		sub('sprint:set_status', handleSprintSetStatus)
		sub('task:refresh', handleTaskRefresh)
		sub('sprint:refresh', handleSprintRefresh)
		sub('sprint:description_updated', handleSprintDescriptionUpdate)
		sub('task:description_updated', handleTaskDescriptionUpdate)
		sub('task.deleted', handleTaskDeleted)

		// Cleanup function
		return () => {
	
			unsub('sprint:get_all', handleSprintGetAll)
			unsub('task:set_status', handleTaskSetStatus)
			unsub('sprint:set_status', handleSprintSetStatus)
			unsub('task:refresh', handleTaskRefresh)
			unsub('sprint:refresh', handleSprintRefresh)
			unsub('sprint:description_updated', handleSprintDescriptionUpdate)
			unsub('task:description_updated', handleTaskDescriptionUpdate)
			unsub('task.deleted', handleTaskDeleted)
		}
	}, [sub, unsub, dispatch])

	// Start JWT refresh cycle when component mounts
	useEffect(() => {
		startRefreshCycle(60, true) // 60 seconds before expiry, show notifications
	}, [startRefreshCycle])





	const handleStatusChange = (newStatus: Status) => {
		if (selectedTask) {
			// Emit task status change using WebSocket context
			emit('task:set_status', {
				id: selectedTask.id,
				status: newStatus
			})
		} else if (selectedSprint) {
			// Emit sprint status change using WebSocket context
			emit('sprint:set_status', {
				id: selectedSprint.id,
				status: newStatus
			})
		}
	}

	const getStatusOptions = (): Status[] => {
		return Object.values(StatusEnum)
	}

	const currentStatus = useAppSelector(selectCurrentStatus)



	const handleAddTask = useCallback((sprintId?: string, parentTaskId?: string, parentTaskName?: string) => {
		
		dispatch(setTaskCreationData({ sprintId, parentTaskId, parentTaskName }))
		dispatch(setCreateModalOpen(true))
	}, [dispatch])

	const handleCloseModal = useCallback(() => {
		dispatch(setCreateModalOpen(false))
		dispatch(clearTaskCreationData())
	}, [dispatch])

	// Handler functions for editing descriptions
	const handleStartEditingSprintDescription = () => {
		// Convert plain string back to rich text when starting to edit
		const richTextState = convertPlainStringToRichText(selectedSprint?.description || '')
		dispatch(setSprintEditorState(richTextState))
		dispatch(setEditingSprintDescription(true))
		dispatch(setCurrentEditorType('sprint'))
	}

	const handleSaveSprintDescription = () => {
		if (selectedSprint) {
			const richTextString = convertRichTextToPlainString(sprintEditorState)
			
			// Update the sprint with new description using Redux
			dispatch(updateSprintDescription({ sprintId: selectedSprint.id, description: richTextString }))
			
			// Emit WebSocket event to save description on server
			emit('sprint:change_description', { id: selectedSprint.id, description: richTextString })
		}
		dispatch(setEditingSprintDescription(false))
	}

	const handleCancelSprintDescription = () => {
		dispatch(setEditingSprintDescription(false))
		dispatch(setSprintEditorState(EditorState.createEmpty()))
	}

	const handleStartEditingTaskDescription = () => {
		// Convert plain string back to rich text when starting to edit
		const richTextState = convertPlainStringToRichText(selectedTask?.description || '')
		dispatch(setTaskEditorState(richTextState))
		dispatch(setEditingTaskDescription(true))
		dispatch(setCurrentEditorType('task'))
	}

			const handleSaveTaskDescription = () => {
		if (selectedTask) {
			const richTextString = convertRichTextToPlainString(taskEditorState)
			
			// Update the task with new description
			const updatedTask = { ...selectedTask, description: richTextString }
			dispatch(setSelectedTask(updatedTask))
			
			// Update the task in the sprints list
			const updatedSprints = (sprints as Sprint[]).map(sprint => ({
				...sprint,
				tasks: sprint.tasks?.map(task => 
					task.id === selectedTask.id ? updatedTask : task
				)
			}))
			dispatch(setSprints(updatedSprints))
			
			// Emit WebSocket event to save description on server
			emit('task:change_description', { id: selectedTask.id, description: richTextString })
		}
		dispatch(setEditingTaskDescription(false))
	}

	const handleCancelTaskDescription = () => {
		dispatch(setEditingTaskDescription(false))
		dispatch(setTaskEditorState(EditorState.createEmpty()))
	}

	// Handler functions for editing sprint name
	const handleStartEditingSprintName = () => {
		dispatch(setSprintNameValue(selectedSprint?.name || ''))
		dispatch(setEditingSprintName(true))
	}

	const handleSaveSprintName = () => {
		if (selectedSprint && sprintNameValue.trim()) {
			// Only send the edit request to server, don't update client state
			emit('sprint:change_name', { id: selectedSprint.id, name: sprintNameValue.trim() })
		}
		dispatch(setEditingSprintName(false))
	}

	const handleCancelSprintName = () => {
		dispatch(setEditingSprintName(false))
		dispatch(setSprintNameValue(''))
	}

	// Handler functions for editing task name
	const handleStartEditingTaskName = () => {
		dispatch(setTaskNameValue(selectedTask?.title || ''))
		dispatch(setEditingTaskName(true))
	}

	const handleSaveTaskName = () => {
		if (selectedTask && taskNameValue.trim()) {
			// Only send the edit request to server, don't update client state
			emit('task:change_name', { id: selectedTask.id, name: taskNameValue.trim() })
		}
		dispatch(setEditingTaskName(false))
	}

	const handleCancelTaskName = () => {
		dispatch(setEditingTaskName(false))
		dispatch(setTaskNameValue(''))
	}

	return (
		<Box sx={{ p: 3, height: '100vh', position: 'relative' }}>
			
			<Typography variant="h4" gutterBottom>
				Dashboard
			</Typography>
			
							<OnlineUsersDisplay />
				<OnlineUsersWebSocketHandler />
			
			<Box sx={{ display: 'flex', gap: 3, minHeight: 'calc(100vh - 120px)', alignItems: 'flex-start' }}>
				<Paper sx={{ 
					p: 2, 
					display: 'flex',
					flexDirection: 'column',
					flexShrink: 0, // Prevent shrinking
					minWidth: '300px',
					maxWidth: '60vw' // Match the tree's max width
				}}>
					<Typography variant="h6" gutterBottom>
						Sprints
					</Typography>
					
					{/* Filter Controls */}
					<Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<input
								type="checkbox"
								id="hideCompletedSprints"
								checked={hideCompletedSprints}
								onChange={(e) => dispatch(setHideCompletedSprints(e.target.checked))}
							/>
							<label htmlFor="hideCompletedSprints">
								<Typography variant="body2">Hide completed sprints</Typography>
							</label>
						</Box>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<input
								type="checkbox"
								id="hideCompletedTasks"
								checked={hideCompletedTasks}
								onChange={(e) => dispatch(setHideCompletedTasks(e.target.checked))}
							/>
							<label htmlFor="hideCompletedTasks">
								<Typography variant="body2">Hide completed tasks</Typography>
							</label>
						</Box>
					</Box>
					
					<SprintTreeView
						onAddTask={handleAddTask}
					/>
				</Paper>
				
				{(selectedSprint || selectedTask) ? (
					<Paper sx={{ 
						p: 2, 
						flex: 1, // Take remaining space 
						position: 'sticky',
						top: '24px', // Space from top of viewport
						alignSelf: 'flex-start',
						maxHeight: 'calc(100vh - 48px)', // Leave some margin
						overflowY: 'auto',
						zIndex: 1000
					}}>
						<Typography variant="h6" gutterBottom>
							{selectedTask ? 'Task Details' : selectedSprint ? 'Sprint Details' : 'Details'}
						</Typography>
						
						{/* Status Dropdown */}
						<Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<Box sx={{ flex: 1 }}>
								{selectedTask && selectedSprint && (
									<Typography variant="body2" color="text.secondary">
										Sprint: {selectedSprint.name}
									</Typography>
								)}
							</Box>
							<FormControl size="small" sx={{ minWidth: 150 }}>
								<InputLabel>Status</InputLabel>
								<Select
									value={currentStatus || ''}
									label="Status"
									onChange={(e) => handleStatusChange(e.target.value as Status)}
								>
									{getStatusOptions().map((status) => (
										<MenuItem key={status} value={status}>
											{status.replace('_', ' ')}
										</MenuItem>
									))}
								</Select>
							</FormControl>
						</Box>

					{selectedSprint && !selectedTask && (
						<Box>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
								{isEditingSprintName ? (
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
										<TextField
											value={sprintNameValue}
											onChange={(e) => dispatch(setSprintNameValue(e.target.value))}
											variant="outlined"
											size="small"
											sx={{ flex: 1 }}
											autoFocus
											onKeyPress={(e) => {
												if (e.key === 'Enter') {
													handleSaveSprintName()
												} else if (e.key === 'Escape') {
													handleCancelSprintName()
												}
											}}
										/>
										<IconButton
											size="small"
											color="primary"
											onClick={handleSaveSprintName}
										>
											<SaveIcon />
										</IconButton>
										<IconButton
											size="small"
											color="error"
											onClick={handleCancelSprintName}
										>
											<CancelIcon />
										</IconButton>
									</Box>
								) : (
									<>
										<Typography variant="h5">{selectedSprint.name}</Typography>
										<IconButton
											size="small"
											onClick={handleStartEditingSprintName}
										>
											<EditIcon />
										</IconButton>
									</>
								)}
								{selectedSprint.status && (
									<Chip
										label={selectedSprint.status.replace('_', ' ')}
										size="small"
										sx={{
											backgroundColor: selectedSprint.status === 'OPEN' ? '#ff9800' : 
															selectedSprint.status === 'IN_PROGRESS' ? '#2196f3' : 
															selectedSprint.status === 'COMPLETED' ? '#4caf50' : '#757575',
											color: 'white',
											fontSize: '0.7rem',
											height: 24,
										}}
									/>
								)}
							</Box>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
								{isEditingSprintDescription ? (
									<Box sx={{ flex: 1 }}>
										{/* Toolbar */}
										<Box sx={{ display: 'flex', gap: 1, mb: 1, p: 1, border: '1px solid #ccc', borderBottom: 'none', backgroundColor: '#f5f5f5', flexWrap: 'wrap' }}>
											<IconButton
												size="small"
												onClick={() => onBoldClick(sprintEditorState, handleSprintEditorChange)}
												sx={{ 
													backgroundColor: sprintEditorState.getCurrentInlineStyle().has('BOLD') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<strong>B</strong>
											</IconButton>
											<IconButton
												size="small"
												onClick={() => onItalicClick(sprintEditorState, handleSprintEditorChange)}
												sx={{ 
													backgroundColor: sprintEditorState.getCurrentInlineStyle().has('ITALIC') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<em>I</em>
											</IconButton>
											<IconButton
												size="small"
												onClick={() => onUnderlineClick(sprintEditorState, handleSprintEditorChange)}
												sx={{ 
													backgroundColor: sprintEditorState.getCurrentInlineStyle().has('UNDERLINE') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<u>U</u>
											</IconButton>
											
											{/* Color Picker */}
											<Box sx={{ position: 'relative', display: 'inline-block' }}>
												<IconButton
													size="small"
													onClick={() => dispatch(setShowColorPicker(!showColorPicker))}
													sx={{ 
														backgroundColor: isStyleActive('COLOR_RED') || isStyleActive('COLOR_ORANGE') || isStyleActive('COLOR_YELLOW') || isStyleActive('COLOR_GREEN') || isStyleActive('COLOR_BLUE') || isStyleActive('COLOR_PURPLE') || isStyleActive('COLOR_PINK') || isStyleActive('COLOR_BLACK') || isStyleActive('COLOR_GRAY') ? '#e3f2fd' : 'transparent',
														'&:hover': { backgroundColor: '#e3f2fd' }
													}}
												>
													<ColorIcon fontSize="small" />
												</IconButton>
												{showColorPicker && currentEditorType === 'sprint' && (
													<Box sx={{ 
														position: 'absolute', 
														top: '100%', 
														left: 0, 
														zIndex: 1000, 
														backgroundColor: 'white', 
														border: '1px solid #ccc', 
														borderRadius: '4px', 
														p: 1,
														display: 'grid',
														gridTemplateColumns: 'repeat(3, 1fr)',
														gap: 0.5,
														minWidth: '120px'
													}} data-color-picker>
														{Object.entries(colorStyleMap).map(([key, style]) => (
															<Box
																key={key}
																onClick={() => onColorClick(key, sprintEditorState, handleSprintEditorChange)}
																sx={{
																	width: '24px',
																	height: '24px',
																	backgroundColor: style.color,
																	border: '1px solid #ccc',
																	borderRadius: '2px',
																	cursor: 'pointer',
																	'&:hover': { opacity: 0.8 }
																}}
																title={key.replace('COLOR_', '').toLowerCase()}
															/>
														))}
													</Box>
												)}
											</Box>
											
											{/* Font Size Selector */}
											<Box sx={{ position: 'relative', display: 'inline-block' }}>
												<IconButton
													size="small"
													onClick={() => dispatch(setShowSizeSelector(!showSizeSelector))}
													sx={{ 
														backgroundColor: isStyleActive('FONT_SIZE_SMALL') || isStyleActive('FONT_SIZE_NORMAL') || isStyleActive('FONT_SIZE_LARGE') ? '#e3f2fd' : 'transparent',
														'&:hover': { backgroundColor: '#e3f2fd' }
													}}
												>
													<SizeIcon fontSize="small" />
												</IconButton>
												{showSizeSelector && currentEditorType === 'sprint' && (
													<Box sx={{ 
														position: 'absolute', 
														top: '100%', 
														left: 0, 
														zIndex: 1000, 
														backgroundColor: 'white', 
														border: '1px solid #ccc', 
														borderRadius: '4px', 
														p: 1,
														minWidth: '80px'
													}} data-size-selector>
														{Object.entries(fontSizeStyleMap).map(([key, style]) => (
															<Box
																key={key}
																onClick={() => onFontSizeClick(key, sprintEditorState, handleSprintEditorChange)}
																sx={{
																	p: 0.5,
																	cursor: 'pointer',
																	fontSize: style.fontSize,
																	'&:hover': { backgroundColor: '#f0f0f0' },
																	borderRadius: '2px'
																}}
															>
																{key.replace('FONT_SIZE_', '').toLowerCase()}
															</Box>
														))}
													</Box>
												)}
											</Box>
										</Box>
										{/* Editor */}
										<Box sx={{ border: '1px solid #ccc', padding: '10px', minHeight: '120px' }}>
											<Editor
												editorState={sprintEditorState}
												onChange={handleSprintEditorChange}
												handleKeyCommand={(command) => handleKeyCommand(command, sprintEditorState)}
												placeholder="Enter sprint description..."
												customStyleMap={customStyleMap}
											/>
										</Box>
										<Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
											<IconButton
												size="small"
												color="primary"
												onClick={handleSaveSprintDescription}
											>
												<SaveIcon />
											</IconButton>
											<IconButton
												size="small"
												color="error"
												onClick={handleCancelSprintDescription}
											>
												<CancelIcon />
											</IconButton>
										</Box>
									</Box>
								) : (
									<>
										<Box sx={{ flex: 1 }}>
											<Box sx={{ border: '1px solid #ccc', padding: '10px', minHeight: '120px', backgroundColor: '#f9f9f9' }}>
												<Editor
													editorState={convertPlainStringToRichText(selectedSprint?.description || '')}
													onChange={() => {}} // No-op function for read-only
													readOnly={true}
													placeholder="No description"
													customStyleMap={customStyleMap}
												/>
											</Box>
										</Box>
										<IconButton
											size="small"
											onClick={handleStartEditingSprintDescription}
										>
											<EditIcon />
										</IconButton>
									</>
								)}
							</Box>
							{selectedSprint.startDate && selectedSprint.endDate && (
								<Typography variant="body2" sx={{ mt: 1 }}>
									{selectedSprint.startDate} - {selectedSprint.endDate}
								</Typography>
							)}
						</Box>
					)}
					{selectedTask && (
						<Box sx={{ mt: 2 }}>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
								{isEditingTaskName ? (
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
										<TextField
											value={taskNameValue}
											onChange={(e) => dispatch(setTaskNameValue(e.target.value))}
											variant="outlined"
											size="small"
											sx={{ flex: 1 }}
											autoFocus
											onKeyPress={(e) => {
												if (e.key === 'Enter') {
													handleSaveTaskName()
												} else if (e.key === 'Escape') {
													handleCancelTaskName()
												}
											}}
										/>
										<IconButton
											size="small"
											color="primary"
											onClick={handleSaveTaskName}
										>
											<SaveIcon />
										</IconButton>
										<IconButton
											size="small"
											color="error"
											onClick={handleCancelTaskName}
										>
											<CancelIcon />
										</IconButton>
									</Box>
								) : (
									<>
										<Typography variant="h6">{selectedTask.title}</Typography>
										<IconButton
											size="small"
											onClick={handleStartEditingTaskName}
										>
											<EditIcon />
										</IconButton>
									</>
								)}
								{selectedTask.status && (
									<Chip
										label={selectedTask.status.replace('_', ' ')}
										size="small"
										sx={{
											backgroundColor: selectedTask.status === 'OPEN' ? '#ff9800' : 
															selectedTask.status === 'IN_PROGRESS' ? '#2196f3' : 
															selectedTask.status === 'COMPLETED' ? '#4caf50' : '#757575',
											color: 'white',
											fontSize: '0.7rem',
											height: 24,
										}}
									/>
								)}
							</Box>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
								{isEditingTaskDescription ? (
									<Box sx={{ flex: 1 }}>
										{/* Toolbar */}
										<Box sx={{ display: 'flex', gap: 1, mb: 1, p: 1, border: '1px solid #ccc', borderBottom: 'none', backgroundColor: '#f5f5f5', flexWrap: 'wrap' }}>
											<IconButton
												size="small"
												onClick={() => onBoldClick(taskEditorState, handleTaskEditorChange)}
												sx={{ 
													backgroundColor: taskEditorState.getCurrentInlineStyle().has('BOLD') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<strong>B</strong>
											</IconButton>
											<IconButton
												size="small"
												onClick={() => onItalicClick(taskEditorState, handleTaskEditorChange)}
												sx={{ 
													backgroundColor: taskEditorState.getCurrentInlineStyle().has('ITALIC') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<em>I</em>
											</IconButton>
											<IconButton
												size="small"
												onClick={() => onUnderlineClick(taskEditorState, handleTaskEditorChange)}
												sx={{ 
													backgroundColor: taskEditorState.getCurrentInlineStyle().has('UNDERLINE') ? '#e3f2fd' : 'transparent',
													'&:hover': { backgroundColor: '#e3f2fd' }
												}}
											>
												<u>U</u>
											</IconButton>
											
											{/* Color Picker */}
											<Box sx={{ position: 'relative', display: 'inline-block' }}>
												<IconButton
													size="small"
													onClick={() => dispatch(setShowColorPicker(!showColorPicker))}
													sx={{ 
														backgroundColor: isStyleActive('COLOR_RED') || isStyleActive('COLOR_ORANGE') || isStyleActive('COLOR_YELLOW') || isStyleActive('COLOR_GREEN') || isStyleActive('COLOR_BLUE') || isStyleActive('COLOR_PURPLE') || isStyleActive('COLOR_PINK') || isStyleActive('COLOR_BLACK') || isStyleActive('COLOR_GRAY') ? '#e3f2fd' : 'transparent',
														'&:hover': { backgroundColor: '#e3f2fd' }
													}}
												>
													<ColorIcon fontSize="small" />
												</IconButton>
												{showColorPicker && currentEditorType === 'task' && (
													<Box sx={{ 
														position: 'absolute', 
														top: '100%', 
														left: 0, 
														zIndex: 1000, 
														backgroundColor: 'white', 
														border: '1px solid #ccc', 
														borderRadius: '4px', 
														p: 1,
														display: 'grid',
														gridTemplateColumns: 'repeat(3, 1fr)',
														gap: 0.5,
														minWidth: '120px'
													}} data-color-picker>
														{Object.entries(colorStyleMap).map(([key, style]) => (
															<Box
																key={key}
																onClick={() => onColorClick(key, taskEditorState, handleTaskEditorChange)}
																sx={{
																	width: '24px',
																	height: '24px',
																	backgroundColor: style.color,
																	border: '1px solid #ccc',
																	borderRadius: '2px',
																	cursor: 'pointer',
																	'&:hover': { opacity: 0.8 }
																}}
																title={key.replace('COLOR_', '').toLowerCase()}
															/>
														))}
													</Box>
												)}
											</Box>
											
											{/* Font Size Selector */}
											<Box sx={{ position: 'relative', display: 'inline-block' }}>
												<IconButton
													size="small"
													onClick={() => dispatch(setShowSizeSelector(!showSizeSelector))}
													sx={{ 
														backgroundColor: isStyleActive('FONT_SIZE_SMALL') || isStyleActive('FONT_SIZE_NORMAL') || isStyleActive('FONT_SIZE_LARGE') ? '#e3f2fd' : 'transparent',
														'&:hover': { backgroundColor: '#e3f2fd' }
													}}
												>
													<SizeIcon fontSize="small" />
												</IconButton>
												{showSizeSelector && currentEditorType === 'task' && (
													<Box sx={{ 
														position: 'absolute', 
														top: '100%', 
														left: 0, 
														zIndex: 1000, 
														backgroundColor: 'white', 
														border: '1px solid #ccc', 
														borderRadius: '4px', 
														p: 1,
														minWidth: '80px'
													}} data-size-selector>
														{Object.entries(fontSizeStyleMap).map(([key, style]) => (
															<Box
																key={key}
																onClick={() => onFontSizeClick(key, taskEditorState, handleTaskEditorChange)}
																sx={{
																	p: 0.5,
																	cursor: 'pointer',
																	fontSize: style.fontSize,
																	'&:hover': { backgroundColor: '#f0f0f0' },
																	borderRadius: '2px'
																}}
															>
																{key.replace('FONT_SIZE_', '').toLowerCase()}
															</Box>
														))}
													</Box>
												)}
											</Box>
										</Box>
										{/* Editor */}
										<Box sx={{ border: '1px solid #ccc', padding: '10px', minHeight: '120px' }}>
											<Editor
												editorState={taskEditorState}
												onChange={handleTaskEditorChange}
												handleKeyCommand={(command) => handleKeyCommand(command, taskEditorState)}
												placeholder="Enter task description..."
												customStyleMap={customStyleMap}
											/>
										</Box>
										<Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
											<IconButton
												size="small"
												color="primary"
												onClick={handleSaveTaskDescription}
											>
												<SaveIcon />
											</IconButton>
											<IconButton
												size="small"
												color="error"
												onClick={handleCancelTaskDescription}
											>
												<CancelIcon />
											</IconButton>
										</Box>
									</Box>
								) : (
									<>
										<Box sx={{ flex: 1 }}>
											<Box sx={{ border: '1px solid #ccc', padding: '10px', minHeight: '120px', backgroundColor: '#f9f9f9' }}>
												<Editor
													editorState={convertPlainStringToRichText(selectedTask?.description || '')}
													onChange={() => {}} // No-op function for read-only
													readOnly={true}
													placeholder="No description"
													customStyleMap={customStyleMap}
												/>
											</Box>
										</Box>
										<IconButton
											size="small"
											onClick={handleStartEditingTaskDescription}
										>
											<EditIcon />
										</IconButton>
									</>
								)}
							</Box>
							<Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
								<Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
									Current assignee:
								</Typography>
								<Button
									variant="outlined"
									color="primary"
									onClick={() => dispatch(setChangeAssigneeModalOpen(true))}
									size="small"
									sx={{ minWidth: '150px' }}
								>
									{selectedTask.assigneeName || 'Unassigned'}
								</Button>
							</Box>
						</Box>
					)}
				</Paper>
				) : null}
			</Box>
			
			<TaskCreationModal 
				open={isCreateOpen} 
				onClose={handleCloseModal} 
				selectedSprintId={taskCreationData.sprintId}
				selectedParentTaskId={taskCreationData.parentTaskId}
				selectedParentTaskName={taskCreationData.parentTaskName}
			/>
			
			<ChangeAssigneeModal
				open={isChangeAssigneeOpen}
				onClose={() => dispatch(setChangeAssigneeModalOpen(false))}
				taskId={selectedTask?.id}
				taskTitle={selectedTask?.title}
				currentAssigneeId={selectedTask?.assignedTo}
			/>
			
			<SprintCreationModal
				open={isSprintCreateOpen}
				onClose={() => dispatch(setSprintCreateModalOpen(false))}
			/>
			
			{/* Floating Action Button */}
			<Fab
				color="primary"
				aria-label="add"
				sx={{
					position: 'fixed',
					top: 16,
					left: 16,
					zIndex: 1000,
				}}
				onClick={() => dispatch(setSprintCreateModalOpen(true))}
			>
				<AddIcon />
			</Fab>
		</Box>
	)
}

