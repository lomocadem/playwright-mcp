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
import fs from 'fs';
import path from 'path';
import { defineTool } from './tool.js';
import { getDatabaseManager, CrawlJob } from '../database.js';
import { outputFile } from '../config.js';

const getCrawlResultsSchema = z.object({
  jobId: z.number().describe('The job ID to retrieve results for'),
  limit: z.number().default(100).describe('Maximum number of items to return'),
  offset: z.number().default(0).describe('Number of items to skip (for pagination)'),
  format: z.enum(['json', 'summary']).default('summary').describe('Return format - summary for overview, json for full data')
});

const exportCrawlDataSchema = z.object({
  jobId: z.number().describe('The job ID to export data for'),
  format: z.enum(['json', 'csv', 'txt']).default('json').describe('Export format'),
  filename: z.string().optional().describe('Optional filename for the export')
});

const listCrawlJobsSchema = z.object({
  limit: z.number().default(20).describe('Maximum number of jobs to return'),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'all']).default('all').describe('Filter by job status'),
  sortBy: z.enum(['created_at', 'completed_at', 'total_items']).default('created_at').describe('Sort jobs by field'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort order')
});

// Get Crawl Results Tool
const getCrawlResults = defineTool({
  capability: 'core',
  schema: {
    name: 'get_crawl_results',
    title: 'Get crawl results from database',
    description: 'Retrieve extracted data from a specific crawl job stored in the database.',
    inputSchema: getCrawlResultsSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const dbManager = getDatabaseManager();
    
    try {
      // Get job information
      const job = await dbManager.getCrawlJob(params.jobId);
      if (!job) {
        throw new Error(`Job with ID ${params.jobId} not found`);
      }

      // Get crawl results
      const results = await dbManager.getCrawlResults(params.jobId);
      
      if (params.format === 'summary') {
        // Return summary format
        const totalItems = results.reduce((sum, result) => {
          const data = result.extracted_data;
          let itemCount = 0;
          for (const value of Object.values(data)) {
            if (Array.isArray(value)) {
              itemCount += value.length;
            } else if (value && typeof value === 'string' && value !== '') {
              itemCount += 1;
            } else if (value && typeof value === 'object' && !(value as any).error) {
              itemCount += 1;
            }
          }
          return sum + itemCount;
        }, 0);

        // Sample data from first result
        const sampleData = results.length > 0 ? results[0].extracted_data : {};
        const samplePreview: any = {};
        for (const [key, value] of Object.entries(sampleData)) {
          if (Array.isArray(value)) {
            samplePreview[key] = value.slice(0, 2); // Show first 2 items
            if (value.length > 2) {
              samplePreview[key].push(`... and ${value.length - 2} more items`);
            }
          } else {
            samplePreview[key] = value;
          }
        }

        return {
          resultOverride: {
            content: [{
              type: 'text',
              text: `# Crawl Results Summary

**Job ID:** ${params.jobId}
**Job Status:** ${job.status}
**URL:** ${job.url}
**Created:** ${job.created_at}
**Completed:** ${job.completed_at || 'N/A'}

## Results Overview
- **Total Pages:** ${job.total_pages}
- **Total Items:** ${totalItems.toLocaleString()}
- **Results Pages:** ${results.length}
- **Token Usage:** ${job.total_tokens?.toLocaleString() || 'N/A'} tokens

## Data Fields Available
${Object.keys(sampleData).map(key => `- **${key}**`).join('\n')}

## Sample Data Preview
\`\`\`json
${JSON.stringify(samplePreview, null, 2)}
\`\`\`

## Access Full Data
- Use \`get_crawl_results(${params.jobId}, format="json")\` for complete data
- Use \`export_crawl_data(${params.jobId}, format="csv")\` to export as CSV
- Use \`export_crawl_data(${params.jobId}, format="json")\` to export as JSON file`
            }],
          },
          code: [
            `// Retrieved crawl results summary for job ${params.jobId}`,
            `// Total items: ${totalItems}`,
            `// Pages: ${results.length}`
          ],
          captureSnapshot: false,
          waitForNetwork: false,
        };
      } else {
        // Return full JSON data (paginated)
        const paginatedResults = results.slice(params.offset, params.offset + params.limit);
        
        return {
          resultOverride: {
            content: [{
              type: 'text',
              text: `# Crawl Results Data (Job ${params.jobId})

**Showing:** ${params.offset + 1}-${Math.min(params.offset + params.limit, results.length)} of ${results.length} pages

\`\`\`json
${JSON.stringify(paginatedResults, null, 2)}
\`\`\`

${results.length > params.limit ? `\n**Note:** Use offset parameter to get more results. Total pages available: ${results.length}` : ''}`
            }],
          },
          code: [
            `// Retrieved ${paginatedResults.length} pages of crawl results`,
            `// Job ID: ${params.jobId}`,
            `// Offset: ${params.offset}, Limit: ${params.limit}`
          ],
          captureSnapshot: false,
          waitForNetwork: false,
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Error Retrieving Crawl Results\n\nFailed to retrieve results for job ${params.jobId}: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Export Crawl Data Tool
const exportCrawlData = defineTool({
  capability: 'core',
  schema: {
    name: 'export_crawl_data',
    title: 'Export crawl data to file',
    description: 'Export extracted data from a crawl job to a file in various formats.',
    inputSchema: exportCrawlDataSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const dbManager = getDatabaseManager();
    
    try {
      // Get job information
      const job = await dbManager.getCrawlJob(params.jobId);
      if (!job) {
        throw new Error(`Job with ID ${params.jobId} not found`);
      }

      // Get crawl results
      const results = await dbManager.getCrawlResults(params.jobId);
      
      // Generate filename with better naming
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jobUrl = new URL(job.url);
      const siteName = jobUrl.hostname.replace(/^www\./, '');
      const defaultFilename = `${siteName}_job${params.jobId}_${timestamp}.${params.format}`;
      const filename = params.filename || defaultFilename;
      
      let exportData: string;
      let totalItems = 0;

      switch (params.format) {
        case 'json':
          exportData = JSON.stringify({
            job: {
              id: job.id,
              url: job.url,
              status: job.status,
              created_at: job.created_at,
              completed_at: job.completed_at,
              total_pages: job.total_pages,
              total_items: job.total_items
            },
            results: results
          }, null, 2);
          totalItems = job.total_items || 0;
          break;

        case 'csv':
          // Flatten all data into CSV format
          const csvRows: string[] = [];
          const headers = new Set<string>();
          
          // Collect all possible headers
          results.forEach(result => {
            const data = result.extracted_data;
            Object.keys(data).forEach(key => headers.add(key));
          });
          
          const headerArray = Array.from(headers);
          csvRows.push(['page', 'item_index', ...headerArray].join(','));
          
          results.forEach(result => {
            const data = result.extracted_data;
            const maxItems = Math.max(...headerArray.map(key => 
              Array.isArray(data[key]) ? data[key].length : 1
            ));
            
            for (let i = 0; i < maxItems; i++) {
              const row = [
                result.page_number.toString(),
                i.toString(),
                ...headerArray.map(key => {
                  const value = Array.isArray(data[key]) ? data[key][i] : (i === 0 ? data[key] : '');
                  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value || '');
                  return `"${stringValue.replace(/"/g, '""')}"`;
                })
              ];
              csvRows.push(row.join(','));
              totalItems++;
            }
          });
          
          exportData = csvRows.join('\n');
          break;

        case 'txt':
          const txtLines: string[] = [];
          txtLines.push(`Crawl Job Export - Job ID: ${params.jobId}`);
          txtLines.push(`URL: ${job.url}`);
          txtLines.push(`Status: ${job.status}`);
          txtLines.push(`Created: ${job.created_at}`);
          txtLines.push(`Completed: ${job.completed_at || 'N/A'}`);
          txtLines.push(`Total Pages: ${job.total_pages}`);
          txtLines.push(`Total Items: ${job.total_items}`);
          txtLines.push('');
          txtLines.push('='.repeat(80));
          txtLines.push('');

          results.forEach(result => {
            txtLines.push(`Page ${result.page_number}:`);
            txtLines.push('-'.repeat(40));
            
            const data = result.extracted_data;
            for (const [key, value] of Object.entries(data)) {
              txtLines.push(`${key}:`);
              if (Array.isArray(value)) {
                value.forEach((item, index) => {
                  txtLines.push(`  ${index + 1}. ${typeof item === 'object' ? JSON.stringify(item) : item}`);
                  totalItems++;
                });
              } else {
                txtLines.push(`  ${typeof value === 'object' ? JSON.stringify(value) : value}`);
                if (value && typeof value === 'string' && value !== '') totalItems++;
              }
              txtLines.push('');
            }
            txtLines.push('');
          });
          
          exportData = txtLines.join('\n');
          break;

        default:
          throw new Error(`Unsupported export format: ${params.format}`);
      }

      // Save to file
      const filePath = await outputFile(context.config, filename);
      await fs.promises.writeFile(filePath, exportData, 'utf8');

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Data Export Completed ✅

**Job ID:** ${params.jobId}
**Export Format:** ${params.format.toUpperCase()}
**File:** ${filename}
**File Path:** ${filePath}

## Export Summary
- **Total Items Exported:** ${totalItems.toLocaleString()}
- **Pages Exported:** ${results.length}
- **File Size:** ${(exportData.length / 1024).toFixed(2)} KB

## File Contents
The exported file contains:
- Job metadata (ID, URL, status, timestamps)
- All extracted data from ${results.length} pages
- ${totalItems.toLocaleString()} individual data items

**File saved to:** \`${filePath}\``
          }],
        },
        code: [
          `// Exported crawl data to ${filename}`,
          `// Format: ${params.format}`,
          `// Items: ${totalItems}`,
          `// File: ${filePath}`
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
            text: `# Export Error\n\nFailed to export data for job ${params.jobId}: ${errorMessage}`
          }],
        },
        code: [`// Error: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// List Crawl Jobs Tool
const listCrawlJobs = defineTool({
  capability: 'core',
  schema: {
    name: 'list_crawl_jobs',
    title: 'List crawl jobs',
    description: 'List all crawl jobs with filtering and sorting options.',
    inputSchema: listCrawlJobsSchema,
    type: 'readOnly',
  },

  handle: async (context, params) => {
    const dbManager = getDatabaseManager();
    
    try {
      // Get crawl jobs with filtering
      const jobs = await dbManager.getCrawlJobs(params);

      if (jobs.length === 0) {
        return {
          resultOverride: {
            content: [{
              type: 'text',
              text: `# No Crawl Jobs Found\n\nNo crawl jobs found matching the specified criteria.`
            }],
          },
          code: ['// No crawl jobs found'],
          captureSnapshot: false,
          waitForNetwork: false,
        };
      }

      const jobsList = jobs.map((job: CrawlJob) => ({
        id: job.id,
        url: job.url,
        status: job.status,
        created_at: job.created_at,
        completed_at: job.completed_at,
        total_pages: job.total_pages,
        total_items: job.total_items,
        total_tokens: job.total_tokens
      }));

      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Crawl Jobs List

