import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

describe('AuthController', () => {
	let controller: AuthController;
	let authService: AuthService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [
				{
					provide: AuthService,
					useValue: {
						validateUser: jest.fn().mockResolvedValue({
							id: 'auth0|123',
							email: 'test@example.com',
							name: 'Test User',
						}),
						login: jest.fn().mockResolvedValue({
							access_token: 'mock-jwt-token',
							refresh_token: 'mock-refresh-token',
							expires_in: 900,
						}),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						getFrontendUrl: jest.fn().mockReturnValue('http://localhost:5173'),
					},
				},
			],
		}).compile();
		controller = module.get<AuthController>(AuthController);
		authService = module.get<AuthService>(AuthService);
	});
	
	it('should be defined', () => {
		expect(controller).toBeDefined();
	});

	it('callback should set JWT cookie and redirect to dashboard', async () => {
		const req = { user: { sub: 'auth0|123', email: 'test@example.com', name: 'Test User' } };
		
		// Mock response object
		const res = {
			cookie: jest.fn().mockReturnThis(),
			redirect: jest.fn()
		};
		
		await controller.callback(req, res);
		
		expect(authService.login).toHaveBeenCalledWith(req.user);
		
		// Test that JWT cookie is set with correct parameters
		expect(res.cookie).toHaveBeenCalledWith('jwt', 'mock-jwt-token', {
			httpOnly: true,
			secure: false, // or true depending on your NODE_ENV in tests
			sameSite: 'lax',
			path: '/',
			maxAge: 15 * 60 * 1000 // 15 minutes
		});
		
		// Test that refresh token cookie is set with correct parameters
		expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'mock-refresh-token', {
			httpOnly: true,
			secure: false, // or true depending on your NODE_ENV in tests
			sameSite: 'lax',
			path: '/',
			maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
		});
		
		// Test that redirect happens
		expect(res.redirect).toHaveBeenCalledWith('http://localhost:5173/');
	});
});