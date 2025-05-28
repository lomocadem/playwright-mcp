/**
 * Manual Browser Connector - Connect to an existing Chrome instance
 * This allows using a real browser with user data, extensions, and history
 */

import { Browser, chromium } from 'playwright-core';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { EnhancedAntiDetectionBrowser, EnhancedHumanBehaviorSimulator } from './enhanced-anti-detection.js';

// Configuration for manual browser connection
const manualBrowserConfigSchema = z.object({
  debuggingPort: z.number().default(9222).describe('Chrome debugging port'),
  applyStealthInjections: z.boolean().default(true).describe('Apply stealth scripts to the browser'),
  humanBehavior: z.boolean().default(true).describe('Enable human-like behavior simulation')
});

// Tool to launch Chrome manually with debugging
const launchChromeManually = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_launch_chrome_manually',
    title: 'Get command to launch Chrome with debugging',
    description: 'Provides the command to manually launch Chrome with remote debugging enabled. This allows bypassing bot detection by using your real browser.',
    inputSchema: z.object({
      port: z.number().default(9222).describe('Debugging port to use'),
      profilePath: z.string().optional().describe('Optional custom profile path')
    }),
    type: 'readOnly',
  },
  handle: async (context, params) => {
    const os = require('os');
    const platform = os.platform();
    
    let command = '';
    let instructions = '';
    
    switch (platform) {
      case 'darwin':
        command = params.profilePath 
          ? `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${params.port} --user-data-dir="${params.profilePath}"`
          : `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${params.port}`;
        instructions = `
1. Close all Chrome windows
2. Open Terminal
3. Run the command below
4. Chrome will open with debugging enabled
5. You can now connect to it using browser_connect_to_manual_chrome`;
        break;
        
      case 'win32':
        command = params.profilePath
          ? `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${params.port} --user-data-dir="${params.profilePath}"`
          : `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${params.port}`;
        instructions = `
1. Close all Chrome windows
2. Open Command Prompt or PowerShell
3. Run the command below
4. Chrome will open with debugging enabled
5. You can now connect to it using browser_connect_to_manual_chrome`;
        break;
        
      case 'linux':
        command = params.profilePath
          ? `google-chrome --remote-debugging-port=${params.port} --user-data-dir="${params.profilePath}"`
          : `google-chrome --remote-debugging-port=${params.port}`;
        instructions = `
1. Close all Chrome windows
2. Open Terminal
3. Run the command below
4. Chrome will open with debugging enabled
5. You can now connect to it using browser_connect_to_manual_chrome`;
        break;
        
      default:
        command = 'Unsupported platform';
        instructions = 'Your operating system is not supported for this feature.';
    }
    
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: `# Launch Chrome with Remote Debugging

## Instructions:
${instructions}

## Command to run:
\`\`\`bash
${command}
\`\`\`

## Important Notes:
- Make sure ALL Chrome windows are closed before running this command
- The browser will open with your default profile (including extensions, cookies, history)
- Keep the terminal/command prompt open while using the browser
- Port ${params.port} will be used for debugging connection

## Benefits of Manual Launch:
✅ Uses your real Chrome profile with history and cookies
✅ Includes all your extensions
✅ Has your bookmarks and saved passwords
✅ Appears as a completely normal browser session
✅ Bypasses most bot detection systems

After Chrome opens, use \`browser_connect_to_manual_chrome\` to connect to it.`
        }],
      },
      code: [
        `// Platform: ${platform}`,
        `// Command: ${command}`,
        `// Port: ${params.port}`
      ],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

