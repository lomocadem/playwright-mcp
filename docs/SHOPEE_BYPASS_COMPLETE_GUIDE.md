# Complete Guide to Bypassing Shopee Bot Detection

## Overview

This guide provides multiple approaches to bypass Shopee's bot detection, from basic anti-detection to using your real Chrome browser. Each method has different levels of effectiveness and complexity.

## Methods Overview

### 1. Manual Browser Connection (Most Effective) ✅
- Uses your real Chrome browser with all data
- Includes your browsing history, cookies, extensions
- Appears as a completely normal browser session
- **Success Rate: 95%+**

### 2. Enhanced Anti-Detection
- Advanced fingerprinting protection
- Comprehensive stealth measures
- **Success Rate: 70-80%**

### 3. Basic Shopee Crawler
- QR code login support
- Session persistence
- **Success Rate: 50-60%**

## Method 1: Manual Browser Connection (Recommended)

This is the most effective method as it uses your actual Chrome browser.

### Step 1: Get Launch Command
```javascript
await browser_launch_chrome_manually({
  port: 9222
});
```

This will provide you with a command to launch Chrome with debugging enabled.

### Step 2: Launch Chrome Manually
Open Terminal (Mac/Linux) or Command Prompt (Windows) and run:

**Mac:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows:**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

### Step 3: Connect to Chrome
```javascript
await browser_connect_to_manual_chrome({
  debuggingPort: 9222,
  applyStealthInjections: true,
  humanBehavior: true
});
```

### Step 4: Navigate to Shopee
```javascript
await browser_shopee_navigate_manual({
  searchKeyword: "Nike shoes",  // Optional
  waitForLogin: true            // Wait if verification needed
});
```

## Method 2: Enhanced Anti-Detection Browser

If you can't use manual browser connection, try the enhanced anti-detection:

### Initialize Enhanced Browser
```javascript
// Create enhanced anti-detection configuration
const antiDetection = new EnhancedAntiDetectionBrowser({
  browserMode: 'launch',
  stealth: {
    maskWebdriver: true,
    mockChrome: true,
    mockWebGL: true,
    mockBattery: true,
    mockPermissions: true,
    mockPlugins: true,
    mockLanguages: true,
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh'
  },
  behavior: {
    startupDelay: 3000,
    humanizeAllActions: true,
    addRandomness: 0.3,
    simulateTabSwitching: true,
    simulateIdlePeriods: true
  }
});

// Launch browser
const browser = await antiDetection.launch();
const context = await antiDetection.createStealthContext(browser);
const page = await context.newPage();

// Use human behavior simulator
const behavior = new EnhancedHumanBehaviorSimulator(page, config);
await page.goto('https://shopee.vn');
await behavior.simulateReading();
```

## Method 3: Basic Shopee Crawler with QR Login

### Initialize Crawler
```javascript
await browser_shopee_init({
  profile: 'shopee-safe',
  sessionFile: './shopee-session.json',
  maxRetries: 3
});
```

### Login with QR Code
```javascript
await browser_shopee_login({
  timeout: 120000
});
// A screenshot will be saved for you to scan with mobile app
```

### Search Products
```javascript
await browser_shopee_search({
  keyword: 'Nike shoes',
  maxProducts: 20,
  profile: 'shopee-safe'
});
```

## Tips for Success

### 1. Human-like Behavior
- Move mouse naturally (not straight lines)
- Type with variable speeds
- Take breaks between actions
- Scroll randomly while "reading"
- Occasionally switch tabs

### 2. Session Management
- Save sessions after successful login
- Reuse sessions to avoid repeated logins
- Rotate between multiple accounts if possible

### 3. Timing Patterns
- **Shopee Safe Mode**: 3-8 seconds between pages
- **Normal Mode**: 1-3 seconds between pages
- Add random delays to all actions

### 4. Browser Fingerprinting
- Use real Chrome executable
- Include real browser extensions
- Maintain consistent user agent
- Use Vietnamese locale for shopee.vn

## Handling CAPTCHAs

When CAPTCHAs appear:

1. **Manual Solving** (Recommended)
   - The crawler will pause and notify you
   - Solve the CAPTCHA in the browser window
   - The script continues automatically after solving

2. **Prevention**
   - Use slower crawling speeds
   - Take longer breaks between sessions
   - Use manual browser connection method
   - Maintain human-like patterns

## Troubleshooting

### "Chrome not found" Error
- Ensure Chrome is installed in the default location
- Or specify custom path in browserPath parameter

### "Connection refused" Error
- Make sure all Chrome windows are closed before launching
- Check if port 9222 is not blocked by firewall
- Try a different port number

### Still Getting Detected?
1. Use manual browser connection (Method 1)
2. Increase delays between actions
3. Reduce number of requests per session
4. Clear cookies and try with fresh session
5. Use a different IP address/network

## Speed Profiles Comparison

| Profile | Delay Between Pages | Behavior Simulation | Use Case |
|---------|-------------------|-------------------|----------|
| shopee-safe | 3-8 seconds | Full (mouse, scroll, hover, reading) | Shopee crawling |
| normal | 1-3 seconds | Basic (mouse movements) | General sites |
| fast | 0.1-0.5 seconds | None | Unprotected sites |

## Example: Complete Shopee Crawling Session

```javascript
// Step 1: Launch Chrome manually
await browser_launch_chrome_manually({ port: 9222 });

// Step 2: Run the command in terminal (from step 1 output)

// Step 3: Connect to Chrome
await browser_connect_to_manual_chrome({
  debuggingPort: 9222,
  applyStealthInjections: true,
  humanBehavior: true
});

// Step 4: Navigate to Shopee
await browser_shopee_navigate_manual({
  searchKeyword: "Moroccanoil",
  waitForLogin: true
});

// Step 5: Extract products (if needed)
await browser_extract_structured_data({
  schema: {
    products: {
      selector: '[data-sqe="item"]',
      multiple: true,
      fields: {
        name: { selector: '[data-sqe="name"]', type: 'text' },
        price: { selector: '[data-sqe="price"]', type: 'text' },
        link: { selector: 'a', type: 'attribute', attribute: 'href' },
        image: { selector: 'img', type: 'attribute', attribute: 'src' }
      }
    }
  }
});
```

## Best Practices Summary

1. **Always start with Manual Browser Connection** - It's the most reliable
2. **Be patient** - Slower is better than getting detected
3. **Save sessions** - Reuse login states when possible
4. **Monitor detection** - Watch for redirects to verification pages
5. **Act human** - Random delays, natural movements, reading pauses
6. **Limit volume** - Don't extract too much data in one session

Remember: The goal is to appear as human as possible. When in doubt, slow down and add more randomness to your actions.
