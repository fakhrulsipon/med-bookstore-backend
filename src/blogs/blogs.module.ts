// src/blogs/blogs.module.ts
import { Module } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { BlogsController } from './blogs.controller';
import { DatabaseModule } from '../database/database.module'; // DatabaseModule path according to your project

@Module({
  imports: [DatabaseModule],
  controllers: [BlogsController],
  providers: [BlogsService],
})
export class BlogsModule {}