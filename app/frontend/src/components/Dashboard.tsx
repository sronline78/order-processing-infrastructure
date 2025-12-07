import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { StatsCards } from './StatsCards';
import { SystemStatus } from './SystemStatus';
import { OrderList } from './OrderList';
import { SubmitOrder } from './SubmitOrder';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiClient.getStats(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Order Processing Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Real-time order monitoring and management
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <StatsCards stats={stats} isLoading={statsLoading} />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Chart - 2 columns */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Orders Per Hour
              </h2>
              {stats?.orders_by_hour && stats.orders_by_hour.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.orders_by_hour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hour"
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.375rem',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  {statsLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
                      Loading chart data...
                    </div>
                  ) : (
                    'No data available'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* System Status - 1 column */}
          <div className="lg:col-span-1">
            <SystemStatus />
          </div>
        </div>

        {/* Submit Order Form */}
        <div className="mb-6">
          <SubmitOrder />
        </div>

        {/* Orders List */}
        <OrderList />
      </main>
    </div>
  );
}
