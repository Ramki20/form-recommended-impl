// Add these interfaces to your existing pre-close.model.ts file

// RECOMMENDATION 2 & 5: Processing status tracking interfaces
export interface SetAsideProcessingStatus {
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  message: string;
  executionArn?: string;
  startTime?: string;
  lastUpdated?: string;
  requestId?: number;
  loanId?: number;
  step?: string;
  result?: {
    documentName?: string;
    totalFormsGenerated?: number;
    fileType?: string;
    containsMultipleForms?: boolean;
    formsDetails?: any[];
  };
  error?: string;
}

export interface SetAsideProcessingResult {
  success: boolean;
  executionArn?: string;
  trackingKey?: string;
  message?: string;
  requestId?: number;
  error?: string;
}

// RECOMMENDATION 1: Async execution response interface
export interface AsyncExecutionResponse {
  requestId: number;
  loanId: number;
  executionArn: string;
  status: string;
  message: string;
  startTime: string;
}

// RECOMMENDATION 2: WebSocket message interface
export interface WebSocketProgressMessage {
  loanId: number;
  step: string;
  message: string;
  timestamp: string;
}

// RECOMMENDATION 6: Enhanced infrastructure configuration
export interface LambdaConfig {
  memorySize: number;
  timeout: number;
  reservedConcurrency?: number;
  environmentVariables?: Record<string, string>;
}

export interface DatabaseConfig {
  connectionLimit: number;
  poolTimeout: number;
  socketTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// RECOMMENDATION 7: Monitoring and metrics interfaces
export interface PerformanceMetrics {
  executionTime: number;
  memoryUsed: number;
  cpuUsage: number;
  databaseConnections: number;
  cacheHitRate: number;
}

export interface ProcessingStep {
  name: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
}