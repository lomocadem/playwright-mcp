import { createConnection } from './index.js';

async function testExtraction() {
  console.log('Testing data extraction tool...');
  
  try {
    // Create a connection
    const connection = await createConnection({
      browser: {
        launchOptions: { headless: true }
      }
    });
    
    console.log('Connection created successfully');
    console.log('Available tools:', connection.tools?.map(t => t.name) || 'No tools found');
    
    // Check if our extraction tool is available
    const extractionTool = connection.tools?.find(t => t.name === 'browser_extract_data');
    if (extractionTool) {
      console.log('✅ browser_extract_data tool found!');
    } else {
      console.log('❌ browser_extract_data tool not found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExtraction();
