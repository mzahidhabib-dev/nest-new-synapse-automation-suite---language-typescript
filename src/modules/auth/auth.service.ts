import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const slug = dto.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    let tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    let isNewTenant = false;

    if (!tenant) {
      tenant = await this.prisma.tenant.create({
        data: { name: dto.companyName, slug, plan: 'free' }
      });
      isNewTenant = true;
    }

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } }
    });
    if (existing) throw new ConflictException('Email already registered for this company');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    // The first user of a new tenant is automatically an admin
    const role = isNewTenant ? 'admin' : 'user';
    const user = await this.prisma.user.create({
      data: { tenantId: tenant.id, email: dto.email, passwordHash, role }
    });

    return this.generateTokens(user.id, tenant.id, tenant.name, user.role);
  }

  async login(dto: LoginDto) {
    let user;

    if (dto.tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
      if (!tenant) throw new UnauthorizedException('Invalid credentials');
      
      user = await this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
        include: { tenant: true }
      });
    } else {
      // Find the user by email across all tenants. 
      // If they belong to multiple, we just take the first one for frictionless login.
      const users = await this.prisma.user.findMany({
        where: { email: dto.email },
        include: { tenant: true },
        take: 1
      });
      user = users[0];
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, user.tenantId, user.tenant.name, user.role);
  }

  private generateTokens(userId: string, tenantId: string, tenantName: string, role: string) {
    const payload = { sub: userId, tenantId, tenantName, role };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET || 'refresh-fallback' }),
      tenantId,
      tenantName,
      userId,
    };
  }
}
