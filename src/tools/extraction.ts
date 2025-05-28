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

import { z } from 'zod';
import crypto from 'crypto';
import { defineTool } from './tool.js';
import { callOnPageNoTrace } from './utils.js';
import { getDatabaseManager } from '../database.js';
import { TokenTracker } from '../tokenTracker.js';

interface ExtractionParams {
  selectors?: Record<string, string>;
  javascript?: string;
  options: {
    includeAttributes: boolean;
    includeStyles: boolean;
    cleanText: boolean;
    maxElements: number;
    timeout: number;
  };
}

const extractDataSchema = z.object({
  selectors: z.record(z.string()).optional().describe('CSS selectors mapped to data keys (e.g., {"title": "h1", "prices": ".price"})'),
  javascript: z.string().optional().describe('Custom JavaScript code for complex extraction. Should return an object with the extracted data.'),
  jobName: z.string().optional().describe('Optional name for the extraction job'),
  options: z.object({
    includeAttributes: z.boolean().default(false).describe('Include element attributes in the extraction'),
    includeStyles: z.boolean().default(false).describe('Include computed styles in the extraction'),
    cleanText: z.boolean().default(true).describe('Clean and trim extracted text'),
    maxElements: z.number().default(100).describe('Maximum number of elements to extract per selector'),
    timeout: z.number().default(5000).describe('Timeout for extraction in milliseconds')
  }).default({}).describe('Extraction options')
});

