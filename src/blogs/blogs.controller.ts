import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/v1')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  // 🔓 PUBLIC ROUTES (For user or student blog pages)

  // a) Handles all general posts, category filters, search results, and paginated posts together
  @Get('blogs')
  async getAllBlogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 6; // Default limit of 6 cards according to UI design
    return this.blogsService.getAllBlogs(p, l, category, search);
  }

  // b) List of only Featured posts (For the top section of the UI)
  @Get('blogs/featured')
  async getFeaturedBlogs() {
    return this.blogsService.getFeaturedBlogs();
  }

  // c) Single blog details view
  @Get('blogs/:id')
  async getBlogById(@Param('id') id: string) {
    return this.blogsService.getBlogById(id);
  }

  // 🔒 ADMIN PROTECTED ROUTES (Admin Panel CRUD - Guard Enabled)

  @Post('admin/blogs')
  @UseGuards(AuthGuard('admin-jwt'))
  async createBlog(@Body() body: any) {
    return this.blogsService.createBlog(body);
  }

  @Put('admin/blogs/:id')
  @UseGuards(AuthGuard('admin-jwt'))
  async updateBlog(@Param('id') id: string, @Body() body: any) {
    return this.blogsService.updateBlog(id, body);
  }

  @Delete('admin/blogs/:id')
  @UseGuards(AuthGuard('admin-jwt'))
  async deleteBlog(@Param('id') id: string) {
    return this.blogsService.deleteBlog(id);
  }
}