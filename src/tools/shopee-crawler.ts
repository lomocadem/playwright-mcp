/**
 * Shopee-specific crawler with anti-detection capabilities
 * Handles login, CAPTCHA detection, and product extraction
 */

import { Page, Browser, BrowserContext } from 'playwright-core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AntiDetectionBrowser, HumanBehaviorSimulator, crawlProfiles } from './anti-detection.js';
import { defineTool } from './tool.js';
import { callOnPageNoTrace } from './utils.js';
import { getDatabaseManager } from '../database.js';

// Shopee session configuration
interface ShopeeSession {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  userAgent: string;
  lastUsed: Date;
}

// Shopee crawler configuration schema
const shopeeCrawlerConfigSchema = z.object({
  profile: z.enum(['shopee-safe', 'normal', 'fast']).default('shopee-safe'),
  sessionFile: z.string().optional().describe('Path to session file for persistence'),
  maxRetries: z.number().default(3).describe('Maximum retries on detection'),
  captchaWaitTime: z.number().default(300000).describe('Time to wait for manual CAPTCHA solving (ms)'),
  qrLoginTimeout: z.number().default(120000).describe('Timeout for QR code login (ms)')
});

const shopeeSearchSchema = z.object({
  keyword: z.string().describe('Search keyword or brand name'),
  maxProducts: z.number().default(50).describe('Maximum number of products to extract'),
  extractDetails: z.boolean().default(false).describe('Whether to extract detailed product information'),
  profile: z.enum(['shopee-safe', 'normal', 'fast']).default('shopee-safe').describe('Crawling speed profile')
});

const shopeeProductDetailSchema = z.object({
  urls: z.array(z.string()).describe('Array of product URLs to extract'),
  fields: z.array(z.string()).default(['title', 'price', 'images']).describe('Fields to extract from product pages'),
  profile: z.enum(['shopee-safe', 'normal', 'fast']).default('shopee-safe').describe('Crawling speed profile')
});

export class ShopeeCrawler {
  public antiDetection: AntiDetectionBrowser;
  private context?: BrowserContext;
  private sessionFile?: string;
  public currentProfile: keyof typeof crawlProfiles;

  constructor(config: z.infer<typeof shopeeCrawlerConfigSchema>) {
    this.currentProfile = config.profile;
    this.sessionFile = config.sessionFile;
    
    this.antiDetection = new AntiDetectionBrowser({
      browserOptions: {
        headless: false,
        viewport: { width: 1920, height: 1080 }
      },
      stealth: {
        locale: 'vi-VN',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        webgl: true,
        canvas: true,
        audioContext: true
      },
      behavior: {
        mouseMovementSpeed: 'natural',
        typingSpeed: { min: 80, max: 150 },
        scrollBehavior: 'smooth',
        randomDelays: {
          betweenActions: { min: 500, max: 2000 },
          pageLoad: { min: 2000, max: 5000 },
          beforeClick: { min: 300, max: 800 }
        }
      }
    }, config.profile);
  }