// Tool to connect to manually launched Chrome
const connectToManualChrome = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_connect_to_manual_chrome',
    title: 'Connect to manually launched Chrome',
    description: 'Connect to a Chrome instance that was manually launched with debugging enabled',
    inputSchema: manualBrowserConfigSchema,
    type: 'destructive',
  },
  handle: async (context, params) => {
    try {
      // Connect to the Chrome instance
      const browser = await chromium.connectOverCDP(`http://localhost:${params.debuggingPort}`);
      
      // Get the first page (or create one if none exists)
      const pages = browser.contexts()[0].pages();
      let page = pages.length > 0 ? pages[0] : await browser.contexts()[0].newPage();
      
      // Apply stealth injections if requested
      if (params.applyStealthInjections) {
        const antiDetection = new EnhancedAntiDetectionBrowser({
          browserMode: 'cdp',
          debuggingPort: params.debuggingPort,
          stealth: {
            maskWebdriver: true,
            mockChrome: false, // Don't mock chrome since it's real Chrome
            mockWebGL: true,
            mockBattery: true,
            mockPermissions: true,
            mockPlugins: false, // Real Chrome has real plugins
            mockLanguages: true,
            locale: 'vi-VN',
            timezone: 'Asia/Ho_Chi_Minh'
          },
          behavior: {
            startupDelay: 0, // No delay needed, already connected
            humanizeAllActions: params.humanBehavior,
            addRandomness: 0.3,
            simulateTabSwitching: true,
            simulateIdlePeriods: true
          }
        });
        
        await antiDetection.applyStealthToContext(browser.contexts()[0]);
      }
      
      // Store browser in context for reuse
      (context as any).manualBrowser = browser;
      (context as any).manualBrowserConfig = params;
      
      // Set the current tab to the connected page
      const tab = await context.ensureTab();
      (tab as any).page = page;
      
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Successfully Connected to Manual Chrome

✅ Connected to Chrome on port ${params.debuggingPort}
✅ Stealth injections: ${params.applyStealthInjections ? 'Applied' : 'Skipped'}
✅ Human behavior: ${params.humanBehavior ? 'Enabled' : 'Disabled'}

## Current Status:
- Browser is ready for use
- You can now navigate to any website
- All your Chrome data (cookies, extensions, etc.) is available
- Bot detection should be minimal

## Tips for Avoiding Detection:
1. Navigate slowly and naturally
2. Interact with pages like a human would
3. Take breaks between actions
4. Don't perform too many requests quickly

You can now use regular browser navigation commands or the Shopee-specific tools.`
          }],
        },
        code: [
          `// Connected to Chrome on port ${params.debuggingPort}`,
          `// Pages found: ${pages.length}`,
          `// Current URL: ${await page.url()}`
        ],
        captureSnapshot: true,
        waitForNetwork: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Failed to Connect to Chrome

❌ Error: ${errorMessage}

## Troubleshooting:
1. Make sure Chrome is running with debugging enabled
2. Check that you used the correct port (default: ${params.debuggingPort})
3. Ensure no firewall is blocking the connection
4. Try closing all Chrome windows and relaunching with the debug command

To get the launch command, use: \`browser_launch_chrome_manually\``
          }],
        },
        code: [`// Connection failed: ${errorMessage}`],
        captureSnapshot: false,
        waitForNetwork: false,
      };
    }
  },
});

