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

interface PaginationParams {
  selectors: Record<string, string>;
  paginationConfig: {
    nextButtonSelector?: string;
    pageNumberSelector?: string;
    maxPages: number;
    waitBetweenPages: number;
    scrollToLoad: boolean;
    infiniteScroll: boolean;
  };
  options: {
    includeAttributes: boolean;
    includeStyles: boolean;
    cleanText: boolean;
    maxElementsPerPage: number;
    timeout: number;
    deduplication: boolean;
  };
}

const extractPaginatedDataSchema = z.object({
  selectors: z.record(z.string()).describe('CSS selectors mapped to data keys (e.g., {"products": ".product-item", "titles": ".product-title"})'),
  paginationConfig: z.object({
    nextButtonSelector: z.string().optional().describe('CSS selector for the next page button (e.g., ".s-pagination-next", "a[aria-label=\'Next\']")'),
    pageNumberSelector: z.string().optional().describe('CSS selector for page number elements'),
    maxPages: z.number().default(5).describe('Maximum number of pages to scrape'),
    waitBetweenPages: z.number().default(2000).describe('Wait time between page navigations in milliseconds'),
    scrollToLoad: z.boolean().default(false).describe('Scroll to bottom before extracting data (for lazy loading)'),
    infiniteScroll: z.boolean().default(false).describe('Handle infinite scroll pagination')
  }).describe('Pagination configuration'),
  format: z.enum(['json', 'csv', 'text']).default('json').describe('Output format for the extracted data'),
  options: z.object({
    includeAttributes: z.boolean().default(false).describe('Include element attributes in the extraction'),
    includeStyles: z.boolean().default(false).describe('Include computed styles in the extraction'),
    cleanText: z.boolean().default(true).describe('Clean and trim extracted text'),
    maxElementsPerPage: z.number().default(50).describe('Maximum number of elements to extract per page'),
    timeout: z.number().default(10000).describe('Timeout for each page load in milliseconds'),
    deduplication: z.boolean().default(true).describe('Remove duplicate entries across pages')
  }).default({}).describe('Extraction options')
});

