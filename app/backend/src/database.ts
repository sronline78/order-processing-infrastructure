import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

let pool: Pool | null = null;

/**
 * Retrieve database credentials from AWS Secrets Manager
 */
async function getDatabaseCredentials(): Promise<DatabaseCredentials> {
  const secretArn = process.env.DB_SECRET_ARN;

  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is required');
  }

  console.log(`[Database] Fetching credentials from Secrets Manager: ${secretArn}`);

  const client = new SecretsManagerClient({});

  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);

    console.log('[Database] Successfully retrieved credentials from Secrets Manager');

    return {
      username: secret.username,
      password: secret.password,
      host: secret.host,
      port: secret.port || 5432,
      dbname: secret.dbname || 'orders',
    };
  } catch (error) {
    console.error('[Database] Failed to retrieve credentials from Secrets Manager:', error);
    throw error;
  }
}

/**
 * Initialize PostgreSQL connection pool
 */
export async function initializeDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const credentials = await getDatabaseCredentials();

  console.log(`[Database] Initializing connection pool to ${credentials.host}:${credentials.port}/${credentials.dbname}`);

  pool = new Pool({
    user: credentials.username,
    password: credentials.password,
    host: credentials.host,
    port: credentials.port,
    database: credentials.dbname,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('[Database] Connection pool established successfully');
    client.release();
  } catch (error) {
    console.error('[Database] Failed to establish connection pool:', error);
    throw error;
  }

  // Create orders table if it doesn't exist
  await createOrdersTable();

  return pool;
}

/**
 * Create orders table with proper schema
 */
async function createOrdersTable(): Promise<void> {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      order_id VARCHAR(255) PRIMARY KEY,
      customer_id VARCHAR(255) NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      items JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const createIndexQuery = `
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)
  `;

  const createCustomerIndexQuery = `
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)
  `;

  try {
    await pool.query(createTableQuery);
    console.log('[Database] Orders table created or already exists');

    await pool.query(createIndexQuery);
    await pool.query(createCustomerIndexQuery);
    console.log('[Database] Indexes created successfully');
  } catch (error) {
    console.error('[Database] Failed to create orders table:', error);
    throw error;
  }
}

/**
 * Get database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('[Database] Health check failed:', error);
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    console.log('[Database] Closing connection pool...');
    await pool.end();
    pool = null;
    console.log('[Database] Connection pool closed');
  }
}