// Enhanced Shopee navigation with manual browser
const shopeeNavigateManual = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_shopee_navigate_manual',
    title: 'Navigate to Shopee with manual browser',
    description: 'Navigate to Shopee using the manually connected browser with enhanced human behavior',
    inputSchema: z.object({
      searchKeyword: z.string().optional().describe('Optional search keyword after navigation'),
      waitForLogin: z.boolean().default(false).describe('Wait for manual login if needed')
    }),
    type: 'destructive',
  },
  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const config = (context as any).manualBrowserConfig;
    
    if (!config) {
      throw new Error('No manual browser connected. Use browser_connect_to_manual_chrome first.');
    }
    
    // Create behavior simulator
    const behavior = new EnhancedHumanBehaviorSimulator(tab.page, {
      browserMode: 'cdp',
      debuggingPort: config.debuggingPort,
      stealth: {
        maskWebdriver: true,
        mockChrome: false,
        mockWebGL: true,
        mockBattery: true,
        mockPermissions: true,
        mockPlugins: false,
        mockLanguages: true,
        locale: 'vi-VN',
        timezone: 'Asia/Ho_Chi_Minh'
      },
      behavior: {
        startupDelay: 0,
        humanizeAllActions: true,
        addRandomness: 0.3,
        simulateTabSwitching: true,
        simulateIdlePeriods: true
      }
    });
    
    try {
      // Navigate to Shopee
      await tab.page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' });
      
      // Wait for page to load and simulate reading
      await behavior.randomWait(2000 + Math.random() * 2000);
      await behavior.simulateReading();
      
      // Check if we're on a verification page
      const url = tab.page.url();
      const isVerificationPage = url.includes('/verify/') || url.includes('/captcha');
      
      if (isVerificationPage) {
        if (params.waitForLogin) {
          return {
            resultOverride: {
              content: [{
                type: 'text',
                text: `# Verification Required

🔒 Shopee is showing a verification page.

Please complete the verification manually in the browser window.
I'll wait for you to complete it...

Once you've passed the verification, the script will continue automatically.`
              }],
            },
            code: ['// Waiting for manual verification...'],
            captureSnapshot: true,
            waitForNetwork: false,
          };
        } else {
          return {
            resultOverride: {
              content: [{
                type: 'text',
                text: `# Verification Page Detected

⚠️ Shopee is showing a verification page.

You can:
1. Complete the verification manually in the browser
2. Try again with \`waitForLogin: true\` to wait for completion
3. Make sure you're logged in before navigating

Current URL: ${url}`
              }],
            },
            code: [`// Verification required at: ${url}`],
            captureSnapshot: true,
            waitForNetwork: false,
          };
        }
      }
      
      // If search keyword provided, perform search
      if (params.searchKeyword) {
        // Random actions before search
        await behavior.simulateTabSwitch();
        await behavior.randomWait(1000 + Math.random() * 2000);
        
        // Find search box
        const searchSelectors = [
          'input[placeholder*="Tìm kiếm"]',
          'input[placeholder*="Search"]',
          '.shopee-searchbar-input__input',
          'input[type="search"]'
        ];
        
        let searchBox = null;
        for (const selector of searchSelectors) {
          searchBox = await tab.page.$(selector);
          if (searchBox) break;
        }
        
        if (searchBox) {
          const box = await searchBox.boundingBox();
          if (box) {
            // Click on search box with human behavior
            await behavior.clickNaturally(box.x + box.width / 2, box.y + box.height / 2);
            await behavior.randomWait(500 + Math.random() * 1000);
            
            // Clear existing text if any
            await tab.page.keyboard.press('Control+A');
            await behavior.randomWait(100);
            await tab.page.keyboard.press('Delete');
            
            // Type search query naturally
            await behavior.typeNaturally(params.searchKeyword);
            await behavior.randomWait(500 + Math.random() * 1000);
            
            // Press Enter
            await tab.page.keyboard.press('Enter');
            
            // Wait for results
            await behavior.randomWait(2000 + Math.random() * 2000);
          }
        }
      }
      
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Shopee Navigation Successful

✅ Successfully navigated to Shopee
${params.searchKeyword ? `✅ Searched for: "${params.searchKeyword}"` : ''}

## Current Status:
- URL: ${await tab.page.url()}
- Page loaded successfully
- Human behavior simulation active

## Next Steps:
- You can now browse products naturally
- Use the screenshot to see the current state
- Continue with manual interactions or automated extraction`
          }],
        },
        code: [
          '// Successfully navigated to Shopee',
          params.searchKeyword ? `// Searched for: ${params.searchKeyword}` : '// No search performed',
          `// Current URL: ${await tab.page.url()}`
        ],
        captureSnapshot: true,
        waitForNetwork: false,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: `# Navigation Error

❌ Failed to navigate: ${errorMessage}

This might be due to:
- Network issues
- Chrome browser was closed
- Connection was lost

Try reconnecting with \`browser_connect_to_manual_chrome\``
          }],
        },
        code: [`// Navigation error: ${errorMessage}`],
        captureSnapshot: true,
        waitForNetwork: false,
      };
    }
  },
});

export default [
  launchChromeManually,
  connectToManualChrome,
  shopeeNavigateManual,
];
