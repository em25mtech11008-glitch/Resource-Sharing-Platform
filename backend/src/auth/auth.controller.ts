import { Controller, Post, Body, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../database/user.entity';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body(ValidationPipe) body: any) {
    return this.authService.login(body);
  }

  @Post('register')
  async register(@Body(ValidationPipe) body: any) {
    return this.authService.register(body.username, body.password, body.role || Role.USER);
  }
}