const extractPaginatedData = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_extract_paginated_data',
    title: 'Extract data from multiple pages',
    description: 'Extract data from multiple pages by automatically handling pagination. Supports button-based pagination, infinite scroll, and URL-based navigation.',
    inputSchema: extractPaginatedDataSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const code: string[] = [];
    
    try {
      const allExtractedData = await callOnPageNoTrace(tab.page, async (page) => {
        return await page.evaluate(async (paginationParams: PaginationParams) => {
          const { selectors, paginationConfig, options } = paginationParams;
          const allResults: any = {};
          let currentPage = 1;
          const seenItems = new Set<string>();

          // Initialize result structure
          Object.keys(selectors).forEach(key => {
            allResults[key] = [];
          });

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

          // Helper function to create unique identifier for deduplication
          const createItemId = (item: any): string => {
            if (typeof item === 'string') {
              return item.trim().toLowerCase();
            }
            if (typeof item === 'object' && item.text) {
              return item.text.trim().toLowerCase();
            }
            return JSON.stringify(item);
          };

          // Helper function to extract data from current page
          const extractCurrentPageData = () => {
            const pageResults: any = {};
            
            for (const [key, selector] of Object.entries(selectors)) {
              try {
                const elements = document.querySelectorAll(selector);
                const extractedElements = Array.from(elements)
                  .slice(0, options.maxElementsPerPage)
                  .map(el => {
                    if (options.includeAttributes || options.includeStyles) {
                      return extractElementData(el);
                    } else {
                      return cleanText(el.textContent);
                    }
                  })
                  .filter(item => item && item !== ''); // Remove empty items

                pageResults[key] = extractedElements;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                pageResults[key] = { error: `Failed to extract with selector "${selector}": ${errorMessage}` };
              }
            }
            
            return pageResults;
          };

          // Helper function to scroll to load content
          const scrollToLoadContent = async () => {
            if (paginationConfig.scrollToLoad || paginationConfig.infiniteScroll) {
              const initialHeight = document.body.scrollHeight;
              window.scrollTo(0, document.body.scrollHeight);
              
              // Wait for content to load
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Check if new content loaded
              const newHeight = document.body.scrollHeight;
              return newHeight > initialHeight;
            }
            return false;
          };

          // Helper function to find next button
          const findNextButton = (): Element | null => {
            if (paginationConfig.nextButtonSelector) {
              return document.querySelector(paginationConfig.nextButtonSelector);
            }

            // Common next button selectors
            const commonSelectors = [
              'a[aria-label="Next"]',
              '.s-pagination-next',
              '.pagnNext',
              '.next',
              '[data-testid="pagination-next"]',
              'a:contains("Next")',
              'button:contains("Next")',
              '.pagination .next',
              '.page-next'
            ];

            for (const selector of commonSelectors) {
              const element = document.querySelector(selector);
              if (element && !element.hasAttribute('disabled') && !element.classList.contains('disabled')) {
                return element;
              }
            }

            return null;
          };

          // Main extraction loop
          while (currentPage <= paginationConfig.maxPages) {
            console.log(`Extracting data from page ${currentPage}...`);

            // Scroll to load content if needed
            if (paginationConfig.infiniteScroll) {
              let hasMoreContent = true;
              while (hasMoreContent && currentPage <= paginationConfig.maxPages) {
                hasMoreContent = await scrollToLoadContent();
                if (hasMoreContent) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            } else if (paginationConfig.scrollToLoad) {
              await scrollToLoadContent();
            }

            // Extract data from current page
            const pageData = extractCurrentPageData();

            // Merge data with deduplication if enabled
            for (const [key, items] of Object.entries(pageData)) {
              if (Array.isArray(items)) {
                for (const item of items) {
                  if (options.deduplication) {
                    const itemId = createItemId(item);
                    if (!seenItems.has(itemId)) {
                      seenItems.add(itemId);
                      allResults[key].push(item);
                    }
                  } else {
                    allResults[key].push(item);
                  }
                }
              } else {
                // Handle error objects
                allResults[key] = items;
              }
            }

            // Break if infinite scroll (we've already loaded all content)
            if (paginationConfig.infiniteScroll) {
              break;
            }

            // Try to navigate to next page
            if (currentPage < paginationConfig.maxPages) {
              const nextButton = findNextButton();
              
              if (nextButton && nextButton instanceof HTMLElement) {
                // Click next button
                nextButton.click();
                
                // Wait for page to load
                await new Promise(resolve => setTimeout(resolve, paginationConfig.waitBetweenPages));
                
                // Wait for new content to appear
                let attempts = 0;
                const maxAttempts = 10;
                while (attempts < maxAttempts) {
                  const newPageData = extractCurrentPageData();
                  const hasNewData = Object.values(newPageData).some((items: any) => 
                    Array.isArray(items) && items.length > 0
                  );
                  
                  if (hasNewData) break;
                  
                  await new Promise(resolve => setTimeout(resolve, 500));
                  attempts++;
                }
              } else {
                console.log('No next button found, stopping pagination');
                break;
              }
            }

            currentPage++;
          }

          // Add metadata
          allResults._metadata = {
            totalPages: currentPage - 1,
            extractionTimestamp: new Date().toISOString(),
            totalItems: Object.values(allResults).reduce((sum: number, items: any) => {
              return sum + (Array.isArray(items) ? items.length : 0);
            }, 0),
            deduplicationEnabled: options.deduplication,
            uniqueItemsSeen: seenItems.size
          };

          return allResults;
        }, { selectors: params.selectors, paginationConfig: params.paginationConfig, options: params.options });
      });

      // Format the output based on the requested format
      let formattedOutput: string;
      
      switch (params.format) {
        case 'csv':
          formattedOutput = formatPaginatedAsCSV(allExtractedData);
          break;
        case 'text':
          formattedOutput = formatPaginatedAsText(allExtractedData);
          break;
        case 'json':
        default:
          formattedOutput = JSON.stringify(allExtractedData, null, 2);
          break;
      }

      // Generate code representation
      code.push('// Extract paginated data');
      code.push(`const maxPages = ${params.paginationConfig.maxPages};`);
      code.push('let currentPage = 1;');
      code.push('const allData = [];');
      code.push('');
      code.push('while (currentPage <= maxPages) {');
      
      for (const [key, selector] of Object.entries(params.selectors)) {
        code.push(`  const ${key} = await page.locator('${selector}').allTextContents();`);
      }
      
      code.push('  allData.push({ pageData });');
      code.push('  ');
      code.push('  // Navigate to next page');
      if (params.paginationConfig.nextButtonSelector) {
        code.push(`  await page.locator('${params.paginationConfig.nextButtonSelector}').click();`);
      } else {
        code.push('  await page.locator(\'a[aria-label="Next"]\').click();');
      }
      code.push(`  await page.waitForTimeout(${params.paginationConfig.waitBetweenPages});`);
      code.push('  currentPage++;');
      code.push('}');

      const metadata = allExtractedData._metadata || {};
      const totalItems = metadata.totalItems || 0;
      const totalPages = metadata.totalPages || 1;

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Paginated Data Extraction Complete\n\n**📊 Extraction Summary:**\n- **Total Pages Processed:** ${totalPages}\n- **Total Items Extracted:** ${totalItems}\n- **Format:** ${params.format.toUpperCase()}\n- **Deduplication:** ${params.options.deduplication ? 'Enabled' : 'Disabled'}\n\n\`\`\`${params.format === 'json' ? 'json' : 'text'}\n${formattedOutput}\n\`\`\``
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
            text: `# Paginated Extraction Error\n\nFailed to extract paginated data: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Helper function to format paginated data as CSV
function formatPaginatedAsCSV(data: any): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  // Remove metadata for CSV formatting
  const { _metadata, ...cleanData } = data;
  
  const rows: string[] = [];
  const allKeys = Object.keys(cleanData);
  
  if (allKeys.length === 0) {
    return '';
  }

  // Find the maximum length of arrays in the data
  const maxLength = Math.max(...allKeys.map(key => 
    Array.isArray(cleanData[key]) ? cleanData[key].length : 1
  ));

  // Create headers
  const headers: string[] = [];
  allKeys.forEach(key => {
    if (Array.isArray(cleanData[key]) && cleanData[key].length > 0) {
      const firstItem = cleanData[key][0];
      if (typeof firstItem === 'object' && firstItem.text !== undefined) {
        headers.push(`${key}_text`);
        if (firstItem.attributes) headers.push(`${key}_attributes`);
        if (firstItem.styles) headers.push(`${key}_styles`);
      } else {
        headers.push(key);
      }
    } else {
      headers.push(key);
    }
  });

  rows.push(headers.join(','));

  // Create data rows
  for (let i = 0; i < maxLength; i++) {
    const row = headers.map(header => {
      const baseKey = header.split('_')[0];
      const property = header.includes('_') ? header.split('_').slice(1).join('_') : null;
      
      const value = Array.isArray(cleanData[baseKey]) ? cleanData[baseKey][i] : (i === 0 ? cleanData[baseKey] : '');
      
      if (property && typeof value === 'object' && value !== null) {
        const propValue = property === 'text' ? value.text : value[property];
        return typeof propValue === 'string' ? `"${propValue.replace(/"/g, '""')}"` : String(propValue || '');
      }
      
      return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value || '');
    });
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

// Helper function to format paginated data as plain text
function formatPaginatedAsText(data: any): string {
  if (typeof data !== 'object' || data === null) {
    return String(data);
  }

  const { _metadata, ...cleanData } = data;
  const lines: string[] = [];

  if (_metadata) {
    lines.push('=== EXTRACTION METADATA ===');
    lines.push(`Total Pages: ${_metadata.totalPages}`);
    lines.push(`Total Items: ${_metadata.totalItems}`);
    lines.push(`Extraction Time: ${_metadata.extractionTimestamp}`);
    lines.push(`Deduplication: ${_metadata.deduplicationEnabled ? 'Enabled' : 'Disabled'}`);
    lines.push('');
  }

  lines.push('=== EXTRACTED DATA ===');
  for (const [key, value] of Object.entries(cleanData)) {
    lines.push(`${key.toUpperCase()}:`);
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
  extractPaginatedData,
];
