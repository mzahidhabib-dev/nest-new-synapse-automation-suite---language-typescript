import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId || 'anonymous';
    const endpoint = request.route?.path || request.url;

    // Rate limit: 20 requests per minute per endpoint per client
    const limit = 20;
    const windowMs = 60 * 1000;
    const now = new Date();

    try {
      const rateLimit = await this.prisma.rateLimit.upsert({
        where: {
          tenantId_endpoint: { tenantId, endpoint },
        },
        update: {},
        create: {
          tenantId,
          endpoint,
          resetTime: new Date(now.getTime() + windowMs),
        },
      });

      if (now.getTime() > rateLimit.resetTime.getTime()) {
        // Window expired, reset hits
        await this.prisma.rateLimit.update({
          where: { id: rateLimit.id },
          data: { hits: 1, resetTime: new Date(now.getTime() + windowMs) },
        });
        return true;
      }

      if (rateLimit.hits >= limit) {
        throw new HttpException('Rate limit exceeded. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }

      // Increment hits
      await this.prisma.rateLimit.update({
        where: { id: rateLimit.id },
        data: { hits: { increment: 1 } },
      });

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('Rate Limiter Error:', error);
      // Fail open if DB has issues so we don't break the app
      return true;
    }
  }
}
