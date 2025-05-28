/**
 * Anti-detection module for bypassing bot detection systems
 * Implements human-like behavior patterns and browser stealth techniques
 */

import { Page, Browser, BrowserContext } from 'playwright-core';
import { z } from 'zod';

// Anti-detection configuration schema
export const antiDetectionConfigSchema = z.object({
  browserOptions: z.object({
    headless: z.boolean().default(false),
    args: z.array(z.string()).optional(),
    viewport: z.object({
      width: z.number().default(1920),
      height: z.number().default(1080)
    }).optional()
  }),
  stealth: z.object({
    userAgent: z.string().optional(),
    locale: z.string().default('en-US'),
    timezone: z.string().optional(),
    webgl: z.boolean().default(true),
    canvas: z.boolean().default(true),
    audioContext: z.boolean().default(true)
  }),
  behavior: z.object({
    mouseMovementSpeed: z.enum(['natural', 'slow', 'fast']).default('natural'),
    typingSpeed: z.object({
      min: z.number().default(50),
      max: z.number().default(150)
    }),
    scrollBehavior: z.enum(['smooth', 'instant']).default('smooth'),
    randomDelays: z.object({
      betweenActions: z.object({
        min: z.number().default(500),
        max: z.number().default(2000)
      }),
      pageLoad: z.object({
        min: z.number().default(2000),
        max: z.number().default(5000)
      }),
      beforeClick: z.object({
        min: z.number().default(300),
        max: z.number().default(800)
      })
    })
  })
});

export type AntiDetectionConfig = z.infer<typeof antiDetectionConfigSchema>;

// Crawl speed profiles
export const crawlProfiles = {
  'shopee-safe': {
    name: 'Shopee Safe Mode',
    delays: {
      betweenPages: [3000, 8000],
      betweenActions: [500, 2000],
      scrollDelay: [1000, 3000],
      typingDelay: [100, 200],
      beforeClick: [300, 800]
    },
    concurrent: 1,
    sessionRotation: false,
    humanBehavior: {
      randomMouseMovements: true,
      randomScrolling: true,
      randomHovers: true,
      readingSimulation: true
    }
  },
  'normal': {
    name: 'Normal Speed',
    delays: {
      betweenPages: [1000, 3000],
      betweenActions: [200, 800],
      scrollDelay: [500, 1500],
      typingDelay: [50, 150],
      beforeClick: [200, 500]
    },
    concurrent: 3,
    sessionRotation: true,
    humanBehavior: {
      randomMouseMovements: true,
      randomScrolling: false,
      randomHovers: false,
      readingSimulation: false
    }
  },
  'fast': {
    name: 'Fast Mode (unprotected sites)',
    delays: {
      betweenPages: [100, 500],
      betweenActions: [50, 200],
      scrollDelay: [100, 300],
      typingDelay: [20, 50],
      beforeClick: [50, 150]
    },
    concurrent: 10,
    sessionRotation: true,
    humanBehavior: {
      randomMouseMovements: false,
      randomScrolling: false,
      randomHovers: false,
      readingSimulation: false
    }
  }
};

export class AntiDetectionBrowser {
  private config: AntiDetectionConfig;
  private currentProfile: keyof typeof crawlProfiles;

  constructor(config: AntiDetectionConfig, profile: keyof typeof crawlProfiles = 'normal') {
    this.config = config;
    this.currentProfile = profile;
  }

  /**
   * Get browser launch options with anti-detection measures
   */
  getBrowserOptions() {
    const defaultArgs = [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--start-maximized'
    ];

    return {
      headless: this.config.browserOptions.headless,
      args: [...defaultArgs, ...(this.config.browserOptions.args || [])]
    };
  }

  /**
   * Apply stealth configurations to a browser context
   */
  async applyStealthToContext(context: BrowserContext) {
    // Set user agent
    const userAgent = this.config.stealth.userAgent || this.getRandomUserAgent();
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    // Override navigator.plugins
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {
              type: "application/x-google-chrome-pdf",
              suffixes: "pdf",
              description: "Portable Document Format",
              enabledPlugin: Plugin
            },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          }
        ]
      });
    });

    // Override permissions
    await context.addInitScript(() => {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission as PermissionState }) :
          originalQuery(parameters)
      ) as any;
    });

    // Viewport will be set per page

    // Set locale and timezone
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'language', {
        get: () => 'vi-VN'
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['vi-VN', 'vi', 'en-US', 'en']
      });
    });

    return context;
  }

  /**
   * Get random user agent string
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Get random delay based on current profile
   */
  getRandomDelay(delayType: keyof typeof crawlProfiles['normal']['delays']): number {
    const profile = crawlProfiles[this.currentProfile];
    const [min, max] = profile.delays[delayType];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Switch to a different crawl profile
   */
  switchProfile(profile: keyof typeof crawlProfiles) {
    this.currentProfile = profile;
  }

  /**
   * Get current profile settings
   */
  getCurrentProfile() {
    return crawlProfiles[this.currentProfile];
  }
}

