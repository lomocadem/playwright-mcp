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

interface PageStructureAnalysis {
  productContainers: {
    selector: string;
    count: number;
    confidence: number;
  }[];
  paginationElements: {
    type: 'button' | 'infinite_scroll' | 'url_pattern';
    selector?: string;
    pattern?: string;
    confidence: number;
  }[];
  dataFields: {
    name: string;
    selector: string;
    type: 'text' | 'price' | 'image' | 'link' | 'rating';
    repetitive: boolean;
    confidence: number;
  }[];
  siteCharacteristics: {
    domain: string;
    pageType: 'search_results' | 'category' | 'product_list' | 'unknown';
    estimatedTotalItems: number;
    estimatedPages: number;
    loadingPattern: 'static' | 'dynamic' | 'infinite_scroll';
  };
}

interface CrawlStrategy {
  selectors: Record<string, string>;
  paginationConfig: {
    type: 'button' | 'infinite_scroll' | 'url_pattern';
    nextButtonSelector?: string;
    maxPages: number;
    waitBetweenPages: number;
    scrollToLoad: boolean;
    infiniteScroll: boolean;
  };
  extractionOptions: {
    includeAttributes: boolean;
    includeStyles: boolean;
    cleanText: boolean;
    maxElementsPerPage: number;
    timeout: number;
    deduplication: boolean;
  };
  estimatedTokenCost: {
    analysisTokens: number;
    extractionTokens: number;
    totalTokens: number;
  };
  confidence: number;
}

const analyzePageStructureSchema = z.object({
  analysisType: z.enum(['quick', 'detailed']).default('detailed').describe('Type of analysis to perform'),
  cacheKey: z.string().optional().describe('Optional cache key to store/retrieve analysis results'),
  userRequirements: z.object({
    targetDataTypes: z.array(z.string()).default(['products', 'titles', 'prices']).describe('Types of data to extract'),
    maxPages: z.number().default(10).describe('Maximum pages to crawl'),
    prioritizeSpeed: z.boolean().default(false).describe('Prioritize speed over completeness'),
    includeImages: z.boolean().default(false).describe('Include image URLs in extraction'),
  }).default({}).describe('User requirements for the crawling strategy')
});

const planCrawlStrategySchema = z.object({
  pageAnalysisKey: z.string().describe('Key to retrieve the page analysis from cache'),
  userRequirements: z.object({
    targetDataTypes: z.array(z.string()).default(['products', 'titles', 'prices']).describe('Types of data to extract'),
    maxPages: z.number().default(10).describe('Maximum pages to crawl'),
    prioritizeSpeed: z.boolean().default(false).describe('Prioritize speed over completeness'),
    includeImages: z.boolean().default(false).describe('Include image URLs in extraction'),
    budgetTokens: z.number().optional().describe('Maximum token budget for the crawling operation'),
  }).describe('User requirements for the crawling strategy')
});

const executeIntelligentCrawlSchema = z.object({
  strategyKey: z.string().describe('Key to retrieve the crawling strategy from cache'),
  jobName: z.string().optional().describe('Optional name for the crawling job'),
  realTimeProgress: z.boolean().default(true).describe('Whether to provide real-time progress updates'),
});

