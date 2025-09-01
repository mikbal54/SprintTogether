import React from 'react'
import { IconButton, Badge, Tooltip, Popover, List, ListItem, Typography, Box, Chip, Button, Divider } from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAppSelector } from '../../store/hooks'
import { selectOnlineUsers, selectOnlineUsersCount } from '../../features/onlineUsers/onlineUsersSelectors'
import { logout } from '../../utils/logout'
import type { User } from '../../types'

interface OnlineUsersDisplayProps {
  onlineUsers?: User[] // Keep for backward compatibility
}

function OnlineUsersDisplay({ onlineUsers: propOnlineUsers }: OnlineUsersDisplayProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  
  // Get data from Redux
  const onlineUsers = useAppSelector(selectOnlineUsers) as User[]
  const onlineUsersCount = useAppSelector(selectOnlineUsersCount) as number
  
  // Fallback to props if Redux is empty (for backward compatibility)
  const displayUsers = onlineUsers.length > 0 ? onlineUsers : (propOnlineUsers || [])
  const displayCount = onlineUsersCount > 0 ? onlineUsersCount : displayUsers.length

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)
  const id = open ? 'online-users-popover' : undefined

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Recently active'
    
    const date = new Date(lastSeen)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <>
      <Tooltip title="Show online users">
        <IconButton
          onClick={handleClick}
          sx={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 1)',
            },
          }}
        >
          <Badge badgeContent={displayCount} color="primary">
            <PersonIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, minWidth: 300 }}>
          <Typography variant="h6" gutterBottom>
            Online Users ({displayCount})
          </Typography>
          {displayUsers.length > 0 ? (
            <List sx={{ p: 0 }}>
              {displayUsers.map((user: User) => (
                <ListItem key={user.id} sx={{ px: 0, py: 1 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {user.name || 'Anonymous'}
                      </Typography>
                      <Chip
                        label="Online"
                        size="small"
                        sx={{
                          backgroundColor: '#4caf50',
                          color: 'white',
                          fontSize: '0.7rem',
                          height: 20,
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        •
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatLastSeen(user.lastSeen)}
                      </Typography>
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No users online
            </Typography>
          )}
          
          <Divider sx={{ my: 2 }} />
          
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={() => logout()}
            fullWidth
            size="small"
          >
            Logout
          </Button>
        </Box>
      </Popover>
    </>
  )
}

export default React.memo(OnlineUsersDisplay)
