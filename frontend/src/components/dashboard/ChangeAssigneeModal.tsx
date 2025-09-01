import React, { useState, useEffect } from 'react'
import {
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	CircularProgress,
	Typography,
	Alert
} from '@mui/material'
import { useWebSocket } from '../../contexts/WebSocketContext'

interface User {
	id: string
	name: string
}

interface ChangeAssigneeModalProps {
	open: boolean
	onClose: () => void
	taskId?: string
	taskTitle?: string
	currentAssigneeId?: string
}

const ChangeAssigneeModal: React.FC<ChangeAssigneeModalProps> = ({
	open,
	onClose,
	taskId,
	taskTitle,
	currentAssigneeId
}) => {
	const [users, setUsers] = useState<User[]>([])
	const [selectedUserId, setSelectedUserId] = useState<string>('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const { emit, sub, unsub } = useWebSocket()

	useEffect(() => {
		if (open) {
			setError(null)
			loadUsers()
		}
	}, [open])

	useEffect(() => {
		// Subscribe to user:get_all event
		const handleUserGetAll = (data: { users: User[] }) => {
			setUsers(data.users)
			setLoading(false)
			setError(null)
			
			// Set the current assignee as selected if available
			if (currentAssigneeId && data.users.length > 0) {
				const currentUser = data.users.find(user => user.id === currentAssigneeId)
				if (currentUser) {
					setSelectedUserId(currentAssigneeId)
				}
			}
		}

		sub('user:get_all', handleUserGetAll)

		// Cleanup subscription when component unmounts
		return () => {
			unsub('user:get_all', handleUserGetAll)
		}
	}, [sub, unsub, currentAssigneeId])

	const loadUsers = async () => {
		setLoading(true)
		setError(null)
		try {
			// Emit the WebSocket request to get all users
			emit('user:request_all')
		} catch (error) {
			console.error('Error loading users:', error)
			setLoading(false)
			setError('Failed to load users. Please try again.')
		}
	}

	const handleClose = () => {
		setSelectedUserId('')
		setError(null)
		onClose()
	}

	const handleSave = () => {
		// Only emit if the assignee has actually changed
		if (selectedUserId !== currentAssigneeId) {
			emit('task:change_assignee', {
				taskId,
				assigneeId: selectedUserId
			})
		}
		handleClose()
	}

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
			<DialogTitle>Change Assignee</DialogTitle>
			<DialogContent>
				{taskTitle && (
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						Task: {taskTitle}
					</Typography>
				)}
				
				{error && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{error}
					</Alert>
				)}
				
				<FormControl fullWidth sx={{ mt: 1 }}>
					<InputLabel>Select Assignee</InputLabel>
					<Select
						value={selectedUserId}
						label="Select Assignee"
						onChange={(e) => setSelectedUserId(e.target.value)}
						disabled={loading}
					>
						{loading ? (
							<MenuItem disabled>
								<CircularProgress size={20} sx={{ mr: 1 }} />
								Loading users...
							</MenuItem>
						) : users.length > 0 ? (
							users.map((user) => (
								<MenuItem key={user.id} value={user.id}>
									{user.name}
								</MenuItem>
							))
						) : (
							<MenuItem disabled>
								No users available
							</MenuItem>
						)}
					</Select>
				</FormControl>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose} color="secondary">
					Cancel
				</Button>
				<Button 
					onClick={handleSave} 
					variant="contained" 
					color="primary"
					disabled={!selectedUserId || loading}
				>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	)
}

export default ChangeAssigneeModal
