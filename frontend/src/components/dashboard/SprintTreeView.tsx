import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
	Box,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Collapse,
	Typography,
	Chip,
	CircularProgress,
	Button,
	Tooltip,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	IconButton,
} from '@mui/material'
import {
	ExpandMore,
	ExpandLess,
	PlaylistPlay,
	Timeline,
	DirectionsRun,
	Speed,
	TrackChanges,
	Assignment,
	Add,
	Delete,
} from '@mui/icons-material'
import type { Task, Sprint, PaginationState } from '../../types'
import { useSession } from '../../features/auth/hooks/useSession'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { 
	setSelectedSprint,
	setSelectedTask,
	updateSprintTasks,
	updateSprintHasChildren,
	updateTaskAssignee,
	removeTask
} from '../../features/sprints/sprintsSlice'
import {
	selectFilteredSprints, 
	selectSelectedSprint, 
	selectSelectedTask,
	selectFilteredTasks
} from '../../features/sprints/sprintsSelectors'

// Utility function to strip formatting tags and return plain text
const stripFormattingTags = (text: string): string => {
	if (!text) return ''
	// Remove all HTML-style formatting tags like <BOLD>, <ITALIC>, etc.
	return text.replace(/<[^>]*>/g, '')
}

// Array of sprint icons to randomly select from
const sprintIcons = [PlaylistPlay, Timeline, DirectionsRun, Speed, TrackChanges]

// Function to get a random icon for a sprint based on its ID
const getSprintIcon = (sprintId: string) => {
	// Use sprint ID as seed for consistent random selection
	const hash = sprintId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
	const iconIndex = hash % sprintIcons.length
	return sprintIcons[iconIndex]
}

// Utility function to get status color
const getStatusColor = (status: string): string => {
	switch (status) {
		case 'COMPLETED':
			return '#4caf50'
		case 'IN_PROGRESS':
			return '#ff9800'
		case 'OPEN':
			return '#2196f3'
		default:
			return '#757575'
	}
}

interface SprintTreeViewProps {
	onAddTask?: (sprintId?: string, parentTaskId?: string, parentTaskName?: string) => void
}

// Function to calculate the maximum depth of expanded tasks
const calculateMaxDepth = (
	sprints: Sprint[],
	expandedSprints: Set<string>,
	expandedTasks: Set<string>,
	taskChildren: Record<string, Task[]>
): number => {
	let maxDepth = 0

	for (const sprint of sprints) {
		if (!expandedSprints.has(sprint.id)) continue

		const tasks = sprint.tasks || []
		for (const task of tasks) {
			const depth = calculateTaskDepth(task, expandedTasks, taskChildren, 1)
			maxDepth = Math.max(maxDepth, depth)
		}
	}

	return maxDepth
}

// Recursive function to calculate task depth
const calculateTaskDepth = (
	task: Task,
	expandedTasks: Set<string>,
	taskChildren: Record<string, Task[]>,
	currentDepth: number
): number => {
	let maxDepth = currentDepth

	if (expandedTasks.has(task.id) && taskChildren[task.id]) {
		for (const childTask of taskChildren[task.id]) {
			const childDepth = calculateTaskDepth(childTask, expandedTasks, taskChildren, currentDepth + 1)
			maxDepth = Math.max(maxDepth, childDepth)
		}
	}

	return maxDepth
}

// Recursive Task Renderer Component
interface TaskRendererProps {
	task: Task
	sprintId: string
	depth: number
	selectedTask?: Task | null
	onTaskClick: (task: Task) => void
	onDeleteTask: (task: Task) => void
	onAddTask?: (sprintId?: string, parentTaskId?: string, parentTaskName?: string) => void
	expandedTasks: Set<string>
	onTaskToggle: (taskId: string) => void
	taskChildren: Record<string, Task[]>
	loadingChildren: Set<string>
	childrenPaginationState: Record<string, PaginationState>
	onChildrenPaginationNav: (taskId: string, action: 'first' | 'prev' | 'next' | 'last') => void
	filterTasks: (tasks: Task[]) => Task[]
}

