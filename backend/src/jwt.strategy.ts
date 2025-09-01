import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

	constructor(private readonly prismaService: PrismaService) {
		console.log("JwtStrategy is created")
		const jwtSecret = process.env.JWT_SECRET;
		if (!jwtSecret) {
			throw new Error('JWT_SECRET environment variable is required');
		}
		
		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
				(request) => {
					return request?.cookies?.jwt;
				}
			]),
			ignoreExpiration: false,
			secretOrKey: jwtSecret, // Now TypeScript knows it's not undefined
		});
	}

    async validate(payload: any) {
        console.log('JwtStrategy.validate() called');
        console.log('JWT Payload:', JSON.stringify(payload, null, 2));
        
        // Find user in database using auth0Id
        let user = await this.prismaService.user.findUnique({
            where: { auth0Id: payload.sub }
        });
        
        if (!user) {
            // User is authenticated via Auth0 but doesn't exist in our database
            // Create a new user record
            console.log(`Creating new user for auth0Id: ${payload.sub}`);
            
            // Generate a fallback name if not available from payload
            let userName = payload.name || payload.email?.split('@')[0] || `User${Date.now()}`;
            
            // Ensure userName is a string
            if (typeof userName !== 'string') {
                userName = `User${Date.now()}`;
            }
            
            try {
                user = await this.prismaService.user.create({
                    data: {
                        auth0Id: payload.sub,
                        name: userName
                    }
                });
                console.log(`Created new user: ${user.name} (${user.id})`);
            } catch (error) {
                console.error('Failed to create user:', error);
                throw new Error(`Failed to create user for auth0Id ${payload.sub}: ${error.message}`);
            }
        }
        
        // Return user object that gets attached to req.user
        return {
            id: user.id,
            auth0Id: user.auth0Id,
            name: user.name
        };
    }
}