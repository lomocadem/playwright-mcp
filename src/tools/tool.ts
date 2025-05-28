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

import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Context } from '../context.js';
import type * as playwright from 'playwright';
import type { ToolCapability } from '../../config.js';

export type ToolSchema<Input extends InputType> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Input;
  type: 'readOnly' | 'destructive';
};

type InputType = z.Schema;

export type FileUploadModalState = {
  type: 'fileChooser';
  description: string;
  fileChooser: playwright.FileChooser;
};

export type DialogModalState = {
  type: 'dialog';
  description: string;
  dialog: playwright.Dialog;
};

export type ModalState = FileUploadModalState | DialogModalState;

export type ToolActionResult = { content?: (ImageContent | TextContent)[] } | undefined | void;

export type ToolResult = {
  code: string[];
  action?: () => Promise<ToolActionResult>;
  captureSnapshot: boolean;
  waitForNetwork: boolean;
  resultOverride?: ToolActionResult;
};

export type Tool<Input extends InputType = InputType> = {
  capability: ToolCapability;
  schema: ToolSchema<Input>;
  clearsModalState?: ModalState['type'];
  handle: (context: Context, params: z.output<Input>) => Promise<ToolResult>;
};

export type ToolFactory = (snapshot: boolean) => Tool<any>;

// Maximum response size in characters (5KB to prevent conversation bloat)
const MAX_RESPONSE_SIZE = 5000;

// Helper function to calculate response size
function calculateResponseSize(content: (ImageContent | TextContent)[]): number {
  return content.reduce((size, item) => {
    if (item.type === 'text') {
      return size + item.text.length;
    }
    // Images are typically smaller in token terms, but we'll count them as 100 chars
    return size + 100;
  }, 0);
}

// Helper function to truncate response if too large
function truncateResponse(content: (ImageContent | TextContent)[]): (ImageContent | TextContent)[] {
  const totalSize = calculateResponseSize(content);
  
  if (totalSize <= MAX_RESPONSE_SIZE) {
    return content;
  }

  // If response is too large, replace with error message
  return [{
    type: 'text',
    text: `# Response Too Large ⚠️

The tool response was ${totalSize.toLocaleString()} characters, which exceeds the maximum allowed size of ${MAX_RESPONSE_SIZE.toLocaleString()} characters.

**This indicates a tool implementation issue** - all extraction tools should save data to the database and return only job summaries.

## What happened:
- Tool returned large data payload directly
- This violates the database-first approach
- Response was automatically blocked to prevent conversation bloat

## Solution:
- Use database-first extraction tools that return job summaries
- Access full data using \`get_crawl_results(job_id)\`
- Export data using \`export_crawl_data(job_id, format)\`

*Note: This safety mechanism prevents any tool from returning large responses that could consume conversation tokens.*`
  }];
}

export function defineTool<Input extends InputType>(tool: Tool<Input>): Tool<Input> {
  // Wrap the original handle function with response size enforcement
  const originalHandle = tool.handle;
  
  const wrappedHandle = async (context: Context, params: z.output<Input>): Promise<ToolResult> => {
    try {
      const result = await originalHandle(context, params);
      
      // Enforce response size limits on resultOverride
      if (result.resultOverride?.content) {
        const truncatedContent = truncateResponse(result.resultOverride.content);
        result.resultOverride.content = truncatedContent;
      }
      
      // Enforce response size limits on action results
      if (result.action) {
        const originalAction = result.action;
        result.action = async () => {
          const actionResult = await originalAction();
          if (actionResult?.content) {
            const truncatedContent = truncateResponse(actionResult.content);
            return { content: truncatedContent };
          }
          return actionResult;
        };
      }
      
      return result;
    } catch (error) {
      // Ensure error messages are also size-limited
      const errorMessage = error instanceof Error ? error.message : String(error);
      const truncatedErrorMessage = errorMessage.length > MAX_RESPONSE_SIZE 
        ? errorMessage.substring(0, MAX_RESPONSE_SIZE - 100) + '... [Error message truncated]'
        : errorMessage;
      
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Tool Error\n\n${truncatedErrorMessage}\n\n*Note: Error messages are automatically size-limited to prevent conversation bloat.*`
          }],
        },
        code: [`// Error: ${truncatedErrorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  };
  
  return {
    ...tool,
    handle: wrappedHandle
  };
}
