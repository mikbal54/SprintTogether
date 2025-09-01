export const Status = {
	OPEN: 'OPEN',
	IN_PROGRESS: 'IN_PROGRESS',
	COMPLETED: 'COMPLETED'
} as const

export type Status = typeof Status[keyof typeof Status]

export interface User {
	id: string
	name: string
	email: string
	socketId: string
	lastSeen?: string
}

export interface Task {
	id: string
	title: string
	description?: string
	status?: Status
	priority?: string
	hasChildren?: boolean
	assignedTo?: string
	assigneeName?: string
	hours: number
}

export interface Sprint {
	id: string
	name: string
	description?: string
	startDate?: string
	endDate?: string
	status?: Status
	tasks?: Task[]
	hasChildren?: boolean
}

// Pagination interfaces
export interface PaginationState {
	currentPage: number
	pageSize: number
	totalTasks: number
	hasMore: boolean
}

export interface PaginatedTasksResponse {
	sprintId: string
	tasks: Task[]
	pagination: {
		total: number
		currentIndex: number
		startIndex: number
		endIndex: number
		hasNext: boolean
		hasPrev: boolean
		limit: number
	}
}

export interface TaskGetByIndexRequest {
	sprintId: string
	index: number
	limit: number
	isForward: boolean
}
