import React, { useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Slide } from '@mui/material';
import { Close as CloseIcon, CheckCircle as SuccessIcon, Error as ErrorIcon, Warning as WarningIcon, Info as InfoIcon } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { selectActiveNotifications } from '../features/notifications/notificationsSelectors';
import { removeNotification, removeExpiredNotifications } from '../features/notifications/notificationsSlice';
import type { Notification } from '../features/notifications/notificationsSlice';

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return <SuccessIcon sx={{ color: '#4caf50' }} />;
    case 'error':
      return <ErrorIcon sx={{ color: '#f44336' }} />;
    case 'warning':
      return <WarningIcon sx={{ color: '#ff9800' }} />;
    case 'info':
      return <InfoIcon sx={{ color: '#2196f3' }} />;
    default:
      return <InfoIcon sx={{ color: '#2196f3' }} />;
  }
};

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return '#e8f5e8';
    case 'error':
      return '#ffebee';
    case 'warning':
      return '#fff3e0';
    case 'info':
      return '#e3f2fd';
    default:
      return '#e3f2fd';
  }
};

const getNotificationBorderColor = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return '#4caf50';
    case 'error':
      return '#f44336';
    case 'warning':
      return '#ff9800';
    case 'info':
      return '#2196f3';
    default:
      return '#2196f3';
  }
};

const NotificationItem: React.FC<{ notification: Notification }> = ({ notification }) => {
  const dispatch = useAppDispatch();

  // Convert timestamp number to Date for display
  const notificationDate = new Date(notification.timestamp);

  return (
    <Slide direction="left" in={true} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          p: 1,
          mb: 0.5,
          minWidth: 200,
          maxWidth: 280,
          backgroundColor: getNotificationColor(notification.type),
          borderLeft: `3px solid ${getNotificationBorderColor(notification.type)}`,
          borderRadius: 0.5,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ mt: 0.5 }}>
            {getNotificationIcon(notification.type)}
          </Box>
          
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              {notification.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {notification.message}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block', fontSize: '0.7rem' }}>
              {notificationDate.toLocaleTimeString()}
            </Typography>
          </Box>
          
          <IconButton
            size="small"
            onClick={() => dispatch(removeNotification(notification.id))}
            sx={{
              p: 0.25,
              minWidth: 24,
              height: 24,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: '0.9rem' }} />
          </IconButton>
        </Box>
      </Paper>
    </Slide>
  );
};

const NotificationToast: React.FC = () => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(selectActiveNotifications) as Notification[];
  
  // Timer to automatically remove expired notifications
  useEffect(() => {
    // Only set up timer if there are notifications with durations
    const hasNotificationsWithDuration = notifications.some(notification => notification.duration !== undefined);
    
    if (!hasNotificationsWithDuration) {
      return;
    }

    // Check for expired notifications every second
    const interval = setInterval(() => {
      dispatch(removeExpiredNotifications());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [dispatch, notifications]);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </Box>
  );
};

export default NotificationToast;
