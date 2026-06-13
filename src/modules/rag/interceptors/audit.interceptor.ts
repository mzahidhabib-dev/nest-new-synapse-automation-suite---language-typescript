import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId || null;
    const userId = request.user?.userId || null;
    const action = `${request.method} ${request.route?.path || request.url}`;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || null;
    
    // As discussed, we only log lightweight metadata to save DB space, not the full chat text
    const metadata = {
      ip: request.ip,
      sessionId: request.body?.sessionId,
      hasFile: !!request.file,
    };

    return next.handle().pipe(
      tap(async () => {
        try {
          await this.prisma.auditLog.create({
            data: {
              tenantId,
              userId,
              action,
              ipAddress,
              userAgent,
              metadata,
            },
          });
        } catch (e) {
          console.error('Failed to write audit log', e);
        }
      }),
    );
  }
}