  /**
   * Load saved session from file
   */
  public async loadSession(): Promise<ShopeeSession | null> {
    if (!this.sessionFile) return null;
    
    try {
      const sessionData = await fs.readFile(this.sessionFile, 'utf-8');
      return JSON.parse(sessionData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save current session to file
   */
  private async saveSession(page: Page): Promise<void> {
    if (!this.sessionFile) return;

    const session: ShopeeSession = {
      cookies: await page.context().cookies(),
      localStorage: await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) items[key] = localStorage.getItem(key) || '';
        }
        return items;
      }),
      sessionStorage: await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) items[key] = sessionStorage.getItem(key) || '';
        }
        return items;
      }),
      userAgent: await page.evaluate(() => navigator.userAgent),
      lastUsed: new Date()
    };

    await fs.writeFile(this.sessionFile, JSON.stringify(session, null, 2));
  }

  /**
   * Restore session to page
   */
  public async restoreSession(page: Page, session: ShopeeSession): Promise<void> {
    // Add cookies
    await page.context().addCookies(session.cookies);

    // Restore localStorage and sessionStorage
    await page.evaluate((session) => {
      // Clear existing storage
      localStorage.clear();
      sessionStorage.clear();

      // Restore localStorage
      Object.entries(session.localStorage).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });

      // Restore sessionStorage
      Object.entries(session.sessionStorage).forEach(([key, value]) => {
        sessionStorage.setItem(key, value);
      });
    }, session);
  }

  /**
   * Check if CAPTCHA is present
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    const url = page.url();
    return url.includes('/verify/captcha') || url.includes('/verify/traffic');
  }

  /**
   * Handle CAPTCHA detection
   */
  private async handleCaptcha(page: Page, waitTime: number): Promise<boolean> {
    console.log('🔒 CAPTCHA detected! Please solve it manually...');
    
    try {
      // Wait for navigation away from CAPTCHA page
      await page.waitForFunction(
        () => !window.location.href.includes('/verify/'),
        { timeout: waitTime }
      );
      
      console.log('✅ CAPTCHA solved successfully!');
      return true;
    } catch (error) {
      console.log('❌ CAPTCHA solving timeout');
      return false;
    }
  }

  /**
   * Login with QR code
   */
  async loginWithQR(page: Page, timeout: number = 120000): Promise<boolean> {
    const behavior = new HumanBehaviorSimulator(page, crawlProfiles[this.currentProfile]);
    
    try {
      // Navigate to login page
      await page.goto('https://shopee.vn/buyer/login');
      await behavior.simulateReading();
      
      // Wait for QR code to appear
      await page.waitForSelector('.qr-code-container, [class*="qr"], img[alt*="QR"]', { timeout: 10000 });
      
      // Take screenshot of QR code
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `shopee-qr-${timestamp}.png`;
      await page.screenshot({ path: screenshotPath });
      
      console.log(`📱 QR Code saved to: ${screenshotPath}`);
      console.log('Please scan the QR code with your Shopee mobile app...');
      
      // Wait for successful login
      const loginSuccess = await page.waitForFunction(
        () => window.location.href.includes('shopee.vn') && !window.location.href.includes('/login'),
        { timeout }
      );

      if (loginSuccess) {
        console.log('✅ Login successful!');
        await this.saveSession(page);
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('❌ QR login timeout or error:', error);
      return false;
    }
  }

  /**
   * Check if logged in
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Check for user avatar or login button
      const isLoggedIn = await page.evaluate(() => {
        const loginButton = document.querySelector('[href*="/login"], .navbar__link--login');
        const userAvatar = document.querySelector('.navbar__username, .shopee-avatar, [class*="user-avatar"]');
        return !loginButton && !!userAvatar;
      });
      
      return isLoggedIn;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search for products with anti-detection measures
   */
  async searchProducts(page: Page, keyword: string, maxProducts: number): Promise<any[]> {
    const behavior = new HumanBehaviorSimulator(page, crawlProfiles[this.currentProfile]);
    const products: any[] = [];
    
    try {
      // Navigate to Shopee homepage
      await page.goto('https://shopee.vn');
      await behavior.simulateReading();
      
      // Random actions before search
      await behavior.randomHover();
      await behavior.randomScroll();
      
      // Find and click search box
      const searchBox = await page.waitForSelector('input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], .shopee-searchbar-input__input');
      const box = await searchBox?.boundingBox();
      if (box) {
        await behavior.moveMouseNaturally(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(this.antiDetection.getRandomDelay('beforeClick'));
        await searchBox?.click();
      }
      
      // Type search query naturally
      await behavior.typeNaturally(keyword);
      await page.waitForTimeout(this.antiDetection.getRandomDelay('betweenActions'));
      
      // Press Enter
      await page.keyboard.press('Enter');
      
      // Wait for results to load
      await page.waitForSelector('[class*="item-card"], [class*="product"], .shopee-search-item-result__item', { timeout: 10000 });
      await behavior.simulateReading();
      
      // Extract products with pagination
      let currentPage = 1;
      let extractedCount = 0;
      
      while (extractedCount < maxProducts) {
        // Check for CAPTCHA
        if (await this.detectCaptcha(page)) {
          const solved = await this.handleCaptcha(page, 300000);
          if (!solved) break;
        }
        
        // Simulate human behavior on each page
        await behavior.randomScroll();
        await behavior.randomHover();
        
        // Extract products from current page
        const pageProducts = await page.evaluate(() => {
          const items = document.querySelectorAll('[class*="item-card"], [class*="product"], .shopee-search-item-result__item');
          const products = [];
          
          for (const item of items) {
            try {
              const titleEl = item.querySelector('[class*="name"], [class*="title"]');
              const priceEl = item.querySelector('[class*="price"]');
              const imageEl = item.querySelector('img');
              const linkEl = item.querySelector('a');
              
              if (titleEl && priceEl) {
                products.push({
                  title: titleEl.textContent?.trim(),
                  price: priceEl.textContent?.trim(),
                  image: imageEl?.src || imageEl?.getAttribute('data-src'),
                  link: linkEl?.href || window.location.origin + linkEl?.getAttribute('href'),
                  shopName: item.querySelector('[class*="shop"]')?.textContent?.trim()
                });
              }
            } catch (error) {
              // Skip problematic items
            }
          }
          
          return products;
        });
        
        products.push(...pageProducts);
        extractedCount += pageProducts.length;
        
        // Check if we have enough products
        if (extractedCount >= maxProducts) break;
        
        // Try to go to next page
        const nextButton = await page.$('button[class*="next"]:not([disabled]), .shopee-icon-button--right:not(.shopee-icon-button--disabled)');
        if (!nextButton) break;
        
        // Click next with human-like behavior
        const nextBox = await nextButton.boundingBox();
        if (nextBox) {
          await behavior.moveMouseNaturally(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);
          await page.waitForTimeout(this.antiDetection.getRandomDelay('beforeClick'));
          await nextButton.click();
          
          // Wait for new content to load
          await page.waitForTimeout(this.antiDetection.getRandomDelay('betweenPages'));
          await page.waitForSelector('[class*="item-card"], [class*="product"]', { timeout: 10000 });
        } else {
          break;
        }
        
        currentPage++;
      }
      
      // Save session after successful search
      await this.saveSession(page);
      
      return products.slice(0, maxProducts);
    } catch (error) {
      console.error('Error during search:', error);
      return products;
    }
  }

  /**
   * Extract product details
   */
  async extractProductDetails(page: Page, url: string, fields: string[]): Promise<any> {
    const behavior = new HumanBehaviorSimulator(page, crawlProfiles[this.currentProfile]);
    
    try {
      // Navigate to product page
      await page.goto(url);
      await behavior.simulateReading();
      
      // Check for CAPTCHA
      if (await this.detectCaptcha(page)) {
        const solved = await this.handleCaptcha(page, 300000);
        if (!solved) return null;
      }
      
      // Simulate human behavior
      await behavior.randomScroll();
      await behavior.randomHover();
      
      // Extract product details
      const productDetails = await page.evaluate((fields) => {
        const details: any = {};
        
        // Extract based on requested fields
        if (fields.includes('title')) {
          details.title = document.querySelector('[class*="product-title"], h1')?.textContent?.trim();
        }
        
        if (fields.includes('price')) {
          details.price = document.querySelector('[class*="product-price"], [class*="price-now"]')?.textContent?.trim();
        }
        
        if (fields.includes('images')) {
          const images = Array.from(document.querySelectorAll('[class*="product-image"] img, [class*="gallery"] img'));
          details.images = images.map(img => (img as HTMLImageElement).src || img.getAttribute('data-src')).filter(Boolean);
        }
        
        if (fields.includes('description')) {
          details.description = document.querySelector('[class*="product-description"], [class*="detail"]')?.textContent?.trim();
        }
        
        if (fields.includes('reviews')) {
          const reviews = Array.from(document.querySelectorAll('[class*="review-item"], [class*="rating-comment"]'));
          details.reviews = reviews.slice(0, 10).map(review => ({
            rating: review.querySelector('[class*="rating"]')?.textContent?.trim(),
            comment: review.querySelector('[class*="comment"], [class*="content"]')?.textContent?.trim(),
            author: review.querySelector('[class*="author"], [class*="username"]')?.textContent?.trim()
          }));
        }
        
        if (fields.includes('shopInfo')) {
          details.shopInfo = {
            name: document.querySelector('[class*="shop-name"]')?.textContent?.trim(),
            rating: document.querySelector('[class*="shop-rating"]')?.textContent?.trim(),
            location: document.querySelector('[class*="shop-location"]')?.textContent?.trim()
          };
        }
        
        return details;
      }, fields);
      
      // Save session after successful extraction
      await this.saveSession(page);
      
      return productDetails;
    } catch (error) {
      console.error('Error extracting product details:', error);
      return null;
    }
  }
}

// Tool definitions for MCP integration
const initializeShopeeCrawler = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_shopee_init',
    title: 'Initialize Shopee crawler with anti-detection',
    description: 'Initialize a Shopee crawler instance with anti-detection measures and configurable speed profiles',
    inputSchema: shopeeCrawlerConfigSchema,
    type: 'readOnly',
  },
  handle: async (context, params) => {
    const tab = await context.ensureTab();
    const crawler = new ShopeeCrawler(params);
    
    // Store crawler instance in context for later use
    (context as any).shopeeCrawler = crawler;
    
    // Apply anti-detection to browser context
    await crawler.antiDetection.applyStealthToContext(tab.page.context());
    
    // Load saved session if available
    const session = await crawler.loadSession();
    if (session) {
      await crawler.restoreSession(tab.page, session);
    }
    
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: `# Shopee Crawler Initialized\n\n**Profile:** ${params.profile}\n**Session File:** ${params.sessionFile || 'None'}\n**Max Retries:** ${params.maxRetries}\n**Session Loaded:** ${session ? 'Yes' : 'No'}`
        }],
      },
      code: ['// Shopee crawler initialized with anti-detection'],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

