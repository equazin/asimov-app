import { Controller, Post, Body, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email y password' })
  async login(
    @Body() body: { email: string; password: string; totpCode?: string },
    @Headers('x-device-origin') origin?: string,
  ) {
    return this.auth.login(body.email, body.password, origin ?? 'web');
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo tenant + usuario owner' })
  async register(
    @Body() body: {
      tenantName: string;
      ownerName: string;
      ownerEmail: string;
      password: string;
      country?: string;
      planTier?: string;
    },
  ) {
    return this.auth.registerTenant({
      tenantName: body.tenantName,
      ownerName: body.ownerName,
      ownerEmail: body.ownerEmail,
      password: body.password,
      country: body.country ?? 'AR',
      planTier: body.planTier ?? 'trial',
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token con refresh token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refreshToken(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@Body() body: { refreshToken?: string; userId: string }) {
    await this.auth.logout(body.userId, body.refreshToken);
  }
}
