# Pagination Extraction Guide

This guide demonstrates how to use the new `browser_extract_paginated_data` tool to extract data from multiple pages automatically, solving the common problem of only getting limited results from single-page extractions.

## Overview

The `browser_extract_paginated_data` tool extends the basic extraction capabilities by:

- **Automatic Pagination**: Detects and navigates through multiple pages
- **Smart Button Detection**: Finds "Next" buttons using multiple strategies
- **Infinite Scroll Support**: Handles sites with infinite scroll pagination
- **Deduplication**: Removes duplicate entries across pages
- **Multiple Formats**: Outputs in JSON, CSV, or plain text
- **Progress Tracking**: Provides detailed metadata about the extraction process

## Basic Usage

### Amazon Product Extraction (Button-based Pagination)

```json
{
  "name": "browser_extract_paginated_data",
  "arguments": {
    "selectors": {
      "productTitles": "[data-component-type=\"s-search-result\"] h2 a span",
      "prices": "[data-component-type=\"s-search-result\"] .a-price-whole",
      "ratings": "[data-component-type=\"s-search-result\"] .a-icon-alt",
      "images": "[data-component-type=\"s-search-result\"] img"
    },
    "paginationConfig": {
      "nextButtonSelector": ".s-pagination-next",
      "maxPages": 5,
      "waitBetweenPages": 3000,
      "scrollToLoad": true
    },
    "format": "json",
    "options": {
      "includeAttributes": true,
      "cleanText": true,
      "maxElementsPerPage": 20,
      "deduplication": true
    }
  }
}
```

### E-commerce Site with Generic Pagination

```json
{
  "name": "browser_extract_paginated_data",
  "arguments": {
    "selectors": {
      "products": ".product-item .product-name",
      "prices": ".product-item .price",
      "availability": ".product-item .stock-status"
    },
    "paginationConfig": {
      "maxPages": 10,
      "waitBetweenPages": 2000,
      "scrollToLoad": false
    },
    "format": "csv"
  }
}
```

## Advanced Pagination Strategies

### 1. Infinite Scroll Sites

For sites that load content as you scroll (like social media feeds):

```json
{
  "name": "browser_extract_paginated_data",
  "arguments": {
    "selectors": {
      "posts": ".post-content",
      "authors": ".post-author",
      "timestamps": ".post-time"
    },
    "paginationConfig": {
      "infiniteScroll": true,
      "maxPages": 1,
      "waitBetweenPages": 1000,
      "scrollToLoad": true
    },
    "options": {
      "maxElementsPerPage": 100,
      "deduplication": true
    }
  }
}
```

### 2. Custom Next Button Selectors

When the automatic detection doesn't work:

```json
{
  "paginationConfig": {
    "nextButtonSelector": "button[aria-label='Go to next page']",
    "maxPages": 3,
    "waitBetweenPages": 2000
  }
}
```

### 3. Sites with Lazy Loading

For sites that load content as you scroll down each page:

```json
{
  "paginationConfig": {
    "nextButtonSelector": ".pagination-next",
    "maxPages": 5,
    "waitBetweenPages": 3000,
    "scrollToLoad": true
  }
}
```

## Configuration Options

### Pagination Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nextButtonSelector` | string | auto-detect | CSS selector for the next page button |
| `pageNumberSelector` | string | optional | CSS selector for page number elements |
| `maxPages` | number | 5 | Maximum number of pages to scrape |
| `waitBetweenPages` | number | 2000 | Wait time between page navigations (ms) |
| `scrollToLoad` | boolean | false | Scroll to bottom before extracting data |
| `infiniteScroll` | boolean | false | Handle infinite scroll pagination |

### Extraction Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeAttributes` | boolean | false | Include element attributes (href, src, etc.) |
| `includeStyles` | boolean | false | Include computed styles |
| `cleanText` | boolean | true | Clean and trim extracted text |
| `maxElementsPerPage` | number | 50 | Maximum elements to extract per page |
| `timeout` | number | 10000 | Timeout for each page load (ms) |
| `deduplication` | boolean | true | Remove duplicate entries across pages |

## Output Formats

### JSON Format (Default)

```json
{
  "productTitles": [
    "Robot Toy 1",
    "Robot Toy 2",
    "..."
  ],
  "prices": [
    "$29.99",
    "$49.99",
    "..."
  ],
  "_metadata": {
    "totalPages": 3,
    "totalItems": 45,
    "extractionTimestamp": "2025-01-15T10:30:00.000Z",
    "deduplicationEnabled": true,
    "uniqueItemsSeen": 45
  }
}
```

### CSV Format

```csv
"productTitles","prices"
"Robot Toy 1","$29.99"
"Robot Toy 2","$49.99"
"Robot Toy 3","$79.99"
```

### Text Format

