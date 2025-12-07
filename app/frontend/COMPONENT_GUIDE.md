# Component Guide

## Component Hierarchy

```
App (QueryClientProvider)
└── Dashboard
    ├── Header
    ├── StatsCards
    │   └── [4 stat cards with icons]
    ├── Two-Column Layout
    │   ├── Orders Per Hour Chart (Recharts LineChart)
    │   └── SystemStatus
    │       └── [3 service status indicators]
    ├── SubmitOrder
    │   ├── Customer ID Input
    │   └── Dynamic Item List
    │       └── [Product ID, Quantity, Price per item]
    └── OrderList
        ├── Orders Table
        └── Pagination Controls
```

## Component Props & State

### Dashboard.tsx
**State:** None (stateless container)
**Hooks:** 
- `useQuery(['stats'])` - Auto-refresh every 10s

**Responsibilities:**
- Layout orchestration
- Header rendering
- Child component composition

---

### StatsCards.tsx
**Props:**
```typescript
{
  stats: Stats | undefined;
  isLoading: boolean;
}
```

**Displays:**
1. Orders Today (📦 blue)
2. Processing Rate (⚡ green)
3. Queue Depth (📊 yellow)
4. Total Orders (🎯 purple)

**Features:**
- Loading state placeholders
- Formatted numbers with locale
- Icon badges with colored backgrounds

---

### SystemStatus.tsx
**State:** None
**Hooks:** 
- `useQuery(['health'])` - Auto-refresh every 30s

**Services Monitored:**
1. API Service (`health.status === 'healthy'`)
2. PostgreSQL (`health.database.status === 'connected'`)
3. RabbitMQ (`health.queue.status === 'connected'`)

**Visual Indicators:**
- Green dot = Healthy
- Red dot = Down
- Gray dot (pulsing) = Checking

---

### OrderList.tsx
**State:** 
- `page: number` - Current page (default: 1)

**Hooks:** 
- `useQuery(['orders', page])` - Auto-refresh every 10s

**Constants:**
- `limit = 20` orders per page

**Table Columns:**
1. Order ID (truncated to 8 chars)
2. Customer ID
3. Item Count
4. Total Amount (USD formatted)
5. Status (color-coded badge)
6. Created Date (localized format)

**Pagination:**
- Previous/Next buttons
- Disabled states at boundaries
- Page counter display

**Status Colors:**
- pending → Yellow
- processing → Blue
- completed → Green
- failed → Red

---

### SubmitOrder.tsx
**State:**
```typescript
{
  customerId: string;
  items: OrderItem[];
  notification: { type: 'success' | 'error', message: string } | null;
}
```

**Hooks:**
- `useMutation(createOrder)` - Form submission

**Form Fields:**
1. Customer ID (text input, required)
2. Order Items (dynamic array):
   - Product ID (text, required)
   - Quantity (number, min: 1)
   - Price (number, min: 0.01, step: 0.01)

**Actions:**
- Add Item (+ button)
- Remove Item (only if > 1 item)
- Submit Order

**Validation:**
- Customer ID must not be empty
- At least 1 valid item required
- All item fields must be filled

**Side Effects on Success:**
- Reset form to initial state
- Show success notification (3s auto-hide)
- Invalidate 'orders' and 'stats' queries
- Trigger dashboard refresh

**Side Effects on Error:**
- Show error notification (5s auto-hide)
- Keep form state intact
- Display error message from API

---

## API Service Layer

### api.ts

**Class:** `ApiClient`

**Constructor:**
```typescript
new ApiClient(baseUrl: string)
```

**Base URL Detection:**
```typescript
getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL; // Dev override
  }
  return `${window.location.protocol}//${window.location.host}`; // Production
}
```

**Methods:**

1. **getOrders(page: number, limit: number)**
   - GET `/api/orders?page={page}&limit={limit}`
   - Returns: `OrdersResponse`

2. **createOrder(order: CreateOrderRequest)**
   - POST `/api/orders`
   - Body: `{ customer_id, items }`
   - Returns: `Order`

3. **getStats()**
   - GET `/api/stats`
   - Returns: `Stats`

4. **getHealth()**
   - GET `/api/health`
   - Returns: `HealthStatus`

**Error Handling:**
- Catches network errors
- Parses API error responses
- Throws Error with message for React Query

**Export:**
```typescript
export const apiClient = new ApiClient(API_BASE_URL);
```

---

## Type Definitions (types.ts)

```typescript
// Item in an order
interface OrderItem {
  product_id: string;
  quantity: number;
  price: number;
}

