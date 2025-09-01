import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketContextType {
  isConnected: boolean;
  socket: Socket | null;
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string) => void;
  sub: (event: string, callback: (data: any) => void) => void;
  unsub: (event: string, callback?: (data: any) => void) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnect: () => void;
}

interface WebSocketProviderProps {
  children: ReactNode;
  url: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url,
  autoReconnect = true,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
}) => {
  const socketRef = useRef<Socket | null>(null);
  const eventCallbacksRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const connectionStatusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const isInitializedRef = useRef(false);
  const unmountingRef = useRef(false);

  const connect = () => {
    if (socketRef.current?.connected || isInitializedRef.current || unmountingRef.current) {
      return;
    }


    connectionStatusRef.current = 'connecting';
    isInitializedRef.current = true;
    
    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'], // Allow fallback to polling
        autoConnect: true,
        reconnection: autoReconnect,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: reconnectInterval,
        timeout: 20000, // Increase timeout
      });
      
      socketRef.current = socket;

      // Add global message listener to log all incoming messages
      // We'll use a more compatible approach by logging in the sub method
      // and also adding a general message interceptor
      const originalEmit = socket.emit.bind(socket);
      socket.emit = (event: string, ...args: any[]) => {
        return originalEmit(event, ...args);
      };

      // Add a global message interceptor for all incoming messages
      // This will catch messages that don't have specific handlers
      const originalOn = socket.on.bind(socket);
      socket.on = (event: string, callback: (...args: any[]) => void) => {
        const wrappedCallback = (...args: any[]) => {
          callback(...args);
        };
        return originalOn(event, wrappedCallback);
      };

      socket.on('connect', () => {
        setIsConnected(true);
        connectionStatusRef.current = 'connected';
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        connectionStatusRef.current = 'disconnected';
      });

      socket.on('connect_error', (error) => {
        console.error('[WebSocket] Connection error:', error);
        connectionStatusRef.current = 'error';
      });

    } catch (error) {
      console.error('[WebSocket] Failed to create Socket.IO connection:', error);
    }
  };

  const disconnect = () => {
    if (socketRef.current && !unmountingRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setIsConnected(false);
    connectionStatusRef.current = 'disconnected';
    eventCallbacksRef.current.clear();
    isInitializedRef.current = false;
  };

  const emit = (end_point: string, data?: any) => {
    if (socketRef.current?.connected && isConnected) {
      socketRef.current.emit(end_point, data);
    } else {
      console.warn('[WebSocket] Socket.IO is not connected. Cannot emit event:', end_point);
    }
  };

  const on = (event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string) => {
    if (socketRef.current) {
      socketRef.current.off(event);
    }
  };

  const sub = (event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      
      // Add callback to our tracking map
      if (!eventCallbacksRef.current.has(event)) {
        eventCallbacksRef.current.set(event, new Set());
      }
      eventCallbacksRef.current.get(event)!.add(callback);
      
      // Subscribe to the event with debugging wrapper
            const wrappedCallback = (data: any) => {
        callback(data);
      };

      socketRef.current.on(event, wrappedCallback);
    } else {
      console.warn('[WebSocket] Cannot subscribe to event:', event, '- socket not available');
    }
  };

  const unsub = (event: string, callback?: (data: any) => void) => {
    if (socketRef.current) {
      if (callback) {
        // Remove specific callback
        const callbacks = eventCallbacksRef.current.get(event);
        if (callbacks) {
          callbacks.delete(callback);
          socketRef.current.off(event, callback);
          
          // If no more callbacks for this event, remove the event from tracking
          if (callbacks.size === 0) {
            eventCallbacksRef.current.delete(event);
          }
        }
      } else {
        // Remove all callbacks for this event
        const callbacks = eventCallbacksRef.current.get(event);
        if (callbacks) {
          callbacks.forEach(cb => {
            socketRef.current!.off(event, cb);
          });
          eventCallbacksRef.current.delete(event);
        }
      }
    }
  };

  const reconnect = () => {
    disconnect();
    connect();
  };

  useEffect(() => {
    // Only connect if not already connected and not initialized
    if (!socketRef.current?.connected && !isInitializedRef.current) {
      connect();
    }

    return () => {
      // Only disconnect on actual component unmount, not on re-renders
      if (socketRef.current && !unmountingRef.current) {
        unmountingRef.current = true;
        disconnect();
      }
    };
  }, []); // Remove url dependency to prevent reconnection on every render

  const value: WebSocketContextType = {
    isConnected: isConnected,
    socket: socketRef.current,
    emit,
    on,
    off,
    sub,
    unsub,
    connectionStatus: connectionStatusRef.current, 
    reconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
