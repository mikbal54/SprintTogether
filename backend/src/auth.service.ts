import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from './redis.service';
import axios from 'axios';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
	constructor(
		private readonly configService: ConfigService,
		private readonly jwtService: JwtService,
		private readonly redisService: RedisService,
	) {}

	/**
	 * Validate a user object returned by Auth0
	 * Typically, you would check your database here
	 */
	async validateUser(auth0User: any) {
		// Example: find user in DB or create new
		// For demo, just return the Auth0 payload
		return {
			id: auth0User.sub,
			email: auth0User.email,
			name: auth0User.name,
		};
	}

	/**
	 * Issue a JWT token and refresh token for your own app
	 */
	async login(user: any) {
		const payload = { sub: user.auth0Id };
		
		// Generate access token with shorter expiry
		const access_token = this.jwtService.sign(payload, {
			expiresIn: '15m', // Short-lived access token
		});
		
		// Generate refresh token
		const refresh_token = await this.generateRefreshToken(user.auth0Id);
		
		return {
			access_token,
			refresh_token,
			expires_in: 15 * 60, // 15 minutes in seconds
		};
	}

	/**
	 * Generate a refresh token and store it in Redis
	 */
	async generateRefreshToken(auth0Id: string): Promise<string> {
		const refreshToken = randomBytes(32).toString('hex');
		const refreshTokenKey = `refresh_token:${auth0Id}:${refreshToken}`;
		
		// Store refresh token in Redis with longer expiry (7 days)
		await this.redisService.set(refreshTokenKey, {
			userId: auth0Id,
			createdAt: new Date().toISOString(),
		}, 7 * 24 * 60 * 60); // 7 days
		
		return refreshToken;
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshToken(refreshToken: string, auth0Id: string): Promise<{ access_token: string; expires_in: number } | null> {
		const refreshTokenKey = `refresh_token:${auth0Id}:${refreshToken}`;
		
		// Check if refresh token exists and is valid
		const tokenData = await this.redisService.get(refreshTokenKey);
		if (!tokenData || tokenData.userId !== auth0Id) {
			return null;
		}
		
		// Generate new access token
		const payload = { sub: auth0Id };
		const access_token = this.jwtService.sign(payload, {
			expiresIn: '15m',
		});
		
		return {
			access_token,
			expires_in: 15 * 60, // 15 minutes in seconds
		};
	}

	/**
	 * Revoke a refresh token
	 */
	async revokeRefreshToken(refreshToken: string, auth0Id: string): Promise<boolean> {
		const refreshTokenKey = `refresh_token:${auth0Id}:${refreshToken}`;
		const result = await this.redisService.del(refreshTokenKey);
		return result > 0;
	}

	/**
	 * Revoke all refresh tokens for a user
	 */
	async revokeAllRefreshTokens(auth0Id: string): Promise<void> {
		const pattern = `refresh_token:${auth0Id}:*`;
		const keys = await this.redisService.keys(pattern);
		
		if (keys.length > 0) {
			await this.redisService.del(...keys);
		}
	}

	/**
	 * Get a machine-to-machine token from Auth0
	 * Useful for calling Auth0-protected APIs
	 */
	async getAuth0Token() {
		const domain = this.configService.get<string>('AUTH0_DOMAIN');
		const clientId = this.configService.get<string>('AUTH0_CLIENT_ID');
		const clientSecret = this.configService.get<string>('AUTH0_CLIENT_SECRET');
		const audience = this.configService.get<string>('AUTH0_AUDIENCE');

		const response = await axios.post(`https://${domain}/oauth/token`, {
			client_id: clientId,
			client_secret: clientSecret,
			audience,
			grant_type: 'client_credentials',
		});

		return response.data.access_token;
	}
}
