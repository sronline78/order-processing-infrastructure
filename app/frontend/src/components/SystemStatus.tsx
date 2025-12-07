import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';

export function SystemStatus() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const services = [
    {
      name: 'API',
      status: health?.status === 'healthy',
      label: 'API Service',
    },
    {
      name: 'Database',
      status: health?.database?.status === 'connected',
      label: 'PostgreSQL',
    },
    {
      name: 'Queue',
      status: health?.queue?.status === 'connected',
      label: 'RabbitMQ',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">System Status</h2>
      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between py-2"
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isLoading
                    ? 'bg-gray-300 animate-pulse'
                    : service.status
                    ? 'bg-green-500'
                    : 'bg-red-500'
                }`}
              />
              <span className="text-gray-700 font-medium">{service.label}</span>
            </div>
            <span
              className={`text-sm font-semibold ${
                isLoading
                  ? 'text-gray-400'
                  : service.status
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {isLoading ? 'Checking...' : service.status ? 'Healthy' : 'Down'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
