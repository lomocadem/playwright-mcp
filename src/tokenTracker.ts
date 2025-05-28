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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ActionTokenUsage extends TokenUsage {
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionTotalTokens: number;
}

export class TokenTracker {
  private sessionInputTokens: number = 0;
  private sessionOutputTokens: number = 0;

  /**
   * Estimates token count from text using a rough approximation.
   * Uses ~4 characters per token as a reasonable estimate for English text.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    
    // Remove extra whitespace and normalize
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    
    // Rough estimation: ~4 characters per token
    // This accounts for the fact that tokens can be partial words, punctuation, etc.
    const estimatedTokens = Math.ceil(normalizedText.length / 4);
    
    return Math.max(1, estimatedTokens); // Minimum 1 token for non-empty text
  }

  /**
   * Estimates tokens from structured data (objects, arrays, etc.)
   */
  estimateTokensFromData(data: any): number {
    if (data === null || data === undefined) return 1;
    
    if (typeof data === 'string') {
      return this.estimateTokens(data);
    }
    
    if (typeof data === 'number' || typeof data === 'boolean') {
      return 1;
    }
    
    if (Array.isArray(data)) {
      return data.reduce((total, item) => total + this.estimateTokensFromData(item), 0);
    }
    
    if (typeof data === 'object') {
      const jsonString = JSON.stringify(data);
      return this.estimateTokens(jsonString);
    }
    
    return 1;
  }

  /**
   * Tracks token usage for a single action and updates session totals.
   */
  trackAction(inputData: any, outputContent: any): ActionTokenUsage {
    const inputTokens = this.estimateTokensFromData(inputData);
    const outputTokens = this.estimateTokensFromData(outputContent);
    
    // Update session totals
    this.sessionInputTokens += inputTokens;
    this.sessionOutputTokens += outputTokens;
    
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      sessionInputTokens: this.sessionInputTokens,
      sessionOutputTokens: this.sessionOutputTokens,
      sessionTotalTokens: this.sessionInputTokens + this.sessionOutputTokens,
    };
  }

  /**
   * Gets current session totals without tracking a new action.
   */
  getSessionTotals(): TokenUsage {
    return {
      inputTokens: this.sessionInputTokens,
      outputTokens: this.sessionOutputTokens,
      totalTokens: this.sessionInputTokens + this.sessionOutputTokens,
    };
  }

  /**
   * Formats token usage into a readable markdown report.
   */
  formatUsageReport(usage: ActionTokenUsage): string {
    const lines = [
      '### Token Usage',
      `- Input tokens (this action): ${usage.inputTokens.toLocaleString()}`,
      `- Output tokens (this action): ${usage.outputTokens.toLocaleString()}`,
      `- Total tokens (this action): ${usage.totalTokens.toLocaleString()}`,
      '',
      `- Session input tokens: ${usage.sessionInputTokens.toLocaleString()}`,
      `- Session output tokens: ${usage.sessionOutputTokens.toLocaleString()}`,
      `- Session total tokens: ${usage.sessionTotalTokens.toLocaleString()}`,
    ];

    // Add warning if session total is getting high
    if (usage.sessionTotalTokens > 150000) {
      lines.push('', '⚠️  **Warning**: Session token count is getting high. Consider starting a new conversation to avoid hitting limits.');
    } else if (usage.sessionTotalTokens > 100000) {
      lines.push('', '📊 **Info**: Session has used a significant number of tokens. Monitor usage to avoid hitting limits.');
    }

    return lines.join('\n');
  }

  /**
   * Resets session token counters.
   */
  resetSession(): void {
    this.sessionInputTokens = 0;
    this.sessionOutputTokens = 0;
  }
}
