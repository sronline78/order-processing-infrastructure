import { Duration } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface VpcConfig {
  maxAzs: number;
  natGateways: number;
}

export interface DatabaseConfig {
  minCapacity: number;
  maxCapacity: number;
  backupRetention: number;
  deletionProtection: boolean;
}

export interface EcsConfig {
  backendCpu: number;
  backendMemory: number;
  backendDesiredCount: number;
  backendMinCapacity: number;
  backendMaxCapacity: number;
  frontendCpu: number;
  frontendMemory: number;
  frontendDesiredCount: number;
}

export interface MessagingConfig {
  producerEnabled: boolean;
  producerIntervalMinutes: number;
  minOrdersPerInvocation: number;
  maxOrdersPerInvocation: number;
}

export interface MonitoringConfig {
  logRetentionDays: logs.RetentionDays;
}

export interface WafConfig {
  enabled: boolean;
  rateLimit: number;
  allowedCountryCodes?: string[];
  enableLogging?: boolean;
}

export interface SecurityConfig {
  enableCloudTrail: boolean;
  enableGuardDuty: boolean;
  enableSecurityHub: boolean;
  enableInspector: boolean;
  enableConfig: boolean;
}

export interface EnvironmentConfig {
  env: {
    account: string;
    region: string;
  };
  vpcConfig: VpcConfig;
  databaseConfig: DatabaseConfig;
  ecsConfig: EcsConfig;
  messagingConfig: MessagingConfig;
  monitoringConfig: MonitoringConfig;
  wafConfig: WafConfig;
  securityConfig: SecurityConfig;
  tags: Record<string, string>;
}

export const DEV_CONFIG: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '211125316068',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  vpcConfig: {
    maxAzs: 3,
    natGateways: 1, 
  },
  databaseConfig: {
    minCapacity: 0, // Scale to 0 for cost savings
    maxCapacity: 1,
    backupRetention: 7,
    deletionProtection: false,
  },
  ecsConfig: {
    backendCpu: 512,
    backendMemory: 1024,
    backendDesiredCount: 1,
    backendMinCapacity: 1,
    backendMaxCapacity: 3,
    frontendCpu: 256,
    frontendMemory: 512,
    frontendDesiredCount: 1,
  },
  messagingConfig: {
    producerEnabled: true,
    producerIntervalMinutes: 5,
    minOrdersPerInvocation: 1,
    maxOrdersPerInvocation: 5,
  },
  monitoringConfig: {
    logRetentionDays: logs.RetentionDays.ONE_WEEK,
  },
  wafConfig: {
    enabled: true,
    rateLimit: 2000, // 2000 requests per 5 minutes per IP
    enableLogging: false, // Disabled in dev to save costs
  },
  securityConfig: {
    enableCloudTrail: false, // May already exist
    enableGuardDuty: false,
    enableSecurityHub: false,
    enableInspector: false,
    enableConfig: false,
  },
  tags: {
    Environment: 'dev',
    Project: 'order-processing',
    ManagedBy: 'cdk',
  },
};

export const PROD_CONFIG: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '211125316068',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  vpcConfig: {
    maxAzs: 3,
    natGateways: 3, // HA for production
  },
  databaseConfig: {
    minCapacity: 0.5,
    maxCapacity: 4,
    backupRetention: 35,
    deletionProtection: true,
  },
  ecsConfig: {
    backendCpu: 512,
    backendMemory: 1024,
    backendDesiredCount: 2,
    backendMinCapacity: 2,
    backendMaxCapacity: 10,
    frontendCpu: 256,
    frontendMemory: 512,
    frontendDesiredCount: 2,
  },
  messagingConfig: {
    producerEnabled: false, // Disable in prod
    producerIntervalMinutes: 5,
    minOrdersPerInvocation: 1,
    maxOrdersPerInvocation: 5,
  },
  monitoringConfig: {
    logRetentionDays: logs.RetentionDays.THREE_MONTHS,
  },
  wafConfig: {
    enabled: true,
    rateLimit: 2000, // 2000 requests per 5 minutes per IP
    enableLogging: true, // Enabled in production for security auditing
  },
  securityConfig: {
    enableCloudTrail: false, // May already exist
    enableGuardDuty: false,
    enableSecurityHub: false,
    enableInspector: false,
    enableConfig: false,
  },
  tags: {
    Environment: 'prod',
    Project: 'order-processing',
    ManagedBy: 'cdk',
  },
};

export function getConfig(environment?: string): EnvironmentConfig {
  const env = environment || process.env.ENVIRONMENT || 'dev';
  return env === 'prod' ? PROD_CONFIG : DEV_CONFIG;
}