const shopeeLogin = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_shopee_login',
    title: 'Login to Shopee with QR code',
    description: 'Handle Shopee login using QR code scanning',
    inputSchema: z.object({
      timeout: z.number().default(120000).describe('Timeout for QR login in milliseconds')
    }),
    type: 'destructive',
  },
  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const crawler = (context as any).shopeeCrawler as ShopeeCrawler;
    
    if (!crawler) {
      throw new Error('Shopee crawler not initialized. Please run browser_shopee_init first.');
    }
    
    // Check if already logged in
    if (await crawler.isLoggedIn(tab.page)) {
      return {
        resultOverride: {
          content: [{
            type: 'text',
            text: '# Already Logged In\n\nYou are already logged in to Shopee.'
          }],
        },
        code: ['// Already logged in'],
        captureSnapshot: true,
        waitForNetwork: false,
      };
    }
    
    // Perform QR login
    const success = await crawler.loginWithQR(tab.page, params.timeout);
    
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: success ? 
            '# Login Successful ✅\n\nSuccessfully logged in to Shopee. Session has been saved.' :
            '# Login Failed ❌\n\nFailed to login to Shopee. Please try again.'
        }],
      },
      code: [success ? '// Login successful' : '// Login failed'],
      captureSnapshot: true,
      waitForNetwork: false,
    };
  },
});

