// src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { BlogsModule } from './blogs/blogs.module';

@Module({
  imports: [DatabaseModule, AuthModule, ProductsModule, CheckoutModule, AdminDashboardModule, BlogsModule],
})
export class AppModule {}