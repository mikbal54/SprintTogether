import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-auth0';
import { PrismaService } from '../prisma/prisma.service';
import {RedisService} from "./redis.service"


//TODO: write integration test
@Injectable() 
export class Auth0Strategy extends PassportStrategy(Strategy, 'auth0') {
	constructor(private readonly prisma: PrismaService, private readonly redisService : RedisService )  {
		super({
			domain: process.env.AUTH0_DOMAIN,
			clientID: process.env.AUTH0_CLIENT_ID,
			clientSecret: process.env.AUTH0_CLIENT_SECRET,
			callbackURL: process.env.AUTH0_CALLBACK_URL || 'http://localhost:3000/auth/callback',
			scope: 'openid profile email',
            state: false, 
		});

        console.log('Auth0Strategy created');
	}

    async validate(accessToken: string, refreshToken: string, extraParams: any, profile: any) {

  
        //console.log('Auth0 Extra Params:', JSON.stringify(extraParams, null, 2));

        const userId = extraParams.id;
        // Extract name with better priority order based on Auth0 extraParams data
        let userName = '';
        
        // Helper function to safely convert to string
        const safeToString = (value: any): string => {
            if (typeof value === 'string') {
                return value;
            }
            if (typeof value === 'object' && value !== null) {
                // If it's an object with name properties, extract them
                if (value.givenName && value.familyName) {
                    return `${value.givenName} ${value.familyName}`;
                }
                if (value.givenName) {
                    return value.givenName;
                }
                if (value.familyName) {
                    return value.familyName;
                }
                if (value.name) {
                    return safeToString(value.name);
                }
                // If it's an object but we can't extract a name, return empty string
                return '';
            }
            // For other types (number, boolean, etc.), convert to string
            return String(value || '');
        };

        if (extraParams.name) {
            userName = safeToString(extraParams.name);
        } else if (extraParams.given_name && extraParams.family_name) {
            userName = `${safeToString(extraParams.given_name)} ${safeToString(extraParams.family_name)}`;
        } else if (extraParams.given_name) {
            userName = safeToString(extraParams.given_name);
        } else if (extraParams.nickname) {
            userName = safeToString(extraParams.nickname);
        } else if (extraParams.email) {
            userName = safeToString(extraParams.email).split('@')[0];
        }

        // Ensure userName is a string and not empty
        if (typeof userName !== 'string') {
            console.warn('userName is not a string, converting:', userName);
            userName = safeToString(userName);
        }

        // Try to get user from Redis cache
        let user = await this.redisService.get(`user:${userId}`);
        
        if (!user) {
            // Fetch from DB
            user = await this.prisma.user.findUnique({ where: { auth0Id: userId } });
    
            if (!user) {
                // If no name from Auth0, generate fallback name
                if (!userName) {
                    const userCount = await this.prisma.user.count();
                    userName = `User${userCount + 1}`;
                }
                
                // Final validation before creating user
                if (typeof userName !== 'string') {
                    throw new Error(`Invalid userName type: ${typeof userName}. Expected string, got: ${JSON.stringify(userName)}`);
                }
                
                // Create new user with name
                user = await this.prisma.user.create({ 
                    data: { 
                        auth0Id: userId,
                        name: userName
                    } 
                });
            } else if (user.name === '' && userName) {
                // Final validation before updating user
                if (typeof userName !== 'string') {
                    throw new Error(`Invalid userName type: ${typeof userName}. Expected string, got: ${JSON.stringify(userName)}`);
                }
                
                // Update existing user's name if it's empty and we have a name
                user = await this.prisma.user.update({
                    where: { auth0Id: userId },
                    data: { name: userName }
                });
            }
    
            // Cache the user in Redis for 1 hour
            await this.redisService.set(`user:${userId}`, user, 3600);
        }
    
        return user; // becomes req.user
    }
}