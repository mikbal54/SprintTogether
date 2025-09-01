import { Routes, Route, Navigate } from 'react-router-dom'
import { PrivateRoute } from './features/auth/components/PrivateRoute'
import LogoutPage from './features/auth/components/Logout'
import DashboardPage from './features/dashboard/DashboardPage'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { JwtRefreshProvider } from './contexts/JwtRefreshContext'
import NotificationToast from './components/NotificationToast'

import './App.css'

function App() {
	const wsUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

	return (
		<>
			<Routes>
				<Route
					path="/dashboard"
					element={
						<PrivateRoute>
							<WebSocketProvider url={wsUrl}>
								<JwtRefreshProvider>
									<DashboardPage />
								</JwtRefreshProvider>
							</WebSocketProvider>
						</PrivateRoute>
					}
				/>
				<Route path="/logout" element={<LogoutPage />} />
				<Route path="*" element={<Navigate to="/dashboard" replace />} />
			</Routes>
			<NotificationToast />
		</>
	)
}

export default App
