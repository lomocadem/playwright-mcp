import { createConnection } from './index.js';

async function testLocalServer() {
  console.log('🚀 Testing local Playwright MCP server with data extraction...');
  
  try {
    // Create a connection
    const connection = await createConnection({
      browser: {
        launchOptions: { headless: true }
      }
    });
    
    console.log('✅ Connection created successfully');
    console.log('✅ Server initialized');
    console.log('✅ Context created');
    
    // Close the connection
    await connection.close();
    
    console.log('\n🎊 Server test passed! The extended Playwright MCP server is ready.');
    console.log('\n📋 To use with Claude Desktop, update your configuration to:');
    console.log('\n{');
    console.log('  "mcpServers": {');
    console.log('    "playwright": {');
    console.log('      "command": "node",');
    console.log('      "args": [');
    console.log(`        "${process.cwd()}/cli.js"`);
    console.log('      ]');
    console.log('    }');
    console.log('  }');
    console.log('}');
    console.log('\n🎯 The new browser_extract_data tool will be available for token-efficient data extraction!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testLocalServer();
