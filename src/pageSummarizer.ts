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

import * as playwright from 'playwright';
import { callOnPageNoTrace } from './tools/utils.js';
import type { FullConfig } from './config.js';

export interface PageSummaryOptions {
  verbosity: 'quiet' | 'normal' | 'verbose';
  verbosityLevel: number;
  maxElements?: number;
  includeHidden?: boolean;
  focusOnInteractive?: boolean;
}

export interface PageElement {
  type: string;
  text?: string;
  ref?: string;
  role?: string;
  href?: string;
  value?: string;
  placeholder?: string;
  level?: number;
  metadata?: any; // Added metadata property for enhanced analysis
}

export interface PageSummary {
  title: string;
  url: string;
  pageType: 'search' | 'article' | 'form' | 'navigation' | 'ecommerce' | 'unknown';
  interactiveElements: PageElement[];
  headings: PageElement[];
  links: PageElement[];
  forms: PageElement[];
  summary: string;
  totalElements: number;
  truncated: boolean;
}

export class PageSummarizer {
  private config: FullConfig;

  constructor(config: FullConfig) {
    this.config = config;
  }

  async summarizePage(page: playwright.Page, options?: Partial<PageSummaryOptions>): Promise<PageSummary> {
    const opts: PageSummaryOptions = {
      verbosity: this.config.responseManagement?.verbosity || 'normal',
      verbosityLevel: this.config.responseManagement?.verbosityLevel || 1,
      maxElements: this.getMaxElements(options?.verbosity || this.config.responseManagement?.verbosity || 'normal'),
      includeHidden: false,
      focusOnInteractive: true,
      ...options
    };

    // Get basic page info
    const title = await page.title();
    const url = page.url();

    // Extract elements based on verbosity
    const elements = await this.extractElements(page, opts);
    
    // Classify page type
    const pageType = this.classifyPageType(elements, title, url);

    // Filter and prioritize elements
    const filtered = this.filterElements(elements, opts, pageType);

    // Generate summary text
    const summary = this.generateSummary(filtered, pageType, opts);

    return {
      title,
      url,
      pageType,
      interactiveElements: filtered.interactive,
      headings: filtered.headings,
      links: filtered.links,
      forms: filtered.forms,
      summary,
      totalElements: elements.length,
      truncated: elements.length > (opts.maxElements || 100)
    };
  }

  private getMaxElements(verbosity: string): number {
    switch (verbosity) {
      case 'quiet': return 20;
      case 'normal': return 50;
      case 'verbose': return 150;
      default: return 50;
    }
  }

  private async extractElements(page: playwright.Page, options: PageSummaryOptions): Promise<PageElement[]> {
    return await callOnPageNoTrace(page, async (page) => {
      const elements: PageElement[] = [];
      
      // Interactive elements (buttons, inputs, links)
      const interactive = document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"]');
      interactive.forEach((el: Element, index: number) => {
        if (!options.includeHidden && !this.isVisible(el)) return;
        
        const element: PageElement = {
          type: el.tagName.toLowerCase(),
          text: this.getElementText(el),
          ref: `e${elements.length}`,
          role: el.getAttribute('role') || undefined,
        };

        if (el.tagName.toLowerCase() === 'a') {
          element.href = el.getAttribute('href') || undefined;
        }
        
        if (el.tagName.toLowerCase() === 'input') {
          element.value = (el as HTMLInputElement).value || undefined;
          element.placeholder = el.getAttribute('placeholder') || undefined;
        }

        elements.push(element);
      });

      // Headings
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((el: Element) => {
        if (!options.includeHidden && !this.isVisible(el)) return;
        
        elements.push({
          type: 'heading',
          text: this.getElementText(el),
          ref: `e${elements.length}`,
          level: parseInt(el.tagName.charAt(1))
        });
      });

      // Forms
      const forms = document.querySelectorAll('form');
      forms.forEach((el: Element) => {
        if (!options.includeHidden && !this.isVisible(el)) return;
        
        elements.push({
          type: 'form',
          text: this.getElementText(el),
          ref: `e${elements.length}`,
        });
      });

      return elements;
    });
  }