// Page Structure Analysis Tool
const analyzePageStructure = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_analyze_page_structure',
    title: 'Analyze page structure for intelligent crawling',
    description: 'Analyzes the current page structure to identify product containers, pagination patterns, and data fields for optimal crawling strategy.',
    inputSchema: analyzePageStructureSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const tokenTracker = new TokenTracker();
    const dbManager = getDatabaseManager();
    
    try {
      // Generate cache key if not provided
      const url = await tab.page.url();
      const cacheKey = params.cacheKey || crypto.createHash('md5').update(url).digest('hex');
      
      // Check if analysis exists in cache
      const cachedAnalysis = await dbManager.getPageAnalysis(cacheKey);
      if (cachedAnalysis) {
        return {
          resultOverride: {
            content: [{
              type: 'text',
              text: `# Cached Page Analysis Retrieved\n\n**URL:** ${url}\n**Cache Key:** ${cacheKey}\n\n\`\`\`json\n${JSON.stringify(cachedAnalysis.analysis_result, null, 2)}\n\`\`\``
            }],
          },
          code: ['// Retrieved cached page analysis'],
          captureSnapshot: false,
          waitForNetwork: false,
        };
      }

      // Get page HTML and perform analysis
      const pageData = await callOnPageNoTrace(tab.page, async (page) => {
        return await page.evaluate(async (analysisType: string) => {
          const analysis: PageStructureAnalysis = {
            productContainers: [],
            paginationElements: [],
            dataFields: [],
            siteCharacteristics: {
              domain: window.location.hostname,
              pageType: 'unknown',
              estimatedTotalItems: 0,
              estimatedPages: 1,
              loadingPattern: 'static'
            }
          };

          // Analyze product containers
          const containerSelectors = [
            '[data-testid*="product"]',
            '[class*="product"]',
            '[class*="item"]',
            '[class*="card"]',
            '[class*="result"]',
            '.product',
            '.item',
            '.card',
            '.result',
            '[itemtype*="Product"]'
          ];

          for (const selector of containerSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 1) {
              analysis.productContainers.push({
                selector,
                count: elements.length,
                confidence: Math.min(elements.length / 10, 1) * 0.8
              });
            }
          }

          // Analyze pagination elements
          const paginationSelectors = [
            'a[aria-label*="Next"]',
            'button[aria-label*="Next"]',
            '.pagination .next',
            '.pager .next',
            '[data-testid*="next"]',
            '[class*="next"]',
            'a:contains("Next")',
            'button:contains("Next")'
          ];

          for (const selector of paginationSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              analysis.paginationElements.push({
                type: 'button',
                selector,
                confidence: 0.8
              });
            }
          }

          // Check for infinite scroll indicators
          const infiniteScrollIndicators = [
            '[class*="infinite"]',
            '[class*="lazy"]',
            '[data-testid*="load-more"]',
            '.load-more'
          ];

          for (const selector of infiniteScrollIndicators) {
            if (document.querySelector(selector)) {
              analysis.paginationElements.push({
                type: 'infinite_scroll',
                selector,
                confidence: 0.7
              });
            }
          }

          // Analyze data fields
          const dataFieldPatterns = [
            { name: 'title', selectors: ['h1', 'h2', 'h3', '[class*="title"]', '[class*="name"]'], type: 'text' as const },
            { name: 'price', selectors: ['[class*="price"]', '[data-testid*="price"]', '.price'], type: 'price' as const },
            { name: 'image', selectors: ['img[src]', '[class*="image"] img'], type: 'image' as const },
            { name: 'link', selectors: ['a[href]'], type: 'link' as const },
            { name: 'rating', selectors: ['[class*="rating"]', '[class*="star"]', '[data-testid*="rating"]'], type: 'rating' as const }
          ];

          for (const pattern of dataFieldPatterns) {
            for (const selector of pattern.selectors) {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                analysis.dataFields.push({
                  name: pattern.name,
                  selector,
                  type: pattern.type,
                  repetitive: elements.length > 1,
                  confidence: Math.min(elements.length / 5, 1) * 0.7
                });
              }
            }
          }

          // Determine page type and characteristics
          const url = window.location.href.toLowerCase();
          if (url.includes('search') || url.includes('query')) {
            analysis.siteCharacteristics.pageType = 'search_results';
          } else if (url.includes('category') || url.includes('browse')) {
            analysis.siteCharacteristics.pageType = 'category';
          } else if (analysis.productContainers.length > 0) {
            analysis.siteCharacteristics.pageType = 'product_list';
          }

          // Estimate total items and pages
          const bestContainer = analysis.productContainers.sort((a, b) => b.confidence - a.confidence)[0];
          if (bestContainer) {
            analysis.siteCharacteristics.estimatedTotalItems = bestContainer.count;
            
            // Look for total count indicators
            const countIndicators = document.querySelectorAll('[class*="total"], [class*="count"], [class*="result"]');
            for (const indicator of countIndicators) {
              const text = indicator.textContent || '';
              const match = text.match(/(\d+)/);
              if (match) {
                const count = parseInt(match[1]);
                if (count > bestContainer.count) {
                  analysis.siteCharacteristics.estimatedTotalItems = count;
                  analysis.siteCharacteristics.estimatedPages = Math.ceil(count / bestContainer.count);
                  break;
                }
              }
            }
          }

          // Detect loading pattern
          if (analysis.paginationElements.some(p => p.type === 'infinite_scroll')) {
            analysis.siteCharacteristics.loadingPattern = 'infinite_scroll';
          } else if (document.querySelector('[class*="dynamic"], [class*="ajax"], [data-testid*="dynamic"]')) {
            analysis.siteCharacteristics.loadingPattern = 'dynamic';
          }

          return {
            html: document.documentElement.outerHTML,
            analysis
          };
        }, params.analysisType);
      });

      // Store analysis in cache
      const pageAnalysis = {
        url,
        html_content: pageData.html,
        analysis_result: pageData.analysis,
        timestamp: new Date()
      };

      await dbManager.storePageAnalysis(cacheKey, pageAnalysis);

      // Track token usage
      const tokenUsage = tokenTracker.trackAction(
        { url, analysisType: params.analysisType },
        pageData.analysis
      );

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Page Structure Analysis Complete\n\n**URL:** ${url}\n**Cache Key:** ${cacheKey}\n**Analysis Type:** ${params.analysisType}\n\n## Analysis Results\n\n\`\`\`json\n${JSON.stringify(pageData.analysis, null, 2)}\n\`\`\`\n\n## Token Usage\n${tokenTracker.formatUsageReport(tokenUsage)}`
          }],
        },
        code: [
          '// Page structure analysis completed',
          `// Cache key: ${cacheKey}`,
          `// Found ${pageData.analysis.productContainers.length} product container patterns`,
          `// Found ${pageData.analysis.paginationElements.length} pagination patterns`,
          `// Estimated ${pageData.analysis.siteCharacteristics.estimatedPages} pages`
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
            text: `# Page Analysis Error\n\nFailed to analyze page structure: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Strategy Planning Tool
const planCrawlStrategy = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_plan_crawl_strategy',
    title: 'Plan intelligent crawling strategy',
    description: 'Creates an optimized crawling strategy based on page analysis and user requirements, with token cost estimation.',
    inputSchema: planCrawlStrategySchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tokenTracker = new TokenTracker();
    const dbManager = getDatabaseManager();
    
    try {
      // Retrieve page analysis
      const pageAnalysis = await dbManager.getPageAnalysis(params.pageAnalysisKey);
      if (!pageAnalysis) {
        throw new Error(`Page analysis not found for key: ${params.pageAnalysisKey}`);
      }

      const analysis = pageAnalysis.analysis_result as PageStructureAnalysis;
      
      // Generate strategy based on analysis and requirements
      const strategy: CrawlStrategy = {
        selectors: {},
        paginationConfig: {
          type: 'button',
          maxPages: params.userRequirements.maxPages,
          waitBetweenPages: params.userRequirements.prioritizeSpeed ? 1000 : 2000,
          scrollToLoad: false,
          infiniteScroll: false
        },
        extractionOptions: {
          includeAttributes: params.userRequirements.includeImages,
          includeStyles: false,
          cleanText: true,
          maxElementsPerPage: 50,
          timeout: 10000,
          deduplication: true
        },
        estimatedTokenCost: {
          analysisTokens: 0,
          extractionTokens: 0,
          totalTokens: 0
        },
        confidence: 0
      };

      // Select best selectors based on confidence and user requirements
      const bestContainer = analysis.productContainers
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestContainer) {
        strategy.selectors.products = bestContainer.selector;
      }

      // Map user requirements to data fields
      for (const dataType of params.userRequirements.targetDataTypes) {
        const matchingFields = analysis.dataFields
          .filter(field => field.name.toLowerCase().includes(dataType.toLowerCase()) || 
                          dataType.toLowerCase().includes(field.name.toLowerCase()))
          .sort((a, b) => b.confidence - a.confidence);
        
        if (matchingFields.length > 0) {
          strategy.selectors[dataType] = matchingFields[0].selector;
        }
      }

      // Configure pagination based on detected patterns
      const bestPagination = analysis.paginationElements
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestPagination) {
        strategy.paginationConfig.type = bestPagination.type;
        if (bestPagination.selector) {
          strategy.paginationConfig.nextButtonSelector = bestPagination.selector;
        }
        if (bestPagination.type === 'infinite_scroll') {
          strategy.paginationConfig.infiniteScroll = true;
          strategy.paginationConfig.scrollToLoad = true;
        }
      }

      // Estimate token costs
      const itemsPerPage = bestContainer?.count || 10;
      const totalPages = Math.min(params.userRequirements.maxPages, analysis.siteCharacteristics.estimatedPages);
      const totalItems = itemsPerPage * totalPages;
      
      strategy.estimatedTokenCost.analysisTokens = tokenTracker.estimateTokens(JSON.stringify(analysis));
      strategy.estimatedTokenCost.extractionTokens = totalItems * Object.keys(strategy.selectors).length * 10; // Rough estimate
      strategy.estimatedTokenCost.totalTokens = strategy.estimatedTokenCost.analysisTokens + strategy.estimatedTokenCost.extractionTokens;

      // Calculate confidence score
      const selectorConfidence = Object.keys(strategy.selectors).length / params.userRequirements.targetDataTypes.length;
      const paginationConfidence = bestPagination?.confidence || 0.5;
      strategy.confidence = (selectorConfidence + paginationConfidence) / 2;

      // Check budget constraints
      if (params.userRequirements.budgetTokens && 
          strategy.estimatedTokenCost.totalTokens > params.userRequirements.budgetTokens) {
        // Adjust strategy to fit budget
        const budgetRatio = params.userRequirements.budgetTokens / strategy.estimatedTokenCost.totalTokens;
        strategy.paginationConfig.maxPages = Math.floor(strategy.paginationConfig.maxPages * budgetRatio);
        strategy.extractionOptions.maxElementsPerPage = Math.floor(strategy.extractionOptions.maxElementsPerPage * budgetRatio);
        
        // Recalculate costs
        const adjustedItems = strategy.extractionOptions.maxElementsPerPage * strategy.paginationConfig.maxPages;
        strategy.estimatedTokenCost.extractionTokens = adjustedItems * Object.keys(strategy.selectors).length * 10;
        strategy.estimatedTokenCost.totalTokens = strategy.estimatedTokenCost.analysisTokens + strategy.estimatedTokenCost.extractionTokens;
      }

      // Store strategy in cache
      const strategyKey = crypto.createHash('md5').update(JSON.stringify(strategy)).digest('hex');
      await dbManager.storeCrawlStrategy(strategyKey, strategy);

      // Track token usage
      const tokenUsage = tokenTracker.trackAction(params, strategy);

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Crawling Strategy Generated\n\n**Strategy Key:** ${strategyKey}\n**Confidence Score:** ${(strategy.confidence * 100).toFixed(1)}%\n\n## Strategy Details\n\n\`\`\`json\n${JSON.stringify(strategy, null, 2)}\n\`\`\`\n\n## Cost Estimation\n- **Analysis Tokens:** ${strategy.estimatedTokenCost.analysisTokens.toLocaleString()}\n- **Extraction Tokens:** ${strategy.estimatedTokenCost.extractionTokens.toLocaleString()}\n- **Total Estimated Tokens:** ${strategy.estimatedTokenCost.totalTokens.toLocaleString()}\n\n## Token Usage\n${tokenTracker.formatUsageReport(tokenUsage)}`
          }],
        },
        code: [
          '// Crawling strategy generated',
          `// Strategy key: ${strategyKey}`,
          `// Confidence: ${(strategy.confidence * 100).toFixed(1)}%`,
          `// Estimated cost: ${strategy.estimatedTokenCost.totalTokens.toLocaleString()} tokens`,
          `// Max pages: ${strategy.paginationConfig.maxPages}`
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
            text: `# Strategy Planning Error\n\nFailed to plan crawling strategy: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Intelligent Crawl Execution Tool
const executeIntelligentCrawl = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_execute_intelligent_crawl',
    title: 'Execute intelligent crawling strategy',
    description: 'Executes a pre-planned crawling strategy with real-time progress tracking and database storage.',
    inputSchema: executeIntelligentCrawlSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const tokenTracker = new TokenTracker();
    const dbManager = getDatabaseManager();
    
    try {
      // Retrieve crawling strategy
      const strategy = await dbManager.getCrawlStrategy(params.strategyKey);
      if (!strategy) {
        throw new Error(`Crawling strategy not found for key: ${params.strategyKey}`);
      }

      const crawlStrategy = strategy as CrawlStrategy;
      const url = await tab.page.url();
      
      // Create crawl job in database
      const jobId = await dbManager.createCrawlJob({
        url,
        strategy_hash: params.strategyKey,
        status: 'running',
        total_pages: 0,
        total_items: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      });

      let totalItems = 0;
      let totalPages = 0;
      let currentPage = 1;
      const allResults: any[] = [];

      // Execute crawling strategy
      const crawlResults = await callOnPageNoTrace(tab.page, async (page) => {
        return await page.evaluate(async (strategy: CrawlStrategy) => {
          const results: any[] = [];
          let currentPageNum = 1;
          let totalExtractedItems = 0;

          // Helper function to extract data from current page
          const extractCurrentPageData = () => {
            const pageResults: any = {};
            
            for (const [key, selector] of Object.entries(strategy.selectors)) {
              try {
                const elements = document.querySelectorAll(selector);
                const extractedElements = Array.from(elements)
                  .slice(0, strategy.extractionOptions.maxElementsPerPage)
                  .map(el => {
                    if (strategy.extractionOptions.includeAttributes) {
                      const data: any = {
                        text: strategy.extractionOptions.cleanText ? 
                          (el.textContent || '').trim().replace(/\s+/g, ' ') : 
                          el.textContent
                      };
                      
                      data.attributes = {};
                      for (let i = 0; i < el.attributes.length; i++) {
                        const attr = el.attributes[i];
                        data.attributes[attr.name] = attr.value;
                      }
                      
                      return data;
                    } else {
                      return strategy.extractionOptions.cleanText ? 
                        (el.textContent || '').trim().replace(/\s+/g, ' ') : 
                        el.textContent;
                    }
                  })
                  .filter(item => item && (typeof item === 'string' ? item !== '' : item.text !== ''));

                pageResults[key] = extractedElements;
                totalExtractedItems += extractedElements.length;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                pageResults[key] = { error: `Failed to extract with selector "${selector}": ${errorMessage}` };
              }
            }
            
            return pageResults;
          };

          // Helper function to find next button
          const findNextButton = (): Element | null => {
            if (strategy.paginationConfig.nextButtonSelector) {
              return document.querySelector(strategy.paginationConfig.nextButtonSelector);
            }

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

          // Main crawling loop
          while (currentPageNum <= strategy.paginationConfig.maxPages) {
            console.log(`Extracting data from page ${currentPageNum}...`);

            // Handle infinite scroll
            if (strategy.paginationConfig.infiniteScroll) {
              let hasMoreContent = true;
              while (hasMoreContent && currentPageNum <= strategy.paginationConfig.maxPages) {
                if (strategy.paginationConfig.scrollToLoad) {
                  const initialHeight = document.body.scrollHeight;
                  window.scrollTo(0, document.body.scrollHeight);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const newHeight = document.body.scrollHeight;
                  hasMoreContent = newHeight > initialHeight;
                }
                
                if (hasMoreContent) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            } else if (strategy.paginationConfig.scrollToLoad) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Extract data from current page
            const pageData = extractCurrentPageData();
            results.push({
              page: currentPageNum,
              data: pageData,
              timestamp: new Date().toISOString()
            });

            // Break if infinite scroll (we've loaded all content)
            if (strategy.paginationConfig.infiniteScroll) {
              break;
            }

            // Try to navigate to next page
            if (currentPageNum < strategy.paginationConfig.maxPages) {
              const nextButton = findNextButton();
              
              if (nextButton && nextButton instanceof HTMLElement) {
                nextButton.click();
                await new Promise(resolve => setTimeout(resolve, strategy.paginationConfig.waitBetweenPages));
                
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

            currentPageNum++;
          }

          return {
            results,
            totalPages: currentPageNum - 1,
            totalItems: totalExtractedItems
          };
        }, crawlStrategy);
      });

      // Store results in database
      for (const pageResult of crawlResults.results) {
        await dbManager.storeCrawlResult({
          job_id: jobId,
          page_number: pageResult.page,
          extracted_data: pageResult.data,
          metadata: {
            timestamp: pageResult.timestamp,
            strategy_key: params.strategyKey,
            job_name: params.jobName
          }
        });
      }

      // Update job status
      const tokenUsage = tokenTracker.trackAction(
        { strategyKey: params.strategyKey, jobName: params.jobName },
        crawlResults
      );

      await dbManager.updateCrawlJob(jobId, {
        status: 'completed',
        completed_at: new Date(),
        total_pages: crawlResults.totalPages,
        total_items: crawlResults.totalItems,
        input_tokens: tokenUsage.inputTokens,
        output_tokens: tokenUsage.outputTokens,
        total_tokens: tokenUsage.totalTokens
      });

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Intelligent Crawl Completed\n\n**Job ID:** ${jobId}\n**Job Name:** ${params.jobName || 'Unnamed'}\n**Strategy Key:** ${params.strategyKey}\n\n## Results Summary\n- **Total Pages Crawled:** ${crawlResults.totalPages}\n- **Total Items Extracted:** ${crawlResults.totalItems}\n- **Data Stored in PostgreSQL:** ✅\n\n## Sample Data\n\n\`\`\`json\n${JSON.stringify(crawlResults.results.slice(0, 2), null, 2)}\n\`\`\`\n\n## Token Usage\n${tokenTracker.formatUsageReport(tokenUsage)}`
          }],
        },
        code: [
          '// Intelligent crawl execution completed',
          `// Job ID: ${jobId}`,
          `// Pages crawled: ${crawlResults.totalPages}`,
          `// Items extracted: ${crawlResults.totalItems}`,
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
            text: `# Crawl Execution Error\n\nFailed to execute intelligent crawl: ${errorMessage}`
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
  analyzePageStructure,
  planCrawlStrategy,
  executeIntelligentCrawl,
];
