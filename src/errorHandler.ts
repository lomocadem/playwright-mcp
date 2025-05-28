/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  ELEMENT_HANDLE = 'element_handle',
  CONSOLE_EVENT = 'console_event',
  PAGE_CREATION = 'page_creation',
  NAVIGATION = 'navigation',
  BROWSER_CONTEXT = 'browser_context',
  NETWORK = 'network',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  url?: string;
  tabId?: string;
  timestamp: number;
  userAgent?: string;
  browserName?: string;
  additionalData?: Record<string, unknown>;
}

export interface ClassifiedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context: ErrorContext;
  recoveryStrategy?: string;
  shouldRetry: boolean;
  maxRetries: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ClassifiedError[];
  recoverySuccessRate: number;
}

export class ErrorHandler {
  private _errors: ClassifiedError[] = [];
  private _maxErrorHistory = 100;
  private _debugMode = false;
  private _errorPatterns: Map<string, number> = new Map();

  constructor(debugMode = false) {
    this._debugMode = debugMode;
  }

  /**
   * Classify and handle an error with appropriate recovery strategy
   */
  handleError(error: Error, context: Partial<ErrorContext> = {}): ClassifiedError {
    const fullContext: ErrorContext = {
      timestamp: Date.now(),
      ...context
    };

    const classified = this._classifyError(error, fullContext);
    this._recordError(classified);
    this._logError(classified);

    return classified;
  }

  /**
   * Check if an error should be retried based on classification
   */
  shouldRetry(classifiedError: ClassifiedError, currentAttempt: number): boolean {
    return classifiedError.shouldRetry && currentAttempt < classifiedError.maxRetries;
  }