const TaskRenderer: React.FC<TaskRendererProps> = ({
	task,
	sprintId,
	depth,
	selectedTask,
	onTaskClick,
	onDeleteTask,
	onAddTask,
	expandedTasks,
	onTaskToggle,
	taskChildren,
	loadingChildren,
	childrenPaginationState,
	onChildrenPaginationNav,
	filterTasks,
}) => {
	const isTaskExpanded = expandedTasks.has(task.id)
	// Check both server-provided hasChildren and local taskChildren state
	const hasChildren = task.hasChildren || (taskChildren[task.id] && taskChildren[task.id].length > 0) || false
	const paddingLeft = 1 + (depth * 0.5) // Dynamic padding based on depth
	

	
	return (
		<Box>
			<ListItem disablePadding sx={{ pl: depth > 0 ? 0 : paddingLeft }}>
				<ListItemButton
					onClick={() => onTaskClick(task)}
					sx={{
						py: 1,
						borderRadius: 1,
						backgroundColor: selectedTask?.id === task.id ? '#e8f5e8' : 'transparent',
						color: selectedTask?.id === task.id ? '#2e7d32' : 'inherit',
						'&:hover': {
							backgroundColor: selectedTask?.id === task.id ? '#c8e6c9' : 'action.hover',
						},
					}}
				>
					<ListItemIcon sx={{ minWidth: 0 }}>
						<Assignment fontSize="small" />
					</ListItemIcon>
					<ListItemText
						primary={
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<Typography variant="body2">
									{task.title}
								</Typography>
								{task.status && (
									<Chip
										label={task.status.replace('_', ' ')}
										size="small"
										sx={{
											backgroundColor: getStatusColor(task.status),
											color: 'white',
											fontSize: '0.7rem',
											height: 20,
										}}
									/>
								)}
								{task.hours && (
									<Chip
										label={`${task.hours}h`}
										size="small"
										variant="outlined"
										sx={{
											fontSize: '0.7rem',
											height: 20,
											borderColor: 'primary.main',
											color: 'primary.main',
										}}
									/>
								)}
							</Box>
						}
						secondary={
							task.description && (
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										display: '-webkit-box',
										WebkitLineClamp: 2,
										WebkitBoxOrient: 'vertical',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										mt: 0.5,
										lineHeight: 1.2,
									}}
								>
									{stripFormattingTags(task.description)}
								</Typography>
							)
						}
					/>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<Tooltip title="Add Child Task" placement="top">
							<IconButton
								size="small"
								onClick={(e) => {
									e.stopPropagation()
									onAddTask?.(sprintId, task.id, task.title)
								}}
								sx={{
									color: 'primary.main',
									'&:hover': {
										backgroundColor: 'action.hover',
									},
								}}
							>
								<Add fontSize="small" />
							</IconButton>
						</Tooltip>
						<Tooltip title="Delete Task" placement="top">
							<IconButton
								size="small"
								onClick={(e) => {
									e.stopPropagation()
									onDeleteTask(task)
								}}
								sx={{
									color: 'text.secondary',
									'&:hover': {
										backgroundColor: 'action.hover',
									},
								}}
							>
								<Delete fontSize="small" />
							</IconButton>
						</Tooltip>
						{hasChildren && (
							<Box
								onClick={(e) => {
									e.stopPropagation()
									onTaskToggle(task.id)
								}}
								sx={{ cursor: 'pointer' }}
							>
								{isTaskExpanded ? <ExpandLess /> : <ExpandMore />}
							</Box>
						)}
					</Box>
				</ListItemButton>
			</ListItem>
			
			{/* Recursive nesting for task children at any depth */}
			{hasChildren && (
				<Collapse in={isTaskExpanded} timeout="auto" unmountOnExit>
					<List component="div" disablePadding sx={{ pl: paddingLeft + 0.5 }}>
						
						{loadingChildren.has(task.id) ? (
							<ListItem disablePadding>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
									<CircularProgress size={16} />
									<Typography variant="caption" color="text.secondary">
										Loading children...
									</Typography>
								</Box>
							</ListItem>
						) : taskChildren[task.id] ? (
							filterTasks(taskChildren[task.id]).map((childTask) => (
								<TaskRenderer
									key={childTask.id}
									task={childTask}
									sprintId={sprintId}
									depth={depth + 1}
									selectedTask={selectedTask}
									onTaskClick={onTaskClick}
									onDeleteTask={onDeleteTask}
									onAddTask={onAddTask}
									expandedTasks={expandedTasks}
									onTaskToggle={onTaskToggle}
									taskChildren={taskChildren}
									loadingChildren={loadingChildren}
									childrenPaginationState={childrenPaginationState}
									onChildrenPaginationNav={onChildrenPaginationNav}
									filterTasks={filterTasks}
								/>
							))
						) : (
							<ListItem disablePadding>
								<Box sx={{ py: 1 }}>
									<Typography variant="caption" color="text.secondary">
										No child tasks found
									</Typography>
								</Box>
							</ListItem>
						)}
						
						{/* Children Pagination controls */}
						{(() => {
							const currentChildrenPagination = childrenPaginationState[task.id]
							return currentChildrenPagination && currentChildrenPagination.totalTasks > currentChildrenPagination.pageSize && (
								<Box sx={{ display: 'flex', justifyContent: 'center', p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, m: 1, ml: 2, mr: 2 }}>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
										<Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
											{currentChildrenPagination.totalTasks} children
										</Typography>
										
										{/* First page button */}
										<IconButton
											size="small"
											onClick={() => onChildrenPaginationNav(task.id, 'first')}
											disabled={currentChildrenPagination.currentPage <= 1}
											sx={{ 
												p: 0.5,
												border: '1px solid #e0e0e0',
												'&:hover': {
													backgroundColor: 'action.hover',
												}
											}}
										>
											<Typography variant="caption" fontWeight="bold">«</Typography>
										</IconButton>
										
										{/* Previous page button */}
										<IconButton
											size="small"
											onClick={() => onChildrenPaginationNav(task.id, 'prev')}
											disabled={currentChildrenPagination.currentPage <= 1}
											sx={{ 
												p: 0.5,
												border: '1px solid #e0e0e0',
												'&:hover': {
													backgroundColor: 'action.hover',
												}
											}}
										>
											<Typography variant="caption" fontWeight="bold">‹</Typography>
										</IconButton>
										
										{/* Current page indicator */}
										<Typography variant="caption" sx={{ px: 1, fontWeight: 'bold', color: 'primary.main' }}>
											{((currentChildrenPagination.currentPage - 1) * currentChildrenPagination.pageSize) + 1}-{Math.min(currentChildrenPagination.currentPage * currentChildrenPagination.pageSize, currentChildrenPagination.totalTasks)}
										</Typography>
										
										{/* Next page button */}
										<IconButton
											size="small"
											onClick={() => onChildrenPaginationNav(task.id, 'next')}
											disabled={currentChildrenPagination.currentPage >= Math.ceil(currentChildrenPagination.totalTasks / currentChildrenPagination.pageSize)}
											sx={{ 
												p: 0.5,
												border: '1px solid #e0e0e0',
												'&:hover': {
													backgroundColor: 'action.hover',
												}
											}}
										>
											<Typography variant="caption" fontWeight="bold">›</Typography>
										</IconButton>
										
										{/* Last page button */}
										<IconButton
											size="small"
											onClick={() => onChildrenPaginationNav(task.id, 'last')}
											disabled={currentChildrenPagination.currentPage >= Math.ceil(currentChildrenPagination.totalTasks / currentChildrenPagination.pageSize)}
											sx={{ 
												p: 0.5,
												border: '1px solid #e0e0e0',
												'&:hover': {
													backgroundColor: 'action.hover',
												}
											}}
										>
											<Typography variant="caption" fontWeight="bold">»</Typography>
										</IconButton>
									</Box>
								</Box>
							)
						})()}
					</List>
				</Collapse>
			)}
		</Box>
	)
}

