/**
 * Enhanced Anti-detection module with advanced stealth capabilities
 * Implements comprehensive browser fingerprinting protection
 */

import { Page, Browser, BrowserContext, chromium } from 'playwright-core';
import { z } from 'zod';
import os from 'os';
import path from 'path';

// Enhanced anti-detection configuration schema
export const enhancedAntiDetectionConfigSchema = z.object({
  browserMode: z.enum(['launch', 'connect', 'cdp']).default('launch').describe('How to connect to browser'),
  browserPath: z.string().optional().describe('Path to Chrome/Chromium executable'),
  userDataDir: z.string().optional().describe('Path to user data directory (Chrome profile)'),
  debuggingPort: z.number().default(9222).describe('Port for CDP connection'),
  stealth: z.object({
    maskWebdriver: z.boolean().default(true),
    mockChrome: z.boolean().default(true),
    mockWebGL: z.boolean().default(true),
    mockBattery: z.boolean().default(true),
    mockPermissions: z.boolean().default(true),
    mockPlugins: z.boolean().default(true),
    mockLanguages: z.boolean().default(true),
    locale: z.string().default('vi-VN'),
    timezone: z.string().default('Asia/Ho_Chi_Minh'),
    geolocation: z.object({
      latitude: z.number().default(10.7769),
      longitude: z.number().default(106.7009)
    }).optional()
  }),
  behavior: z.object({
    startupDelay: z.number().default(3000).describe('Delay after browser launch'),
    humanizeAllActions: z.boolean().default(true),
    addRandomness: z.number().default(0.3).describe('Randomness factor 0-1'),
    simulateTabSwitching: z.boolean().default(true),
    simulateIdlePeriods: z.boolean().default(true)
  })
});

export type EnhancedAntiDetectionConfig = z.infer<typeof enhancedAntiDetectionConfigSchema>;

export class EnhancedAntiDetectionBrowser {
  private config: EnhancedAntiDetectionConfig;
  private browser?: Browser;
  
  constructor(config: EnhancedAntiDetectionConfig) {
    this.config = config;
  }