const shopeeSearch = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_shopee_search',
    title: 'Search products on Shopee',
    description: 'Search for products on Shopee with human-like behavior',
    inputSchema: shopeeSearchSchema,
    type: 'readOnly',
  },
  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const crawler = (context as any).shopeeCrawler as ShopeeCrawler;
    
    if (!crawler) {
      throw new Error('Shopee crawler not initialized. Please run browser_shopee_init first.');
    }
    
    // Switch profile if different
    if (params.profile !== crawler.currentProfile) {
      crawler.antiDetection.switchProfile(params.profile);
    }
    
    // Perform search
    const products = await crawler.searchProducts(tab.page, params.keyword, params.maxProducts);
    
    // Store results in database if requested
    if (params.extractDetails) {
      const dbManager = getDatabaseManager();
      const jobId = await dbManager.createCrawlJob({
        url: `https://shopee.vn/search?keyword=${encodeURIComponent(params.keyword)}`,
        strategy_hash: crypto.createHash('md5').update(JSON.stringify(params)).digest('hex'),
        status: 'completed',
        total_pages: 1,
        total_items: products.length,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      });
      
      await dbManager.storeCrawlResult({
        job_id: jobId,
        page_number: 1,
        extracted_data: { products },
        metadata: {
          keyword: params.keyword,
          profile: params.profile,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: `# Shopee Search Results\n\n**Keyword:** ${params.keyword}\n**Products Found:** ${products.length}\n**Profile Used:** ${params.profile}\n\n## Sample Results\n\n\`\`\`json\n${JSON.stringify(products.slice(0, 3), null, 2)}\n\`\`\``
        }],
      },
      code: [
        `// Searched for: ${params.keyword}`,
        `// Found ${products.length} products`
      ],
      captureSnapshot: true,
      waitForNetwork: false,
    };
  },
});

