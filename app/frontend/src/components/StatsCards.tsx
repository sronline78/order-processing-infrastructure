import type { Stats } from '../types';

interface StatsCardsProps {
  stats: Stats | undefined;
  isLoading: boolean;
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      title: 'Orders Today',
      value: stats?.orders_today ?? 0,
      icon: '📦',
      color: 'bg-blue-500',
    },
    {
      title: 'Processing Rate',
      value: stats?.processing_rate ?? 0,
      suffix: '/min',
      icon: '⚡',
      color: 'bg-green-500',
    },
    {
      title: 'Queue Depth',
      value: stats?.queue_depth ?? 0,
      icon: '📊',
      color: 'bg-yellow-500',
    },
    {
      title: 'Total Orders',
      value: stats?.total_orders ?? 0,
      icon: '🎯',
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">{card.title}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {isLoading ? (
                  <span className="text-gray-400">--</span>
                ) : (
                  <>
                    {card.value.toLocaleString()}
                    {card.suffix && (
                      <span className="text-lg text-gray-500 ml-1">
                        {card.suffix}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className={`${card.color} p-3 rounded-full text-2xl`}>
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