const extractData = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_extract_data',
    title: 'Extract data from page',
    description: 'Extract specific data from the current page using CSS selectors or custom JavaScript. Data is automatically saved to database and only job summary is returned to prevent conversation bloat.',
    inputSchema: extractDataSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const tokenTracker = new TokenTracker();
    const dbManager = getDatabaseManager();
    
    // Validate that at least one extraction method is provided
    if (!params.selectors && !params.javascript) {
      throw new Error('Either selectors or javascript parameter must be provided');
    }

    const code: string[] = [];
    
    try {
      const url = await tab.page.url();
      const extractedData = await callOnPageNoTrace(tab.page, async (page) => {
        return await page.evaluate(async (extractionParams: ExtractionParams) => {
          const { selectors, javascript, options } = extractionParams;
          const result: any = {};

          // Helper function to clean text
          const cleanText = (text: string | null | undefined): string => {
            if (!text) return '';
            return options.cleanText ? text.trim().replace(/\s+/g, ' ') : text;
          };

          // Helper function to extract element data
          const extractElementData = (element: Element) => {
            const data: any = {
              text: cleanText(element.textContent)
            };

            if (options.includeAttributes) {
              data.attributes = {};
              // Use traditional for loop to avoid TypeScript iteration issues
              for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                data.attributes[attr.name] = attr.value;
              }
            }

            if (options.includeStyles) {
              const computedStyle = window.getComputedStyle(element);
              data.styles = {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                color: computedStyle.color,
                backgroundColor: computedStyle.backgroundColor
              };
            }

            return data;
          };

          // CSS Selector-based extraction
          if (selectors) {
            for (const [key, selector] of Object.entries(selectors)) {
              try {
                const elements = document.querySelectorAll(selector);
                const extractedElements = Array.from(elements)
                  .slice(0, options.maxElements)
                  .map(el => {
                    if (options.includeAttributes || options.includeStyles) {
                      return extractElementData(el);
                    } else {
                      return cleanText(el.textContent);
                    }
                  })
                  .filter(item => item && (typeof item === 'string' ? item !== '' : item.text !== ''));

                // If only one element, return it directly instead of array
                result[key] = extractedElements.length === 1 ? extractedElements[0] : extractedElements;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                result[key] = { error: `Failed to extract with selector "${selector}": ${errorMessage}` };
              }
            }
          }

          // Custom JavaScript evaluation
          if (javascript) {
            try {
              // Create a function from the JavaScript code and execute it
              const customFunction = new Function('document', 'window', 'cleanText', 'extractElementData', javascript);
              const customResult = customFunction(document, window, cleanText, extractElementData);
              
              // Merge custom results with selector results
              if (typeof customResult === 'object' && customResult !== null) {
                Object.assign(result, customResult);
              } else {
                result.customExtraction = customResult;
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              result.javascriptError = `Failed to execute custom JavaScript: ${errorMessage}`;
            }
          }

          return result;
        }, { selectors: params.selectors, javascript: params.javascript, options: params.options });
      });

      // Generate code representation
      if (params.selectors) {
        code.push('// Extract data using CSS selectors');
        for (const [key, selector] of Object.entries(params.selectors)) {
          code.push(`const ${key} = await page.locator('${selector}').allTextContents();`);
        }
      }

      if (params.javascript) {
        code.push('// Extract data using custom JavaScript');
        code.push(`const customData = await page.evaluate(() => {`);
        code.push(`  ${params.javascript}`);
        code.push(`});`);
      }

      // MANDATORY DATABASE STORAGE - No legacy fallback allowed
      // Create extraction job
      const strategyHash = crypto.createHash('md5').update(JSON.stringify({
        selectors: params.selectors,
        javascript: params.javascript,
        options: params.options
      })).digest('hex');

      const jobId = await dbManager.createCrawlJob({
        url,
        strategy_hash: strategyHash,
        status: 'running',
        total_pages: 1,
        total_items: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      });

      // Count total items extracted
      let totalItems = 0;
      const itemCounts: Record<string, number> = {};
      
      for (const [key, value] of Object.entries(extractedData)) {
        if (Array.isArray(value)) {
          itemCounts[key] = value.length;
          totalItems += value.length;
        } else if (value && typeof value === 'object' && !(value as any).error) {
          itemCounts[key] = 1;
          totalItems += 1;
        } else if (typeof value === 'string' && value !== '') {
          itemCounts[key] = 1;
          totalItems += 1;
        }
      }

      // Store extraction results in database
      await dbManager.storeCrawlResult({
        job_id: jobId,
        page_number: 1,
        extracted_data: extractedData,
        metadata: {
          url,
          timestamp: new Date().toISOString(),
          job_name: params.jobName,
          selectors: params.selectors,
          javascript: params.javascript,
          options: params.options,
          item_counts: itemCounts
        }
      });

      // Track token usage
      const tokenUsage = tokenTracker.trackAction(params, extractedData);

      // Update job status
      await dbManager.updateCrawlJob(jobId, {
        status: 'completed',
        completed_at: new Date(),
        total_pages: 1,
        total_items: totalItems,
        input_tokens: tokenUsage.inputTokens,
        output_tokens: tokenUsage.outputTokens,
        total_tokens: tokenUsage.totalTokens
      });

      // Create sample data for preview (first few items)
      const sampleData: any = {};
      for (const [key, value] of Object.entries(extractedData)) {
        if (Array.isArray(value)) {
          sampleData[key] = value.slice(0, 3); // Show first 3 items
          if (value.length > 3) {
            sampleData[key].push(`... and ${value.length - 3} more items`);
          }
        } else {
          sampleData[key] = value;
        }
      }

      // ALWAYS return job summary - never return full data
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Data Extraction Job Completed ✅

**Job ID:** ${jobId}
**Job Name:** ${params.jobName || 'Unnamed Extraction'}
**URL:** ${url}
**Status:** Completed

## Extraction Summary
- **Total Items Extracted:** ${totalItems.toLocaleString()}
- **Data Fields:** ${Object.keys(extractedData).length}
- **Storage:** PostgreSQL Database

## Item Breakdown
${Object.entries(itemCounts).map(([key, count]) => `- **${key}:** ${count.toLocaleString()} items`).join('\n')}

## Sample Data Preview
\`\`\`json
${JSON.stringify(sampleData, null, 2)}
\`\`\`

## Data Access
- **Full data stored in database** - Use \`get_crawl_results(${jobId})\` to retrieve
- **Export options available** - Use \`export_crawl_data(${jobId}, format="csv")\` to export

## Token Usage
${tokenTracker.formatUsageReport(tokenUsage)}

*Note: All extracted data is automatically saved to database to prevent conversation bloat. This summary uses minimal tokens while preserving all extracted data.*`
          }],
        },
        code: [
          ...code,
          `// Data extraction completed`,
          `// Job ID: ${jobId}`,
          `// Total items: ${totalItems}`,
          `// Data stored in PostgreSQL database`
        ],
        captureSnapshot: false,
        waitForNetwork: false,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Extraction Error\n\nFailed to extract data: ${errorMessage}\n\n*Note: Database storage is mandatory. If database is unavailable, extraction cannot proceed.*`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

export default [
  extractData,
];