**Found:** ${jobs.length} jobs
**Filter:** ${params.status === 'all' ? 'All statuses' : params.status}
**Sort:** ${params.sortBy} (${params.sortOrder})

## Jobs

${jobsList.map((job: any) => `### Job ${job.id}
- **URL:** ${job.url}
- **Status:** ${job.status}
- **Created:** ${job.created_at}
- **Completed:** ${job.completed_at || 'N/A'}
- **Pages:** ${job.total_pages || 0}
- **Items:** ${job.total_items?.toLocaleString() || 0}
- **Tokens:** ${job.total_tokens?.toLocaleString() || 'N/A'}

**Actions:** \`get_crawl_results(${job.id})\` | \`export_crawl_data(${job.id})\`
`).join('\n')}

## Quick Actions
- View results: \`get_crawl_results(job_id)\`
- Export data: \`export_crawl_data(job_id, format="csv")\`
- Get job details: \`get_crawl_results(job_id, format="summary")\``
          }],
        },
        code: [
          `// Listed ${jobs.length} crawl jobs`,
          `// Filter: ${params.status}`,
          `// Sort: ${params.sortBy} ${params.sortOrder}`
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
            text: `# Error Listing Jobs\n\nFailed to list crawl jobs: ${errorMessage}`
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
  getCrawlResults,
  exportCrawlData,
  listCrawlJobs,
];
