import json
import boto3
import random
import os
from datetime import datetime
from uuid import uuid4

sqs = boto3.client('sqs')
QUEUE_URL = os.environ['QUEUE_URL']
MIN_ORDERS = int(os.environ.get('MIN_ORDERS', '1'))
MAX_ORDERS = int(os.environ.get('MAX_ORDERS', '5'))
ENABLED = os.environ.get('ENABLED', 'true').lower() == 'true'

PRODUCTS = [
    {'id': 'PROD-001', 'name': 'Laptop', 'price': 1299.99},
    {'id': 'PROD-002', 'name': 'Mouse', 'price': 29.99},
    {'id': 'PROD-003', 'name': 'Keyboard', 'price': 89.99},
    {'id': 'PROD-004', 'name': 'Monitor', 'price': 399.99},
    {'id': 'PROD-005', 'name': 'Headphones', 'price': 149.99},
]

def generate_order():
    """Generate a random order with 1-3 items"""
    num_items = random.randint(1, 3)
    items = []
    total_amount = 0

    for _ in range(num_items):
        product = random.choice(PRODUCTS)
        quantity = random.randint(1, 5)
        price = product['price']
        total_amount += price * quantity

        items.append({
            'product_id': product['id'],  # snake_case
            'quantity': quantity,
            'price': price
        })

    return {
        'order_id': f"ORD-{uuid4().hex[:8].upper()}",  # snake_case
        'customer_id': f"CUST-{random.randint(1000, 9999)}",  # snake_case
        'items': items,
        'total_amount': round(total_amount, 2),  # Required by backend
        'status': 'pending',  # Required by backend
        'created_at': datetime.utcnow().isoformat()  # snake_case
    }

def handler(event, context):
    """Generate and send 1-5 random orders to SQS"""
    if not ENABLED:
        print("Producer is disabled via ENABLED environment variable")
        return {'statusCode': 200, 'body': 'Disabled'}

    num_orders = random.randint(MIN_ORDERS, MAX_ORDERS)
    sent_orders = []

    for _ in range(num_orders):
        order = generate_order()

        try:
            response = sqs.send_message(
                QueueUrl=QUEUE_URL,
                MessageBody=json.dumps(order)
            )
            sent_orders.append(order['order_id'])
            print(f"Sent order: {order['order_id']}")
        except Exception as e:
            print(f"Error sending order: {e}")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Sent {len(sent_orders)} orders',
            'orderIds': sent_orders
        })
    }
