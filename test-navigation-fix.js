#!/usr/bin/env node

/**
 * Test script to verify the navigation fix for the Playwright MCP server
 */

import { createConnection } from './lib/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function testNavigation() {
  console.log('Testing navigation fix...');
  
  try {
    // Create a connection with minimal config
    const connection = await createConnection({
      browser: {
        browserName: 'chromium',
        isolated: true
      }
    });

    // Simulate a navigation request like the one that was failing
    const testRequest = {
      params: {
        name: 'browser_navigate',
        arguments: {
          url: 'https://shopee.vn'
        }
      }
    };

    console.log('Attempting navigation to shopee.vn...');
    
    // This would normally be called by the MCP framework
    const tool = connection.context.tools.find(t => t.schema.name === 'browser_navigate');
    if (!tool) {
      throw new Error('Navigation tool not found');
    }

    // Test the navigation
    const result = await connection.context.run(tool, testRequest.params.arguments);
    
    console.log('Navigation test completed successfully!');
    console.log('Result type:', typeof result);
    console.log('Has content:', !!result.content);
    
    // Clean up
    await connection.close();
    
    console.log('✅ Navigation fix verified - server no longer crashes on navigation');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Navigation test failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testNavigation();
}
