import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

const getRequiredEnv = (name: string, fallbackName?: string): string => {
  const value =
    process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}${fallbackName ? ` or ${fallbackName}` : ''}`,
    );
  }

  return value;
};

type MailError = {
  code?: string;
  response?: string;
  message?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private readonly smtpUser: string;

  constructor(
    private dbService: DatabaseService,
    private jwtService: JwtService,
  ) {
    const smtpHost = getRequiredEnv('SMTP_HOST', 'EMAIL_HOST');
    const smtpPort = Number(
      process.env.SMTP_PORT || process.env.EMAIL_PORT || 587,
    );
    this.smtpUser = getRequiredEnv('SMTP_USER', 'EMAIL_USER');
    const smtpPass = getRequiredEnv('SMTP_PASS', 'EMAIL_PASS').replace(
      /\s/g,
      '',
    );

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort === 587,
      auth: {
        user: this.smtpUser,
        pass: smtpPass,
      },
    });
  }

  // --- ADMIN AUTH ---
  async adminLogin(body: any) {
    const { email, password } = body;
    const normalizedEmail = email.trim().toLowerCase();
    const admin = await this.dbService.db
      .collection('admins')
      .findOne({ email: normalizedEmail });

    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: admin._id.toString(),
      email: admin.email,
      role: 'admin',
    };
    return this.jwtService.sign(payload, { expiresIn: '1d' });
  }

  // --- STUDENT OTP ACCESS ---
  async requestOtp(email: string) {
    if (!email) throw new BadRequestException('Email is required.');
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check if the user is a buyer (if their email exists in the orders collection)
    const buyerExists = await this.dbService.db
      .collection('orders')
      .findOne({ email: normalizedEmail, payment_status: 'Paid' });
    if (!buyerExists) {
      throw new BadRequestException('This email has no purchase history.');
    }

    // 2. OTP Generation (6 digits)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute validity

    // 3. Save/Update OTP
    await this.dbService.db
      .collection('otp_verifications')
      .updateOne(
        { email: normalizedEmail },
        { $set: { otp_code: otpCode, expireAt } },
        { upsert: true },
      );

    // 4. Send Email
    try {
      await this.transporter.sendMail({
        from: `"MedBookStore" <${this.smtpUser}>`,
        to: normalizedEmail,
        subject: 'Your Access OTP Code',
        text: `Your OTP is ${otpCode}. It will expire in 5 minutes.`,
      });
      return { success: true, message: 'OTP sent successfully to email.' };
    } catch (error) {
      const smtpError = error as MailError;
      this.logger.error(
        `Failed to send OTP email: ${smtpError.code || 'SMTP_ERROR'} ${smtpError.response || smtpError.message}`,
      );
      throw new ServiceUnavailableException(
        'Failed to send email. Check SMTP setup.',
      );
    }
  }

  // 🔒 OTP Verification and 2-device lock logic
  async verifyOtp(body: any) {
    const { email, otp, device_id } = body;

    if (!email || !otp || !device_id) {
      throw new BadRequestException('Email, OTP, and device_id are required.');
    }

    // Trim and string conversion to handle data types and spaces
    const normalizedEmail = email.trim().toLowerCase();
    const otpCode = String(otp).trim();
    const normalizedDeviceId = String(device_id).trim();

    // 1. Direct matching and expiry check in MongoDB
    const record = await this.dbService.db
      .collection('otp_verifications')
      .findOne({
        email: normalizedEmail,
        otp_code: otpCode,
        expireAt: { $gt: new Date() }, // Expiry time must be greater than current time
      });

    if (!record) {
      throw new BadRequestException('Invalid or expired OTP.');
    }

    // 2. Device session tracking and 2-device limit restriction
    const sessionsCollection = this.dbService.db.collection('device_sessions');
    const existingSessions = await sessionsCollection
      .find({ email: normalizedEmail })
      .toArray();

    // Check if the current request's device_id is already locked in the database
    const isCurrentDeviceRegistered = existingSessions.some(
      (session) => session.device_id === normalizedDeviceId,
    );

    if (!isCurrentDeviceRegistered) {
      // If two different devices are already locked in the database, block access for the third device (403)
      if (existingSessions.length >= 2) {
        throw new ForbiddenException(
          'Access Denied. You have reached the maximum limit of 2 devices for this email.',
        );
      }

      // If there are fewer than 2 devices, save the new device ID permanently in the collection
      await sessionsCollection.insertOne({
        email: normalizedEmail,
        device_id: normalizedDeviceId,
        registered_at: new Date(),
      });
    }

    // Remove OTP from collection once matched and verified (One-time Use)
    await this.dbService.db
      .collection('otp_verifications')
      .deleteOne({ email: normalizedEmail });

    // Issue 1-year valid JWT for students
    const payload = {
      email: normalizedEmail,
      deviceId: normalizedDeviceId,
      role: 'student',
    };
    const token = this.jwtService.sign(payload, { expiresIn: '365d' });

    return { success: true, access_token: token };
  }

  // 🔄 Logic to reset/clear a student's devices from the admin panel
  async resetStudentDevices(email: string) {
    if (!email)
      throw new BadRequestException('Email is required to reset devices.');
    const normalizedEmail = email.trim().toLowerCase();

    await this.dbService.db
      .collection('device_sessions')
      .deleteMany({ email: normalizedEmail });
    return {
      success: true,
      message: `All device sessions cleared successfully for ${normalizedEmail}.`,
    };
  }
}
