import { getPool } from '../database';
import { QueryResult } from 'pg';

export interface OrderItem {
  product_id: string;
  quantity: number;
  price: number;
}

export interface Order {
  id?: string; // Frontend expects 'id'
  order_id: string;
  customer_id: string;
  total_amount: number;
  items: OrderItem[];
  status: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface OrderStats {
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_revenue: number;
  orders_today: number;
  orders_by_hour?: Array<{ hour: string; count: number }>;
}

/**
 * Insert a new order into the database
 */
export async function insertOrder(order: Order): Promise<void> {
  const pool = getPool();

  const query = `
    INSERT INTO orders (order_id, customer_id, total_amount, items, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (order_id) DO NOTHING
  `;

  const values = [
    order.order_id,
    order.customer_id,
    order.total_amount,
    JSON.stringify(order.items),
    order.status || 'pending',
    order.created_at || new Date(),
  ];

  try {
    await pool.query(query, values);
    console.log(`[Order Model] Inserted order: ${order.order_id}`);
  } catch (error) {
    console.error(`[Order Model] Failed to insert order ${order.order_id}:`, error);
    throw error;
  }
}

/**
 * Get paginated list of orders
 */
export async function getOrders(page: number = 1, limit: number = 50): Promise<Order[]> {
  const pool = getPool();

  const offset = (page - 1) * limit;

  const query = `
    SELECT order_id, customer_id, total_amount, items, status, created_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `;

  try {
    const result: QueryResult = await pool.query(query, [limit, offset]);

    return result.rows.map((row) => ({
      id: row.order_id,
      order_id: row.order_id,
      customer_id: row.customer_id,
      total_amount: parseFloat(row.total_amount),
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.created_at, // Using created_at as fallback for updated_at
    }));
  } catch (error) {
    console.error('[Order Model] Failed to fetch orders:', error);
    throw error;
  }
}

/**
 * Get a single order by ID
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const pool = getPool();

  const query = `
    SELECT order_id, customer_id, total_amount, items, status, created_at
    FROM orders
    WHERE order_id = $1
  `;

  try {
    const result: QueryResult = await pool.query(query, [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.order_id,
      order_id: row.order_id,
      customer_id: row.customer_id,
      total_amount: parseFloat(row.total_amount),
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.created_at,
    };
  } catch (error) {
    console.error(`[Order Model] Failed to fetch order ${orderId}:`, error);
    throw error;
  }
}

/**
 * Get order statistics
 */
export async function getOrderStats(): Promise<OrderStats> {
  const pool = getPool();

  const query = `
    SELECT
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as orders_today
    FROM orders
  `;

  const hourlyQuery = `
    SELECT
      TO_CHAR(DATE_TRUNC('hour', created_at), 'HH24:00') as hour,
      COUNT(*) as count
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY DATE_TRUNC('hour', created_at)
  `;

  try {
    const [statsResult, hourlyResult] = await Promise.all([
      pool.query(query),
      pool.query(hourlyQuery),
    ]);

    const row = statsResult.rows[0];

    return {
      total_orders: parseInt(row.total_orders, 10),
      pending_orders: parseInt(row.pending_orders, 10),
      completed_orders: parseInt(row.completed_orders, 10),
      total_revenue: parseFloat(row.total_revenue),
      orders_today: parseInt(row.orders_today, 10),
      orders_by_hour: hourlyResult.rows.map((r: any) => ({
        hour: r.hour,
        count: parseInt(r.count, 10),
      })),
    };
  } catch (error) {
    console.error('[Order Model] Failed to fetch order stats:', error);
    throw error;
  }
}

/**
 * Update order status
 */
export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const pool = getPool();

  const query = `
    UPDATE orders
    SET status = $1
    WHERE order_id = $2
  `;

  try {
    await pool.query(query, [status, orderId]);
    console.log(`[Order Model] Updated order ${orderId} status to ${status}`);
  } catch (error) {
    console.error(`[Order Model] Failed to update order ${orderId}:`, error);
    throw error;
  }
}

/**
 * Get total count of orders
 */
export async function getTotalOrderCount(): Promise<number> {
  const pool = getPool();

  const query = `SELECT COUNT(*) as count FROM orders`;

  try {
    const result: QueryResult = await pool.query(query);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('[Order Model] Failed to get order count:', error);
    throw error;
  }
}
