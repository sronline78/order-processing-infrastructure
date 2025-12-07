import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import type { OrderItem } from '../types';

export function SubmitOrder() {
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([
    { product_id: '', quantity: 1, price: 0 },
  ]);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: apiClient.createOrder.bind(apiClient),
    onSuccess: () => {
      setNotification({
        type: 'success',
        message: 'Order created successfully!',
      });
      // Reset form
      setCustomerId('');
      setItems([{ product_id: '', quantity: 1, price: 0 }]);
      // Refresh orders list
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    },
    onError: (error) => {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create order',
      });
      setTimeout(() => setNotification(null), 5000);
    },
  });

  const handleAddItem = () => {
    setItems([...items, { product_id: '', quantity: 1, price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof OrderItem,
    value: string | number
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!customerId.trim()) {
      setNotification({
        type: 'error',
        message: 'Customer ID is required',
      });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const validItems = items.filter(
      (item) => item.product_id.trim() && item.quantity > 0 && item.price > 0
    );

    if (validItems.length === 0) {
      setNotification({
        type: 'error',
        message: 'At least one valid item is required',
      });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    mutation.mutate({
      customer_id: customerId,
      items: validItems,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Submit New Order</h2>

      {notification && (
        <div
          className={`mb-4 p-4 rounded-md ${
            notification.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer ID */}
        <div>
          <label
            htmlFor="customerId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Customer ID
          </label>
          <input
            type="text"
            id="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="customer-123"
            required
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Order Items
            </label>
            <button
              type="button"
              onClick={handleAddItem}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex gap-2 items-start p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={item.product_id}
                    onChange={(e) =>
                      handleItemChange(index, 'product_id', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Product ID"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          'quantity',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Quantity"
                      min="1"
                      required
                    />
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          'price',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Price"
                      step="0.01"
                      min="0.01"
                      required
                    />
                  </div>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="mt-1 text-red-600 hover:text-red-700 font-medium text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Submitting...
            </span>
          ) : (
            'Submit Order'
          )}
        </button>
      </form>
    </div>
  );
}
