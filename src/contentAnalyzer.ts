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
import type { PageElement } from './pageSummarizer.js';

export interface ContentPattern {
  type: 'search_results' | 'product_listing' | 'article_content' | 'navigation_menu' | 'form_fields' | 'data_table';
  confidence: number;
  elements: PageElement[];
  description: string;
}

export interface PageContext {
  domain: string;
  path: string;
  title: string;
  language: string;
  viewport: { width: number; height: number };
  loadTime: number;
}

export interface ContentAnalysis {
  context: PageContext;
  patterns: ContentPattern[];
  primaryContent: PageElement[];
  secondaryContent: PageElement[];
  interactiveElements: PageElement[];
  relevanceScore: number;
  recommendations: string[];
}

export class ContentAnalyzer {
  
  async analyzePageContent(page: playwright.Page): Promise<ContentAnalysis> {
    const startTime = Date.now();
    
    // Get page context
    const context = await this.getPageContext(page);
    
    // Extract all elements with metadata
    const allElements = await this.extractElementsWithMetadata(page);
    
    // Detect content patterns
    const patterns = this.detectContentPatterns(allElements, context);
    
    // Classify content by importance
    const { primary, secondary, interactive } = this.classifyContentByImportance(allElements, patterns);
    
    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(patterns, primary);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(patterns, context);
    
    const loadTime = Date.now() - startTime;
    context.loadTime = loadTime;
    
    return {
      context,
      patterns,
      primaryContent: primary,
      secondaryContent: secondary,
      interactiveElements: interactive,
      relevanceScore,
      recommendations
    };
  }

  private async getPageContext(page: playwright.Page): Promise<PageContext> {
    const url = new URL(page.url());
    const title = await page.title();
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    
    // Detect language
    const language = await callOnPageNoTrace(page, async () => {
      return document.documentElement.lang || 
             document.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content') || 
             'en';
    });

    return {
      domain: url.hostname,
      path: url.pathname,
      title,
      language,
      viewport,
      loadTime: 0 // Will be set later
    };
  }