  /**
   * Get error metrics for monitoring
   */
  getMetrics(): ErrorMetrics {
    const totalErrors = this._errors.length;
    const errorsByCategory = this._countByCategory();
    const errorsBySeverity = this._countBySeverity();
    const recentErrors = this._errors.slice(-10);
    const recoverySuccessRate = this._calculateRecoverySuccessRate();

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      recentErrors,
      recoverySuccessRate
    };
  }

  /**
   * Clear error history (useful for testing)
   */
  clearHistory(): void {
    this._errors = [];
    this._errorPatterns.clear();
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
  }

  /**
   * Get formatted error report for diagnostics
   */
  getErrorReport(): string {
    const metrics = this.getMetrics();
    const report = [
      '=== Error Handler Report ===',
      `Total Errors: ${metrics.totalErrors}`,
      `Recovery Success Rate: ${(metrics.recoverySuccessRate * 100).toFixed(1)}%`,
      '',
      'Errors by Category:',
      ...Object.entries(metrics.errorsByCategory).map(([cat, count]) => `  ${cat}: ${count}`),
      '',
      'Errors by Severity:',
      ...Object.entries(metrics.errorsBySeverity).map(([sev, count]) => `  ${sev}: ${count}`),
      '',
      'Recent Error Patterns:',
      ...Array.from(this._errorPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pattern, count]) => `  ${pattern}: ${count} occurrences`)
    ];

    return report.join('\n');
  }

  private _classifyError(error: Error, context: ErrorContext): ClassifiedError {
    const message = error.message.toLowerCase();
    
    // ElementHandle-related errors
    if (message.includes('elementhandle can only be created from framedispatcher')) {
      return {
        category: ErrorCategory.ELEMENT_HANDLE,
        severity: ErrorSeverity.HIGH,
        message: 'ElementHandle creation failed - invalid context',
        originalError: error,
        context,
        recoveryStrategy: 'disable_console_collection',
        shouldRetry: false,
        maxRetries: 0
      };
    }

    if (message.includes('elementhandle') || message.includes('jshandle')) {
      return {
        category: ErrorCategory.ELEMENT_HANDLE,
        severity: ErrorSeverity.MEDIUM,
        message: 'ElementHandle operation failed',
        originalError: error,
        context,
        recoveryStrategy: 'retry_with_fallback',
        shouldRetry: true,
        maxRetries: 2
      };
    }

    // Console event errors
    if (message.includes('console') && (message.includes('event') || message.includes('message'))) {
      return {
        category: ErrorCategory.CONSOLE_EVENT,
        severity: ErrorSeverity.LOW,
        message: 'Console event handling failed',
        originalError: error,
        context,
        recoveryStrategy: 'skip_console_event',
        shouldRetry: false,
        maxRetries: 0
      };
    }

    // Page creation errors
    if (message.includes('page') && (message.includes('create') || message.includes('new'))) {
      return {
        category: ErrorCategory.PAGE_CREATION,
        severity: ErrorSeverity.HIGH,
        message: 'Page creation failed',
        originalError: error,
        context,
        recoveryStrategy: 'retry_page_creation',
        shouldRetry: true,
        maxRetries: 3
      };
    }

    // Navigation errors
    if (message.includes('navigation') || message.includes('goto') || message.includes('navigate')) {
      return {
        category: ErrorCategory.NAVIGATION,
        severity: ErrorSeverity.MEDIUM,
        message: 'Navigation operation failed',
        originalError: error,
        context,
        recoveryStrategy: 'retry_navigation',
        shouldRetry: true,
        maxRetries: 2
      };
    }

    // Browser context errors
    if (message.includes('browser') && message.includes('context')) {
      return {
        category: ErrorCategory.BROWSER_CONTEXT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Browser context error',
        originalError: error,
        context,
        recoveryStrategy: 'recreate_context',
        shouldRetry: true,
        maxRetries: 1
      };
    }

    // Network errors
    if (message.includes('net::') || message.includes('network') || message.includes('timeout')) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Network operation failed',
        originalError: error,
        context,
        recoveryStrategy: 'retry_with_timeout',
        shouldRetry: true,
        maxRetries: 2
      };
    }

    // Unknown errors
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      message: 'Unclassified error',
      originalError: error,
      context,
      recoveryStrategy: 'log_and_continue',
      shouldRetry: false,
      maxRetries: 0
    };
  }

  private _recordError(error: ClassifiedError): void {
    this._errors.push(error);
    
    // Maintain error history limit
    if (this._errors.length > this._maxErrorHistory) {
      this._errors = this._errors.slice(-this._maxErrorHistory);
    }

    // Track error patterns
    const pattern = `${error.category}:${error.severity}`;
    this._errorPatterns.set(pattern, (this._errorPatterns.get(pattern) || 0) + 1);
  }

  private _logError(error: ClassifiedError): void {
    const logLevel = this._getLogLevel(error.severity);
    const logMessage = [
      `[${error.category.toUpperCase()}] ${error.message}`,
      `URL: ${error.context.url || 'unknown'}`,
      `Recovery: ${error.recoveryStrategy || 'none'}`,
      this._debugMode ? `Stack: ${error.originalError.stack}` : ''
    ].filter(Boolean).join(' | ');

    if (logLevel === 'error') {
      console.error(logMessage);
    } else if (logLevel === 'warn') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  private _getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'log' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
      default:
        return 'log';
    }
  }

  private _countByCategory(): Record<ErrorCategory, number> {
    const counts = Object.values(ErrorCategory).reduce((acc, cat) => {
      acc[cat] = 0;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    this._errors.forEach(error => {
      counts[error.category]++;
    });

    return counts;
  }

  private _countBySeverity(): Record<ErrorSeverity, number> {
    const counts = Object.values(ErrorSeverity).reduce((acc, sev) => {
      acc[sev] = 0;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    this._errors.forEach(error => {
      counts[error.severity]++;
    });

    return counts;
  }

  private _calculateRecoverySuccessRate(): number {
    const retriableErrors = this._errors.filter(e => e.shouldRetry);
    if (retriableErrors.length === 0) return 1.0;

    // This is a simplified calculation - in a real implementation,
    // we'd track actual retry outcomes
    const successfulRecoveries = retriableErrors.filter(e => 
      e.severity !== ErrorSeverity.CRITICAL
    ).length;

    return successfulRecoveries / retriableErrors.length;
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler();
