# Data Extraction Examples

This document demonstrates how to use the new `browser_extract_data` tool for efficient data extraction from web pages.

## Overview

The `browser_extract_data` tool provides a token-efficient alternative to full page snapshots by allowing you to extract specific data using CSS selectors or custom JavaScript. This can reduce token usage by 85-95% compared to full accessibility snapshots.

## Basic Usage

### 1. CSS Selector-based Extraction

Extract specific elements using CSS selectors:

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "title": "h1",
      "prices": ".price",
      "descriptions": ".product-description",
      "links": "a[href]"
    }
  }
}
```

### 2. Custom JavaScript Extraction

For complex data extraction logic:

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "javascript": "return { productCount: document.querySelectorAll('.product').length, totalPrice: Array.from(document.querySelectorAll('.price')).reduce((sum, el) => sum + parseFloat(el.textContent.replace(/[^0-9.]/g, '')), 0) };"
  }
}
```

### 3. Combined Approach

Use both selectors and JavaScript:

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "products": ".product-name"
    },
    "javascript": "return { timestamp: new Date().toISOString(), pageUrl: window.location.href };"
  }
}
```

## Advanced Options

### Include Element Attributes

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "images": "img"
    },
    "options": {
      "includeAttributes": true
    }
  }
}
```

### Include Computed Styles

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "buttons": "button"
    },
    "options": {
      "includeStyles": true
    }
  }
}
```

### Output Formats

#### JSON Format (default)
```json
{
  "format": "json"
}
```

#### CSV Format
```json
{
  "format": "csv"
}
```

#### Plain Text Format
```json
{
  "format": "text"
}
```

## Real-World Examples

### E-commerce Product Scraping

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "productNames": ".product-title",
      "prices": ".price-current",
      "ratings": ".rating-stars",
      "availability": ".stock-status"
    },
    "javascript": "return { totalProducts: document.querySelectorAll('.product-item').length, averagePrice: Array.from(document.querySelectorAll('.price-current')).reduce((sum, el, _, arr) => sum + parseFloat(el.textContent.replace(/[^0-9.]/g, '')) / arr.length, 0) };",
    "options": {
      "maxElements": 50,
      "cleanText": true
    }
  }
}
```

### News Article Extraction

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "headline": "h1.article-title",
      "author": ".author-name",
      "publishDate": ".publish-date",
      "content": ".article-body p"
    },
    "javascript": "return { wordCount: document.querySelector('.article-body')?.textContent?.split(' ').length || 0, readingTime: Math.ceil((document.querySelector('.article-body')?.textContent?.split(' ').length || 0) / 200) + ' minutes' };",
    "format": "json"
  }
}
```

### Social Media Data

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "selectors": {
      "posts": ".post-content",
      "likes": ".like-count",
      "comments": ".comment-count",
      "usernames": ".username"
    },
    "javascript": "return { totalEngagement: Array.from(document.querySelectorAll('.like-count, .comment-count')).reduce((sum, el) => sum + parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0, 0) };",
    "options": {
      "maxElements": 20
    }
  }
}
```

### Table Data Extraction

```json
{
  "name": "browser_extract_data",
  "arguments": {
    "javascript": "const table = document.querySelector('table'); if (!table) return { error: 'No table found' }; const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim()); const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => { const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim()); return headers.reduce((obj, header, index) => { obj[header] = cells[index] || ''; return obj; }, {}); }); return { headers, rows, totalRows: rows.length };",
    "format": "json"
  }
}
```

## Token Usage Comparison

| Method | Typical Token Count | Use Case |
|--------|-------------------|----------|
| Full Page Snapshot | 8,000-30,000+ | Interactive automation |
| CSS Selector Extraction | 100-1,000 | Simple data extraction |
| JavaScript Extraction | 200-2,000 | Complex data processing |
| Network Request Monitoring | 200-2,000 | API data capture |

## Best Practices

1. **Use specific selectors**: Target exactly what you need to minimize noise
2. **Combine approaches**: Use selectors for simple extraction, JavaScript for complex logic
3. **Set appropriate limits**: Use `maxElements` to prevent excessive data extraction
4. **Choose the right format**: JSON for structured data, CSV for tabular data, text for simple lists
5. **Clean your data**: Enable `cleanText` to remove extra whitespace
6. **Handle errors gracefully**: The tool provides error information for failed extractions

## Error Handling

The tool provides detailed error information:

```json
{
  "title": "Page Title",
  "invalidSelector": {
    "error": "Failed to extract with selector \".non-existent\": SyntaxError: Invalid selector"
  },
  "javascriptError": "Failed to execute custom JavaScript: ReferenceError: undefinedVariable is not defined"
}
```

## Performance Tips

1. **Minimize DOM traversal**: Use efficient CSS selectors
2. **Limit extraction scope**: Use `maxElements` to prevent processing too many elements
3. **Cache results**: Extract multiple data points in a single call
4. **Use appropriate timeouts**: Adjust `timeout` for slow-loading content
5. **Prefer selectors over JavaScript**: CSS selectors are generally faster than custom JavaScript

This tool significantly reduces token consumption while providing powerful data extraction capabilities, making it ideal for web scraping, data analysis, and automated content processing tasks.
