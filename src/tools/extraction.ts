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
import { defineTool } from './tool.js';
import { callOnPageNoTrace } from './utils.js';

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
  format: z.enum(['json', 'csv', 'text']).default('json').describe('Output format for the extracted data'),
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
    description: 'Extract specific data from the current page using CSS selectors or custom JavaScript. Much more token-efficient than full page snapshots.',
    inputSchema: extractDataSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    
    // Validate that at least one extraction method is provided
    if (!params.selectors && !params.javascript) {
      throw new Error('Either selectors or javascript parameter must be provided');
    }

    const code: string[] = [];
    
    try {
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
                  });

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

      // Format the output based on the requested format
      let formattedOutput: string;
      
      switch (params.format) {
        case 'csv':
          formattedOutput = formatAsCSV(extractedData);
          break;
        case 'text':
          formattedOutput = formatAsText(extractedData);
          break;
        case 'json':
        default:
          formattedOutput = JSON.stringify(extractedData, null, 2);
          break;
      }

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

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Extracted Data (${params.format.toUpperCase()} format)\n\n\`\`\`${params.format === 'json' ? 'json' : 'text'}\n${formattedOutput}\n\`\`\``
          }],
        },
        code,
        captureSnapshot: false,
        waitForNetwork: false,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Extraction Error\n\nFailed to extract data: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Helper function to format data as CSV
function formatAsCSV(data: any): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const rows: string[] = [];
  const headers = Object.keys(data);
  rows.push(headers.join(','));

  // Find the maximum length of arrays in the data
  const maxLength = Math.max(...headers.map(key => 
    Array.isArray(data[key]) ? data[key].length : 1
  ));

  for (let i = 0; i < maxLength; i++) {
    const row = headers.map(key => {
      const value = Array.isArray(data[key]) ? data[key][i] : (i === 0 ? data[key] : '');
      return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value || '');
    });
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

// Helper function to format data as plain text
function formatAsText(data: any): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}:`);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        lines.push(`  ${index + 1}. ${typeof item === 'object' ? JSON.stringify(item) : item}`);
      });
    } else {
      lines.push(`  ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export default [
  extractData,
];
