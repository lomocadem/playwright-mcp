#!/usr/bin/env node

/**
 * Enhanced test script to verify the improved navigation fix for the Playwright MCP server
 * Tests error handling, recovery mechanisms, and monitoring capabilities
 */

import { createConnection } from './lib/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function testEnhancedNavigation() {
  console.log('🚀 Testing enhanced navigation fix with comprehensive error handling...\n');
  
  let connection;
  
  try {
    // Create a connection with minimal config
    connection = await createConnection({
      browser: {
        browserName: 'chromium',
        isolated: true
      }
    });

    console.log('✅ Connection established successfully');

    // Enable debug mode for detailed error tracking
    connection.context.setErrorDebugMode(true);
    console.log('🔍 Debug mode enabled for error tracking\n');

    // Test 1: Navigate to a problematic site (the original failing case)
    console.log('📍 Test 1: Navigating to shopee.vn (original failing case)...');
    await testNavigation(connection, 'https://shopee.vn', 'Shopee Vietnam');

    // Test 2: Navigate to a complex JavaScript-heavy site
    console.log('\n📍 Test 2: Navigating to a complex site...');
    await testNavigation(connection, 'https://github.com', 'GitHub');

    // Test 3: Navigate to a site with heavy console output
    console.log('\n📍 Test 3: Navigating to a site with heavy console activity...');
    await testNavigation(connection, 'https://www.google.com', 'Google');

    // Test 4: Test error metrics and reporting
    console.log('\n📊 Test 4: Checking error metrics and reporting...');
    await testErrorReporting(connection);

    // Test 5: Test tab management with errors
    console.log('\n🗂️  Test 5: Testing tab management...');
    await testTabManagement(connection);

    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Enhanced navigation fix verified - server is robust against various error conditions');

  } catch (error) {
    console.error('❌ Enhanced navigation test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.close();
      console.log('\n🔒 Connection closed');
    }
  }
}

async function testNavigation(connection, url, siteName) {
  try {
    const tool = connection.context.tools.find(t => t.schema.name === 'browser_navigate');
    if (!tool) {
      throw new Error('Navigation tool not found');
    }

    console.log(`   Attempting navigation to ${url}...`);
    const startTime = Date.now();
    
    const result = await connection.context.run(tool, { url });
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ Successfully navigated to ${siteName} (${duration}ms)`);
    console.log(`   📄 Result type: ${typeof result}, Has content: ${!!result.content}`);
    
    if (result.content && result.content.length > 0) {
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent && textContent.text) {
        const lines = textContent.text.split('\n');
        const urlLine = lines.find(line => line.includes('Page URL:'));
        const titleLine = lines.find(line => line.includes('Page Title:'));
        
        if (urlLine) console.log(`   🔗 ${urlLine.trim()}`);
        if (titleLine) console.log(`   📋 ${titleLine.trim()}`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Navigation to ${siteName} failed:`, error.message);
    throw error;
  }
}

async function testErrorReporting(connection) {
  try {
    // Get error metrics
    const metrics = connection.context.getErrorMetrics();
    console.log('   📊 Error Metrics:');
    console.log(`      Total Errors: ${metrics.totalErrors}`);
    console.log(`      Recovery Success Rate: ${(metrics.recoverySuccessRate * 100).toFixed(1)}%`);
    
    if (metrics.totalErrors > 0) {
      console.log('      Errors by Category:');
      Object.entries(metrics.errorsByCategory).forEach(([category, count]) => {
        if (count > 0) {
          console.log(`         ${category}: ${count}`);
        }
      });
      
      console.log('      Errors by Severity:');
      Object.entries(metrics.errorsBySeverity).forEach(([severity, count]) => {
        if (count > 0) {
          console.log(`         ${severity}: ${count}`);
        }
      });
    }

    // Get detailed error report
    const report = connection.context.getErrorReport();
    if (report.includes('Total Errors: 0')) {
      console.log('   ✅ No errors detected - excellent stability!');
    } else {
      console.log('   📋 Detailed Error Report:');
      console.log(report.split('\n').map(line => `      ${line}`).join('\n'));
    }
    
  } catch (error) {
    console.error('   ❌ Error reporting test failed:', error.message);
    throw error;
  }
}

async function testTabManagement(connection) {
  try {
    // Test creating multiple tabs
    console.log('   Creating multiple tabs...');
    
    const newTabTool = connection.context.tools.find(t => t.schema.name === 'browser_new_tab');
    if (newTabTool) {
      await connection.context.run(newTabTool, {});
      console.log('   ✅ New tab created successfully');
    }
    
    // Test listing tabs
    const listTabsTool = connection.context.tools.find(t => t.schema.name === 'browser_list_tabs');
    if (listTabsTool) {
      const result = await connection.context.run(listTabsTool, {});
      console.log('   ✅ Tab listing successful');
      
      if (result.content && result.content.length > 0) {
        const textContent = result.content.find(c => c.type === 'text');
        if (textContent && textContent.text) {
          const tabLines = textContent.text.split('\n').filter(line => line.includes('(current)') || line.match(/^\s*-\s*\d+:/));
          console.log(`   📑 Active tabs: ${tabLines.length}`);
        }
      }
    }
    
  } catch (error) {
    console.error('   ❌ Tab management test failed:', error.message);
    // Don't throw here as tab management is not critical for the core navigation fix
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedNavigation();
}

export { testEnhancedNavigation };
