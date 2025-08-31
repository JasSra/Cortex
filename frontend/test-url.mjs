import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

async function testUrlFetch(url) {
  console.log(`Testing URL: ${url}`);
  
  try {
    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`HTML length: ${html.length}`);
    console.log(`HTML preview: ${html.substring(0, 200)}...`);
    
    // Parse with JSDOM
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    console.log(`Article parsed:`, {
      title: article?.title,
      content_length: article?.content?.length,
      text_length: article?.textContent?.length,
      byline: article?.byline,
      excerpt: article?.excerpt
    });
    
    return {
      success: true,
      title: article?.title,
      content: article?.content,
      textContent: article?.textContent,
      byline: article?.byline,
      excerpt: article?.excerpt
    };
    
  } catch (error) {
    console.error(`Error processing URL:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test the problematic URL
testUrlFetch('https://sheafification.com/the-fast-track/')
  .then(result => {
    console.log('\nFinal result:', result);
  })
  .catch(error => {
    console.error('\nUnhandled error:', error);
  });
