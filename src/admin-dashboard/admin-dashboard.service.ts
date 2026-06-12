import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ObjectId } from 'mongodb';

@Injectable()
export class AdminDashboardService {
  constructor(private dbService: DatabaseService) {}

  private get ordersCollection() {
    return this.dbService.db.collection('orders');
  }

  // 📊 1. Live Dashboard Analytics Counter (Stats API)
  async getDashboardStats() {
    // Single-shot calculation of total revenue and book vs. pdf sales breakdown using aggregation pipeline
    const statsPipeline = [
      {
        $facet: {
          // a) Total Paid Revenue Calculation
          totalRevenue: [
            { $match: { payment_status: 'Paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ],
          // b) Sales Count by Product Type (Book vs PDF)
          productTypeBreakdown: [
            { $match: { payment_status: 'Paid' } },
            { $group: { _id: '$product_type', count: { $sum: 1 } } }
          ],
          // c) Order Breakdown by Status (Paid, Pending, Failed, Shipped, Delivered)
          statusBreakdown: [
            { $group: { _id: '$payment_status', count: { $sum: 1 } } }
          ],
          // d) Total Order Count (Any status)
          totalOrdersCount: [
            { $count: 'count' }
          ]
        }
      }
    ];

    const [rawStats] = await this.ordersCollection.aggregate(statsPipeline).toArray();

    // Data formatting (to ensure frontend developer receives a clean object)
    const revenue = rawStats?.totalRevenue?.[0]?.total || 0;
    const totalOrders = rawStats?.totalOrdersCount?.[0]?.count || 0;
    
    const types: Record<string, number> = { book: 0, pdf: 0 };
    rawStats?.productTypeBreakdown?.forEach((item: any) => {
      if (item._id) types[item._id] = item.count;
    });

    const statuses: Record<string, number> = { PENDING: 0, Paid: 0, FAILED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 };
    rawStats?.statusBreakdown?.forEach((item: any) => {
      if (item._id) statuses[item._id] = item.count;
    });

    return {
      success: true,
      stats: {
        total_revenue: revenue,
        total_orders: totalOrders,
        sales_by_type: types,       // { book: 12, pdf: 45 }
        sales_by_status: statuses   // { PENDING: 5, Paid: 40, SHIPPED: 2 ... }
      }
    };
  }

  // 📑 2. List of All Orders with Filtering and Pagination
  async getAllOrders(page = 1, limit = 10, status?: string, search?: string) {
    const query: any = {};

    // Status Filter (e.g., ?status=Paid or ?status=PENDING)
    if (status) {
      query.payment_status = status;
    }

    // Search Filter (Search by Name, Email, or Phone Number)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { tran_id: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    // Fetch data query and total count simultaneously
    const orders = await this.ordersCollection
      .find(query)
      .sort({ created_at: -1 }) // Show latest orders first
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalOrders = await this.ordersCollection.countDocuments(query);

    return {
      success: true,
      meta: {
        total_records: totalOrders,
        current_page: page,
        limit,
        total_pages: Math.ceil(totalOrders / limit),
      },
      orders,
    };
  }

  // 🚚 3. Update Order Status (Delivery Tracking - PATCH)
  async updateOrderStatus(orderId: string, status: 'PENDING' | 'Paid' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED') {
    if (!ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid Order ID format.');
    }

    const allowedStatuses = ['PENDING', 'Paid', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Allowed values: ${allowedStatuses.join(', ')}`);
    }

    const result = await this.ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { 
        $set: { 
          payment_status: status,
          updated_at: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Order record not found.');
    }

    return {
      success: true,
      message: `Order status successfully updated to ${status}.`
    };
  }

  // 👥 4. Registered Paid Student Directory List
  async getStudentDirectory(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Group and list unique students by email
    const pipeline = [
      { $match: { payment_status: 'Paid' } },
      {
        $group: {
          _id: '$email',
          name: { $first: '$name' },
          phone: { $first: '$phone' },
          academic_info: { $first: '$academic_info' },
          total_books_bought: { $sum: 1 },
          last_purchase_date: { $max: '$created_at' }
        }
      },
      { $sort: { last_purchase_date: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }]
        }
      }
    ];

    const [result] = await this.ordersCollection.aggregate(pipeline).toArray();
    const totalStudents = result?.totalCount?.[0]?.count || 0;

    return {
      success: true,
      meta: {
        total_students: totalStudents,
        current_page: page,
        limit,
        total_pages: Math.ceil(totalStudents / limit),
      },
      students: result?.data || []
    };
  }
}