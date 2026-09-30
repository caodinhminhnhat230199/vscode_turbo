export class OrderController {
  public listOrders(): string[] {
    return ['order-1', 'order-2'];
  }

  public cancelOrder(orderId: string): boolean {
    return orderId !== '';
  }
}