const shopeeExtractDetails = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_shopee_extract_details',
    title: 'Extract Shopee product details',
    description: 'Extract detailed information from Shopee product pages',
    inputSchema: shopeeProductDetailSchema,
    type: 'readOnly',
  },
  handle: async (context, params) => {
    const tab = context.currentTabOrDie();
    const crawler = (context as any).shopeeCrawler as ShopeeCrawler;
    
    if (!crawler) {
      throw new Error('Shopee crawler not initialized. Please run browser_shopee_init first.');
    }
    
    // Switch profile if different
    if (params.profile !== crawler.currentProfile) {
      crawler.antiDetection.switchProfile(params.profile);
    }
    
    const results = [];
    
    // Extract details for each URL
    for (const url of params.urls) {
      const details = await crawler.extractProductDetails(tab.page, url, params.fields);
      if (details) {
        results.push({ url, ...details });
      }
      
      // Wait between products
      await new Promise(resolve => setTimeout(resolve, crawler.antiDetection.getRandomDelay('betweenPages')));
    }
    
    // Store results in database
    const dbManager = getDatabaseManager();
    const jobId = await dbManager.createCrawlJob({
      url: 'https://shopee.vn/products',
      strategy_hash: crypto.createHash('md5').update(JSON.stringify(params)).digest('hex'),
      status: 'completed',
      total_pages: params.urls.length,
      total_items: results.length,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0
    });
    
    await dbManager.storeCrawlResult({
      job_id: jobId,
      page_number: 1,
      extracted_data: { products: results },
      metadata: {
        fields: params.fields,
        profile: params.profile,
        timestamp: new Date().toISOString()
      }
    });
    
    return {
      resultOverride: {
        content: [{
          type: 'text',
          text: `# Product Details Extracted\n\n**URLs Processed:** ${params.urls.length}\n**Successful Extractions:** ${results.length}\n**Fields Extracted:** ${params.fields.join(', ')}\n\n## Sample Result\n\n\`\`\`json\n${JSON.stringify(results[0], null, 2)}\n\`\`\``
        }],
      },
      code: [
        `// Extracted details from ${results.length} products`,
        `// Fields: ${params.fields.join(', ')}`
      ],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

export default [
  initializeShopeeCrawler,
  shopeeLogin,
  shopeeSearch,
  shopeeExtractDetails,
];