const SprintTreeView: React.FC<SprintTreeViewProps> = ({
	onAddTask,
}) => {
	const dispatch = useAppDispatch()
	

	

	
	// Get state from Redux
	const sprints = useAppSelector(selectFilteredSprints) as Sprint[]
	const selectedSprint = useAppSelector(selectSelectedSprint) as Sprint | null
	const selectedTask = useAppSelector(selectSelectedTask) as Task | null
	const filterTasksFn = useAppSelector(selectFilteredTasks) as (tasks: Task[]) => Task[]
	

	
	const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set())
	const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
	
	// Ref to store current expandedSprints for event handlers
	const expandedSprintsRef = useRef<Set<string>>(new Set())
	
	const [taskChildren, setTaskChildren] = useState<Record<string, Task[]>>({})
	const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set())
	
	// Pagination state for child tasks - each parent task has its own pagination
	const [childrenPaginationState, setChildrenPaginationState] = useState<Record<string, PaginationState>>({})
	
	// Ref to store current child pagination state for event handlers
	const childrenPaginationStateRef = useRef<Record<string, PaginationState>>({})
	
	// Keep the ref in sync with the state
	useEffect(() => {
		childrenPaginationStateRef.current = childrenPaginationState
	}, [childrenPaginationState])
	const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState(false)
	const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
	const [deleteSprintDialogOpen, setDeleteSprintDialogOpen] = useState(false)
	const [sprintToDelete, setSprintToDelete] = useState<Sprint | null>(null)
	
	// Pagination state - each sprint has its own pagination
	const [paginationState, setPaginationState] = useState<Record<string, PaginationState>>({})
	const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set())
	
	// Ref to store current pagination state for event handlers
	const paginationStateRef = useRef<Record<string, PaginationState>>({})
	
	// Keep the ref in sync with the state
	useEffect(() => {
		paginationStateRef.current = paginationState
	}, [paginationState])
	
	// Keep the ref in sync with the state
	useEffect(() => {
		expandedSprintsRef.current = expandedSprints
	}, [expandedSprints])
	

	

	

	

	
	// Ref to store scroll position
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const [scrollPosition, setScrollPosition] = useState(0)
	const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false)
	
	// Effect to restore scroll position after render
	useEffect(() => {
		if (shouldRestoreScroll && scrollContainerRef.current) {
			const timer = setTimeout(() => {
				if (scrollContainerRef.current) {
					scrollContainerRef.current.scrollTop = scrollPosition
					setShouldRestoreScroll(false)
				}
			}, 50)
			return () => clearTimeout(timer)
		}
	}, [shouldRestoreScroll, scrollPosition])
	
	// Filter task children based on hideCompletedTasks
	const filteredTaskChildren = useMemo(() => {
		const filtered: Record<string, Task[]> = {}
		Object.entries(taskChildren).forEach(([taskId, children]) => {
			const filteredChildren = filterTasksFn(children)
			if (filteredChildren.length > 0) {
				filtered[taskId] = filteredChildren
			}
		})
		return filtered
	}, [taskChildren, filterTasksFn])
	
		const { isAuthenticated, isLoading } = useSession()
		const { sub, unsub, emit } = useWebSocket()
	


	
	
	// Stabilize the callback to prevent socket reconnection
	const stableOnSprintTasksUpdate = useCallback((sprintId: string, tasks: Task[]) => {
		dispatch(updateSprintTasks({ sprintId, tasks }))
	}, [dispatch])

	// Initialize WebSocket event subscriptions
	useEffect(() => {

		
		// Don't subscribe if still loading or not authenticated
		if (isLoading || !isAuthenticated) {
			return
		}

		// Event handlers
		const handleTaskGetChildrenByIndex = (data: { taskId: string; children: Task[]; pagination: { total: number; currentIndex: number; startIndex: number; endIndex: number; hasNext: boolean; hasPrev: boolean; limit: number } }) => {
			
			// Extract pagination info from the server response
			const { total, currentIndex, limit, hasNext } = data.pagination
			
			// Calculate current page (1-based)
			const currentPage = Math.floor(currentIndex / limit) + 1
			

			
			// Update pagination state for children
			setChildrenPaginationState(prev => {
				const newState = {
					...prev,
					[data.taskId]: {
						currentPage: currentPage,
						pageSize: limit,
						totalTasks: total,
						hasMore: hasNext
					}
				}

				return newState
			})
			
			// Update children for the task
			setTaskChildren(prev => ({
				...prev,
				[data.taskId]: data.children
			}))

			
			// Remove loading state
			setLoadingChildren(prev => {
				const newSet = new Set(prev)
				newSet.delete(data.taskId)
				return newSet
			})
		}

		const handleTaskGetByIndex = (data: { sprintId: string; tasks: Task[]; pagination: { total: number; currentIndex: number; startIndex: number; endIndex: number; hasNext: boolean; hasPrev: boolean; limit: number } }) => {
			
			// Extract pagination info from the server response
			const { total, currentIndex, limit, hasNext } = data.pagination
			
			// Calculate current page (1-based)
			const currentPage = Math.floor(currentIndex / limit) + 1
			

			
			// Update pagination state
			setPaginationState(prev => {
				const newState = {
					...prev,
					[data.sprintId]: {
						currentPage: currentPage,
						pageSize: limit,
						totalTasks: total,
						hasMore: hasNext
					}
				}

				return newState
			})
			
			// Only update tasks if the sprint is currently expanded
			// This prevents losing tree contents when the sprint is collapsed
			if (expandedSprintsRef.current.has(data.sprintId)) {
				// Update tasks for the sprint
				stableOnSprintTasksUpdate(data.sprintId, data.tasks)
			}
			
			// Remove loading state
			setLoadingTasks(prev => {
				const newSet = new Set(prev)
				newSet.delete(data.sprintId)
				return newSet
			})
			
			// Mark that we should restore scroll position after render
			// The useEffect will handle the actual restoration
		}

		const handleTaskRefresh = (data: { sprintId: string; taskId: string; action?: string; new_description?: string; new_assignee?: string; new_assignee_name?: string }) => {
			// If only assignee changed, update selected task's assignee and exit
			if (data.action === 'assignee_updated') {
				if (selectedTask && selectedTask.id === data.taskId && data.new_assignee && data.new_assignee_name) {
					dispatch(updateTaskAssignee({ taskId: data.taskId, assigneeId: data.new_assignee, assigneeName: data.new_assignee_name }))
				}
				return
			}
			// Skip refresh if only description changed (handled elsewhere)
			if (data.action === 'description_updated') {
				return
			}
			
			// For created actions, we need to handle sprint hasChildren updates even if sprint is not expanded
			if (data.action === 'created') {
				// Find the sprint in the props and check if it needs hasChildren update
				const sprint = sprints.find(s => s.id === data.sprintId)
				if (sprint && !sprint.hasChildren) {
					// Call the parent's callback to update the sprint's hasChildren property
					dispatch(updateSprintHasChildren({ sprintId: data.sprintId, hasChildren: true }))
				}
			}
			
			// Refresh the specific task or sprint data only if the sprint is expanded
			if (data.sprintId && expandedSprintsRef.current.has(data.sprintId)) {

				// Add delay for deleted actions to avoid race condition with database updates
				// not a real issue in production. because server already has high latency
				// but in local development, 2 socket calls are faster than 1 database query
				// Also add a small delay for created actions to ensure database consistency
				const delay = data.action === 'deleted' ? 250 : (data.action === 'created' ? 100 : 0)
				
				setTimeout(() => {
					const currentPagination = paginationStateRef.current[data.sprintId]
					if (currentPagination) {
						loadSprintTasks(data.sprintId, currentPagination.currentPage, currentPagination.pageSize)
					} else {
						loadSprintTasks(data.sprintId, 1, 5)
					}
					
					// For created tasks, we need to be more aggressive about refreshing
					// to ensure all parent tasks get updated hasChildren values
					if (data.action === 'created') {
						
						// Refresh all expanded tasks, not just their children
						expandedTasks.forEach(expandedTaskId => {
							const currentChildrenPagination = childrenPaginationStateRef.current[expandedTaskId]
							if (currentChildrenPagination) {
								loadTaskChildren(expandedTaskId, currentChildrenPagination.currentPage, currentChildrenPagination.pageSize)
							} else {
								loadTaskChildren(expandedTaskId, 1, 5)
							}
						})
						
						// Add extra delay to ensure database updates are complete
						setTimeout(() => {
							expandedTasks.forEach(expandedTaskId => {
								const currentChildrenPagination = childrenPaginationStateRef.current[expandedTaskId]
								if (currentChildrenPagination) {
									loadTaskChildren(expandedTaskId, currentChildrenPagination.currentPage, currentChildrenPagination.pageSize)
								}
							})
						}, 200)
					} else {
						// For non-created actions, use the original logic
						expandedTasks.forEach(expandedTaskId => {
							const currentChildrenPagination = childrenPaginationStateRef.current[expandedTaskId]
							if (currentChildrenPagination) {
								loadTaskChildren(expandedTaskId, currentChildrenPagination.currentPage, currentChildrenPagination.pageSize)
							} else {
								loadTaskChildren(expandedTaskId, 1, 5)
							}
						})
					}
				}, delay)
			}
		}

		const handleSprintRefresh = (data: { sprintId: string; action?: string; new_description?: string }) => {
			// Skip refresh if action is description_updated
			if (data.action === 'description_updated') {
				return
			}
			// For other actions, we might want to refresh sprint data
			// This could be implemented if needed
		}

		const handleTaskDeleted = (data: { sprintId: string; taskId: string; action: string }) => {
			
			// If the deleted task is currently selected, unselect it
			if (selectedTask && selectedTask.id === data.taskId) {
				dispatch(setSelectedTask(null)) // Clear task selection
			}
			
			// Remove the task from expanded tasks if it was expanded
			setExpandedTasks(prev => {
				const newExpanded = new Set(prev)
				newExpanded.delete(data.taskId)
				return newExpanded
			})
			
			// Remove the task from task children if it was a child task
			setTaskChildren(prev => {
				const newTaskChildren = { ...prev }
				Object.keys(newTaskChildren).forEach(parentTaskId => {
					newTaskChildren[parentTaskId] = newTaskChildren[parentTaskId].filter(
						childTask => childTask.id !== data.taskId
					)
				})
				return newTaskChildren
			})
			
			// Remove from loading children if it was loading
			setLoadingChildren(prev => {
				const newSet = new Set(prev)
				newSet.delete(data.taskId)
				return newSet
			})
			
			// Remove children pagination state for the deleted task
			setChildrenPaginationState(prev => {
				const newState = { ...prev }
				delete newState[data.taskId]
				return newState
			})
			
			// Remove task from Redux state
			dispatch(removeTask({ sprintId: data.sprintId, taskId: data.taskId }))
		}

		// Subscribe to events
		sub('task:get_children_by_index', handleTaskGetChildrenByIndex)
		sub('task:get_by_index', handleTaskGetByIndex)
		sub('task:refresh', handleTaskRefresh)
		sub('sprint:refresh', handleSprintRefresh)
		sub('task.deleted', handleTaskDeleted)

		// Cleanup function
		return () => {
	
			unsub('task:get_children_by_index', handleTaskGetChildrenByIndex)
			unsub('task:get_by_index', handleTaskGetByIndex)
			unsub('task:refresh', handleTaskRefresh)
			unsub('sprint:refresh', handleSprintRefresh)
			unsub('task.deleted', handleTaskDeleted)
		}
	}, [sub, unsub, emit, stableOnSprintTasksUpdate, isAuthenticated, isLoading])

	// Function to load tasks for a sprint with pagination
	const loadSprintTasks = useCallback((sprintId: string, page: number = 1, pageSize: number = 5) => {
		const startIndex = (page - 1) * pageSize

		emit('task:get_by_index', { 
			sprintId, 
			index: startIndex, 
			limit: pageSize, 
			isForward: true 
		})

		
		// Set loading state
		setLoadingTasks(prev => new Set(prev).add(sprintId))
	}, [emit])

	// Function to load children for a task with pagination
	const loadTaskChildren = useCallback((taskId: string, page: number = 1, pageSize: number = 5) => {
		const startIndex = (page - 1) * pageSize

		emit('task:get_children_by_index', { 
			taskId, 
			index: startIndex, 
			limit: pageSize, 
			isForward: true 
		})

		
		// Set loading state
		setLoadingChildren(prev => new Set(prev).add(taskId))
	}, [emit])

	// Function to reset sprint state when collapsed
	const resetSprintState = useCallback((sprintId: string) => {
		// Clear tasks for this sprint
		stableOnSprintTasksUpdate(sprintId, [])
		
		// Reset pagination state
		setPaginationState(prev => {
			const newState = { ...prev }
			delete newState[sprintId]
			return newState
		})
		
		// Remove loading state
		setLoadingTasks(prev => {
			const newSet = new Set(prev)
			newSet.delete(sprintId)
			return newSet
		})
		
		// Clear expanded tasks for this sprint
		setExpandedTasks(prev => {
			const newSet = new Set(prev)
			// Remove all task children for this sprint
			const sprint = sprints.find(s => s.id === sprintId)
			if (sprint?.tasks) {
				sprint.tasks.forEach(task => {
					newSet.delete(task.id)
				})
			}
			return newSet
		})
		
		// Clear task children for this sprint
		setTaskChildren(prev => {
			const newTaskChildren = { ...prev }
			const sprint = sprints.find(s => s.id === sprintId)
			if (sprint?.tasks) {
				sprint.tasks.forEach(task => {
					delete newTaskChildren[task.id]
				})
			}
			return newTaskChildren
		})
		
		// Clear children pagination state for this sprint
		setChildrenPaginationState(prev => {
			const newState = { ...prev }
			const sprint = sprints.find(s => s.id === sprintId)
			if (sprint?.tasks) {
				sprint.tasks.forEach(task => {
					delete newState[task.id]
				})
			}
			return newState
		})
	}, [stableOnSprintTasksUpdate, sprints])

	const handleSprintToggle = (sprintId: string) => {
		const newExpanded = new Set(expandedSprints)
		if (newExpanded.has(sprintId)) {
			// Collapsing - remove from expanded and reset state
			newExpanded.delete(sprintId)
			setExpandedSprints(newExpanded)
			resetSprintState(sprintId)
		} else {
			// Expanding - add to expanded and fetch tasks
			newExpanded.add(sprintId)
			setExpandedSprints(newExpanded)
			
			// Always load first page when expanding (fresh start)
			loadSprintTasks(sprintId, 1, 5)
		}
	}

	// Handle pagination navigation
	const handlePaginationNav = (sprintId: string, action: 'first' | 'prev' | 'next' | 'last') => {
		const currentPagination = paginationState[sprintId]
		if (!currentPagination) return
		
		// Save current scroll position
		if (scrollContainerRef.current) {
			setScrollPosition(scrollContainerRef.current.scrollTop)
			setShouldRestoreScroll(true)
		}
		
		let newIndex = 0
		const pageSize = currentPagination.pageSize
		
		switch (action) {
			case 'first':
				newIndex = 0
				break
			case 'prev':
				newIndex = Math.max(0, currentPagination.currentPage * pageSize - pageSize * 2)
				break
			case 'next':
				newIndex = currentPagination.currentPage * pageSize
				break
			case 'last':
				// Calculate the start index of the last page
				const totalPages = Math.ceil(currentPagination.totalTasks / pageSize)
				newIndex = (totalPages - 1) * pageSize
				break
		}
		
		const newPage = Math.floor(newIndex / pageSize) + 1
		loadSprintTasks(sprintId, newPage, pageSize)
	}

	// Handle pagination navigation for children
	const handleChildrenPaginationNav = (taskId: string, action: 'first' | 'prev' | 'next' | 'last') => {
		const currentPagination = childrenPaginationState[taskId]
		if (!currentPagination) return
		
		// Save current scroll position
		if (scrollContainerRef.current) {
			setScrollPosition(scrollContainerRef.current.scrollTop)
			setShouldRestoreScroll(true)
		}
		
		let newIndex = 0
		const pageSize = currentPagination.pageSize
		
		switch (action) {
			case 'first':
				newIndex = 0
				break
			case 'prev':
				newIndex = Math.max(0, currentPagination.currentPage * pageSize - pageSize * 2)
				break
			case 'next':
				newIndex = currentPagination.currentPage * pageSize
				break
			case 'last':
				// Calculate the start index of the last page
				const totalPages = Math.ceil(currentPagination.totalTasks / pageSize)
				newIndex = (totalPages - 1) * pageSize
				break
		}
		
		const newPage = Math.floor(newIndex / pageSize) + 1
		loadTaskChildren(taskId, newPage, pageSize)
	}

	const handleSprintClick = (sprint: Sprint) => {
		dispatch(setSelectedSprint(sprint))
	}

	const handleTaskClick = (task: Task) => {
		dispatch(setSelectedTask(task))
		
		// Find the sprint that contains this task and select it
		const taskSprint = sprints.find(sprint => 
			sprint.tasks?.some(sprintTask => sprintTask.id === task.id) ||
			Object.values(taskChildren).some(children => 
				children.some(childTask => childTask.id === task.id)
			)
		)
		
		if (taskSprint && taskSprint.id !== selectedSprint?.id) {
			dispatch(setSelectedSprint(taskSprint))
		}
	}

	const handleTaskToggle = (taskId: string) => {
		const newExpanded = new Set(expandedTasks)
		if (newExpanded.has(taskId)) {
			newExpanded.delete(taskId)
			setExpandedTasks(newExpanded)
			
			// Reset children pagination state when collapsed
			setChildrenPaginationState(prev => {
				const newState = { ...prev }
				delete newState[taskId]
				return newState
			})
		} else {
			newExpanded.add(taskId)
			setExpandedTasks(newExpanded)
			
			// Check if children are already loaded and if pagination state exists
			if (!taskChildren[taskId] || !childrenPaginationState[taskId]) {
				// Load first page of children (this will also restore pagination state)
				loadTaskChildren(taskId, 1, 5)
			}
		}
	}

	const handleDeleteTask = (task: Task) => {
		setTaskToDelete(task)
		setDeleteTaskDialogOpen(true)
	}

	const handleConfirmDeleteTask = () => {
		if (taskToDelete) {
	
			emit('task:request_delete', { taskId: taskToDelete.id })

			setDeleteTaskDialogOpen(false)
			setTaskToDelete(null)
		}
	}

	const handleCancelDeleteTask = () => {
		setDeleteTaskDialogOpen(false)
		setTaskToDelete(null)
	}

	const handleDeleteSprint = (sprint: Sprint) => {
		setSprintToDelete(sprint)
		setDeleteSprintDialogOpen(true)
	}

	const handleConfirmDeleteSprint = () => {
		if (sprintToDelete) {
	
			emit('sprint:request_delete', { sprintId: sprintToDelete.id })

			setDeleteSprintDialogOpen(false)
			setSprintToDelete(null)
		}
	}

	const handleCancelDeleteSprint = () => {
		setDeleteSprintDialogOpen(false)
		setSprintToDelete(null)
	}

	// Calculate dynamic width based on tree depth
	const maxDepth = calculateMaxDepth(sprints, expandedSprints, expandedTasks, taskChildren)
	const baseWidth = 300 // Minimum width
	const depthMultiplier = 30 // Additional width per depth level
	const dynamicWidth = Math.max(baseWidth, baseWidth + (maxDepth * depthMultiplier))

	return (
		<Box 
			ref={scrollContainerRef}
			sx={{ 
				width: `${dynamicWidth}px`,
				minWidth: `${baseWidth}px`,
				maxWidth: '60vw', // Prevent excessive width
				overflowX: 'auto',
				transition: 'width 0.3s ease-in-out'
			}}
		>
			<List component="nav" sx={{ p: 0 }}>
				{Array.isArray(sprints) ? sprints.map((sprint) => {
					const isExpanded = expandedSprints.has(sprint.id)
					const tasks = filterTasksFn(sprint.tasks || [])
					const hasTasks = tasks.length > 0
					const currentPagination = paginationState[sprint.id]
					const isLoading = loadingTasks.has(sprint.id)
															const SprintIcon = getSprintIcon(sprint.id)
					

					
					
					// Check if sprint has children based on server-provided hasChildren property
					const hasChildren = sprint.hasChildren || false
					
					return (
						<Box key={sprint.id}>
							<ListItem disablePadding>
								<ListItemButton
									onClick={() => handleSprintClick(sprint)}
									sx={{
										pl: 2,
										pr: 1,
										py: 1,
										backgroundColor: selectedSprint?.id === sprint.id ? '#e8f5e8' : 'transparent',
										color: selectedSprint?.id === sprint.id ? '#2e7d32' : 'inherit',
										'&:hover': {
											backgroundColor: selectedSprint?.id === sprint.id ? '#c8e6c9' : 'action.hover',
										},
									}}
								>
									<ListItemIcon sx={{ minWidth: 36 }}>
										<SprintIcon sx={{ color: '#1976d2' }} />
									</ListItemIcon>
									<ListItemText
										primary={
											<Box>
												<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
													<Typography variant="body1" fontWeight="bold">
														{sprint.name}
													</Typography>
													{sprint.status && (
														<Chip
															label={sprint.status.replace('_', ' ')}
															size="small"
															sx={{
																backgroundColor: getStatusColor(sprint.status),
																color: 'white',
																fontSize: '0.7rem',
																height: 20,
															}}
														/>
													)}
												</Box>
												<Typography
													variant="caption"
													color="text.secondary"
													sx={{
														display: '-webkit-box',
														WebkitLineClamp: 3,
														WebkitBoxOrient: 'vertical',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
														mt: 0.5,
														lineHeight: 1.2,
														fontStyle: !sprint.description ? 'italic' : 'normal',
													}}
												>
													{sprint.description ? stripFormattingTags(sprint.description) : 'No Description'}
												</Typography>
											</Box>
										}
									/>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
										<Tooltip title="Add Task to Sprint" placement="top">
											<IconButton
												size="small"
												onClick={(e) => {
													e.stopPropagation()
													onAddTask?.(sprint.id)
												}}
												sx={{
													color: 'primary.main',
													'&:hover': {
														backgroundColor: 'action.hover',
													},
												}}
											>
												<Add fontSize="small" />
											</IconButton>
										</Tooltip>
										<Tooltip title="Delete Sprint" placement="top">
											<IconButton
												size="small"
												onClick={(e) => {
													e.stopPropagation()
													handleDeleteSprint(sprint)
												}}
												sx={{
													color: 'text.secondary',
													'&:hover': {
														backgroundColor: 'action.hover',
													},
												}}
											>
												<Delete fontSize="small" />
											</IconButton>
										</Tooltip>
										{hasChildren && (
											<Tooltip title={isExpanded ? "Collapse" : "Expand"} placement="top">
												<Box
													onClick={(e) => {
														e.stopPropagation()
														handleSprintToggle(sprint.id)
													}}
													sx={{ cursor: 'pointer' }}
												>
													{isExpanded ? <ExpandLess /> : <ExpandMore />}
												</Box>
											</Tooltip>
										)}
									</Box>
								</ListItemButton>
							</ListItem>

							<Collapse in={isExpanded} timeout="auto" unmountOnExit>
								<Box sx={{ pl: 1 }}>
									
									{isLoading ? (
										<Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
											<CircularProgress size={24} />
										</Box>
									) : (
										<>
											{hasTasks ? (
												<>
													<List component="div" disablePadding>
														{tasks.map((task) => (
															<TaskRenderer
																key={task.id}
																task={task}
																sprintId={sprint.id}
																depth={0}
																selectedTask={selectedTask}
																onTaskClick={handleTaskClick}
																onDeleteTask={handleDeleteTask}
																onAddTask={onAddTask}
																expandedTasks={expandedTasks}
																onTaskToggle={handleTaskToggle}
																taskChildren={filteredTaskChildren}
																loadingChildren={loadingChildren}
																childrenPaginationState={childrenPaginationState}
																onChildrenPaginationNav={handleChildrenPaginationNav}
																filterTasks={filterTasksFn}
															/>
														))}
													</List>


													
																		{/* Pagination controls */}
													{currentPagination && currentPagination.totalTasks > currentPagination.pageSize && (
														<Box sx={{ display: 'flex', justifyContent: 'center', p: 2, border: '1px solid #e0e0e0', borderRadius: 1, m: 1 }}>
															<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
																<Typography variant="body2" color="text.secondary" sx={{ mr: 1.5 }}>
																	{currentPagination.totalTasks} tasks
																</Typography>
																
																{/* First page button */}
																<IconButton
																	size="small"
																	onClick={() => handlePaginationNav(sprint.id, 'first')}
																	disabled={currentPagination.currentPage <= 1}
																	sx={{ 
																		p: 0.75,
																		border: '1px solid #e0e0e0',
																		'&:hover': {
																			backgroundColor: 'action.hover',
																		}
																	}}
																>
																	<Typography variant="body2" fontWeight="bold">«</Typography>
																</IconButton>
																
																{/* Previous page button */}
																<IconButton
																	size="small"
																	onClick={() => handlePaginationNav(sprint.id, 'prev')}
																	disabled={currentPagination.currentPage <= 1}
																	sx={{ 
																		p: 0.75,
																		border: '1px solid #e0e0e0',
																		'&:hover': {
																			backgroundColor: 'action.hover',
																		}
																	}}
																>
																	<Typography variant="body2" fontWeight="bold">‹</Typography>
																</IconButton>
																
																								{/* Current page indicator */}
								<Typography variant="body2" sx={{ px: 1.5, fontWeight: 'bold', color: 'primary.main' }}>
									{((currentPagination.currentPage - 1) * currentPagination.pageSize) + 1}-{Math.min(currentPagination.currentPage * currentPagination.pageSize, currentPagination.totalTasks)}
								</Typography>
																
																{/* Next page button */}
																<IconButton
																	size="small"
																	onClick={() => handlePaginationNav(sprint.id, 'next')}
																	disabled={currentPagination.currentPage >= Math.ceil(currentPagination.totalTasks / currentPagination.pageSize)}
																	sx={{ 
																		p: 0.75,
																		border: '1px solid #e0e0e0',
																		'&:hover': {
																			backgroundColor: 'action.hover',
																		}
																	}}
																>
																	<Typography variant="body2" fontWeight="bold">›</Typography>
																</IconButton>
																
																{/* Last page button */}
																<IconButton
																	size="small"
																	onClick={() => handlePaginationNav(sprint.id, 'last')}
																	disabled={currentPagination.currentPage >= Math.ceil(currentPagination.totalTasks / currentPagination.pageSize)}
																	sx={{ 
																		p: 0.75,
																		border: '1px solid #e0e0e0',
																		'&:hover': {
																			backgroundColor: 'action.hover',
																		}
																	}}
																>
																	<Typography variant="body2" fontWeight="bold">»</Typography>
																</IconButton>
															</Box>
														</Box>
													)}
													
													
												</>
											) : null}
										</>
									)}
								</Box>
							</Collapse>
						</Box>
					)
				}) : (
					<ListItem disablePadding>
						<Box sx={{ py: 1 }}>
							<Typography variant="caption" color="text.secondary">
								No sprints available
							</Typography>
						</Box>
					</ListItem>
				)}
			</List>

			<Dialog open={deleteTaskDialogOpen} onClose={handleCancelDeleteTask}>
				<DialogTitle>Confirm Delete</DialogTitle>
				<DialogContent>
					<Typography>Are you sure you want to delete task "{taskToDelete?.title}"?</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleCancelDeleteTask} color="primary">
						Cancel
					</Button>
					<Button onClick={handleConfirmDeleteTask} color="error" variant="contained">
						Delete
					</Button>
				</DialogActions>
			</Dialog>

			<Dialog open={deleteSprintDialogOpen} onClose={handleCancelDeleteSprint}>
				<DialogTitle>Confirm Delete Sprint</DialogTitle>
				<DialogContent>
					<Typography>Are you sure you want to delete sprint "{sprintToDelete?.name}"?</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
						This will also delete all tasks within this sprint.
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleCancelDeleteSprint} color="primary">
						Cancel
					</Button>
					<Button onClick={handleConfirmDeleteSprint} color="error" variant="contained">
						Delete
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	)
}

export default SprintTreeView