// Complete order object
interface Order {
  id: string;
  customer_id: string;
  items: OrderItem[];
  total_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// Paginated orders response
interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}

// Dashboard statistics
interface Stats {
  orders_today: number;
  processing_rate: number;
  queue_depth: number;
  total_orders: number;
  orders_by_hour?: Array<{
    hour: string;
    count: number;
  }>;
}

// System health status
interface HealthStatus {
  status: string;
  database: {
    status: string;
  };
  queue: {
    status: string;
  };
}

// Order creation request
interface CreateOrderRequest {
  customer_id: string;
  items: OrderItem[];
}

// API error response
interface ApiError {
  error: string;
  message?: string;
}
```

---

## Data Flow

### Order Submission Flow

```
User fills form
    ↓
Click "Submit Order"
    ↓
SubmitOrder validates inputs
    ↓
useMutation calls apiClient.createOrder()
    ↓
POST /api/orders with JSON body
    ↓
API returns new Order | Error
    ↓
On Success:
  - Show success notification
  - Reset form
  - Invalidate ['orders'] query
  - Invalidate ['stats'] query
  - OrderList and StatsCards auto-refresh
    ↓
On Error:
  - Show error notification
  - Keep form state
```

### Auto-Refresh Flow

```
Component mounts
    ↓
useQuery fetches initial data
    ↓
React Query schedules refetch based on refetchInterval
    ↓
Every 10s (orders, stats) or 30s (health):
  - Fetch latest data
  - Update UI if data changed
  - Continue interval
    ↓
Component unmounts → Cancel interval
```

---

## Styling Strategy

### Tailwind CSS Utilities

**Layout:**
- `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4` - Responsive grid
- `flex items-center justify-between` - Flexbox alignment
- `space-y-4` - Vertical spacing

**Colors:**
- `bg-white` - Card backgrounds
- `text-gray-900` - Primary text
- `text-gray-500` - Secondary text
- `bg-blue-500` - Primary actions
- `border-gray-200` - Subtle borders

**Interactive:**
- `hover:bg-gray-50` - Row hover
- `disabled:opacity-50` - Disabled state
- `transition-colors` - Smooth transitions

**Responsive:**
- Mobile-first approach
- `sm:`, `md:`, `lg:` breakpoints
- Stacks to single column on mobile

---

## Performance Considerations

1. **React Query Caching:**
   - Automatic cache management
   - Stale-while-revalidate pattern
   - Deduplication of parallel requests

2. **Component Optimization:**
   - No unnecessary re-renders
   - Stateless components where possible
   - Memoization not needed (queries handle it)

3. **Bundle Size:**
   - Tree-shaking enabled
   - Dynamic imports ready
   - Recharts only loads used components

4. **Network:**
   - Automatic retry (1x)
   - Request deduplication
   - Polling intervals optimized

---

## Development Tips

### Adding a New Component

1. Create file in `src/components/`
2. Define TypeScript interfaces for props
3. Import into `Dashboard.tsx`
4. Add to component hierarchy
5. Style with Tailwind classes

### Adding a New API Endpoint

1. Add method to `ApiClient` class
2. Define types in `src/types.ts`
3. Export from `apiClient` instance
4. Use with `useQuery` or `useMutation`

### Changing Refresh Intervals

Edit `refetchInterval` in `useQuery` options:
```typescript
useQuery({
  queryKey: ['myData'],
  queryFn: () => apiClient.getMyData(),
  refetchInterval: 5000, // 5 seconds
})
```

### Debugging

1. React Query DevTools (can be added):
   ```typescript
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
   
   <QueryClientProvider client={queryClient}>
     <Dashboard />
     <ReactQueryDevtools />
   </QueryClientProvider>
   ```

2. Network tab in browser DevTools
3. Console logs in API client
4. TypeScript compiler errors

---

## Future Enhancements

Potential additions:
- Order detail modal/drawer
- Real-time updates via WebSockets
- Advanced filtering and search
- Export to CSV functionality
- Dark mode toggle
- User authentication UI
- Notifications system
- Order status timeline
- Performance metrics charts
- Error boundary components
