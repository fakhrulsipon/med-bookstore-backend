import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ProductsService } from './products.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('api/v1')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  // 🔓 PUBLIC ROUTES (Homepage & Preview Page)
  
  @Get('products')
  async getAllProducts(@Query('type') type?: 'book' | 'pdf') {
    return this.productsService.getAllProducts(type);
  }

  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.productsService.getProductById(id);
  }

  // 📱 After student scans and OTP is verified, this API provides the custom player link
  @Get('products/:id/topics/:topicNumber')
  async getTopicVideoForStudent(
    @Param('id') productId: string,
    @Param('topicNumber') topicNumber: string
  ) {
    return this.productsService.getTopicVideoForStudent(productId, topicNumber);
  }

  // 🛡️ PDF Access Verification Route (Only verified paid students get access)
  @Get('student/verify-pdf-access')
  @UseGuards(AuthGuard('student-jwt'))
  async verifyPdfAccess(
    @Query('product_id') productId: string,
    @Req() req: any
  ) {
    const studentEmail = req.user.email; // Read student email from JWT Payload
    return this.productsService.verifyPdfAccess(productId, studentEmail);
  }

  // 🔒 ADMIN PROTECTED ROUTES (Cookie/Token verified admin mechanism)

  @Post('products')
  @UseGuards(AuthGuard('admin-jwt'))
  async createProduct(@Body() body: any) {
    return this.productsService.createProduct(body);
  }

  // ⚙️ Updated API for Admin "Upload & Generate" button (includes video file receiver)
  @Post('admin/products/:id/topics')
  @UseGuards(AuthGuard('admin-jwt'))
  @UseInterceptors(FileInterceptor('video')) // 👈 File will arrive with 'video' key from frontend
  async addProductTopic(
    @Param('id') productId: string,
    @Body('topic_number') topicNumber: string,
    @Body('topic_name') topicName: string,
    @UploadedFile() file: any
  ) {
    return this.productsService.addProductTopic(productId, topicNumber, topicName, file);
  }

  @Put('products/:id')
  @UseGuards(AuthGuard('admin-jwt'))
  async updateProduct(@Param('id') id: string, @Body() body: any) {
    return this.productsService.updateProduct(id, body);
  }

  @Delete('products/:id')
  @UseGuards(AuthGuard('admin-jwt'))
  async deleteProduct(@Param('id') id: string) {
    return this.productsService.deleteProduct(id);
  }
}