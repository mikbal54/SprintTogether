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
        const user = await this.prismaService.user.findUnique({
            where: { auth0Id: payload.sub }
        });
        
        if (!user) {
            throw new Error(`User with auth0Id ${payload.sub} not found in database`);
        }
        
        // Return user object that gets attached to req.user
        return {
            id: user.id,
            auth0Id: user.auth0Id,
            name: user.name
        };
    }
}