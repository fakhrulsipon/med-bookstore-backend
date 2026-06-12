import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ObjectId } from 'mongodb';

@Injectable()
export class BlogsService {
  constructor(private dbService: DatabaseService) {}

  private get collection() {
    return this.dbService.db.collection('blogs');
  }

  // --- PUBLIC APIS (For users and frontend UI) ---

  // 1. Fetch all blog posts as a list (with category filter, search, and pagination)
  async getAllBlogs(page = 1, limit = 6, category?: string, search?: string) {
    const query: any = {};
    
    // a) Category Filter (If anything other than 'All Posts' is selected)
    if (category && category !== 'All Posts') {
      query.category = { $regex: category.trim(), $options: 'i' };
    }
    
    // b) Search Functionality (Searches within title and description)
    if (search) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // c) Skip calculation for pagination
    const skip = (page - 1) * limit;

    // Fetch data query and total matching posts simultaneously
    const blogs = await this.collection
      .find(query)
      .sort({ created_at: -1 }) // Show latest posts first
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalBlogs = await this.collection.countDocuments(query);

    return {
      success: true,
      meta: {
        total_records: totalBlogs,
        current_page: page,
        limit,
        total_pages: Math.ceil(totalBlogs / limit),
      },
      blogs,
    };
  }

  // 2. Fetch only 'Featured' posts (For UI top banners)
  async getFeaturedBlogs() {
    return await this.collection.find({ is_featured: true }).sort({ created_at: -1 }).limit(3).toArray();
  }

  // 3. View details of a specific blog
  async getBlogById(id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Blog ID format');
    
    const blog = await this.collection.findOne({ _id: new ObjectId(id) });
    if (!blog) throw new NotFoundException('Blog post not found');
    
    return blog;
  }

  // --- ADMIN PROTECTED CRUD APIS (Admin panel only) ---

  // 4. Create a new blog post (with all UI fields)
  async createBlog(body: any) {
    const { img, title, category, tags, description, read_time, author_name, is_featured } = body;
    
    if (!title || !description) {
      throw new BadRequestException('Title and Description are required.');
    }

    const newBlog = {
      img: img || '',                                    
      title: title.trim(),                               
      category: category ? category.trim() : 'Study Tips', 
      tags: Array.isArray(tags) ? tags.map(tag => tag.trim()) : [], 
      description: description.trim(),                   
      read_time: read_time || '5 min',                  
      author_name: author_name ? author_name.trim() : 'Dr. Rahman', 
      is_featured: is_featured === true || is_featured === 'true', 
      created_at: new Date(),                             
      updated_at: new Date()
    };

    const result = await this.collection.insertOne(newBlog);
    return { success: true, message: 'Blog post created successfully', blogId: result.insertedId };
  }

  // 5. Update a blog post
  async updateBlog(id: string, body: any) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Blog ID format');

    const updateData: any = {};
    const allowedFields = ['img', 'title', 'category', 'tags', 'description', 'read_time', 'author_name', 'is_featured'];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        if (field === 'tags' && Array.isArray(body[field])) {
          updateData[field] = body[field].map((t: string) => t.trim());
        } else if (field === 'is_featured') {
          updateData[field] = body[field] === true || body[field] === 'true';
        } else if (typeof body[field] === 'string') {
          updateData[field] = body[field].trim();
        } else {
          updateData[field] = body[field];
        }
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update.');
    }

    updateData.updated_at = new Date();

    const result = await this.collection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    if (result.matchedCount === 0) throw new NotFoundException('Blog post not found');

    return { success: true, message: 'Blog post updated successfully' };
  }

  // 6. Delete a blog post
  async deleteBlog(id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Blog ID format');

    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) throw new NotFoundException('Blog post not found');

    return { success: true, message: 'Blog post deleted successfully' };
  }
}