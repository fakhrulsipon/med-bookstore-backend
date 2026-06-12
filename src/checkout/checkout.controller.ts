import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

@Controller('api/v1')
export class CheckoutController {
  constructor(private checkoutService: CheckoutService) {}

  // 1. API to submit checkout form from frontend
  @Post('checkout/pay')
  async pay(@Body() body: any) {
    return this.checkoutService.initiatePayment(body);
  }

  // 📝 New API: To get invoice data, type, and PDF token for the payment success page
  // URL: GET /api/v1/checkout/invoice/TXN-12345
  @Get('checkout/invoice/:tran_id')
  @HttpCode(HttpStatus.OK)
  async getInvoiceDetails(@Param('tran_id') tranId: string) {
    return this.checkoutService.getInvoiceDetails(tranId);
  }

  // 2. SSLCommerz successful payment redirect route (SSLCommerz will hit the backend)
  @Post('payment/success')
  @HttpCode(HttpStatus.OK)
  async success(@Body('tran_id') tran_id: string) {
    return this.checkoutService.handleSuccess(tran_id);
  }

  // 3. SSLCommerz failed payment redirect route
  @Post('payment/fail')
  @HttpCode(HttpStatus.OK)
  async fail(@Body('tran_id') tran_id: string) {
    return this.checkoutService.handleFail(tran_id);
  }

  // 4. SSLCommerz cancelled payment redirect route
  @Post('payment/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Body('tran_id') tran_id: string) {
    return this.checkoutService.handleCancel(tran_id);
  }
}