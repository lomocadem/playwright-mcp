# Shopee Anti-Detection Crawler Documentation

## Overview

This document describes the Shopee-specific crawler with anti-detection capabilities designed to bypass bot detection systems while extracting product data from Shopee.

## Features

### 1. Anti-Detection Measures
- **Browser Stealth**: Removes automation indicators like `navigator.webdriver`
- **Human-like Behavior**: Natural mouse movements, typing delays, random scrolling
- **Session Persistence**: Save and restore login sessions
- **CAPTCHA Handling**: Detects CAPTCHAs and waits for manual solving
- **Configurable Speed Profiles**: Choose between safe, normal, and fast modes

### 2. Authentication
- **QR Code Login**: Semi-automated login using QR code scanning
- **Session Management**: Saves cookies and storage for reuse
- **Login State Detection**: Checks if already logged in

### 3. Data Extraction
- **Product Search**: Search for products by keyword/brand
- **Product Details**: Extract detailed product information
- **Pagination Support**: Automatically navigate through multiple pages
- **Database Storage**: Results are stored in PostgreSQL

## Speed Profiles

### Shopee Safe Mode
- **Delays**: 3-8 seconds between pages
- **Behavior**: Full human simulation (mouse movements, reading pauses, random hovers)
- **Concurrent Tabs**: 1 (single tab only)
- **Use Case**: Maximum safety for Shopee, minimal detection risk

### Normal Mode
- **Delays**: 1-3 seconds between pages
- **Behavior**: Basic human simulation
- **Concurrent Tabs**: 3
- **Use Case**: General crawling with moderate protection

### Fast Mode
- **Delays**: 0.1-0.5 seconds between pages
- **Behavior**: Minimal simulation
- **Concurrent Tabs**: 10
- **Use Case**: Unprotected websites, maximum speed

## Tool Commands

### 1. browser_shopee_init
Initialize the Shopee crawler with anti-detection configurations.

**Parameters:**
- `profile`: Speed profile ('shopee-safe', 'normal', 'fast')
- `sessionFile`: Path to save/load session data (optional)
- `maxRetries`: Maximum retries on detection (default: 3)
- `captchaWaitTime`: Time to wait for CAPTCHA solving in ms (default: 300000)
- `qrLoginTimeout`: QR login timeout in ms (default: 120000)

### 2. browser_shopee_login
Handle login via QR code scanning.

**Parameters:**
- `timeout`: Login timeout in milliseconds (default: 120000)

### 3. browser_shopee_search
Search for products on Shopee.

**Parameters:**
- `keyword`: Search keyword or brand name
- `maxProducts`: Maximum products to extract (default: 50)
- `extractDetails`: Store in database (default: false)
- `profile`: Speed profile to use

### 4. browser_shopee_extract_details
Extract detailed information from product pages.

**Parameters:**
- `urls`: Array of product URLs
- `fields`: Fields to extract (e.g., 'title', 'price', 'images', 'description', 'reviews', 'shopInfo')
- `profile`: Speed profile to use

## Usage Example

```javascript
// Step 1: Initialize crawler with shopee-safe profile
await browser_shopee_init({
  profile: 'shopee-safe',
  sessionFile: './shopee-session.json'
});

// Step 2: Login if needed (QR code will be saved as screenshot)
await browser_shopee_login({
  timeout: 120000
});

// Step 3: Search for products
await browser_shopee_search({
  keyword: 'Nike shoes',
  maxProducts: 20,
  extractDetails: true,
  profile: 'shopee-safe'
});

// Step 4: Extract product details
await browser_shopee_extract_details({
  urls: [
    'https://shopee.vn/product-url-1',
    'https://shopee.vn/product-url-2'
  ],
  fields: ['title', 'price', 'images', 'description', 'shopInfo'],
  profile: 'shopee-safe'
});
```

## CAPTCHA Handling

When a CAPTCHA is detected:
1. The crawler will notify you with: "🔒 CAPTCHA detected! Please solve it manually..."
2. You have 5 minutes to solve the CAPTCHA in the browser window
3. Once solved, the crawler will automatically continue
4. If timeout occurs, the extraction will stop

## Session Management

Sessions are automatically saved after successful:
- Login
- Product searches
- Product detail extractions

To reuse a session:
1. Initialize with the same `sessionFile` path
2. The crawler will automatically load the saved session
3. No need to login again unless the session expires

## Best Practices

1. **Start with Shopee Safe Mode**: Always use 'shopee-safe' profile for Shopee
2. **Manual CAPTCHA Solving**: Be ready to solve CAPTCHAs manually
3. **Session Persistence**: Use session files to avoid repeated logins
4. **Reasonable Limits**: Don't extract too many products at once
5. **Monitor Detection**: Watch for redirects to verification pages
6. **Natural Patterns**: Take breaks between crawling sessions

## Troubleshooting

### "CAPTCHA detected" message
- Solve the CAPTCHA manually in the browser window
- You have 5 minutes before timeout

### "QR login timeout"
- Ensure you scan the QR code within 2 minutes
- Check that your Shopee mobile app is logged in

### Products not extracted
- Check if logged in successfully
- Verify the search returns results
- Try reducing `maxProducts` parameter

### Session not persisting
- Ensure write permissions for session file
- Check if session file path is correct
- Session may have expired (re-login required)

## Anti-Detection Details

### Browser Fingerprinting Protection
- Removes `navigator.webdriver` property
- Adds fake Chrome plugins
- Sets Vietnamese locale for Shopee.vn
- Uses real Chrome user agents

### Human Behavior Simulation
- **Mouse Movement**: Bézier curve paths instead of straight lines
- **Typing**: Variable delays between keystrokes (80-150ms)
- **Scrolling**: Smooth, random scroll patterns
- **Reading**: Pauses to simulate content reading
- **Hovering**: Random hover over elements

### Network Patterns
- Delays between page loads (3-8 seconds in safe mode)
- Random wait times before clicks (300-800ms)
- Natural navigation patterns

## Database Storage

Extracted data is automatically stored in PostgreSQL with:
- Job tracking (crawl_jobs table)
- Result storage (crawl_results table)
- Metadata including timestamps and parameters
- Searchable JSON data format
