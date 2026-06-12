import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/v1/admin-dashboard')
@UseGuards(AuthGuard('admin-jwt'))
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  // 📊 1. Dashboard Live Analytics Counter Summary
  @Get('stats')
  async getDashboardStats() {
    return this.dashboardService.getDashboardStats();
  }

  // 📑 2. List of all student orders (search, filter and paginated)
  // Example: /api/v1/admin-dashboard/orders?page=1&limit=10&status=Paid&search=Bashar
  @Get('orders')
  async getAllOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 10;
    return this.dashboardService.getAllOrders(p, l, status, search);
  }

  // 🚚 3. Update the delivery or payment status of the order (when changed from the admin panel)
  // Example: PATCH /api/v1/admin-dashboard/orders/65f3a1b2c3d4.../status
  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Param('id') orderId: string,
    @Body('status') status: 'PENDING' | 'Paid' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  ) {
    return this.dashboardService.updateOrderStatus(orderId, status);
  }

  // 👥4. Directory profile list of registered paid students
  @Get('students')
  async getStudentDirectory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 10;
    return this.dashboardService.getStudentDirectory(p, l);
  }
}