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

import { PageSnapshot } from './pageSnapshot.js';
import { globalErrorHandler, ErrorCategory } from './errorHandler.js';

import type { Context } from './context.js';
import { callOnPageNoTrace } from './tools/utils.js';

export class Tab {
  readonly context: Context;
  readonly page: playwright.Page;
  private _consoleMessages: playwright.ConsoleMessage[] = [];
  private _requests: Map<playwright.Request, playwright.Response | null> = new Map();
  private _snapshot: PageSnapshot | undefined;
  private _onPageClose: (tab: Tab) => void;
  private _consoleCollectionEnabled = true;
  private _eventHandlersAttached = false;
  private _tabId: string;

  constructor(context: Context, page: playwright.Page, onPageClose: (tab: Tab) => void) {
    this.context = context;
    this.page = page;
    this._onPageClose = onPageClose;
    this._tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this._setupEventHandlers();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(5000);
  }

  private _clearCollectedArtifacts() {
    this._consoleMessages.length = 0;
    this._requests.clear();
  }

  private _onClose() {
    this._clearCollectedArtifacts();
    this._onPageClose(this);
  }

  async title(): Promise<string> {
    return await callOnPageNoTrace(this.page, page => page.title());
  }

  async waitForLoadState(state: 'load', options?: { timeout?: number }): Promise<void> {
    await callOnPageNoTrace(this.page, page => page.waitForLoadState(state, options).catch(() => {}));
  }

  async navigate(url: string) {
    this._clearCollectedArtifacts();

    const downloadEvent = callOnPageNoTrace(this.page, page => page.waitForEvent('download').catch(() => {}));
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (_e: unknown) {
      const e = _e as Error;
      const mightBeDownload =
        e.message.includes('net::ERR_ABORTED') // chromium
        || e.message.includes('Download is starting'); // firefox + webkit
      if (!mightBeDownload)
        throw e;

      // on chromium, the download event is fired *after* page.goto rejects, so we wait a lil bit
      const download = await Promise.race([
        downloadEvent,
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
      if (!download)
        throw e;
    }

    // Cap load event to 5 seconds, the page is operational at this point.
    await this.waitForLoadState('load', { timeout: 5000 });
  }

  hasSnapshot(): boolean {
    return !!this._snapshot;
  }

  snapshotOrDie(): PageSnapshot {
    if (!this._snapshot)
      throw new Error('No snapshot available');
    return this._snapshot;
  }

  consoleMessages(): playwright.ConsoleMessage[] {
    return this._consoleMessages;
  }

  /**
   * Get tab ID for error tracking
   */
  getTabId(): string {
    return this._tabId;
  }

  /**
   * Check if console collection is enabled
   */
  isConsoleCollectionEnabled(): boolean {
    return this._consoleCollectionEnabled;
  }

  /**
   * Disable console collection (used for recovery)
   */
  disableConsoleCollection(): void {
    this._consoleCollectionEnabled = false;
    this._consoleMessages = [];
  }

  /**
   * Re-enable console collection with error handling
   */
  enableConsoleCollection(): void {
    this._consoleCollectionEnabled = true;
  }

  /**
   * Setup event handlers with comprehensive error handling and recovery
   */
  private _setupEventHandlers(): void {
    if (this._eventHandlersAttached) {
      return;
    }

    try {
      this._attachConsoleHandler();
      this._attachNetworkHandlers();
      this._attachModalHandlers();
      this._attachLifecycleHandlers();
      
      this._eventHandlersAttached = true;
    } catch (error) {
      const classified = globalErrorHandler.handleError(error as Error, {
        url: this.page.url(),
        tabId: this._tabId
      });
      
      // Attempt recovery based on error classification
      this._attemptEventHandlerRecovery(classified);
    }
  }

  /**
   * Attach console event handler with advanced error handling
   */
  private _attachConsoleHandler(): void {
    this.page.on('console', event => {
      if (!this._consoleCollectionEnabled) {
        return;
      }

      try {
        this._consoleMessages.push(event);
      } catch (error) {
        const classified = globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId
        });

        // Handle ElementHandle-specific errors
        if (classified.category === ErrorCategory.ELEMENT_HANDLE) {
          this._handleElementHandleError(classified);
        } else {
          // For other console errors, just skip this event
          console.warn(`Console event skipped due to error: ${classified.message}`);
        }
      }
    });
  }

  /**
   * Attach network-related event handlers
   */
  private _attachNetworkHandlers(): void {
    this.page.on('request', request => {
      try {
        this._requests.set(request, null);
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId,
          additionalData: { requestUrl: request.url() }
        });
      }
    });
    
    this.page.on('response', response => {
      try {
        this._requests.set(response.request(), response);
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId,
          additionalData: { responseUrl: response.url() }
        });
      }
    });
  }

  /**
   * Attach modal and dialog handlers
   */
  private _attachModalHandlers(): void {
    this.page.on('filechooser', chooser => {
      try {
        this.context.setModalState({
          type: 'fileChooser',
          description: 'File chooser',
          fileChooser: chooser,
        }, this);
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId
        });
      }
    });
    
    this.page.on('dialog', dialog => {
      try {
        this.context.dialogShown(this, dialog);
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId,
          additionalData: { dialogType: dialog.type() }
        });
      }
    });
    
    this.page.on('download', download => {
      try {
        void this.context.downloadStarted(this, download);
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId,
          additionalData: { downloadFilename: download.suggestedFilename() }
        });
      }
    });
  }

  /**
   * Attach lifecycle event handlers
   */
  private _attachLifecycleHandlers(): void {
    this.page.on('close', () => {
      try {
        this._onClose();
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId
        });
      }
    });
  }

  /**
   * Handle ElementHandle-specific errors with recovery strategies
   */
  private _handleElementHandleError(classifiedError: any): void {
    switch (classifiedError.recoveryStrategy) {
      case 'disable_console_collection':
        console.warn(`Disabling console collection for tab ${this._tabId} due to ElementHandle errors`);
        this.disableConsoleCollection();
        break;
      
      case 'retry_with_fallback':
        // For now, just disable console collection as a fallback
        this.disableConsoleCollection();
        break;
      
      default:
        console.warn(`Unknown recovery strategy: ${classifiedError.recoveryStrategy}`);
        break;
    }
  }

  /**
   * Attempt to recover from event handler setup failures
   */
  private _attemptEventHandlerRecovery(classifiedError: any): void {
    console.warn(`Event handler setup failed for tab ${this._tabId}, attempting recovery...`);
    
    // Try to attach handlers individually to isolate the problem
    const handlers = [
      () => this._attachNetworkHandlers(),
      () => this._attachModalHandlers(),
      () => this._attachLifecycleHandlers()
    ];

    for (const handler of handlers) {
      try {
        handler();
      } catch (error) {
        globalErrorHandler.handleError(error as Error, {
          url: this.page.url(),
          tabId: this._tabId
        });
      }
    }

    // Try console handler last, as it's most likely to fail
    try {
      this._attachConsoleHandler();
    } catch (error) {
      console.warn(`Console handler attachment failed for tab ${this._tabId}, disabling console collection`);
      this.disableConsoleCollection();
    }

    this._eventHandlersAttached = true;
  }

  requests(): Map<playwright.Request, playwright.Response | null> {
    return this._requests;
  }

  async captureSnapshot() {
    this._snapshot = await PageSnapshot.create(this.page);
  }
}
