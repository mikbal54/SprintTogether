import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket} from 'socket.io';
import { UseGuards, OnModuleInit, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { AsyncApiSub, AsyncApiPub } from 'nestjs-asyncapi';
import { WsJwtGuard } from './ws-jwt.guard';
import { SprintService } from './sprint.service';
import { TaskService } from './task.service';
import { RedisService } from './redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { 
  OnlineUserDto, 
  OnlineUsersResponseDto, 
  TaskGetByIndexDto, 
  TaskGetByIndexResponseDto,
  TaskGetChildrenDto,
  TaskSetStatusDto,
  SprintCreateDto,
  TaskCreateDto,
  TaskChangeAssigneeDto,
  SprintSetStatusDto,
  SprintChangeDescriptionDto,
  SprintChangeNameDto,
  TaskChangeDescriptionDto,
  TaskChangeNameDto,
  TaskRequestDeleteDto,
  UserPresenceDto,
  TaskGetChildrenByIndexDto,
  SprintRequestDeleteDto
} from './ws.dto';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
})

export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;
  private readonly ONLINE_USERS_KEY = 'user:online_users';
  private readonly USER_SOCKET_PREFIX = 'user_socket:';
  private readonly SOCKET_USER_PREFIX = 'socket_user:';
  private readonly USER_PRESENCE_PREFIX = 'user_presence:';
  private readonly SOCKET_TOKEN_PREFIX = 'socket_token:';
  private tokenCheckInterval: NodeJS.Timeout | null = null;
  private staleSocketCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Validates if a socket ID is still connected by checking both Redis mapping and Socket.IO server state
   */
  private async validateSocketConnection(socketId: string): Promise<boolean> {
    try {
      // First check Redis mapping
      const redisMapping = await this.redisService.get(`${this.SOCKET_USER_PREFIX}${socketId}`);
      if (!redisMapping) {
        return false; // No Redis mapping, definitely not connected
      }
      
      // Then check Socket.IO server state
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) {
        return false; // Socket not found in server, not connected
      }
      
      // Check if socket is actually connected
      return socket.connected;
    } catch (error) {
      console.error(`Error validating socket connection ${socketId}:`, error);
      return false;
    }
  }

  /**
   * Validates and filters a list of socket IDs to only include valid connections
   */
  private async validateSocketIds(socketIds: string[]): Promise<string[]> {
    const validSocketIds: string[] = [];
    
    for (const socketId of socketIds) {
      const isValid = await this.validateSocketConnection(socketId);
      if (isValid) {
        validSocketIds.push(socketId);
      } else {
        console.log(`Socket ID ${socketId} is no longer valid, removing from list`);
        
        // Clean up the invalid Redis mapping
        try {
          await this.redisService.del(`${this.SOCKET_USER_PREFIX}${socketId}`);
          console.log(`Cleaned up invalid Redis mapping for socket ${socketId}`);
        } catch (error) {
          console.error(`Error cleaning up Redis mapping for socket ${socketId}:`, error);
        }
      }
    }
    
    return validSocketIds;
  }

  /**
   * Forces validation of all connections for a specific user
   * Useful for debugging or manual cleanup
   */
  private async validateUserConnections(userId: string): Promise<{ valid: string[], removed: string[], details: any[] }> {
    try {
      const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
      const userData = await this.redisService.get(userKey);
      
      if (!userData || !userData.socketIds) {
        return { valid: [], removed: [], details: [] };
      }
      
      const originalSocketIds = [...userData.socketIds];
      const validationDetails: any[] = [];
      const validSocketIds: string[] = [];
      const removedSocketIds: string[] = [];
      
      // Validate each socket with detailed information
      for (const socketId of originalSocketIds) {
        const redisMapping = await this.redisService.get(`${this.SOCKET_USER_PREFIX}${socketId}`);
        const socket = this.server.sockets.sockets.get(socketId);
        const isConnected = socket?.connected || false;
        
        const detail = {
          socketId,
          hasRedisMapping: !!redisMapping,
          hasSocketObject: !!socket,
          isConnected,
          isValid: redisMapping && socket && isConnected
        };
        
        validationDetails.push(detail);
        
        if (detail.isValid) {
          validSocketIds.push(socketId);
        } else {
          removedSocketIds.push(socketId);
          // Clean up invalid Redis mapping
          if (redisMapping) {
            try {
              await this.redisService.del(`${this.SOCKET_USER_PREFIX}${socketId}`);
            } catch (error) {
              console.error(`Error cleaning up Redis mapping for socket ${socketId}:`, error);
            }
          }
        }
      }
      
      // Update user data if any sockets were removed
      if (removedSocketIds.length > 0) {
        if (validSocketIds.length === 0) {
          // No valid sockets left, remove user from online users
          await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
          await this.redisService.del(userKey);
          console.log(`User ${userId} removed from online users after validation (no valid connections)`);
        } else {
          const updatedUserData = {
            ...userData,
            socketIds: validSocketIds,
            lastConnectedAt: new Date().toISOString()
          };
          await this.redisService.set(userKey, updatedUserData, 3600);
          console.log(`User ${userId} updated after validation: ${validSocketIds.length} valid connections`);
        }
      }
      
      return { valid: validSocketIds, removed: removedSocketIds, details: validationDetails };
    } catch (error) {
      console.error(`Error validating user connections for ${userId}:`, error);
      return { valid: [], removed: [], details: [] };
    }
  }
  
  constructor(
    private readonly sprintService: SprintService,
    private readonly taskService: TaskService,
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit() {
    // Gateway is ready
    this.startTokenValidationScheduler();
    this.cleanupDuplicateSocketIds();
  }

  onModuleDestroy() {
    // Clean up intervals to prevent memory leaks
    if (this.tokenCheckInterval) {
      clearInterval(this.tokenCheckInterval);
      this.tokenCheckInterval = null;
    }
    
    if (this.staleSocketCheckInterval) {
      clearInterval(this.staleSocketCheckInterval);
      this.staleSocketCheckInterval = null;
    }
  }

  private startTokenValidationScheduler() {
    // Check token validity every 2 minutes
    this.tokenCheckInterval = setInterval(async () => {
      await this.checkAllTokensValidity();
    }, 2 * 60 * 1000);
    
    // Clean up stale socket IDs every 5 minutes
    this.staleSocketCheckInterval = setInterval(async () => {
      await this.cleanupStaleSocketIds();
    }, 5 * 60 * 1000);
  }

  private async cleanupDuplicateSocketIds() {
    try {
      console.log('Cleaning up duplicate socket IDs...');
      const userIds = await this.redisService.smembers(this.ONLINE_USERS_KEY);
      
      for (const userId of userIds) {
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        
        if (userData && userData.socketIds) {
          // Remove duplicates from socketIds array
          const uniqueSocketIds = [...new Set(userData.socketIds)];
          
          if (uniqueSocketIds.length !== userData.socketIds.length) {
            console.log(`Cleaned up user ${userId}: removed ${userData.socketIds.length - uniqueSocketIds.length} duplicate socket IDs`);
            
            const updatedUserData = {
              ...userData,
              socketIds: uniqueSocketIds
            };
            
            await this.redisService.set(userKey, updatedUserData, 3600);
          }
        }
      }
      console.log('Duplicate socket ID cleanup completed');
    } catch (error) {
      console.error('Error cleaning up duplicate socket IDs:', error);
    }
  }

  private async cleanupStaleSocketIds() {
    try {
      console.log('Cleaning up stale socket IDs...');
      const userIds = await this.redisService.smembers(this.ONLINE_USERS_KEY);
      let totalRemoved = 0;
      
      for (const userId of userIds) {
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        
        if (userData && userData.socketIds) {
          const validSocketIds = await this.validateSocketIds(userData.socketIds);
          const removedCount = userData.socketIds.length - validSocketIds.length;
          totalRemoved += removedCount;
          
          if (validSocketIds.length !== userData.socketIds.length) {
            console.log(`User ${userId}: removed ${userData.socketIds.length - validSocketIds.length} stale socket IDs`);
            
            if (validSocketIds.length === 0) {
              // No valid sockets left, remove user from online users
              await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
              await this.redisService.del(userKey);
              console.log(`User ${userId} removed from online users (no valid connections)`);
            } else {
              const updatedUserData = {
                ...userData,
                socketIds: validSocketIds
              };
              await this.redisService.set(userKey, updatedUserData, 3600);
            }
          }
        }
      }
      
      if (totalRemoved > 0) {
        console.log(`Stale socket ID cleanup completed: removed ${totalRemoved} stale socket IDs`);
      }
    } catch (error) {
      console.error('Error cleaning up stale socket IDs:', error);
    }
  }

  private async checkAllTokensValidity() {
    try {
      // Get all socket-token mappings
      const socketTokenKeys = await this.redisService.keys(`${this.SOCKET_TOKEN_PREFIX}*`);
      
      for (const key of socketTokenKeys) {
        const socketId = key.replace(this.SOCKET_TOKEN_PREFIX, '');
        const tokenData = await this.redisService.get(key);
        
        if (tokenData && tokenData.token) {
          try {
            // Check if token is still valid
            this.jwtService.verify(tokenData.token);
          } catch (error) {
            // Token is expired or invalid
            console.log(`Token expired for socket ${socketId}, notifying client`);
            
            // Find the socket and notify the client
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('auth:token_expired', {
                message: 'Your session has expired. Please refresh your token.',
                timestamp: new Date().toISOString()
              });
              
              // Optionally disconnect the socket after a grace period
              setTimeout(() => {
                if (socket.connected) {
                  socket.disconnect(true);
                }
              }, 5000); // 5 second grace period
            }
            
            // Clean up expired token data
            await this.redisService.del(key);
            await this.removeOnlineUser(socketId);
          }
        }
      }
    } catch (error) {
      console.error('Error checking token validity:', error);
    }
  }

  // Listen for task events and emit WebSocket notifications
  @OnEvent('task.created')
  handleTaskCreated(payload: { sprintId: string; taskId: string; action: string }) {
    this.server.emit('task:refresh', {
      sprintId: payload.sprintId,
      taskId: payload.taskId,
      action: payload.action
    });
  }

  @OnEvent('task.updated')
  handleTaskUpdated(payload: { sprintId: string; taskId: string; action: string }) {
    this.server.emit('task:refresh', {
      sprintId: payload.sprintId,
      taskId: payload.taskId,
      action: payload.action
    });
  }

  @OnEvent('task.deleted')
  handleTaskDeleted(payload: { sprintId: string; taskId: string; action: string }) {
    this.server.emit('task:refresh', {
      sprintId: payload.sprintId,
      taskId: payload.taskId,
      action: payload.action
    });
  }

  @UseGuards(WsJwtGuard) 
  @AsyncApiPub({
    channel: 'connected',
    summary: 'WebSocket connected',
    description: 'Emitted when a client successfully connects to the WebSocket',
    message: {
      payload: Object,
    },
  })
  async handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
    
    try {
      // Extract authenticated user from JWT token
      const user = await this.extractAuthenticatedUser(client);
      
      if (user) {
        // Store token information for periodic validation
        await this.storeSocketToken(client.id, user.token, user.id);
        
        await this.addOnlineUser(user, client.id);
        await this.broadcastOnlineUsers();
      }
      
      console.log('Sending connected message to client:', client.id);
      client.emit('connected', { message: 'WebSocket connected' });
      
      console.log('Fetching sprints for client:', client.id);
      const sprints = await this.sprintService.getAll();
      console.log('Sprints fetched:', sprints.length, 'sprints');
      
      console.log('Sending sprint:get_all to client:', client.id);
      client.emit('sprint:get_all', sprints);
      console.log('sprint:get_all sent successfully to client:', client.id);
    } catch (error) {
      console.error('Authentication failed for WebSocket connection:', error);
      
      if (error.name === 'TokenExpiredError') {
        client.emit('auth:token_expired', {
          message: 'Your session has expired. Please refresh your token.',
          timestamp: new Date().toISOString()
        });
      } else {
        client.emit('auth:error', { message: 'Authentication failed' });
      }
      
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);
    
    // Remove user from online users and clean up token data
    await this.removeOnlineUser(client.id);
    await this.cleanupSocketToken(client.id);
    await this.broadcastOnlineUsers();
  }

  private async storeSocketToken(socketId: string, token: string, userId: string): Promise<void> {
    try {
      const tokenKey = `${this.SOCKET_TOKEN_PREFIX}${socketId}`;
      await this.redisService.set(tokenKey, {
        token,
        userId,
        storedAt: new Date().toISOString()
      }, 15 * 60); // Store for 15 minutes (token lifetime)
    } catch (error) {
      console.error('Error storing socket token:', error);
    }
  }

  private async cleanupSocketToken(socketId: string): Promise<void> {
    try {
      const tokenKey = `${this.SOCKET_TOKEN_PREFIX}${socketId}`;
      await this.redisService.del(tokenKey);
    } catch (error) {
      console.error('Error cleaning up socket token:', error);
    }
  }

  private async extractAuthenticatedUser(client: Socket): Promise<any> {
    try {
      // Extract JWT token from cookie
      const cookies = client.handshake.headers.cookie;
      if (!cookies) {
        throw new UnauthorizedException('No cookies found');
      }

      const jwtCookie = cookies.split('; ').find(cookie => cookie.startsWith('jwt='));
      if (!jwtCookie) {
        throw new UnauthorizedException('JWT token not found in cookies');
      }

      const jwtToken = jwtCookie.substring(4); // Remove 'jwt=' prefix
      if (!jwtToken) {
        throw new UnauthorizedException('JWT token is empty');
      }

      // Validate JWT token
      const payload = this.jwtService.verify(jwtToken) as any;
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid JWT token payload');
      }

      // Find user in database - they must exist since they have a valid JWT
      const dbUser = await this.findUser(payload.sub);
      
      return {
        id: dbUser.id,
        name: dbUser.name,
        auth0Id: dbUser.auth0Id,
        socketId: client.id,
        token: jwtToken // Include token for storage
      };
    } catch (error) {
      console.error('Error extracting authenticated user:', error);
      throw error;
    }
  }

  private async findUser(auth0Id: string): Promise<any> {
    try {
      // Find existing user - they must exist since they have a valid JWT
      const user = await this.prismaService.user.findUnique({
        where: { auth0Id }
      });

      if (!user) {
        throw new UnauthorizedException(`User with auth0Id ${auth0Id} not found in database. This indicates a program error - user should exist after successful authentication.`);
      }

      console.log(`Found existing user: ${user.name} (${user.id})`);
      return user;
    } catch (error) {
      console.error('Error finding user:', error);
      throw error;
    }
  }

  private async addOnlineUser(user: any, socketId: string): Promise<void> {
    try {
      const userKey = `${this.USER_PRESENCE_PREFIX}${user.id}`;
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;
      
      // Check if user is already online (multiple connections)
      const existingUserData = await this.redisService.get(userKey);
      
      if (existingUserData) {
        // User already online, add this socket to their existing data (avoid duplicates)
        const existingSocketIds = existingUserData.socketIds || [];
        
        // Validate existing socket IDs - remove any that are no longer valid
        const validSocketIds = await this.validateSocketIds(existingSocketIds);
        
        if (!validSocketIds.includes(socketId)) {
          const updatedUserData = {
            ...existingUserData,
            socketIds: [...validSocketIds, socketId],
            lastConnectedAt: new Date().toISOString()
          };
          
          await this.redisService.set(userKey, updatedUserData, 3600);
          console.log(`User ${user.name} (${user.id}) added socket ${socketId}, now has ${updatedUserData.socketIds.length} connection(s) after cleanup`);
        } else {
          console.log(`User ${user.name} (${user.id}) socket ${socketId} already exists, skipping duplicate`);
        }
      } else {
        // First connection for this user
        const userData = {
          ...user,
          socketIds: [socketId],
          connectedAt: new Date().toISOString(),
          lastConnectedAt: new Date().toISOString()
        };
        
        await this.redisService.set(userKey, userData, 3600);
        
        // Add user to online users set
        await this.redisService.sadd(this.ONLINE_USERS_KEY, user.id);
      }
      
      // Store socket to user mapping
      await this.redisService.set(socketKey, user.id, 3600);
      
      console.log(`User ${user.name} (${user.id}) is now online with socket ${socketId}`);
    } catch (error) {
      console.error('Error adding online user:', error);
    }
  }

  private async removeOnlineUser(socketId: string): Promise<void> {
    try {
      // Get user ID from socket mapping
      const userId = await this.redisService.get(`${this.SOCKET_USER_PREFIX}${socketId}`);
      
      if (userId) {
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        
        if (userData && userData.socketIds) {
          console.log(`User ${userId} had ${userData.socketIds.length} connections: [${userData.socketIds.join(', ')}]`);
          console.log(`Removing socket ${socketId}`);
          
          // Remove this socket from user's socket list
          const remainingSocketIds = userData.socketIds.filter((id: string) => id !== socketId);
          
          // Validate all remaining socket IDs to ensure they are actually connected
          const validSocketIds = await this.validateSocketIds(remainingSocketIds);
          
          if (validSocketIds.length === 0) {
            // No valid sockets left, remove user from online users
            await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
            await this.redisService.del(userKey);
            console.log(`User ${userId} is now offline (no valid connections remaining)`);
          } else {
            // Update user data with only valid sockets
            const updatedUserData = {
              ...userData,
              socketIds: validSocketIds,
              lastConnectedAt: new Date().toISOString()
            };
            await this.redisService.set(userKey, updatedUserData, 3600);
            console.log(`User ${userId} still online with ${validSocketIds.length} valid connection(s): [${validSocketIds.join(', ')}]`);
          }
        }
        
        // Clean up socket mapping
        await this.redisService.del(`${this.SOCKET_USER_PREFIX}${socketId}`);
      }
    } catch (error) {
      console.error('Error removing online user:', error);
    }
  }

  private async getOnlineUsers(): Promise<any[]> {
    try {
      // Get all online user IDs
      const userIds = await this.redisService.smembers(this.ONLINE_USERS_KEY);
      const onlineUsers: any[] = [];
      
      // Get user data for each online user
      for (const userId of userIds) {
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        
        if (userData && userData.socketIds && userData.socketIds.length > 0) {
          // Validate that user has at least one valid connection
          const validSocketIds = await this.validateSocketIds(userData.socketIds);
          
          if (validSocketIds.length > 0) {
            // User has valid connections, include them
            onlineUsers.push({
              id: userData.id,
              name: userData.name
            });
          } else {
            // User has no valid connections, clean up
            console.log(`Cleaning up user ${userId} - no valid connections found`);
            await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
            await this.redisService.del(userKey);
          }
        } else {
          // Clean up stale entries
          console.log(`Cleaning up stale user entry: ${userId}`);
          await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
          if (userData) {
            await this.redisService.del(userKey);
          }
        }
      }
      
      return onlineUsers;
    } catch (error) {
      console.error('Error getting online users:', error);
      
      // If it's a WRONGTYPE error, clean up the key and return empty array
      if (error.message && error.message.includes('WRONGTYPE')) {
        console.log('Cleaning up wrong key type for online users');
        try {
          await this.redisService.del(this.ONLINE_USERS_KEY);
        } catch (delError) {
          console.error('Error deleting online users key:', delError);
        }
      }
      
      return [];
    }
  }

  private async broadcastOnlineUsers(): Promise<void> {
    try {
      const onlineUsers = await this.getOnlineUsers();
      this.server.emit('user:online_users', {
        users: onlineUsers,
        count: onlineUsers.length
      });
    } catch (error) {
      console.error('Error broadcasting online users:', error);
    }
  }

  @SubscribeMessage('user:request_online_users')
  @AsyncApiSub({
    channel: 'user:request_online_users',
    summary: 'Request online users',
    description: 'Request a list of currently online users',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'user:online_users',
    summary: 'Online users response',
    description: 'Response with list of online users',
    message: {
      payload: OnlineUsersResponseDto,
    },
  })
  async handleRequestOnlineUsers(@ConnectedSocket() client: Socket) {
    try {
      const onlineUsers = await this.getOnlineUsers();
      client.emit('user:online_users', {
        users: onlineUsers,
        count: onlineUsers.length
      });
    } catch (error) {
      console.error('Error getting online users:', error);
      client.emit('user:online_users', {
        error: 'Failed to get online users'
      });
    }
  }

  @SubscribeMessage('user:validate_connections')
  @AsyncApiSub({
    channel: 'user:validate_connections',
    summary: 'Validate user connections',
    description: 'Validate and clean up stale user connections',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'user:validation_result',
    summary: 'Validation result',
    description: 'Response with validation results',
    message: {
      payload: Object,
    },
  })
  async handleValidateConnections(@ConnectedSocket() client: Socket) {
    try {
      const userId = await this.redisService.get(`${this.SOCKET_USER_PREFIX}${client.id}`);
      if (userId) {
        const result = await this.validateUserConnections(userId);
        client.emit('user:validation_result', {
          userId,
          validConnections: result.valid,
          removedConnections: result.removed,
          totalValid: result.valid.length,
          totalRemoved: result.removed.length,
          validationDetails: result.details
        });
      } else {
        client.emit('user:validation_result', {
          error: 'User not found for this socket'
        });
      }
    } catch (error) {
      console.error('Error validating user connections:', error);
      client.emit('user:validation_result', {
        error: 'Failed to validate connections'
      });
    }
  }

  @SubscribeMessage('user:force_cleanup')
  @AsyncApiSub({
    channel: 'user:force_cleanup',
    summary: 'Force cleanup',
    description: 'Force cleanup of stale user connections',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'user:force_cleanup',
    summary: 'Cleanup result',
    description: 'Response with cleanup results',
    message: {
      payload: Object,
    },
  })
  async handleForceCleanup(@ConnectedSocket() client: Socket) {
    try {
      console.log('Force cleanup requested by client');
      
      // Get all online user IDs
      const userIds = await this.redisService.smembers(this.ONLINE_USERS_KEY);
      let totalRemoved = 0;
      let usersRemoved = 0;
      
      for (const userId of userIds) {
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        
        if (userData && userData.socketIds) {
          const validSocketIds = await this.validateSocketIds(userData.socketIds);
          const removedCount = userData.socketIds.length - validSocketIds.length;
          totalRemoved += removedCount;
          
          if (validSocketIds.length === 0) {
            // No valid sockets left, remove user from online users
            await this.redisService.srem(this.ONLINE_USERS_KEY, userId);
            await this.redisService.del(userKey);
            usersRemoved++;
            console.log(`Force cleanup: Removed user ${userId} (no valid connections)`);
          } else if (removedCount > 0) {
            // Update user data with only valid sockets
            const updatedUserData = {
              ...userData,
              socketIds: validSocketIds,
              lastConnectedAt: new Date().toISOString()
            };
            await this.redisService.set(userKey, updatedUserData, 3600);
            console.log(`Force cleanup: Updated user ${userId} - removed ${removedCount} invalid sockets`);
          }
        }
      }
      
      // Broadcast updated online users
      await this.broadcastOnlineUsers();
      
      client.emit('user:force_cleanup_result', {
        success: true,
        totalSocketsRemoved: totalRemoved,
        usersRemoved,
        message: `Force cleanup completed: removed ${totalRemoved} invalid sockets and ${usersRemoved} users`
      });
      
    } catch (error) {
      console.error('Error during force cleanup:', error);
      client.emit('user:force_cleanup_result', {
        success: false,
        error: 'Failed to perform force cleanup',
        message: error.message
      });
    }
  }

  @SubscribeMessage('user_presence')
  @AsyncApiSub({
    channel: 'user_presence',
    summary: 'Update user presence',
    description: 'Update the presence status of the current user',
    message: {
      payload: UserPresenceDto,
    },
  })
  @AsyncApiPub({
    channel: 'user_presence',
    summary: 'User presence update response',
    description: 'Response confirming user presence update',
    message: {
      payload: Object,
    },
  })
  async handleUserPresence(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket
  ) {
    try {
      const userId = await this.redisService.get(`${this.SOCKET_USER_PREFIX}${client.id}`);
      if (userId) {
        // Update user presence
        const userKey = `${this.USER_PRESENCE_PREFIX}${userId}`;
        const userData = await this.redisService.get(userKey);
        if (userData) {
          userData.status = data.status || 'online'; // online, away, busy, offline
          await this.redisService.set(userKey, userData, 3600);
        }
        
        // Broadcast presence update
        this.server.emit('user_presence', {
          userId,
          status: data.status || 'online'
        });
      }
    } catch (error) {
      console.error('Error handling user presence:', error);
    }
  }

  @SubscribeMessage('ping')
  @AsyncApiSub({
    channel: 'ping',
    summary: 'Ping server',
    description: 'Send a ping to keep the connection alive',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'pong',
    summary: 'Pong response',
    description: 'Server response to ping',
    message: {
      payload: Object,
    },
  })
  handlePing(@MessageBody() data: unknown) {
    console.log('ping received:', data);
    return { event: 'pong', data };
  }

  @SubscribeMessage('auth:token_refresh_needed')
  @AsyncApiSub({
    channel: 'auth:token_refresh_needed',
    summary: 'Token refresh needed',
    description: 'Handle token refresh request',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'auth:token_refresh_needed',
    summary: 'Token refresh response',
    description: 'Response to token refresh request',
    message: {
      payload: Object,
    },
  })
  async handleTokenRefreshNeeded(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket
  ) {
    try {
      console.log('Token refresh needed for socket:', client.id);
      
      // Notify client to refresh token
      client.emit('auth:token_expired', {
        message: 'Your session has expired. Please refresh your token.',
        timestamp: new Date().toISOString()
      });
      
      // Give client some time to refresh, then disconnect if still using old token
      setTimeout(async () => {
        // Check if client has updated their token
        const tokenKey = `${this.SOCKET_TOKEN_PREFIX}${client.id}`;
        const tokenData = await this.redisService.get(tokenKey);
        
        if (tokenData && tokenData.token) {
          try {
            this.jwtService.verify(tokenData.token);
            // Token is valid, client has refreshed
            return;
          } catch (error) {
            // Token is still invalid, disconnect
            if (client.connected) {
              client.disconnect(true);
            }
          }
        }
      }, 10000); // 10 second grace period
      
    } catch (error) {
      console.error('Error handling token refresh needed:', error);
    }
  }



	// New endpoint for index-based pagination
	@SubscribeMessage('task:get_by_index')
	@AsyncApiSub({
		channel: 'task:get_by_index',
		summary: 'Get tasks by index',
		description: 'Get tasks for a sprint with index-based pagination',
		message: {
			payload: TaskGetByIndexDto,
		},
	})
	@AsyncApiPub({
		channel: 'task:get_by_index',
		summary: 'Tasks response',
		description: 'Response with tasks and pagination info',
		message: {
			payload: TaskGetByIndexResponseDto,
		},
	})
	async handleGetTasksByIndex(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:get_by_index received', data);

		try {
			if (!data || typeof data.sprintId !== 'string' || !data.sprintId.trim()) {
				throw new Error('sprintId is required and must be a non-empty string');
			}

			// Extract pagination parameters
			const index = parseInt(data.index) || 0;
			const limit = parseInt(data.limit) || 5;
			const isForward = data.isForward !== undefined ? data.isForward : true;

			// Validate parameters
			if (index < 0) {
				throw new Error('index must be non-negative');
			}
			if (limit < 1 || limit > 100) {
				throw new Error('limit must be between 1 and 100');
			}
			if (typeof isForward !== 'boolean') {
				throw new Error('isForward must be a boolean');
			}

			const result = await this.taskService.getAllTasksBySprintWithIndex({
				sprintId: data.sprintId,
				index,
				limit,
				isForward
			});

			console.log('tasks found:', result.tasks.length, 'of', result.total);

			// Send response only to the requester
			client.emit('task:get_by_index', {
				sprintId: data.sprintId,
				tasks: result.tasks,
				pagination: {
					total: result.total,
					currentIndex: result.currentIndex,
					startIndex: result.startIndex,
					endIndex: result.endIndex,
					hasNext: result.hasNext,
					hasPrev: result.hasPrev,
					limit
				}
			});
		} catch (error) {
			console.error('Error in task:get_by_index:', error);

			client.emit('task:get_by_index', {
				error: error.message || 'Unknown error',
			});
		}
	}