  private isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const htmlElement = element as HTMLElement;
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           htmlElement.offsetWidth > 0 && 
           htmlElement.offsetHeight > 0;
  }

  private getElementText(element: Element): string {
    // Get text content, but limit length
    const text = element.textContent?.trim() || '';
    return text.length > 100 ? text.substring(0, 97) + '...' : text;
  }

  private classifyPageType(elements: PageElement[], title: string, url: string): PageSummary['pageType'] {
    const text = (title + ' ' + url + ' ' + elements.map(e => e.text).join(' ')).toLowerCase();
    
    if (text.includes('search') || text.includes('results') || url.includes('/search')) {
      return 'search';
    }
    
    if (elements.some(e => e.type === 'form') || text.includes('login') || text.includes('register')) {
      return 'form';
    }
    
    if (text.includes('cart') || text.includes('buy') || text.includes('price') || text.includes('product')) {
      return 'ecommerce';
    }
    
    if (elements.filter(e => e.type === 'heading').length > 3) {
      return 'article';
    }
    
    if (elements.filter(e => e.type === 'a').length > 10) {
      return 'navigation';
    }
    
    return 'unknown';
  }

  private filterElements(elements: PageElement[], options: PageSummaryOptions, pageType: string) {
    const maxElements = options.maxElements || 50;
    
    // Separate by type
    const interactive = elements.filter(e => 
      ['button', 'input', 'select', 'textarea', 'a'].includes(e.type) || e.role === 'button'
    );
    const headings = elements.filter(e => e.type === 'heading');
    const links = elements.filter(e => e.type === 'a');
    const forms = elements.filter(e => e.type === 'form');

    // Prioritize based on page type and verbosity
    let prioritized: PageElement[] = [];
    
    switch (pageType) {
      case 'search':
        prioritized = [...headings.slice(0, 3), ...links.slice(0, maxElements * 0.7), ...interactive.slice(0, maxElements * 0.3)];
        break;
      case 'form':
        prioritized = [...forms, ...interactive.slice(0, maxElements * 0.8), ...headings.slice(0, 3)];
        break;
      case 'ecommerce':
        prioritized = [...interactive.filter(e => e.text?.toLowerCase().includes('buy') || e.text?.toLowerCase().includes('cart')), 
                     ...headings.slice(0, 5), ...interactive.slice(0, maxElements * 0.6)];
        break;
      default:
        prioritized = [...headings.slice(0, 5), ...interactive.slice(0, maxElements * 0.7), ...links.slice(0, maxElements * 0.3)];
    }

    return {
      interactive: interactive.slice(0, Math.floor(maxElements * 0.6)),
      headings: headings.slice(0, Math.floor(maxElements * 0.2)),
      links: links.slice(0, Math.floor(maxElements * 0.3)),
      forms: forms.slice(0, 5)
    };
  }

  private generateSummary(filtered: any, pageType: string, options: PageSummaryOptions): string {
    const parts: string[] = [];
    
    if (options.verbosity === 'quiet') {
      parts.push(`Page type: ${pageType}`);
      parts.push(`Interactive elements: ${filtered.interactive.length}`);
      if (filtered.headings.length > 0) {
        parts.push(`Main heading: ${filtered.headings[0]?.text || 'None'}`);
      }
    } else {
      parts.push(`# Page Summary (${pageType})`);
      
      if (filtered.headings.length > 0) {
        parts.push(`## Headings (${filtered.headings.length})`);
        filtered.headings.slice(0, 3).forEach((h: PageElement) => {
          parts.push(`- H${h.level}: ${h.text} [ref=${h.ref}]`);
        });
      }
      
      if (filtered.interactive.length > 0) {
        parts.push(`## Interactive Elements (${filtered.interactive.length})`);
        filtered.interactive.slice(0, options.verbosity === 'verbose' ? 10 : 5).forEach((el: PageElement) => {
          parts.push(`- ${el.type}: ${el.text} [ref=${el.ref}]`);
        });
      }
      
      if (options.verbosity === 'verbose' && filtered.links.length > 0) {
        parts.push(`## Links (${filtered.links.length})`);
        filtered.links.slice(0, 5).forEach((link: PageElement) => {
          parts.push(`- ${link.text} → ${link.href} [ref=${link.ref}]`);
        });
      }
    }
    
    return parts.join('\n');
  }

  formatForResponse(summary: PageSummary, options?: Partial<PageSummaryOptions>): string {
    const opts = {
      verbosity: this.config.responseManagement?.verbosity || 'normal',
      ...options
    };

    if (opts.verbosity === 'quiet') {
      return `Page: ${summary.title}\nType: ${summary.pageType}\nElements: ${summary.totalElements}\n\n${summary.summary}`;
    }

    const parts = [
      `# Page Snapshot: ${summary.title}`,
      `**URL:** ${summary.url}`,
      `**Type:** ${summary.pageType}`,
      `**Elements:** ${summary.totalElements} total${summary.truncated ? ' (truncated)' : ''}`,
      '',
      summary.summary
    ];

    if (opts.verbosity === 'verbose') {
      parts.push('', '## All Interactive Elements');
      summary.interactiveElements.forEach(el => {
        parts.push(`- **${el.type}** ${el.text} [ref=${el.ref}]${el.href ? ` → ${el.href}` : ''}`);
      });
    }

    return parts.join('\n');
  }
}