/**
 * Human-like behavior simulation utilities
 */
export class HumanBehaviorSimulator {
  private page: Page;
  private profile: typeof crawlProfiles['normal'];

  constructor(page: Page, profile: typeof crawlProfiles['normal']) {
    this.page = page;
    this.profile = profile;
  }

  /**
   * Simulate natural mouse movement using Bézier curves
   */
  async moveMouseNaturally(targetX: number, targetY: number) {
    if (!this.profile.humanBehavior.randomMouseMovements) {
      await this.page.mouse.move(targetX, targetY);
      return;
    }

    const steps = 20 + Math.floor(Math.random() * 10);
    
    // Get current mouse position from page state
    const currentPosition = await this.page.evaluate(() => {
      // Use last known position or center of viewport
      return {
        x: (window as any).lastMouseX || window.innerWidth / 2,
        y: (window as any).lastMouseY || window.innerHeight / 2
      };
    });
    
    // Track mouse position
    await this.page.evaluate((pos) => {
      (window as any).lastMouseX = pos.x;
      (window as any).lastMouseY = pos.y;
    }, { x: targetX, y: targetY });

    // Generate control points for Bézier curve
    const cp1x = currentPosition.x + (targetX - currentPosition.x) * 0.25 + (Math.random() - 0.5) * 50;
    const cp1y = currentPosition.y + (targetY - currentPosition.y) * 0.25 + (Math.random() - 0.5) * 50;
    const cp2x = currentPosition.x + (targetX - currentPosition.x) * 0.75 + (Math.random() - 0.5) * 50;
    const cp2y = currentPosition.y + (targetY - currentPosition.y) * 0.75 + (Math.random() - 0.5) * 50;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(
        Math.pow(1 - t, 3) * currentPosition.x +
        3 * Math.pow(1 - t, 2) * t * cp1x +
        3 * (1 - t) * Math.pow(t, 2) * cp2x +
        Math.pow(t, 3) * targetX
      );
      const y = Math.round(
        Math.pow(1 - t, 3) * currentPosition.y +
        3 * Math.pow(1 - t, 2) * t * cp1y +
        3 * (1 - t) * Math.pow(t, 2) * cp2y +
        Math.pow(t, 3) * targetY
      );

      await this.page.mouse.move(x, y);
      await this.wait(10 + Math.random() * 20);
    }
  }

  /**
   * Type text with natural delays between keystrokes
   */
  async typeNaturally(text: string) {
    for (const char of text) {
      await this.page.keyboard.type(char);
      await this.wait(this.getRandomDelay('typingDelay'));
    }
  }

  /**
   * Simulate random scrolling patterns
   */
  async randomScroll() {
    if (!this.profile.humanBehavior.randomScrolling) return;

    const scrollCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollCount; i++) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      const distance = 100 + Math.floor(Math.random() * 300);
      
      await this.page.evaluate((d) => {
        window.scrollBy({
          top: d,
          behavior: 'smooth'
        });
      }, direction * distance);
      
      await this.wait(this.getRandomDelay('scrollDelay'));
    }
  }

  /**
   * Simulate reading behavior with pauses
   */
  async simulateReading() {
    if (!this.profile.humanBehavior.readingSimulation) return;

    const readingTime = 2000 + Math.floor(Math.random() * 3000);
    await this.wait(readingTime);
    
    // Random small scrolls while reading
    const scrollCount = Math.floor(Math.random() * 3);
    for (let i = 0; i < scrollCount; i++) {
      await this.page.evaluate(() => {
        window.scrollBy({
          top: 50 + Math.random() * 100,
          behavior: 'smooth'
        });
      });
      await this.wait(500 + Math.random() * 1000);
    }
  }

  /**
   * Perform random hover actions
   */
  async randomHover() {
    if (!this.profile.humanBehavior.randomHovers) return;

    const elements = await this.page.$$('a, button, [class*="product"], [class*="item"]');
    if (elements.length > 0) {
      const randomElement = elements[Math.floor(Math.random() * Math.min(elements.length, 5))];
      const box = await randomElement.boundingBox();
      if (box) {
        await this.moveMouseNaturally(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        await this.wait(200 + Math.random() * 300);
      }
    }
  }

  /**
   * Helper method for delays
   */
  private async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get random delay based on profile
   */
  private getRandomDelay(delayType: keyof typeof crawlProfiles['normal']['delays']): number {
    const [min, max] = this.profile.delays[delayType];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
