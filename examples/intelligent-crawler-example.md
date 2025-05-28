# Intelligent Crawler Example

This example demonstrates how to use the new intelligent crawler system to automatically analyze and extract data from e-commerce product listings.

## Prerequisites

1. **Database Setup**: Ensure Redis and PostgreSQL are running
2. **Environment Variables**: Set database connection details
3. **MCP Server**: Start the Playwright MCP server

```bash
# Set environment variables
export REDIS_HOST=localhost
export REDIS_PORT=6379
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=playwright_mcp
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password

# Start the MCP server
npm run build
node cli.js --vision --show-tokens
```

## Example Workflow

### Step 1: Navigate to Product Listing

First, navigate to a product listing page (e.g., Amazon search results, eBay listings, etc.):

```json
{
  "tool": "browser_navigate",
  "parameters": {
    "url": "https://www.amazon.com/s?k=laptops"
  }
}
```

### Step 2: Analyze Page Structure

Analyze the page structure to understand how products are organized:

```json
{
  "tool": "browser_analyze_page_structure",
  "parameters": {
    "analysisType": "detailed",
    "userRequirements": {
      "targetDataTypes": ["products", "titles", "prices", "ratings", "images"],
      "maxPages": 5,
      "includeImages": true
    }
  }
}
```

**Expected Output:**
```json
{
  "cacheKey": "a1b2c3d4e5f6",
  "analysis": {
    "productContainers": [
      {
        "selector": "[data-component-type='s-search-result']",
        "count": 16,
        "confidence": 0.8
      }
    ],
    "paginationElements": [
      {
        "type": "button",
        "selector": "a[aria-label='Next']",
        "confidence": 0.8
      }
    ],
    "dataFields": [
      {
        "name": "title",
        "selector": "h2 a span",
        "type": "text",
        "confidence": 0.7
      },
      {
        "name": "price",
        "selector": ".a-price-whole",
        "type": "price",
        "confidence": 0.8
      }
    ]
  }
}
```

### Step 3: Plan Crawling Strategy

Create an optimized crawling strategy based on the analysis:

```json
{
  "tool": "browser_plan_crawl_strategy",
  "parameters": {
    "pageAnalysisKey": "a1b2c3d4e5f6",
    "userRequirements": {
      "targetDataTypes": ["products", "titles", "prices", "ratings"],
      "maxPages": 3,
      "prioritizeSpeed": false,
      "budgetTokens": 50000
    }
  }
}
```

**Expected Output:**
```json
{
  "strategyKey": "x7y8z9a1b2c3",
  "confidence": 0.75,
  "strategy": {
    "selectors": {
      "products": "[data-component-type='s-search-result']",
      "titles": "h2 a span",
      "prices": ".a-price-whole"
    },
    "paginationConfig": {
      "type": "button",
      "nextButtonSelector": "a[aria-label='Next']",
      "maxPages": 3,
      "waitBetweenPages": 2000
    },
    "estimatedTokenCost": {
      "totalTokens": 15000
    }
  }
}
```

### Step 4: Execute Intelligent Crawl

Execute the planned crawling strategy:

```json
{
  "tool": "browser_execute_intelligent_crawl",
  "parameters": {
    "strategyKey": "x7y8z9a1b2c3",
    "jobName": "Amazon Laptop Search - Market Research",
    "realTimeProgress": true
  }
}
```

**Expected Output:**
```json
{
  "jobId": 42,
  "totalPages": 3,
  "totalItems": 48,
  "sampleData": [
    {
      "page": 1,
      "data": {
        "products": [
          "ASUS VivoBook 15",
          "HP Pavilion Gaming",
          "Lenovo ThinkPad"
        ],
        "titles": [
          "ASUS VivoBook 15 Thin and Light Laptop",
          "HP Pavilion Gaming Laptop 15.6\"",
          "Lenovo ThinkPad E15 Business Laptop"
        ],
        "prices": [
          "$599.99",
          "$749.99",
          "$899.99"
        ]
      }
    }
  ]
}
```

## Advanced Examples

### Example 1: Budget-Constrained Crawling

When working with token budgets, the system automatically adjusts the strategy:

```json
{
  "tool": "browser_plan_crawl_strategy",
  "parameters": {
    "pageAnalysisKey": "a1b2c3d4e5f6",
    "userRequirements": {
      "targetDataTypes": ["products", "titles", "prices"],
      "maxPages": 10,
      "budgetTokens": 20000
    }
  }
}
```

The system will automatically reduce `maxPages` to fit within the budget.

### Example 2: Speed-Optimized Crawling

For quick data collection:

```json
{
  "tool": "browser_analyze_page_structure",
  "parameters": {
    "analysisType": "quick",
    "userRequirements": {
      "targetDataTypes": ["titles", "prices"],
      "maxPages": 2,
      "prioritizeSpeed": true
    }
  }
}
```

### Example 3: Image-Heavy Extraction

For collecting product images:

```json
{
  "tool": "browser_analyze_page_structure",
  "parameters": {
    "userRequirements": {
      "targetDataTypes": ["products", "titles", "prices", "images"],
      "includeImages": true,
      "maxPages": 3
    }
  }
}
```

## Data Retrieval

After crawling, data is stored in PostgreSQL. You can query it using standard SQL:

```sql
-- Get all results for a job
SELECT 
    page_number,
    extracted_data,
    metadata
FROM crawl_results 
WHERE job_id = 42
ORDER BY page_number;

-- Get specific product data
SELECT 
    extracted_data->>'titles' as titles,
    extracted_data->>'prices' as prices
FROM crawl_results 
WHERE job_id = 42;

-- Get job statistics
SELECT 
    url,
    total_pages,
    total_items,
    total_tokens,
    completed_at - created_at as duration
FROM crawl_jobs 
WHERE id = 42;
```

## Error Handling Examples

### Database Connection Issues

If Redis or PostgreSQL are unavailable:

```json
{
  "error": "Database connection failed",
  "message": "Intelligent crawling features will not be available",
  "fallback": "Use standard extraction tools instead"
}
```

### Low Confidence Analysis

If page analysis has low confidence:

```json
{
  "warning": "Low confidence analysis",
  "confidence": 0.3,
  "recommendation": "Try manual selector specification or different target data types"
}
```

### Token Budget Exceeded

If the estimated cost exceeds budget:

```json
{
  "strategy": {
    "adjustments": {
      "originalMaxPages": 10,
      "adjustedMaxPages": 6,
      "reason": "Budget constraint: 50000 tokens"
    }
  }
}
```

## Performance Tips

1. **Use Caching**: Reuse analysis results for similar pages
2. **Set Realistic Budgets**: Start with smaller token budgets for testing
3. **Monitor Progress**: Use real-time progress tracking for large jobs
4. **Optimize Selectors**: Review confidence scores and adjust if needed
5. **Database Indexing**: Create indexes on frequently queried JSONB fields

## Integration with Existing Tools

The intelligent crawler works alongside existing Playwright MCP tools:

```json
// Navigate and take screenshot first
{"tool": "browser_navigate", "parameters": {"url": "https://example.com/products"}}
{"tool": "browser_screenshot", "parameters": {}}

// Then use intelligent crawler
{"tool": "browser_analyze_page_structure", "parameters": {...}}
{"tool": "browser_plan_crawl_strategy", "parameters": {...}}
{"tool": "browser_execute_intelligent_crawl", "parameters": {...}}

// Continue with other tools if needed
{"tool": "browser_extract_data", "parameters": {...}}
```

This intelligent crawler system provides a powerful, AI-driven approach to web data extraction that automatically adapts to different site structures while optimizing for performance and cost efficiency.
