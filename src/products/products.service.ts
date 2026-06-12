import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ObjectId } from 'mongodb';
import * as QRCode from 'qrcode';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class ProductsService {
  constructor(private dbService: DatabaseService) {
    // Cloudinary config (it's better if it's already set according to project's main environment variable, otherwise it will sit here))
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  private get collection() {
    return this.dbService.db.collection('products');
  }

  // --- PUBLIC APIS ---

  async getAllProducts(type?: 'book' | 'pdf') {
    const query: any = {};
    if (type) query.type = type;
    return await this.collection.find(query, { projection: { main_pdf_url: 0 } }).toArray();
  }

  async getProductById(id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Product ID format');
    const product = await this.collection.findOne({ _id: new ObjectId(id) }, { projection: { main_pdf_url: 0 } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getTopicVideoForStudent(productId: string, topicNumber: string) {
    if (!ObjectId.isValid(productId)) throw new BadRequestException('Invalid Product ID format');

    const product = await this.collection.findOne(
      { 
        _id: new ObjectId(productId),
        'topic_videos.topic_number': Number(topicNumber) 
      },
      {
        projection: {
          title: 1,
          'topic_videos.$': 1 
        }
      }
    );

    if (!product || !product.topic_videos || product.topic_videos.length === 0) {
      throw new NotFoundException('Requested Topic Video not found in this book.');
    }

    return {
      book_title: product.title,
      topic_name: product.topic_videos[0].topic_name,
      video_url: product.topic_videos[0].video_url 
    };
  }

  async verifyPdfAccess(productId: string, studentEmail: string) {
    if (!productId || !studentEmail) {
      throw new BadRequestException('Product ID and Student Email are required.');
    }

    if (!ObjectId.isValid(productId)) {
      throw new BadRequestException('Invalid Product ID format.');
    }

    const paidOrder = await this.dbService.db.collection('orders').findOne({
      email: studentEmail.trim().toLowerCase(),
      product_id: new ObjectId(productId),
      payment_status: 'Paid'
    });

    if (!paidOrder) {
      throw new UnauthorizedException('Access Denied. You have not purchased this book yet.');
    }

    const product = await this.collection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      throw new NotFoundException('The requested book or PDF was not found.');
    }

    return {
      success: true,
      message: 'Access granted successfully.',
      title: product.title,
      pdf_url: product.main_pdf_url
    };
  }

  // --- ADMIN PROTECTED CRUD APIS ---

  async createProduct(body: any) {
    const { title, type, price, cover_url, sample_pdf_url, main_pdf_url } = body;
    if (!title || !type || !price) throw new BadRequestException('Title, type, and price are required.');

    const newProduct = {
      title,
      type,
      price: Number(price),
      cover_url: cover_url || '',
      sample_pdf_url: sample_pdf_url || '',
      main_pdf_url: main_pdf_url || '', 
      sales_count: 0,
      topic_videos: [], 
      created_at: new Date(),
    };

    const result = await this.collection.insertOne(newProduct);
    return { success: true, message: 'Product created successfully', productId: result.insertedId };
  }

  // ⚙️ Updated method: Backend will upload the file and return a QR Base64 string response
  // ⚙️ Fixed method: Parameter names matched with internal names
  async addProductTopic(productId: string, topicNumber: string, topicName: string, file: any) {
    if (!ObjectId.isValid(productId)) throw new BadRequestException('Invalid Product ID format');
    
    // 💡 Checking topicName (Camel Case) here
    if (!topicNumber || !topicName || !file) {
      throw new BadRequestException('topic_number, topic_name, and video file are required.');
    }

    // 1. Upload the file directly from memory buffer to Cloudinary (in video category)
    const cloudinaryUpload = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'video', folder: 'med_books_videos' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        uploadStream.end(file.buffer); 
      });
    };

    let uploadedVideo: any;
    try {
      uploadedVideo = await cloudinaryUpload();
    } catch (err:any) {
      throw new BadRequestException('Cloudinary upload failed: ' + err.message);
    }

    // 2. Generate scan redirect link for students
    const redirectUrl = `https://medbookstore.com/access/verify-video?product_id=${productId}&topic=${topicNumber}`;

    // 3. Generate a Base64 image of this secure redirect URL using the 'qrcode' package
    let qrCodeBase64: string;
    try {
      qrCodeBase64 = await QRCode.toDataURL(redirectUrl, { errorCorrectionLevel: 'H', width: 300 });
    } catch (err:any) {
      throw new BadRequestException('QR Code generation failed: ' + err.message);
    }

    // 4. Prepare object for database (field name will remain topic_name)
    const newTopic = {
      topic_number: Number(topicNumber),
      topic_name: topicName, 
      video_url: uploadedVideo.secure_url, 
      redirect_url: redirectUrl,
      added_at: new Date()
    };

    // Remove and overwrite if the same topic number already exists
    await this.collection.updateOne(
      { _id: new ObjectId(productId) },
      { $pull: { topic_videos: { topic_number: Number(topicNumber) } } as any } 
    );

    const result = await this.collection.updateOne(
      { _id: new ObjectId(productId) },
      { $push: { topic_videos: newTopic } as any }
    );

    if (result.matchedCount === 0) throw new NotFoundException('Product/Book not found');

    // 5. Return success data including QR image string to frontend
    return { 
      success: true, 
      message: 'Video uploaded to Cloudinary & QR generated successfully.',
      qr_code_base64: qrCodeBase64, 
      redirect_url: redirectUrl,
      video_url: uploadedVideo.secure_url
    };
  }

  async updateProduct(id: string, body: any) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Product ID format');
    const updateData: any = {};
    const allowedFields = ['title', 'type', 'price', 'cover_url', 'sample_pdf_url', 'main_pdf_url'];
    
    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = field === 'price' ? Number(body[field]) : body[field];
      }
    });

    const result = await this.collection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
    if (result.matchedCount === 0) throw new NotFoundException('Product not found');
    return { success: true, message: 'Product updated successfully' };
  }

  async deleteProduct(id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('Invalid Product ID format');
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) throw new NotFoundException('Product not found');
    return { success: true, message: 'Product deleted successfully' };
  }
}