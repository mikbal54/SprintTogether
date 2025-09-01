import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import axios from 'axios';

// Test-only helper
class AuthTestHelper {
	constructor(private configService: ConfigService) {}

	async loginWithEmailPassword(): Promise<string> {
		const domain = this.configService.get<string>('AUTH0_DOMAIN');
		const clientId = this.configService.get<string>('AUTH0_CLIENT_ID');
        const clientSecret = this.configService.get<string>('AUTH0_CLIENT_SECRET');
		const email = this.configService.get<string>('AUTH0_TEST_EMAIL');
		const password = this.configService.get<string>('AUTH0_TEST_PASSWORD');

        console.log("user: ", email)
        console.log("password: ", password)

        try {
            const response = await axios.post(`https://${domain}/oauth/token`, {
              grant_type: 'password',
              username: email,
              password,
              client_id: clientId,
              client_secret: clientSecret,
              realm: 'Username-Password-Authentication',
              scope: 'openid profile email',
            });
            return response.data.access_token;
          } catch (err: any) {
            console.error('Auth0 error:', err.response?.data);
            throw err;
          }
	}
    
}

describe('Auth0 Integration (real login)', () => {
	let helper: AuthTestHelper;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ConfigModule.forRoot({ isGlobal: true })],
		}).compile();

		const configService = module.get<ConfigService>(ConfigService);
		helper = new AuthTestHelper(configService);
	});

	it('should login with test account', async () => {
		const token = await helper.loginWithEmailPassword();
		expect(token).toBeDefined();
		expect(typeof token).toBe('string');
		expect(token.length).toBeGreaterThan(10);
	});
});