  /**
   * Get Chrome executable path based on OS
   */
  private getChromePath(): string {
    if (this.config.browserPath) return this.config.browserPath;

    const platform = os.platform();
    switch (platform) {
      case 'darwin':
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      case 'win32':
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      case 'linux':
        return '/usr/bin/google-chrome';
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get user data directory path
   */
  private getUserDataDir(): string {
    if (this.config.userDataDir) return this.config.userDataDir;

    const platform = os.platform();
    const homeDir = os.homedir();
    
    switch (platform) {
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
      case 'win32':
        return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
      case 'linux':
        return path.join(homeDir, '.config', 'google-chrome');
      default:
        return path.join(homeDir, '.chrome-profile');
    }
  }

  /**
   * Launch browser with enhanced anti-detection
   */
  async launch(): Promise<Browser> {
    let browser: Browser;

    if (this.config.browserMode === 'cdp') {
      // Connect to existing Chrome instance
      browser = await chromium.connectOverCDP(`http://localhost:${this.config.debuggingPort}`);
    } else if (this.config.browserMode === 'connect') {
      // Connect via WebSocket
      const wsEndpoint = `ws://localhost:${this.config.debuggingPort}/devtools/browser/<id>`;
      browser = await chromium.connect({ wsEndpoint });
    } else {
      // Launch new browser instance
      browser = await chromium.launch({
        executablePath: this.getChromePath(),
        headless: false,
        args: this.getBrowserArgs(),
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
      });
    }

    // Apply startup delay
    await new Promise(resolve => setTimeout(resolve, this.config.behavior.startupDelay));

    this.browser = browser;
    return browser;
  }

  /**
   * Get optimized browser launch arguments
   */
  private getBrowserArgs(): string[] {
    const args = [
      // Disable automation indicators
      '--disable-blink-features=AutomationControlled',
      '--disable-features=AutomationControlled',
      
      // Disable other detectable features
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-features=CrossSiteDocumentBlockingIfIsolating',
      '--disable-features=CrossSiteDocumentBlockingAlways',
      
      // Performance and stability
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-infobars',
      
      // Window settings
      '--window-size=1920,1080',
      '--start-maximized',
      '--window-position=0,0',
      
      // Additional stealth
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      
      // User agent
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    // Add user data directory if in launch mode
    if (this.config.browserMode === 'launch' && !this.config.userDataDir) {
      args.push(`--user-data-dir=${path.join(os.tmpdir(), 'chrome-profile-' + Date.now())}`);
    } else if (this.config.userDataDir) {
      args.push(`--user-data-dir=${this.config.userDataDir}`);
    }

    return args;
  }

  /**
   * Apply comprehensive stealth scripts to context
   */
  async applyStealthToContext(context: BrowserContext): Promise<void> {
    // Basic webdriver removal
    if (this.config.stealth.maskWebdriver) {
      await context.addInitScript(() => {
        // Remove webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Remove automation flag
        Object.defineProperty(window, 'navigator', {
          value: new Proxy(window.navigator, {
            get: (target, prop) => {
              if (prop === 'webdriver') {
                return undefined;
              }
              return (target as any)[prop];
            }
          })
        });
      });
    }

    // Mock Chrome object
    if (this.config.stealth.mockChrome) {
      await context.addInitScript(() => {
        if (!(window as any).chrome) {
          Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false,
            value: {
              runtime: {
                connect: () => {},
                sendMessage: () => {},
                onMessage: { addListener: () => {} },
                onConnect: { addListener: () => {} },
                onInstalled: { addListener: () => {} },
                getManifest: () => ({}),
                getURL: (path: string) => `chrome-extension://fake-id/${path}`,
                id: 'fake-extension-id',
              },
              storage: {
                local: {
                  get: () => Promise.resolve({}),
                  set: () => Promise.resolve(),
                },
                sync: {
                  get: () => Promise.resolve({}),
                  set: () => Promise.resolve(),
                }
              },
              app: {
                isInstalled: false,
                InstallState: {
                  DISABLED: 'disabled',
                  INSTALLED: 'installed',
                  NOT_INSTALLED: 'not_installed'
                },
                RunningState: {
                  CANNOT_RUN: 'cannot_run',
                  READY_TO_RUN: 'ready_to_run',
                  RUNNING: 'running'
                }
              },
              csi: () => {},
              loadTimes: () => ({})
            }
          });
        }
      });
    }

    // Mock WebGL to prevent fingerprinting
    if (this.config.stealth.mockWebGL) {
      await context.addInitScript(() => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, [parameter]);
        };

        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          // UNMASKED_RENDERER_WEBGL  
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter2.apply(this, [parameter]);
        };
      });
    }

    // Mock battery API
    if (this.config.stealth.mockBattery) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'getBattery', {
          value: () => Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
          })
        });
      });
    }

    // Mock permissions
    if (this.config.stealth.mockPermissions) {
      await context.addInitScript(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = function(permissionDesc: any) {
          if (permissionDesc.name === 'notifications' || permissionDesc.name === 'geolocation') {
            return Promise.resolve({
              state: 'granted',
              onchange: null,
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => true,
            } as any);
          }
          return originalQuery.call(this, permissionDesc);
        };
      });
    }

    // Mock plugins
    if (this.config.stealth.mockPlugins) {
      await context.addInitScript(() => {
        function mockPlugin(name: string, filename: string, description: string, mimeTypes: any[]) {
          const plugin = {
            name,
            filename,
            description,
            length: mimeTypes.length,
            ...Object.fromEntries(mimeTypes.map((mt, i) => [i, mt])),
            item: (index: number) => mimeTypes[index],
            namedItem: (name: string) => mimeTypes.find(mt => mt.type === name),
            [Symbol.iterator]: () => mimeTypes[Symbol.iterator]()
          };
          return plugin;
        }

        const mimeTypes = [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
          { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null }
        ];

        const plugins = [
          mockPlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format', mimeTypes),
          mockPlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'Portable Document Format', mimeTypes),
          mockPlugin('Native Client', 'internal-nacl-plugin', 'Native Client Executable', [])
        ];

        Object.defineProperty(navigator, 'plugins', {
          get: () => plugins,
          configurable: true,
          enumerable: true
        });

        Object.defineProperty(navigator, 'mimeTypes', {
          get: () => mimeTypes,
          configurable: true,
          enumerable: true
        });
      });
    }

    // Set languages
    if (this.config.stealth.mockLanguages) {
      await context.addInitScript((locale) => {
        Object.defineProperty(navigator, 'language', {
          get: () => locale
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => [locale, 'en-US', 'en']
        });
      }, this.config.stealth.locale);
    }

    // Additional CDP detections
    await context.addInitScript(() => {
      // Remove CDP-specific properties
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });

    // Set geolocation if provided
    if (this.config.stealth.geolocation) {
      await context.setGeolocation(this.config.stealth.geolocation);
      await context.grantPermissions(['geolocation']);
    }

    // Set timezone
    await context.addInitScript(() => {
      const DateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(...args: any[]) {
        const instance = new DateTimeFormat(...args);
        const resolvedOptions = instance.resolvedOptions.bind(instance);
        instance.resolvedOptions = () => {
          const options = resolvedOptions();
          options.timeZone = 'Asia/Ho_Chi_Minh';
          return options;
        };
        return instance;
      } as any;
      Object.setPrototypeOf(Intl.DateTimeFormat.prototype, DateTimeFormat.prototype);
    });
  }

  /**
   * Create context with all stealth measures applied
   */
  async createStealthContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: this.config.stealth.locale,
      timezoneId: this.config.stealth.timezone,
      permissions: ['geolocation', 'notifications'],
      colorScheme: 'light',
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    await this.applyStealthToContext(context);
    return context;
  }

  /**
   * Close browser connection
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }
}

/**
 * Enhanced human behavior simulator with more realistic patterns
 */
