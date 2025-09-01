import { Controller, Get, Post, Req, Redirect, UseGuards, Res, Body, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ConfigService } from './config.service';
import type { Response, Request } from 'express'

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService,
    ) {}

	// Route to redirect user to Auth0 login page
	@Get('login')
    @UseGuards(AuthGuard('auth0'))
	login() {
		console.log('Login route handler called');
	}

    @Get('logout')
	async logout(@Req() req: Request, @Res() res: Response) {
		try {
			// Get refresh token from cookie to revoke it
			const refreshToken = req.cookies?.refresh_token;
			const user = (req as any).user;
			
			if (refreshToken && user?.auth0Id) {
				// Revoke the refresh token
				await this.authService.revokeRefreshToken(refreshToken, user.auth0Id);
			}
		} catch (error) {
			console.error('Error revoking refresh token during logout:', error);
		}
		
		// 1) Clear your app cookies EXACTLY as they were set (match path/sameSite/secure)
		res.clearCookie('jwt', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
		});
		
		res.clearCookie('refresh_token', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
		});

		// 2) Redirect to Auth0 logout (which will redirect back to your SPA)
		const returnTo = encodeURIComponent(this.configService.getFrontendUrl() + '/');
		const clientId = process.env.AUTH0_CLIENT_ID!;
		const domain = process.env.AUTH0_DOMAIN!; // e.g. my-tenant.eu.auth0.com
		const url = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;

		return res.redirect(url);
	}
    

	// Callback route Auth0 redirects to after successful login
	@Get('callback')
	@UseGuards(AuthGuard('auth0')) // Auth0 Passport strategy validates Auth0 response
	async callback(@Req() req, @Res() res) {
		// req.user is populated by the Auth0 strategy
		const user = req.user;
		
		// Generate your own JWT and refresh token for your API
		const tokens = await this.authService.login(user);
		
		// Set JWT as secure cookie with shorter expiry
		res.cookie('jwt', tokens.access_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/', 
			maxAge: 15 * 60 * 1000 // 15 minutes
		});
		
		// Set refresh token as secure cookie with longer expiry
		res.cookie('refresh_token', tokens.refresh_token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/', 
			maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
		});
		
		// Redirect browser to React dashboard
		res.redirect(this.configService.getFrontendUrl() + '/');
	}

	@Get('me')
	@UseGuards(AuthGuard('jwt')) // Your JWT authentication guard
	async me(@Req() req) {
		// req.user is populated by your JWT strategy after token validation
		const user = req.user;
		
		return {
			id: user.id,
		};
	}

	@Post('refresh')
	async refresh(@Req() req: Request, @Res() res: Response) {
		try {
			const refreshToken = req.cookies?.refresh_token;
			const currentAuth0Id = req.cookies?.jwt ? this.extractAuth0IdFromJwt(req.cookies.jwt) : null;
			
			if (!refreshToken) {
				throw new UnauthorizedException('Refresh token not found');
			}
			
			if (!currentAuth0Id) {
				throw new UnauthorizedException('Invalid JWT token');
			}
			
			// Refresh the access token
			const newTokens = await this.authService.refreshToken(refreshToken, currentAuth0Id);
			
			if (!newTokens) {
				throw new UnauthorizedException('Invalid refresh token');
			}
			
			// Set new JWT as secure cookie
			res.cookie('jwt', newTokens.access_token, {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				path: '/', 
				maxAge: 15 * 60 * 1000 // 15 minutes
			});
			
			return res.json({
				message: 'Token refreshed successfully',
				expires_in: newTokens.expires_in
			});
			
		} catch (error) {
			console.error('Error refreshing token:', error);
			
			// Clear invalid cookies
			res.clearCookie('jwt', {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				path: '/',
			});
			
			res.clearCookie('refresh_token', {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				path: '/',
			});
			
			throw new UnauthorizedException('Failed to refresh token');
		}
	}

	private extractAuth0IdFromJwt(token: string): string | null {
		try {
			// Decode JWT without verification to get auth0Id
			const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
			return payload.sub || null;
		} catch (error) {
			console.error('Error extracting auth0Id from JWT:', error);
			return null;
		}
	}

}