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
  jobName: z.string().optional().describe('Optional name for the extraction job'),
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
    description: 'Extract data from multiple pages by automatically handling pagination. Data is saved to database and only job summary is returned to prevent conversation bloat.',
    inputSchema: extractPaginatedDataSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const tokenTracker = new TokenTracker();
    const dbManager = getDatabaseManager();
    const code: string[] = [];
    
    try {
      const url = await tab.page.url();
      
      // Create extraction job
      const strategyHash = crypto.createHash('md5').update(JSON.stringify({
        selectors: params.selectors,
        paginationConfig: params.paginationConfig,
        options: params.options
      })).digest('hex');

      const jobId = await dbManager.createCrawlJob({
        url,
        strategy_hash: strategyHash,
        status: 'running',
        total_pages: 0,
        total_items: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      });

      const allExtractedData = await callOnPageNoTrace(tab.page, async (page) => {
        return await page.evaluate(async (paginationParams: PaginationParams) => {
          const { selectors, paginationConfig, options } = paginationParams;
          const allPageResults: any[] = [];
          let currentPage = 1;
          const seenItems = new Set<string>();
          let totalItems = 0;

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
                  .filter(item => item && (typeof item === 'string' ? item !== '' : item.text !== ''));

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
              'button[aria-label="Next"]',
              '.s-pagination-next',
              '.pagnNext',
              '.next',
              '[data-testid="pagination-next"]',
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
            
            // Count items on this page
            let pageItemCount = 0;
            const processedPageData: any = {};
            
            for (const [key, items] of Object.entries(pageData)) {
              if (Array.isArray(items)) {
                const filteredItems = [];
                for (const item of items) {
                  if (options.deduplication) {
                    const itemId = createItemId(item);
                    if (!seenItems.has(itemId)) {
                      seenItems.add(itemId);
                      filteredItems.push(item);
                      pageItemCount++;
                    }
                  } else {
                    filteredItems.push(item);
                    pageItemCount++;
                  }
                }
                processedPageData[key] = filteredItems;
              } else {
                processedPageData[key] = items;
              }
            }

            // Store page results
            allPageResults.push({
              page: currentPage,
              data: processedPageData,
              itemCount: pageItemCount,
              timestamp: new Date().toISOString()
            });

            totalItems += pageItemCount;

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

          return {
            pageResults: allPageResults,
            totalPages: currentPage - 1,
            totalItems,
            uniqueItemsSeen: seenItems.size,
            deduplicationEnabled: options.deduplication
          };
        }, { selectors: params.selectors, paginationConfig: params.paginationConfig, options: params.options });
      });

      // Store each page's results in the database
      for (const pageResult of allExtractedData.pageResults) {
        await dbManager.storeCrawlResult({
          job_id: jobId,
          page_number: pageResult.page,
          extracted_data: pageResult.data,
          metadata: {
            url,
            timestamp: pageResult.timestamp,
            job_name: params.jobName,
            item_count: pageResult.itemCount,
            selectors: params.selectors,
            pagination_config: params.paginationConfig,
            options: params.options
          }
        });
      }

      // Track token usage
      const tokenUsage = tokenTracker.trackAction(params, {
        summary: `Extracted ${allExtractedData.totalItems} items from ${allExtractedData.totalPages} pages`
      });

      // Update job status
      await dbManager.updateCrawlJob(jobId, {
        status: 'completed',
        completed_at: new Date(),
        total_pages: allExtractedData.totalPages,
        total_items: allExtractedData.totalItems,
        input_tokens: tokenUsage.inputTokens,
        output_tokens: tokenUsage.outputTokens,
        total_tokens: tokenUsage.totalTokens
      });

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

      // Count items by field
      const itemCounts: Record<string, number> = {};
      for (const pageResult of allExtractedData.pageResults) {
        for (const [key, items] of Object.entries(pageResult.data)) {
          if (Array.isArray(items)) {
            itemCounts[key] = (itemCounts[key] || 0) + items.length;
          }
        }
      }

      // Create sample data for preview (first few items from first page)
      const sampleData: any = {};
      if (allExtractedData.pageResults.length > 0) {
        const firstPageData = allExtractedData.pageResults[0].data;
        for (const [key, value] of Object.entries(firstPageData)) {
          if (Array.isArray(value)) {
            sampleData[key] = value.slice(0, 3); // Show first 3 items
            if (value.length > 3) {
              sampleData[key].push(`... and ${value.length - 3} more items from this page`);
            }
          } else {
            sampleData[key] = value;
          }
        }
      }

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Paginated Data Extraction Job Completed ✅

**Job ID:** ${jobId}
**Job Name:** ${params.jobName || 'Unnamed Pagination Job'}
**URL:** ${url}
**Status:** Completed

## Extraction Summary
- **Total Pages Processed:** ${allExtractedData.totalPages}
- **Total Items Extracted:** ${allExtractedData.totalItems.toLocaleString()}
- **Data Fields:** ${Object.keys(params.selectors).length}
- **Deduplication:** ${allExtractedData.deduplicationEnabled ? 'Enabled' : 'Disabled'}
- **Unique Items:** ${allExtractedData.uniqueItemsSeen.toLocaleString()}
- **Storage:** PostgreSQL Database

## Item Breakdown by Field
${Object.entries(itemCounts).map(([key, count]) => `- **${key}:** ${count.toLocaleString()} items`).join('\n')}

## Pagination Configuration
- **Max Pages:** ${params.paginationConfig.maxPages}
- **Wait Between Pages:** ${params.paginationConfig.waitBetweenPages}ms
- **Scroll to Load:** ${params.paginationConfig.scrollToLoad ? 'Yes' : 'No'}
- **Infinite Scroll:** ${params.paginationConfig.infiniteScroll ? 'Yes' : 'No'}

## Sample Data Preview (Page 1)
\`\`\`json
${JSON.stringify(sampleData, null, 2)}
\`\`\`

## Data Access
- **Full data stored in database** - Use \`get_crawl_results(${jobId})\` to retrieve
- **Export options available** - Use \`export_crawl_data(${jobId}, format="csv")\` to export

## Token Usage
${tokenTracker.formatUsageReport(tokenUsage)}

*Note: Full paginated data saved to database to prevent conversation bloat. This summary uses minimal tokens while preserving all extracted data.*`
          }],
        },
        code: [
          ...code,
          `// Paginated data extraction completed`,
          `// Job ID: ${jobId}`,
          `// Pages processed: ${allExtractedData.totalPages}`,
          `// Total items: ${allExtractedData.totalItems}`,
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

export default [
  extractPaginatedData,
];