```
=== EXTRACTION METADATA ===
Total Pages: 3
Total Items: 45
Extraction Time: 2025-01-15T10:30:00.000Z
Deduplication: Enabled

=== EXTRACTED DATA ===
PRODUCTTITLES:
  1. Robot Toy 1
  2. Robot Toy 2
  3. Robot Toy 3

PRICES:
  1. $29.99
  2. $49.99
  3. $79.99
```

## Common Use Cases

### 1. E-commerce Product Scraping

Extract products, prices, and ratings from multiple pages:

```json
{
  "selectors": {
    "names": ".product-title",
    "prices": ".price-current",
    "originalPrices": ".price-original",
    "ratings": ".rating-stars",
    "reviews": ".review-count",
    "images": ".product-image img",
    "links": ".product-title a"
  },
  "paginationConfig": {
    "maxPages": 10,
    "waitBetweenPages": 2000
  },
  "options": {
    "includeAttributes": true,
    "deduplication": true
  }
}
```

### 2. News Article Collection

Gather articles from multiple pages of a news site:

```json
{
  "selectors": {
    "headlines": ".article-headline",
    "summaries": ".article-summary",
    "authors": ".article-author",
    "dates": ".article-date",
    "categories": ".article-category"
  },
  "paginationConfig": {
    "nextButtonSelector": ".pagination-next",
    "maxPages": 5,
    "waitBetweenPages": 1500
  },
  "format": "csv"
}
```

### 3. Social Media Posts

Extract posts from paginated social media feeds:

```json
{
  "selectors": {
    "posts": ".post-content",
    "usernames": ".username",
    "timestamps": ".timestamp",
    "likes": ".like-count",
    "shares": ".share-count"
  },
  "paginationConfig": {
    "infiniteScroll": true,
    "scrollToLoad": true,
    "waitBetweenPages": 1000
  },
  "options": {
    "maxElementsPerPage": 50,
    "deduplication": true
  }
}
```

### 4. Job Listings

Scrape job postings across multiple pages:

```json
{
  "selectors": {
    "jobTitles": ".job-title",
    "companies": ".company-name",
    "locations": ".job-location",
    "salaries": ".salary-range",
    "descriptions": ".job-description",
    "postDates": ".post-date"
  },
  "paginationConfig": {
    "nextButtonSelector": "a[aria-label='Next Page']",
    "maxPages": 20,
    "waitBetweenPages": 2500
  },
  "format": "json",
  "options": {
    "cleanText": true,
    "maxElementsPerPage": 25
  }
}
```

## Automatic Next Button Detection

The tool automatically detects common pagination patterns:

- `a[aria-label="Next"]`
- `.s-pagination-next` (Amazon)
- `.pagnNext`
- `.next`
- `[data-testid="pagination-next"]`
- `a:contains("Next")`
- `button:contains("Next")`
- `.pagination .next`
- `.page-next`

## Error Handling

The tool provides detailed error information:

```json
{
  "productTitles": [
    "Product 1",
    "Product 2"
  ],
  "invalidSelector": {
    "error": "Failed to extract with selector \".non-existent\": Invalid selector"
  },
  "_metadata": {
    "totalPages": 2,
    "totalItems": 2,
    "errors": ["Page 3 failed to load"]
  }
}
```

## Performance Tips

1. **Optimize Selectors**: Use specific, efficient CSS selectors
2. **Set Reasonable Limits**: Use `maxPages` and `maxElementsPerPage` to prevent excessive extraction
3. **Adjust Wait Times**: Increase `waitBetweenPages` for slow-loading sites
4. **Enable Deduplication**: Prevents processing duplicate content
5. **Use Appropriate Formats**: CSV for tabular data, JSON for complex structures

## Troubleshooting

### Common Issues

1. **No Next Button Found**
   - Check if the site uses infinite scroll instead
   - Verify the next button selector
   - Ensure the button isn't disabled on the last page

2. **Extraction Stops Early**
   - Increase `waitBetweenPages` for slow sites
   - Check if the site requires scrolling to load content
   - Verify selectors are still valid on subsequent pages

3. **Duplicate Data**
   - Enable `deduplication: true`
   - Check if selectors are too broad
   - Verify that pagination is working correctly

4. **Missing Data**
   - Increase `timeout` for slow-loading elements
   - Enable `scrollToLoad` for lazy-loaded content
   - Check if selectors need to be more specific

## Integration with Existing Tools

The pagination tool works seamlessly with other MCP tools:

```javascript
// Navigate to search results
await connection.navigate('https://example.com/search?q=robots');

// Extract data from multiple pages
const data = await connection.extractPaginatedData({
  selectors: { products: '.product' },
  paginationConfig: { maxPages: 5 }
});

// Take a screenshot of the final page
await connection.screenshot({ fullPage: true });

// Save results to file
await connection.saveFile('results.json', JSON.stringify(data));
```

This comprehensive pagination extraction capability transforms your Playwright MCP server into a powerful web scraping tool that can handle large-scale data extraction tasks efficiently and reliably.
