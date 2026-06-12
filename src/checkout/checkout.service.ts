import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ObjectId } from 'mongodb';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class CheckoutService {
  constructor(private dbService: DatabaseService) {}

  private sanitizeCredential(value: string | undefined): string {
    if (!value) return '';
    return value.replace(/[\r\n\s]/g, '');
  }

  private sanitizeEnvUrl(value: string | undefined): string {
    if (!value) return '';
    const trimmed = value.trim();
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }

  // 💳 1. Form Submission and SSLCommerz Payment Gateway Initiation
  async initiatePayment(body: any) {
    const { 
      product_id, name, email, phone, college_name, batch, class_roll, academic_year, delivery_address 
    } = body;

    if (!product_id || !name || !email || !phone || !college_name || !batch || !class_roll || !academic_year || !delivery_address) {
      throw new BadRequestException('All fields are required. Please fill up Personal, Academic, and Delivery Info.');
    }

    if (!ObjectId.isValid(product_id)) {
      throw new BadRequestException('Invalid Product ID format.');
    }

    const product = await this.dbService.db.collection('products').findOne({ _id: new ObjectId(product_id) });
    if (!product) {
      throw new NotFoundException('The requested product/book was not found.');
    }

    const tran_id = `TXN-${Date.now()}`;
    const normalizedEmail = email.trim().toLowerCase();

    // Store record in MongoDB orders collection with PENDING status
    const order = {
      tran_id,
      product_id: new ObjectId(product_id),
      product_title: product.title,
      product_type: product.type || 'pdf', 
      amount: product.price,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      academic_info: {
        college_name: college_name.trim(),
        batch: batch.trim(),
        class_roll: class_roll.trim(),
        academic_year: academic_year.trim(), 
      },
      delivery_address: delivery_address.trim(),
      payment_status: 'PENDING',
      created_at: new Date()
    };
    
    await this.dbService.db.collection('orders').insertOne(order);

    // SECURE ENV CONFIGURATION (No hardcoded credentials fallback)
    const isSandboxEnv = (process.env.IS_SANDBOX || 'true').trim().toLowerCase() === 'true';
    const storeId = this.sanitizeCredential(process.env.STORE_ID);
    const storePassword = this.sanitizeCredential(process.env.STORE_PASS);
    const backendUrl = this.sanitizeEnvUrl(process.env.BACKEND_URL);

    if (!storeId || !storePassword || !backendUrl) {
      throw new InternalServerErrorException('Payment gateway configuration is missing or corrupt.');
    }

    const formattedAmount = product.price.toFixed(2);

    const paymentData = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      total_amount: formattedAmount,
      currency: 'BDT',
      tran_id: tran_id,
      success_url: `${backendUrl}/api/v1/payment/success`,
      fail_url: `${backendUrl}/api/v1/payment/fail`,
      cancel_url: `${backendUrl}/api/v1/payment/cancel`,
      cus_name: name.trim(),
      cus_email: normalizedEmail,
      cus_phone: phone.trim(),
      cus_add1: delivery_address.trim(),
      cus_city: 'Dhaka', // Mandatory in V4
      cus_postcode: '1000', // Mandatory in V4
      cus_country: 'Bangladesh',
      shipping_method: 'NO',
      num_of_item: '1', // Mandatory in V4
      weight_of_item: '0', // Mandatory in V4
      product_name: product.title || 'MedBookStore Product',
      product_category: 'Medical Education',
      product_profile: 'digital-goods' // Standard value: 'general' or 'digital-goods'
    });

    try {
      const sslUrl = isSandboxEnv
        ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
        : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

      const response = await axios.post(sslUrl, paymentData.toString(), { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
      });
      
      if (response.data && response.data.GatewayPageURL) {
        return { success: true, url: response.data.GatewayPageURL };
      }
      
      const failedReason = response.data?.failedreason || response.data?.failedReason || response.data?.status;
      throw new BadRequestException(failedReason || 'Failed to generate payment gateway page from SSLCommerz.');
    } catch (error: any) {
      const sslErrorMessage = error.response?.data?.failedreason
        || error.response?.data?.failedReason
        || error.message;

      throw new BadRequestException(`Payment Processing Error: ${sslErrorMessage}`);
    }
  }

  // 📝 2. Fetch Invoice Data, Dynamic Type Flag, and 1-Year PDF Access Token
  async getInvoiceDetails(tranId: string) {
    if (!tranId) throw new BadRequestException('Transaction ID is required.');

    const order = await this.dbService.db.collection('orders').findOne({ 
      tran_id: tranId,
      payment_status: 'Paid' 
    });

    if (!order) {
      throw new NotFoundException('No active or paid order found with this Transaction ID.');
    }

    let pdfAccessToken: string | null = null;

    if (order.product_type === 'pdf') {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new InternalServerErrorException('Authentication system configuration is missing.');
      }

      pdfAccessToken = jwt.sign(
        { email: order.email, product_id: order.product_id },
        jwtSecret,
        { expiresIn: '365d' } 
      );
    }

    return {
      success: true,
      message: 'Invoice data fetched successfully.',
      product_type: order.product_type, 
      pdf_access_token: pdfAccessToken, 
      invoice: {
        transaction_id: order.tran_id,
        item_title: order.product_title,
        price_paid: order.amount,
        buyer_name: order.name,
        buyer_email: order.email,
        buyer_phone: order.phone,
        college: order.academic_info?.college_name,
        date: order.paid_at
      }
    };
  }

  // 🔄 3. Success Payment Webhook Listener
  async handleSuccess(tran_id: string) {
    if (!tran_id) throw new BadRequestException('Transaction ID is missing.');

    const result = await this.dbService.db.collection('orders').updateOne(
      { tran_id },
      { $set: { payment_status: 'Paid', paid_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      return `<html><body><h3>Order transaction not found.</h3></body></html>`;
    }

    const order = await this.dbService.db.collection('orders').findOne({ tran_id });
    if (order && order.product_id) {
      await this.dbService.db.collection('products').updateOne(
        { _id: order.product_id },
        { $inc: { sales_count: 1 } }
      );
    }

    const frontendUrl = this.sanitizeEnvUrl(process.env.FRONTEND_URL);
    if (!frontendUrl) {
      throw new InternalServerErrorException('Application routing path configuration is missing.');
    }

    return `
      <html>
        <head><script>window.location.href = "${frontendUrl}/payment-success?tran_id=${tran_id}";</script></head>
        <body style="font-family: Arial, sans-serif; text-align:center; margin-top:20%;">
          <h2>Payment Successful!</h2><p>Redirecting to MedBookStore...</p>
        </body>
      </html>
    `;
  }

  // ❌ 4. Failed Payment Webhook Listener
  async handleFail(tran_id: string) {
    await this.dbService.db.collection('orders').updateOne(
      { tran_id }, 
      { $set: { payment_status: 'FAILED', failed_at: new Date() } }
    );
    
    const frontendUrl = this.sanitizeEnvUrl(process.env.FRONTEND_URL);
    return `
      <html>
        <head><script>window.location.href = "${frontendUrl}/payment-fail";</script></head>
        <body style="font-family: Arial, sans-serif; text-align:center; margin-top:20%;">
          <h2>Payment Failed!</h2><p>Redirecting to MedBookStore...</p>
        </body>
      </html>
    `;
  }

  // 🛑 5. Cancelled Payment Webhook Listener
  async handleCancel(tran_id: string) {
    await this.dbService.db.collection('orders').updateOne(
      { tran_id }, 
      { $set: { payment_status: 'CANCELLED', cancelled_at: new Date() } }
    );

    const frontendUrl = this.sanitizeEnvUrl(process.env.FRONTEND_URL);
    return `
      <html>
        <head><script>window.location.href = "${frontendUrl}/payment-cancel";</script></head>
        <body style="font-family: Arial, sans-serif; text-align:center; margin-top:20%;">
          <h2>Payment Cancelled!</h2><p>Redirecting to MedBookStore...</p>
        </body>
      </html>
    `;
  }
}