export class EnhancedHumanBehaviorSimulator {
  private page: Page;
  private config: EnhancedAntiDetectionConfig;
  private lastActionTime: number = Date.now();

  constructor(page: Page, config: EnhancedAntiDetectionConfig) {
    this.page = page;
    this.config = config;
  }

  /**
   * Add randomness to any value
   */
  private addRandomness(value: number): number {
    const factor = this.config.behavior.addRandomness;
    return value + (Math.random() - 0.5) * value * factor * 2;
  }

  /**
   * Wait with randomness
   */
  async randomWait(baseMs: number): Promise<void> {
    const actualMs = this.addRandomness(baseMs);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, actualMs)));
  }

  /**
   * Simulate idle periods
   */
  async simulateIdle(): Promise<void> {
    if (!this.config.behavior.simulateIdlePeriods) return;

    const timeSinceLastAction = Date.now() - this.lastActionTime;
    if (timeSinceLastAction > 10000 && Math.random() < 0.3) {
      // Simulate longer idle period
      await this.randomWait(5000 + Math.random() * 10000);
    }
    this.lastActionTime = Date.now();
  }

  /**
   * Move mouse with micro movements
   */
  async moveMouseNaturally(targetX: number, targetY: number): Promise<void> {
    if (!this.config.behavior.humanizeAllActions) {
      await this.page.mouse.move(targetX, targetY);
      return;
    }

    // Get current position
    const currentPos = await this.page.evaluate(() => ({
      x: (window as any).lastMouseX || window.innerWidth / 2,
      y: (window as any).lastMouseY || window.innerHeight / 2
    }));

    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(targetX - currentPos.x, 2) + 
      Math.pow(targetY - currentPos.y, 2)
    );

    // More steps for longer distances
    const steps = Math.min(50, Math.max(10, Math.floor(distance / 20)));
    
    // Generate realistic path with overshooting
    const overshoot = Math.random() < 0.3 ? 1.05 + Math.random() * 0.1 : 1;
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      
      // Easing function for more natural movement
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      let x = currentPos.x + (targetX - currentPos.x) * easeProgress;
      let y = currentPos.y + (targetY - currentPos.y) * easeProgress;
      
      // Add micro jitter
      if (i > 0 && i < steps) {
        x += (Math.random() - 0.5) * 2;
        y += (Math.random() - 0.5) * 2;
      }
      
      // Apply overshoot
      if (progress > 0.9 && overshoot > 1) {
        const overshootProgress = (progress - 0.9) / 0.1;
        x = targetX + (x - targetX) * (overshoot - 1) * (1 - overshootProgress);
        y = targetY + (y - targetY) * (overshoot - 1) * (1 - overshootProgress);
      }
      
      await this.page.mouse.move(Math.round(x), Math.round(y));
      await this.randomWait(5 + Math.random() * 15);
    }

    // Final position (ensure we end up exactly where we want)
    await this.page.mouse.move(targetX, targetY);
    
    // Update last known position
    await this.page.evaluate((pos) => {
      (window as any).lastMouseX = pos.x;
      (window as any).lastMouseY = pos.y;
    }, { x: targetX, y: targetY });
  }

  /**
   * Type with realistic patterns including typos
   */
  async typeNaturally(text: string): Promise<void> {
    if (!this.config.behavior.humanizeAllActions) {
      await this.page.keyboard.type(text);
      return;
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Occasionally make typos
      if (Math.random() < 0.02 && i > 0 && i < text.length - 1) {
        // Type wrong character
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
        await this.page.keyboard.type(wrongChar);
        await this.randomWait(100 + Math.random() * 200);
        
        // Delete it
        await this.page.keyboard.press('Backspace');
        await this.randomWait(50 + Math.random() * 100);
      }
      
      // Type the actual character
      await this.page.keyboard.type(char);
      
      // Variable typing speed
      let delay = 50 + Math.random() * 100;
      
      // Longer pauses after punctuation
      if (['.', ',', '!', '?'].includes(char)) {
        delay += 100 + Math.random() * 200;
      }
      
      // Faster for repeated characters
      if (i > 0 && text[i-1] === char) {
        delay *= 0.7;
      }
      
      await this.randomWait(delay);
    }
  }

  /**
   * Click with human-like patterns
   */
  async clickNaturally(x: number, y: number): Promise<void> {
    // Move to the element first
    await this.moveMouseNaturally(x, y);
    
    // Small pause before click
    await this.randomWait(100 + Math.random() * 200);
    
    // Sometimes do a hover before clicking
    if (Math.random() < 0.3) {
      await this.randomWait(200 + Math.random() * 300);
    }
    
    // Click with occasional double clicks
    await this.page.mouse.click(x, y);
    
    if (Math.random() < 0.05) {
      await this.randomWait(50 + Math.random() * 100);
      await this.page.mouse.click(x, y);
    }
  }

  /**
   * Scroll with natural patterns
   */
  async naturalScroll(direction: 'up' | 'down' = 'down', distance?: number): Promise<void> {
    const actualDistance = distance || (200 + Math.random() * 300);
    const steps = Math.floor(actualDistance / 50);
    
    for (let i = 0; i < steps; i++) {
      const stepDistance = 40 + Math.random() * 20;
      await this.page.evaluate((d) => {
        window.scrollBy({
          top: d,
          behavior: 'smooth'
        });
      }, direction === 'down' ? stepDistance : -stepDistance);
      
      await this.randomWait(50 + Math.random() * 100);
    }
  }

  /**
   * Simulate tab switching
   */
  async simulateTabSwitch(): Promise<void> {
    if (!this.config.behavior.simulateTabSwitching || Math.random() > 0.1) return;
    
    // Simulate user switching to another tab
    await this.page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true
      });
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true
      });
    });
    
    // Stay on other tab for a while
    await this.randomWait(3000 + Math.random() * 7000);
    
    // Come back
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true
      });
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  /**
   * Read content with eye movement simulation
   */
  async simulateReading(): Promise<void> {
    const viewportSize = await this.page.viewportSize();
    if (!viewportSize) return;

    // Simulate F-pattern reading
    const positions = [
      { x: 100, y: 200 },
      { x: viewportSize.width - 100, y: 200 },
      { x: 100, y: 300 },
      { x: viewportSize.width * 0.6, y: 300 },
      { x: 100, y: 400 },
      { x: viewportSize.width * 0.4, y: 400 },
    ];

    for (const pos of positions) {
      await this.moveMouseNaturally(pos.x, pos.y);
      await this.randomWait(300 + Math.random() * 700);
    }

    // Scroll down a bit
    await this.naturalScroll('down', 100 + Math.random() * 200);
  }
}
