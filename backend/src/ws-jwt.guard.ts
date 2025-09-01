import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const client: Socket = context.switchToWs().getClient();
    const request = client.handshake;
    
    // Extract JWT token from handshake auth or headers
    let token: string | null = null;
    
    // Try to get token from handshake auth
    if (request.auth && request.auth.token) {
      token = request.auth.token;
    }
    
    // Try to get token from handshake headers
    if (!token && request.headers && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    // Try to get token from cookies
    if (!token && request.headers && request.headers.cookie) {
      const cookies = request.headers.cookie;
      const jwtCookie = cookies.split('; ').find(cookie => cookie.startsWith('jwt='));
      if (jwtCookie) {
        token = jwtCookie.substring(4); // Remove 'jwt=' prefix
      }
    }
    
    // Try to get token from handshake query parameters
    if (!token && request.query && request.query.token) {
      token = request.query.token as string;
    }
    
    if (!token) {
      throw new UnauthorizedException('JWT token not found in WebSocket handshake');
    }
    
    // Create a mock request object that the JWT strategy can work with
    const mockRequest = {
      headers: {
        authorization: `Bearer ${token}`
      },
      cookies: {
        jwt: token
      },
      user: null
    };
    
    // Store the token in the handshake for later use
    (client.handshake as any).token = token;
    
    return mockRequest;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      
      if (result) {
        // Get the authenticated user from the JWT strategy
        const request = this.getRequest(context);
        const user = (request as any).user;
        
        if (user && user.id) {
          // Store the user in the handshake for the gateway to access
          const client: Socket = context.switchToWs().getClient();
          (client.handshake as any).user = user;
        }
      }
      
      return result as boolean;
    } catch (error) {
      throw new UnauthorizedException('WebSocket authentication failed');
    }
  }
}


