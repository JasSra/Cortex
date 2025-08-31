import { NextRequest, NextResponse } from 'next/server'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

interface UrlFetchRequest {
  url: string
}

interface UrlFetchResponse {
  success: boolean
  url: string
  title?: string
  content?: string
  textContent?: string
  byline?: string
  excerpt?: string
  publishedTime?: string
  siteName?: string
  error?: string
  finalUrl?: string
  fetchedAt: string
}

// URL validation and normalization
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed')
    }
    
    // Remove tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'ref', 'source'
    ]
    
    trackingParams.forEach(param => {
      parsed.searchParams.delete(param)
    })
    
    // Remove fragment (hash)
    parsed.hash = ''
    
    return parsed.toString()
  } catch (error) {
    throw new Error(`Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function validateUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required and must be a string')
  }
  
  if (url.length > 2048) {
    throw new Error('URL is too long (max 2048 characters)')
  }
  
  // Check for potentially malicious patterns
  const suspiciousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /file:/i,
    /ftp:/i
  ]
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url)) {
      throw new Error('URL protocol not allowed')
    }
  }
}

async function fetchUrlWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Cortex-Bot/1.0; +https://cortex.ai/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      // Security: limit redirects
      // Note: fetch doesn't have a built-in redirect limit, but most browsers limit to ~20
    })
    
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - URL took too long to respond')
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UrlFetchRequest
    const { url } = body
    
    // Validate URL
    validateUrl(url)
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(url)
    
    console.log(`Fetching URL: ${normalizedUrl}`)
    
    // Fetch the URL with timeout
    const response = await fetchUrlWithTimeout(normalizedUrl)
    
    if (!response.ok) {
      return NextResponse.json({
        success: false,
        url: normalizedUrl,
        error: `HTTP ${response.status}: ${response.statusText}`,
        fetchedAt: new Date().toISOString()
      } as UrlFetchResponse, { status: 400 })
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({
        success: false,
        url: normalizedUrl,
        error: `Unsupported content type: ${contentType}. Only HTML pages are supported.`,
        fetchedAt: new Date().toISOString()
      } as UrlFetchResponse, { status: 400 })
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({
        success: false,
        url: normalizedUrl,
        error: 'Content too large (max 10MB)',
        fetchedAt: new Date().toISOString()
      } as UrlFetchResponse, { status: 400 })
    }
    
    const html = await response.text()
    
    // Use JSDOM and Readability to extract clean content
    const dom = new JSDOM(html, { 
      url: normalizedUrl,
      referrer: normalizedUrl,
      contentType: "text/html",
      includeNodeLocations: false,
      storageQuota: 10000000
    })
    
    const document = dom.window.document
    
    // Extract basic metadata
    const title = document.querySelector('title')?.textContent || 
                 document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                 document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                 'Untitled'
    
    const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
                    new URL(normalizedUrl).hostname
    
    // Use Readability for clean content extraction
    const reader = new Readability(document, {
      debug: false,
      maxElemsToParse: 0,
      nbTopCandidates: 5,
      charThreshold: 500,
      classesToPreserve: ['highlight', 'code', 'pre'],
      keepClasses: false
    })
    
    const article = reader.parse()
    
    if (!article || !article.textContent || article.textContent.trim().length < 100) {
      return NextResponse.json({
        success: false,
        url: normalizedUrl,
        error: 'Could not extract meaningful content from the page',
        fetchedAt: new Date().toISOString()
      } as UrlFetchResponse, { status: 400 })
    }
    
    // Successful extraction
    const result: UrlFetchResponse = {
      success: true,
      url: normalizedUrl,
      finalUrl: response.url, // Final URL after redirects
      title: article.title || title,
      content: article.content || undefined, // HTML content
      textContent: article.textContent || undefined, // Plain text content
      byline: article.byline || undefined,
      excerpt: article.excerpt || undefined,
      publishedTime: article.publishedTime || undefined,
      siteName: siteName,
      fetchedAt: new Date().toISOString()
    }
    
    console.log(`Successfully extracted content from ${normalizedUrl}: ${article.textContent.length} characters`)
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('URL fetch error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json({
      success: false,
      url: '',
      error: errorMessage,
      fetchedAt: new Date().toISOString()
    } as UrlFetchResponse, { status: 500 })
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'OK', 
    service: 'URL Fetch API',
    timestamp: new Date().toISOString()
  })
}
