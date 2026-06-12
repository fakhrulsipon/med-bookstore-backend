import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private client!: MongoClient;
  private dbInstance!: Db;

  async onModuleInit() {
    const mongoUri = process.env.MONGO_URI;
    const dbName = process.env.DB_NAME;

    if (!mongoUri || !dbName) {
      throw new Error('❌ Database Error: MONGO_URI or DB_NAME is missing in .env file!');
    }

    this.client = new MongoClient(mongoUri);
    await this.client.connect();
    this.dbInstance = this.client.db(dbName);
    console.log(`🚀 MongoDB Atlas Connected successfully to database: ${dbName}`);

    // Create TTL Index for OTP expiry
    await this.dbInstance.collection('otp_verifications').createIndex(
      { expireAt: 1 },
      { expireAfterSeconds: 0 }
    );
  }

  get db(): Db {
    return this.dbInstance;
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}