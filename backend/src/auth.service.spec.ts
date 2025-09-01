import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('AuthService', () => {
	let service: AuthService;

	beforeEach(async () => {
		const mockConfigService = {
			get: jest.fn((key: string) => {
				const values = {
					AUTH0_DOMAIN: 'fake-domain',
					AUTH0_CLIENT_ID: 'fake-client-id',
					AUTH0_CLIENT_SECRET: 'fake-client-secret',
					JWT_SECRET: 'test-secret',
				};
				return values[key];
			}),
		};

		const mockJwtService = {
			sign: jest.fn().mockReturnValue('fake-jwt-token'),
		};

		const mockRedisService = {
			set: jest.fn().mockResolvedValue(undefined),
			get: jest.fn().mockResolvedValue(null),
			del: jest.fn().mockResolvedValue(1),
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: JwtService, useValue: mockJwtService },
				{ provide: RedisService, useValue: mockRedisService },
			],
		}).compile();

		service = module.get<AuthService>(AuthService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	it('should validate a user', async () => {
		const auth0User = { sub: 'auth0|123', email: 'test@example.com', name: 'Test User' };
		const user = await service.validateUser(auth0User);

		expect(user).toEqual({
			id: 'auth0|123',
			email: 'test@example.com',
			name: 'Test User',
		});
	});

	it('should return a token on login', async () => {
		const user = { id: 'auth0|123', email: 'test@example.com' };
		const result = await service.login(user);

		expect(result).toEqual({
			access_token: 'fake-jwt-token',
			refresh_token: expect.any(String),
			expires_in: 900,
		});
	});
});
