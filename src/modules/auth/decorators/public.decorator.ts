import { SetMetadata } from '@nestjs/common';

/**
 * Mark a route as public — it will skip the global JwtAuthGuard.
 * Use on any endpoint that must be accessible without a JWT token
 * (e.g. login, register, health checks).
 *
 * @example
 * @Public()
 * @Post('login')
 * login(@Body() dto: LoginDto) { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