  private async extractElementsWithMetadata(page: playwright.Page): Promise<PageElement[]> {
    return await callOnPageNoTrace(page, async () => {
      const elements: PageElement[] = [];
      let elementIndex = 0;

      // Helper function to get element metadata
      const getElementMetadata = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        return {
          visible: rect.width > 0 && rect.height > 0 && style.display !== 'none',
          position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          zIndex: parseInt(style.zIndex) || 0,
          fontSize: parseInt(style.fontSize) || 16,
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontWeight: style.fontWeight,
          textAlign: style.textAlign
        };
      };

      // Extract headings with hierarchy
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((el: Element) => {
        const metadata = getElementMetadata(el);
        if (!metadata.visible) return;

        elements.push({
          type: 'heading',
          text: el.textContent?.trim() || '',
          ref: `e${elementIndex++}`,
          level: parseInt(el.tagName.charAt(1)),
          metadata
        });
      });

      // Extract links with context
      const links = document.querySelectorAll('a[href]');
      links.forEach((el: Element) => {
        const metadata = getElementMetadata(el);
        if (!metadata.visible) return;

        const href = el.getAttribute('href') || '';
        const isExternal = href.startsWith('http') && !href.includes(window.location.hostname);
        
        elements.push({
          type: 'link',
          text: el.textContent?.trim() || '',
          ref: `e${elementIndex++}`,
          href,
          metadata: { ...metadata, isExternal }
        });
      });

      // Extract interactive elements
      const interactive = document.querySelectorAll('button, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"]');
      interactive.forEach((el: Element) => {
        const metadata = getElementMetadata(el);
        if (!metadata.visible) return;

        const element: PageElement = {
          type: el.tagName.toLowerCase(),
          text: el.textContent?.trim() || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '',
          ref: `e${elementIndex++}`,
          role: el.getAttribute('role') || undefined,
          metadata
        };

        if (el.tagName.toLowerCase() === 'input') {
          element.value = (el as HTMLInputElement).value;
          element.placeholder = el.getAttribute('placeholder') || undefined;
        }

        elements.push(element);
      });

      // Extract content blocks
      const contentBlocks = document.querySelectorAll('article, section, main, .content, .post, .product, .item');
      contentBlocks.forEach((el: Element) => {
        const metadata = getElementMetadata(el);
        if (!metadata.visible || metadata.position.height < 50) return;

        elements.push({
          type: 'content_block',
          text: el.textContent?.trim().substring(0, 200) + '...' || '',
          ref: `e${elementIndex++}`,
          metadata
        });
      });

      // Extract lists (potential navigation or data)
      const lists = document.querySelectorAll('ul, ol');
      lists.forEach((el: Element) => {
        const metadata = getElementMetadata(el);
        if (!metadata.visible) return;

        const items = el.querySelectorAll('li');
        if (items.length > 2) { // Only consider lists with multiple items
          elements.push({
            type: 'list',
            text: `List with ${items.length} items`,
            ref: `e${elementIndex++}`,
            metadata: { ...metadata, itemCount: items.length }
          });
        }
      });

      return elements;
    });
  }

  private detectContentPatterns(elements: PageElement[], context: PageContext): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    // Search results pattern
    const searchPattern = this.detectSearchResults(elements, context);
    if (searchPattern) patterns.push(searchPattern);

    // Product listing pattern
    const productPattern = this.detectProductListing(elements, context);
    if (productPattern) patterns.push(productPattern);

    // Article content pattern
    const articlePattern = this.detectArticleContent(elements, context);
    if (articlePattern) patterns.push(articlePattern);

    // Navigation menu pattern
    const navPattern = this.detectNavigationMenu(elements, context);
    if (navPattern) patterns.push(navPattern);

    // Form fields pattern
    const formPattern = this.detectFormFields(elements, context);
    if (formPattern) patterns.push(formPattern);

    // Data table pattern
    const tablePattern = this.detectDataTable(elements, context);
    if (tablePattern) patterns.push(tablePattern);

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  private detectSearchResults(elements: PageElement[], context: PageContext): ContentPattern | null {
    const indicators = [
      context.path.includes('/search'),
      context.title.toLowerCase().includes('search'),
      elements.some(el => el.text?.toLowerCase().includes('results')),
      elements.filter(el => el.type === 'link').length > 10
    ];

    const confidence = indicators.filter(Boolean).length / indicators.length;
    
    if (confidence > 0.5) {
      const resultElements = elements.filter(el => 
        el.type === 'link' || 
        (el.type === 'heading' && el.level && el.level <= 3)
      );

      return {
        type: 'search_results',
        confidence,
        elements: resultElements,
        description: `Search results page with ${resultElements.length} result items`
      };
    }

    return null;
  }

  private detectProductListing(elements: PageElement[], context: PageContext): ContentPattern | null {
    const priceElements = elements.filter(el => 
      el.text?.match(/\$[\d,]+\.?\d*|€[\d,]+\.?\d*|£[\d,]+\.?\d*/) ||
      el.text?.toLowerCase().includes('price')
    );

    const productKeywords = ['buy', 'cart', 'add to cart', 'product', 'shop', 'store'];
    const hasProductKeywords = elements.some(el => 
      productKeywords.some(keyword => el.text?.toLowerCase().includes(keyword))
    );

    const confidence = (priceElements.length > 0 ? 0.4 : 0) + (hasProductKeywords ? 0.6 : 0);

    if (confidence > 0.5) {
      const productElements = elements.filter(el => 
        el.type === 'link' || 
        el.text?.match(/\$[\d,]+\.?\d*/) ||
        el.text?.toLowerCase().includes('add to cart')
      );

      return {
        type: 'product_listing',
        confidence,
        elements: productElements,
        description: `Product listing with ${priceElements.length} price indicators`
      };
    }

    return null;
  }

  private detectArticleContent(elements: PageElement[], context: PageContext): ContentPattern | null {
    const headingHierarchy = elements
      .filter(el => el.type === 'heading')
      .sort((a, b) => (a.level || 0) - (b.level || 0));

    const hasGoodStructure = headingHierarchy.length >= 2 && headingHierarchy[0]?.level === 1;
    const hasContentBlocks = elements.filter(el => el.type === 'content_block').length > 0;
    
    const confidence = (hasGoodStructure ? 0.5 : 0) + (hasContentBlocks ? 0.5 : 0);

    if (confidence > 0.5) {
      const articleElements = [
        ...headingHierarchy,
        ...elements.filter(el => el.type === 'content_block')
      ];

      return {
        type: 'article_content',
        confidence,
        elements: articleElements,
        description: `Article with ${headingHierarchy.length} headings and structured content`
      };
    }

    return null;
  }

  private detectNavigationMenu(elements: PageElement[], context: PageContext): ContentPattern | null {
    const navLists = elements.filter(el => el.type === 'list' && el.metadata?.itemCount && el.metadata.itemCount > 3);
    const navLinks = elements.filter(el => el.type === 'link' && el.metadata?.position?.y && el.metadata.position.y < 200);

    const confidence = (navLists.length > 0 ? 0.5 : 0) + (navLinks.length > 5 ? 0.5 : 0);

    if (confidence > 0.5) {
      return {
        type: 'navigation_menu',
        confidence,
        elements: [...navLists, ...navLinks.slice(0, 10)],
        description: `Navigation with ${navLinks.length} top-level links`
      };
    }

    return null;
  }

  private detectFormFields(elements: PageElement[], context: PageContext): ContentPattern | null {
    const formElements = elements.filter(el => 
      ['input', 'select', 'textarea', 'button'].includes(el.type)
    );

    const confidence = formElements.length > 2 ? Math.min(formElements.length / 10, 1) : 0;

    if (confidence > 0.3) {
      return {
        type: 'form_fields',
        confidence,
        elements: formElements,
        description: `Form with ${formElements.length} input fields`
      };
    }

    return null;
  }

  private detectDataTable(elements: PageElement[], context: PageContext): ContentPattern | null {
    // This would need more sophisticated table detection
    // For now, return null as it requires DOM table analysis
    return null;
  }

  private classifyContentByImportance(elements: PageElement[], patterns: ContentPattern[]) {
    const primary: PageElement[] = [];
    const secondary: PageElement[] = [];
    const interactive: PageElement[] = [];

    // Get elements from high-confidence patterns
    const highConfidenceElements = new Set(
      patterns
        .filter(p => p.confidence > 0.7)
        .flatMap(p => p.elements.map(e => e.ref))
    );

    elements.forEach(element => {
      if (['input', 'button', 'select', 'textarea'].includes(element.type) || element.role === 'button') {
        interactive.push(element);
      } else if (highConfidenceElements.has(element.ref || '')) {
        primary.push(element);
      } else if (element.type === 'heading' && element.level && element.level <= 2) {
        primary.push(element);
      } else {
        secondary.push(element);
      }
    });

    return { primary, secondary, interactive };
  }

  private calculateRelevanceScore(patterns: ContentPattern[], primaryContent: PageElement[]): number {
    const patternScore = patterns.reduce((sum, p) => sum + p.confidence, 0) / Math.max(patterns.length, 1);
    const contentScore = Math.min(primaryContent.length / 20, 1); // Normalize to 0-1
    
    return (patternScore * 0.7 + contentScore * 0.3);
  }

  private generateRecommendations(patterns: ContentPattern[], context: PageContext): string[] {
    const recommendations: string[] = [];

    if (patterns.length === 0) {
      recommendations.push('Page structure is unclear - consider using semantic HTML elements');
    }

    const highConfidencePatterns = patterns.filter(p => p.confidence > 0.7);
    if (highConfidencePatterns.length > 0) {
      recommendations.push(`Detected ${highConfidencePatterns[0].type} pattern - focus on ${highConfidencePatterns[0].description.toLowerCase()}`);
    }

    if (context.viewport.width < 768) {
      recommendations.push('Mobile viewport detected - prioritize touch-friendly elements');
    }

    return recommendations;
  }
}
