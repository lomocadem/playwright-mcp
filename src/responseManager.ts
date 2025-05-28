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

import fs from 'node:fs';
import path from 'node:path';
import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { FullConfig } from './config.js';
import { outputFile } from './config.js';

export interface ResponseManagementResult {
  content: (ImageContent | TextContent)[];
  savedFiles?: string[];
  truncated?: boolean;
  originalSize?: number;
}

export class ResponseManager {
  private config: FullConfig;

  constructor(config: FullConfig) {
    this.config = config;
  }

  /**
   * Processes response content, potentially saving large responses to files
   * and truncating them in the conversation.
   */
  async processResponse(content: (ImageContent | TextContent)[]): Promise<ResponseManagementResult> {
    const responseConfig = this.config.responseManagement;
    
    // If response management is not configured, return as-is
    if (!responseConfig?.saveToFiles && !responseConfig?.truncateLargeResponses) {
      return { content };
    }

    const result: ResponseManagementResult = {
      content: [],
      savedFiles: [],
    };

    for (const item of content) {
      if (item.type === 'text') {
        const processedText = await this.processTextContent(item.text);
        result.content.push({
          type: 'text',
          text: processedText.text
        });
        
        if (processedText.savedFile) {
          result.savedFiles!.push(processedText.savedFile);
        }
        
        if (processedText.truncated) {
          result.truncated = true;
          result.originalSize = processedText.originalSize;
        }
      } else {
        // Keep image content as-is
        result.content.push(item);
      }
    }

    return result;
  }

  private async processTextContent(text: string): Promise<{
    text: string;
    savedFile?: string;
    truncated?: boolean;
    originalSize?: number;
  }> {
    const responseConfig = this.config.responseManagement!;
    const maxSize = responseConfig.maxResponseSize || 10000;
    
    // If text is within limits, return as-is
    if (text.length <= maxSize) {
      return { text };
    }

    let processedText = text;
    let savedFile: string | undefined;
    let truncated = false;
    const originalSize = text.length;

    // Save to file if configured
    if (responseConfig.saveToFiles) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `response-${timestamp}.txt`;
      savedFile = await outputFile(this.config, fileName);
      
      await fs.promises.writeFile(savedFile, text, 'utf8');
    }

    // Truncate if configured
    if (responseConfig.truncateLargeResponses) {
      truncated = true;
      processedText = this.truncateText(text, maxSize, savedFile);
    }

    return {
      text: processedText,
      savedFile,
      truncated,
      originalSize
    };
  }

  private truncateText(text: string, maxSize: number, savedFile?: string): string {
    const truncateAt = Math.floor(maxSize * 0.8); // Use 80% of max size for content
    const preview = text.substring(0, truncateAt);
    
    // Try to truncate at a reasonable boundary (line break)
    const lastNewline = preview.lastIndexOf('\n');
    const actualTruncateAt = lastNewline > truncateAt * 0.5 ? lastNewline : truncateAt;
    
    const truncatedContent = text.substring(0, actualTruncateAt);
    const remainingChars = text.length - actualTruncateAt;
    
    let footer = `\n\n--- RESPONSE TRUNCATED ---\n`;
    footer += `Original size: ${text.length.toLocaleString()} characters\n`;
    footer += `Showing: ${actualTruncateAt.toLocaleString()} characters\n`;
    footer += `Truncated: ${remainingChars.toLocaleString()} characters\n`;
    
    if (savedFile) {
      footer += `Full response saved to: ${path.basename(savedFile)}\n`;
    }
    
    footer += `--- END TRUNCATION ---`;
    
    return truncatedContent + footer;
  }

  /**
   * Estimates the token count of response content for better management.
   */
  estimateResponseTokens(content: (ImageContent | TextContent)[]): number {
    let totalChars = 0;
    
    for (const item of content) {
      if (item.type === 'text') {
        totalChars += item.text.length;
      }
      // Images are harder to estimate, but they're typically much smaller in token terms
    }
    
    // Rough estimation: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Checks if a response should be processed based on size.
   */
  shouldProcessResponse(content: (ImageContent | TextContent)[]): boolean {
    const responseConfig = this.config.responseManagement;
    if (!responseConfig?.saveToFiles && !responseConfig?.truncateLargeResponses) {
      return false;
    }

    const maxSize = responseConfig.maxResponseSize || 10000;
    const totalSize = content.reduce((size, item) => {
      return size + (item.type === 'text' ? item.text.length : 0);
    }, 0);

    return totalSize > maxSize;
  }
}
