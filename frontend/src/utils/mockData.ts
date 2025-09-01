import type { Sprint } from '../types'
import { Status } from '../types'

export const mockSprints: Sprint[] = [
	{
		id: '1',
		name: 'Sprint 1 - User Authentication',
		description: 'Implement user authentication and authorization features',
		startDate: '2024-01-01',
		endDate: '2024-01-15',
		status: Status.IN_PROGRESS,
		tasks: [
			{
				id: '1-1',
				title: 'Design login form',
				description: 'Create responsive login form with validation',
				status: Status.COMPLETED,
				priority: 'High',
				hours: 1,
			},
			{
				id: '1-2',
				title: 'Implement JWT authentication',
				description: 'Set up JWT token generation and validation',
				status: Status.IN_PROGRESS,
				priority: 'High',
				hours: 1,
			},
			{
				id: '1-3',
				title: 'Add password reset functionality',
				description: 'Implement forgot password and reset flow',
				status: Status.OPEN,
				priority: 'Medium',
				hours: 1,
			},
		],
	},
	{
		id: '2',
		name: 'Sprint 2 - Dashboard Features',
		description: 'Build main dashboard with sprint and task management',
		startDate: '2024-01-16',
		endDate: '2024-01-30',
		status: Status.OPEN,
		tasks: [
			{
				id: '2-1',
				title: 'Create sprint tree view',
				description: 'Implement MUI TreeView for sprint visualization',
				status: Status.COMPLETED,
				priority: 'High',
				hours: 1,
			},
			{
				id: '2-2',
				title: 'Add task creation modal',
				description: 'Build modal for creating new tasks',
				status: Status.IN_PROGRESS,
				priority: 'High',
				hours: 1,
			},
			{
				id: '2-3',
				title: 'Implement real-time updates',
				description: 'Add WebSocket integration for live updates',
				status: Status.OPEN,
				priority: 'Medium',
				hours: 1,
			},
		],
	},
	{
		id: '3',
		name: 'Sprint 3 - Team Collaboration',
		description: 'Add team collaboration and communication features',
		startDate: '2024-02-01',
		endDate: '2024-02-15',
		status: Status.OPEN,
		tasks: [
			{
				id: '3-1',
				title: 'Add team member management',
				description: 'Create interface for managing team members',
				status: Status.OPEN,
				priority: 'High',
				hours: 1,
			},
			{
				id: '3-2',
				title: 'Implement comments system',
				description: 'Add commenting functionality to tasks',
				status: Status.OPEN,
				priority: 'Medium',
				hours: 1,
			},
		],
	},
]