//get a tasks children
  @SubscribeMessage('task:get_children')
  @AsyncApiSub({
    channel: 'task:get_children',
    summary: 'Get task children',
    description: 'Get all child tasks of a specific task',
    message: {
      payload: TaskGetChildrenDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:get_children',
    summary: 'Task children response',
    description: 'Response with child tasks',
    message: {
      payload: Object,
    },
  })
	async handleGetTaskChildren(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:get_children received', data);

		try {
			if (!data || typeof data.taskId !== 'string' || !data.taskId.trim()) {
				throw new Error('taskId is required and must be a non-empty string');
			}

			const children = await this.taskService.getTaskChildren(data.taskId);
			console.log('children found:', children.length);

			// Send response only to the requester
			client.emit('task:get_children', {
				taskId: data.taskId,
				children,
			});
		} catch (error) {
			console.error('Error in task:get_children:', error);

			// Optional: send error back to the requester
			client.emit('task:get_children', {
				error: error.message || 'Unknown error',
			});
		}
	}

	// New paginated endpoint for getting task children
	@SubscribeMessage('task:get_children_by_index')
	@AsyncApiSub({
		channel: 'task:get_children_by_index',
		summary: 'Get task children by index',
		description: 'Get child tasks with index-based pagination',
		message: {
			payload: TaskGetChildrenByIndexDto,
		},
	})
	@AsyncApiPub({
		channel: 'task:get_children_by_index',
		summary: 'Task children by index response',
		description: 'Response with child tasks and pagination info',
		message: {
			payload: Object,
		},
	})
	async handleGetTaskChildrenByIndex(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:get_children_by_index received', data);

		try {
			if (!data || typeof data.taskId !== 'string' || !data.taskId.trim()) {
				throw new Error('taskId is required and must be a non-empty string');
			}

			// Extract pagination parameters
			const index = parseInt(data.index) || 0;
			const limit = parseInt(data.limit) || 5;
			const isForward = data.isForward !== undefined ? data.isForward : true;

			// Validate parameters
			if (index < 0) {
				throw new Error('index must be non-negative');
			}
			if (limit < 1 || limit > 100) {
				throw new Error('limit must be between 1 and 100');
			}
			if (typeof isForward !== 'boolean') {
				throw new Error('isForward must be a boolean');
			}

			const result = await this.taskService.getTaskChildrenWithIndex(data.taskId, {
				index,
				limit,
				isForward
			});

			console.log('children found:', result.tasks.length, 'of', result.total);

			// Send response only to the requester
			client.emit('task:get_children_by_index', {
				taskId: data.taskId,
				children: result.tasks,
				pagination: {
					total: result.total,
					currentIndex: result.currentIndex,
					startIndex: result.startIndex,
					endIndex: result.endIndex,
					hasNext: result.hasNext,
					hasPrev: result.hasPrev,
					limit
				}
			});
		} catch (error) {
			console.error('Error in task:get_children_by_index:', error);

			client.emit('task:get_children_by_index', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('task:set_status')
  @AsyncApiSub({
    channel: 'task:set_status',
    summary: 'Set task status',
    description: 'Update the status of a task',
    message: {
      payload: TaskSetStatusDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:set_status',
    summary: 'Task status update response',
    description: 'Response confirming task status update',
    message: {
      payload: Object,
    },
  })
	async handleSetTaskStatus(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:set_status received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('taskId is required and must be a non-empty string');
			}

			if (!data.status || !['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(data.status)) {
				throw new Error('status is required and must be one of: OPEN, IN_PROGRESS, COMPLETED');
			}

			const result = await this.taskService.updateTaskStatus(data.id, data.status);
			console.log('task status updated:', result);

			// Send response only to the requester
			client.emit('task:set_status', {
				id: data.id,
				result,
			});

			// Emit task:refresh event to all clients
			if (result.sprintId) {
				this.server.emit('task:refresh', {
					sprintId: result.sprintId,
					taskId: result.id,
					action: 'status_updated',
          new_status: result.status,
				});
			}
		} catch (error) {
			console.error('Error in task:set_status:', error);

			// Send error back to the requester
			client.emit('task:set_status', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('user:request_all')
  @AsyncApiSub({
    channel: 'user:request_all',
    summary: 'Request all users',
    description: 'Request a list of all users in the system',
    message: {
      payload: Object,
    },
  })
  @AsyncApiPub({
    channel: 'user:all',
    summary: 'All users response',
    description: 'Response with list of all users',
    message: {
      payload: Object,
    },
  })
	async handleRequestAllUsers(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('user:request_all received', data);

		try {
			// Get all users from the database
			const users = await this.prismaService.user.findMany({
				select: {
					id: true,
					name: true,
				},
				orderBy: {
					name: 'asc',
				},
			});

			console.log('users found and sent:', users.length);

			// Send response only to the requester
			client.emit('user:get_all', {
				users,
			});


		} catch (error) {
			console.error('Error in user:request_all:', error);

			// Send error back to the requester
			client.emit('user:get_all', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('task:change_assignee')
  @AsyncApiSub({
    channel: 'task:change_assignee',
    summary: 'Change task assignee',
    description: 'Change the assignee of a task',
    message: {
      payload: TaskChangeAssigneeDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:change_assignee',
    summary: 'Task assignee change response',
    description: 'Response confirming task assignee change',
    message: {
      payload: Object,
    },
  })
	async handleChangeTaskAssignee(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:change_assignee received', data);

		try {
			if (!data || typeof data.taskId !== 'string' || !data.taskId.trim()) {
				throw new Error('taskId is required and must be a non-empty string');
			}

			if (!data.assigneeId || typeof data.assigneeId !== 'string' || !data.assigneeId.trim()) {
				throw new Error('assigneeId is required and must be a non-empty string');
			}

			// Update the task's assignedTo field
			const updatedTask = await this.prismaService.task.update({
				where: { id: data.taskId },
				data: { assignedTo: data.assigneeId },
				include: {
					sprint: true,
				},
			});

			console.log('task assignee updated:', updatedTask);

			// Send response only to the requester
/* 			client.emit('task:change_assignee', {
				event: 'task:change_assignee',
				taskId: data.taskId,
				assigneeId: data.assigneeId,
				result: updatedTask,
			}); */

			// Emit task:refresh event to all clients
			// Fetch the assignee's name
      //TODO: use redis to get the assignee name
			let assigneeName: string | null = null;
			if (data.assigneeId) {
				const user = await this.prismaService.user.findUnique({
					where: { id: data.assigneeId },
					select: { name: true }
				});
				assigneeName = user?.name || null;
			}
			// Invalidate cache after changing assignee
			await this.taskService.invalidateSprintCache(updatedTask.sprintId);

			this.server.emit('task:refresh', {
				sprintId: updatedTask.sprintId,
				taskId: updatedTask.id,
				new_assignee: data.assigneeId,
				new_assignee_name: assigneeName,
				action: 'assignee_updated'
			});

		} catch (error) {
			console.error('Error in task:change_assignee:', error);

			// Send error back to the requester
			client.emit('task:change_assignee', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('sprint:set_status')
  @AsyncApiSub({
    channel: 'sprint:set_status',
    summary: 'Set sprint status',
    description: 'Update the status of a sprint',
    message: {
      payload: SprintSetStatusDto,
    },
  })
  @AsyncApiPub({
    channel: 'sprint:set_status',
    summary: 'Sprint status update response',
    description: 'Response confirming sprint status update',
    message: {
      payload: Object,
    },
  })
	async handleSetSprintStatus(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('sprint:set_status received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('sprintId is required and must be a non-empty string');
			}

			if (!data.status || !['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(data.status)) {
				throw new Error('status is required and must be one of: OPEN, IN_PROGRESS, COMPLETED');
			}

			const result = await this.sprintService.updateSprintStatus(data.id, data.status);
			console.log('sprint status updated:', result);

            // TODO: send to all
			// Send response only to the requester
			client.emit('sprint:set_status', {
				id: data.id,
				result,
			});
		} catch (error) {
			console.error('Error in sprint:set_status:', error);

			// Send error back to the requester
			client.emit('sprint:set_status', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('sprint:change_description')
  @AsyncApiSub({
    channel: 'sprint:change_description',
    summary: 'Change sprint description',
    description: 'Update the description of a sprint',
    message: {
      payload: SprintChangeDescriptionDto,
    },
  })
  @AsyncApiPub({
    channel: 'sprint:change_description',
    summary: 'Sprint description change response',
    description: 'Response confirming sprint description change',
    message: {
      payload: Object,
    },
  })
	async handleChangeSprintDescription(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('sprint:change_description received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('id is required and must be a non-empty string');
			}

			if (typeof data.description !== 'string') {
				throw new Error('description is required and must be a string');
			}

			const result = await this.sprintService.updateSprintDescription(data.id, data.description);
			console.log('sprint description updated:', result);


			// Emit sprint:refresh event to all clients
			this.server.emit('sprint:refresh', {
				sprintId: data.id,
				action: 'description_updated',
        new_description: data.description,
			});

		} catch (error) {
			console.error('Error in sprint:change_description:', error);

			// Send error back to the requester
			client.emit('sprint:change_description', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('sprint:change_name')
  @AsyncApiSub({
    channel: 'sprint:change_name',
    summary: 'Change sprint name',
    description: 'Update the name of a sprint',
    message: {
      payload: SprintChangeNameDto,
    },
  })
  @AsyncApiPub({
    channel: 'sprint:change_name',
    summary: 'Sprint name change response',
    description: 'Response confirming sprint name change',
    message: {
      payload: Object,
    },
  })
	async handleChangeSprintName(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('sprint:change_name received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('id is required and must be a non-empty string');
			}

			if (typeof data.name !== 'string') {
				throw new Error('name is required and must be a string');
			}

			const result = await this.sprintService.updateSprintName(data.id, data.name);
			console.log('sprint name updated:', result);

			// Emit sprint:refresh event to all clients
			this.server.emit('sprint:refresh', {
				sprintId: data.id,
				action: 'name_updated',
        new_name: data.name,
			});

		} catch (error) {
			console.error('Error in sprint:change_name:', error);

			// Send error back to the requester
			client.emit('sprint:change_name', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('sprint:create')
  @AsyncApiSub({
    channel: 'sprint:create',
    summary: 'Create sprint',
    description: 'Create a new sprint',
    message: {
      payload: SprintCreateDto,
    },
  })
  @AsyncApiPub({
    channel: 'sprint:create',
    summary: 'Sprint creation response',
    description: 'Response with created sprint details',
    message: {
      payload: Object,
    },
  })
	async handleCreateSprint(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('sprint:create received', data);

		try {
			if (!data || typeof data.name !== 'string' || !data.name.trim()) {
				throw new Error('name is required and must be a non-empty string');
			}

			const result = await this.sprintService.create(data.name);
			console.log('sprint created:', result);

			// Send response to the requester
			client.emit('sprint:create', {
				result,
			});

			// Broadcast sprint:get_all to all clients
			const allSprints = await this.sprintService.getAll();
			this.server.emit('sprint:get_all', allSprints);

		} catch (error) {
			console.error('Error in sprint:create:', error);

			// Send error back to the requester
			client.emit('sprint:create', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('sprint:request_delete')
  @AsyncApiSub({
    channel: 'sprint:request_delete',
    summary: 'Request sprint deletion',
    description: 'Request deletion of a sprint',
    message: {
      payload: SprintRequestDeleteDto,
    },
  })
  @AsyncApiPub({
    channel: 'sprint:request_delete',
    summary: 'Sprint deletion response',
    description: 'Response confirming sprint deletion',
    message: {
      payload: Object,
    },
  })
	async handleRequestDeleteSprint(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('sprint:request_delete received', data);

		try {
			if (!data || typeof data.sprintId !== 'string' || !data.sprintId.trim()) {
				throw new Error('sprintId is required and must be a non-empty string');
			}

			const result = await this.sprintService.deleteSprint(data.sprintId);
			console.log('sprint deleted:', result);

			// Send response to the requester
			client.emit('sprint:request_delete', {
				sprintId: data.sprintId,
				result,
			});

			// Broadcast sprint:get_all to all clients
			const allSprints = await this.sprintService.getAll();
			this.server.emit('sprint:get_all', allSprints);

		} catch (error) {
			console.error('Error in sprint:request_delete:', error);

			// Send error back to the requester
			client.emit('sprint:request_delete', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('task:change_description')
  @AsyncApiSub({
    channel: 'task:change_description',
    summary: 'Change task description',
    description: 'Update the description of a task',
    message: {
      payload: TaskChangeDescriptionDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:change_description',
    summary: 'Task description change response',
    description: 'Response confirming task description change',
    message: {
      payload: Object,
    },
  })
	async handleChangeTaskDescription(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:change_description received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('id is required and must be a non-empty string');
			}

			if (typeof data.description !== 'string') {
				throw new Error('description is required and must be a string');
			}

			const result = await this.taskService.updateTaskDescription(data.id, data.description);
			console.log('task description updated:', result);

			// Emit task:refresh event to all clients
			this.server.emit('task:refresh', {
				sprintId: result.sprintId,
				taskId: result.id,
				action: 'description_updated',
        new_description: data.description,
			});
		} catch (error) {
			console.error('Error in task:change_description:', error);

			// Send error back to the requester
			client.emit('task:change_description', {
				error: error.message || 'Unknown error',
			});
		}
	}

	@SubscribeMessage('task:change_name')
	async handleChangeTaskName(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:change_name received', data);

		try {
			if (!data || typeof data.id !== 'string' || !data.id.trim()) {
				throw new Error('id is required and must be a non-empty string');
			}

			if (typeof data.name !== 'string') {
				throw new Error('name is required and must be a string');
			}

			const result = await this.taskService.updateTaskName(data.id, data.name);
			console.log('task name updated:', result);

			// Emit task:refresh event to all clients
			this.server.emit('task:refresh', {
				sprintId: result.sprintId,
				taskId: result.id,
				action: 'name_updated',
        new_name: data.name,
			});
		} catch (error) {
			console.error('Error in task:change_name:', error);

			// Send error back to the requester
			client.emit('task:change_name', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('task:create')
  @AsyncApiSub({
    channel: 'task:create',
    summary: 'Create task',
    description: 'Create a new task in a sprint',
    message: {
      payload: TaskCreateDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:create',
    summary: 'Task creation response',
    description: 'Response with created task details',
    message: {
      payload: Object,
    },
  })
	async handleCreateTask(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:create received', data);

		try {
			if (!data || typeof data.title !== 'string' || !data.title.trim()) {
				throw new Error('title is required and must be a non-empty string');
			}

			if (!data.hours || typeof data.hours !== 'number' || data.hours <= 0) {
				throw new Error('hours is required and must be a positive number');
			}

			if (!data.sprintId || typeof data.sprintId !== 'string' || !data.sprintId.trim()) {
				throw new Error('sprintId is required and must be a non-empty string');
			}

			// Optional fields validation
			if (data.parentId !== undefined && data.parentId !== null && data.parentId !== '' && typeof data.parentId !== 'string') {
				throw new Error('parentId must be a string if provided');
			}

			if (data.assignedTo !== undefined && data.assignedTo !== null && data.assignedTo !== '' && typeof data.assignedTo !== 'string') {
				throw new Error('assignedTo must be a string if provided');
			}

			if (data.description !== undefined && typeof data.description !== 'string') {
				throw new Error('description must be a string if provided');
			}

			const result = await this.taskService.createTask({
				title: data.title,
				hours: data.hours,
				sprintId: data.sprintId,
				parentId: data.parentId,
				assignedTo: data.assignedTo,
				description: data.description
			});

			console.log('task created:', result);

			// Send response to the requester
			client.emit('task:create', {
				result,
			});

			// Broadcast task:refresh event to all clients (the event is already emitted by createTask via EventEmitter)
			// No need to manually emit here as the EventEmitter handles it

		} catch (error) {
			console.error('Error in task:create:', error);

			// Send error back to the requester
			client.emit('task:create', {
				error: error.message || 'Unknown error',
			});
		}
	}

	  @SubscribeMessage('task:request_delete')
  @AsyncApiSub({
    channel: 'task:request_delete',
    summary: 'Request task deletion',
    description: 'Request deletion of a task',
    message: {
      payload: TaskRequestDeleteDto,
    },
  })
  @AsyncApiPub({
    channel: 'task:request_delete',
    summary: 'Task deletion response',
    description: 'Response confirming task deletion',
    message: {
      payload: Object, 
    },
  })
	async handleRequestDeleteTask(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket
	) {
		console.log('task:request_delete received', data);

		try {
			if (!data || typeof data.taskId !== 'string' || !data.taskId.trim()) {
				throw new Error('taskId is required and must be a non-empty string');
			}

			const result = await this.taskService.deleteTask(data.taskId);
			console.log('task deleted:', result);

			// Send response to the requester
			client.emit('task:request_delete', {
				taskId: data.taskId,
				result,
			});

			// Broadcast task:deleted event to all clients
			this.server.emit('task:deleted', {
				taskId: data.taskId,
				sprintId: result.sprintId,
			});

		} catch (error) {
			console.error('Error in task:request_delete:', error);

			// Send error back to the requester
			client.emit('task:request_delete', {
				error: error.message || 'Unknown error',
			});
		}
	}
}


