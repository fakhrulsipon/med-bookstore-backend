import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  Get,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';

@Controller('api/v1')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('admin/login')
  async adminLogin(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.authService.adminLogin(body);

    // Push token to HttpOnly Cookie
    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: false, // Set to true in production (for HTTPS)
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    return { success: true, message: 'Logged in successfully' };
  }

  @Post('admin/logout')
  async adminLogout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_session');
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('access/request-otp')
  async requestOtp(@Body('email') email: string) {
    return this.authService.requestOtp(email);
  }

  @Post('access/verify-otp')
  async verifyOtp(@Body() body: any) {
    return this.authService.verifyOtp(body);
  }

  // 🔄 When admin wants to reset a student's device from the dashboard
  @Post('admin/reset-devices')
  @UseGuards(AuthGuard('admin-jwt')) // Only cookie-verified admins can run this API
  async resetDevices(@Body('email') email: string) {
    return this.authService.resetStudentDevices(email);
  }

  // --- ROUTE PROTECTION TESTING ENDPOINTS ---
  @Get('admin/me')
  @UseGuards(AuthGuard('admin-jwt'))
  getAdminProfile(@Req() req: any) {
    return { message: 'Authenticated Admin Access Granted!', user: req.user };
  }

  @Get('student/verify-token')
  @UseGuards(AuthGuard('student-jwt'))
  getStudentProfile(@Req() req: any) {
    return { message: 'Authenticated Student Access Granted!', user: req.user };
  }
}
