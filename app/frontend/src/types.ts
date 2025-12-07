export interface OrderItem {
  product_id: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customer_id: string;
  items: OrderItem[];
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}

export interface Stats {
  orders_today: number;
  processing_rate: number;
  queue_depth: number;
  total_orders: number;
  orders_by_hour?: Array<{
    hour: string;
    count: number;
  }>;
}

export interface HealthStatus {
  status: string;
  database: {
    status: string;
  };
  queue: {
    status: string;
  };
}

export interface CreateOrderRequest {
  customer_id: string;
  items: OrderItem[];
}

export interface ApiError {
  error: string;
  message?: string;
}
