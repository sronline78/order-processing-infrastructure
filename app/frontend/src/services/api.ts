import type {
  Order,
  OrdersResponse,
  Stats,
  HealthStatus,
  CreateOrderRequest,
  ApiError,
} from '../types';

// Detect API URL automatically - same host or from environment
const getApiBaseUrl = (): string => {
  // In production, API is on same host via ALB routing
  // In development, can override with env variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Use current host
  const protocol = window.location.protocol;
  const host = window.location.host;
  return `${protocol}//${host}`;
};

const API_BASE_URL = getApiBaseUrl();

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'Request failed',
          message: response.statusText,
        }));
        throw new Error(error.message || error.error);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  async getOrders(page: number = 1, limit: number = 50): Promise<OrdersResponse> {
    return this.request<OrdersResponse>(
      `/api/orders?page=${page}&limit=${limit}`
    );
  }

  async createOrder(order: CreateOrderRequest): Promise<Order> {
    return this.request<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async getStats(): Promise<Stats> {
    return this.request<Stats>('/api/stats');
  }

  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/api/health');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
