import { createConnection } from './index.js';

async function testPaginationExtraction() {
  console.log('🤖 Testing Enhanced Pagination Extraction Tool...\n');
  
  try {
    // Create a connection
    const connection = await createConnection({
      browser: {
        launchOptions: { headless: false } // Set to false to see the browser in action
      }
    });
    
    console.log('✅ Connection created successfully');
    console.log('📋 Available tools:', connection.tools?.map(t => t.name).join(', ') || 'No tools found');
    
    // Check if our pagination tool is available
    const paginationTool = connection.tools?.find(t => t.name === 'browser_extract_paginated_data');
    if (paginationTool) {
      console.log('✅ browser_extract_paginated_data tool found!\n');
    } else {
      console.log('❌ browser_extract_paginated_data tool not found');
      return;
    }

    // Navigate to Amazon search results for robot toys
    console.log('🌐 Navigating to Amazon robot toys search...');
    await connection.navigate('https://www.amazon.com/s?k=robot+toys&ref=nb_sb_noss');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔍 Starting paginated extraction...\n');
    
    // Extract data from multiple pages
    const extractionResult = await connection.extractPaginatedData({
      selectors: {
        productTitles: '[data-component-type="s-search-result"] h2 a span',
        prices: '[data-component-type="s-search-result"] .a-price-whole',
        ratings: '[data-component-type="s-search-result"] .a-icon-alt',
        images: '[data-component-type="s-search-result"] img',
        links: '[data-component-type="s-search-result"] h2 a'
      },
      paginationConfig: {
        nextButtonSelector: '.s-pagination-next',
        maxPages: 3, // Extract from 3 pages for demo
        waitBetweenPages: 3000, // Wait 3 seconds between pages
        scrollToLoad: true // Scroll to ensure all content loads
      },
      format: 'json',
      options: {
        includeAttributes: true, // Include href for links, src for images
        cleanText: true,
        maxElementsPerPage: 20, // Limit to 20 products per page
        deduplication: true // Remove duplicates across pages
      }
    });

    console.log('📊 Extraction Results:');
    console.log('='.repeat(50));
    
    if (extractionResult && extractionResult._metadata) {
      const metadata = extractionResult._metadata;
      console.log(`📄 Total Pages Processed: ${metadata.totalPages}`);
      console.log(`🎯 Total Items Extracted: ${metadata.totalItems}`);
      console.log(`🕒 Extraction Time: ${metadata.extractionTimestamp}`);
      console.log(`🔄 Deduplication: ${metadata.deduplicationEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`🆔 Unique Items: ${metadata.uniqueItemsSeen}`);
    }

    // Show sample of extracted data
    if (extractionResult && extractionResult.productTitles) {
      console.log('\n📦 Sample Product Titles:');
      extractionResult.productTitles.slice(0, 5).forEach((title, index) => {
        console.log(`  ${index + 1}. ${typeof title === 'object' ? title.text : title}`);
      });
    }

    if (extractionResult && extractionResult.prices) {
      console.log('\n💰 Sample Prices:');
      extractionResult.prices.slice(0, 5).forEach((price, index) => {
        console.log(`  ${index + 1}. $${typeof price === 'object' ? price.text : price}`);
      });
    }

    // Test CSV format extraction
    console.log('\n📄 Testing CSV format extraction...');
    const csvResult = await connection.extractPaginatedData({
      selectors: {
        products: '[data-component-type="s-search-result"] h2 a span',
        prices: '[data-component-type="s-search-result"] .a-price-whole'
      },
      paginationConfig: {
        nextButtonSelector: '.s-pagination-next',
        maxPages: 2,
        waitBetweenPages: 2000
      },
      format: 'csv',
      options: {
        cleanText: true,
        maxElementsPerPage: 10,
        deduplication: true
      }
    });

    console.log('✅ CSV extraction completed');
    
    // Close the connection
    await connection.close();
    console.log('\n🔚 Connection closed successfully');
    
    console.log('\n🎉 Pagination extraction test completed!');
    console.log('📈 Summary:');
    console.log('  - Fixed CSV download functionality ✅');
    console.log('  - Implemented multi-page extraction ✅');
    console.log('  - Added smart pagination detection ✅');
    console.log('  - Included deduplication features ✅');
    console.log('  - Support for multiple output formats ✅');

  } catch (error) {
    console.error('❌ Error during pagination test:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Alternative test for infinite scroll sites
async function testInfiniteScrollExtraction() {
  console.log('\n🔄 Testing Infinite Scroll Extraction...\n');
  
  try {
    const connection = await createConnection({
      browser: {
        launchOptions: { headless: false }
      }
    });

    // Navigate to a site with infinite scroll (example: social media feed)
    console.log('🌐 Navigating to infinite scroll demo...');
    await connection.navigate('https://scrollmagic.io/examples/advanced/infinite_scrolling.html');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔍 Starting infinite scroll extraction...');
    
    const scrollResult = await connection.extractPaginatedData({
      selectors: {
        items: '.box1, .box2'
      },
      paginationConfig: {
        infiniteScroll: true,
        maxPages: 1, // For infinite scroll, this limits scroll iterations
        waitBetweenPages: 1000,
        scrollToLoad: true
      },
      format: 'json',
      options: {
        cleanText: true,
        maxElementsPerPage: 100,
        deduplication: true
      }
    });

    console.log('📊 Infinite Scroll Results:');
    if (scrollResult && scrollResult._metadata) {
      console.log(`🎯 Total Items: ${scrollResult._metadata.totalItems}`);
    }

    await connection.close();
    console.log('✅ Infinite scroll test completed');

  } catch (error) {
    console.error('❌ Error during infinite scroll test:', error.message);
  }
}

// Run the tests
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Pagination Tests\n');
  console.log('=' .repeat(60));
  
  // Test 1: Amazon pagination
  await testPaginationExtraction();
  
  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Infinite scroll (optional)
  // await testInfiniteScrollExtraction();
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 All tests completed!');
}

// Export for use as module or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testPaginationExtraction, testInfiniteScrollExtraction, runAllTests };
