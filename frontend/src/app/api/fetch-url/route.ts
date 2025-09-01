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
  type?: 'html' | 'pdf' | 'github' | 'hackernews' | 'links'
  pdfData?: string // base64 encoded PDF data
  extractedLinks?: string[] // for HN and similar sites
  isMultiContent?: boolean // indicates multiple pieces of content
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

// Specialized handlers for different URL types

async function handleGitHubUrl(url: string): Promise<UrlFetchResponse> {
  const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?/)
  if (!githubMatch) {
    throw new Error('Invalid GitHub URL format')
  }
  
  const [, owner, repo] = githubMatch
  
  // Try to fetch README.md from the GitHub API
  const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`
  
  try {
    const readmeResponse = await fetchUrlWithTimeout(readmeUrl)
    
    if (readmeResponse.ok) {
      const readmeData = await readmeResponse.json()
      const readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8')
      
      return {
        success: true,
        url,
        finalUrl: url,
        title: `${owner}/${repo} - README`,
        textContent: readmeContent,
        content: readmeContent,
        siteName: 'GitHub',
        byline: `Repository by ${owner}`,
        fetchedAt: new Date().toISOString(),
        type: 'github'
      }
    }
  } catch (error) {
    console.log('Failed to fetch README from GitHub API, falling back to web scraping')
  }
  
  // Fallback: scrape the GitHub page normally
  return await handleHtmlUrl(url)
}

async function handlePdfUrl(url: string): Promise<UrlFetchResponse> {
  const response = await fetchUrlWithTimeout(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/pdf')) {
    throw new Error(`Expected PDF but got content type: ${contentType}`)
  }
  
  // Check file size (limit to 50MB for PDFs)
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
    throw new Error('PDF too large (max 50MB)')
  }
  
  const arrayBuffer = await response.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString('base64')
  
  // Extract filename from URL or Content-Disposition header
  const disposition = response.headers.get('content-disposition')
  let filename = 'document.pdf'
  
  if (disposition && disposition.includes('filename=')) {
    const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    if (filenameMatch) {
      filename = filenameMatch[1].replace(/['"]/g, '')
    }
  } else {
    // Extract from URL
    const urlPath = new URL(url).pathname
    const urlFilename = urlPath.split('/').pop()
    if (urlFilename && urlFilename.endsWith('.pdf')) {
      filename = urlFilename
    }
  }
  
  return {
    success: true,
    url,
    finalUrl: response.url,
    title: filename.replace('.pdf', ''),
    textContent: `PDF document: ${filename}`,
    siteName: new URL(url).hostname,
    fetchedAt: new Date().toISOString(),
    type: 'pdf',
    pdfData: base64Data
  }
}

async function handleHackerNewsUrl(url: string): Promise<UrlFetchResponse> {
  const response = await fetchUrlWithTimeout(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const document = dom.window.document
  
  // Extract links from HN comments and story links
  const links: string[] = []
  
  // Get the main story link
  const storyLink = document.querySelector('.storylink')?.getAttribute('href')
  if (storyLink && !storyLink.startsWith('item?')) {
    links.push(storyLink)
  }
  
  // Extract links from comments
  const commentLinks = Array.from(document.querySelectorAll('.comment a[href]'))
    .map(link => link.getAttribute('href'))
    .filter((href): href is string => {
      if (!href) return false
      try {
        const url = new URL(href, 'https://news.ycombinator.com')
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    })
    .map(href => {
      try {
        return new URL(href, 'https://news.ycombinator.com').toString()
      } catch {
        return href
      }
    })
    .filter(url => !url.includes('news.ycombinator.com'))
    .slice(0, 20) // Limit to first 20 links
  
  links.push(...commentLinks)
  
  // Also get the page content for context
  const reader = new Readability(document)
  const article = reader.parse()
  
  return {
    success: true,
    url,
    finalUrl: response.url,
    title: document.querySelector('title')?.textContent || 'Hacker News Discussion',
    textContent: article?.textContent || document.body?.textContent || '',
    content: article?.content || undefined,
    siteName: 'Hacker News',
    fetchedAt: new Date().toISOString(),
    type: 'hackernews',
    extractedLinks: Array.from(new Set(links)), // Remove duplicates
    isMultiContent: true
  }
}

async function handleTwitterUrl(url: string): Promise<UrlFetchResponse> {
  // For Twitter/X URLs, we'll treat them as regular HTML for now
  // In the future, we could integrate with Twitter API
  return await handleHtmlUrl(url)
}

async function handleArxivUrl(url: string): Promise<UrlFetchResponse> {
  // arXiv URLs often point to PDFs
  const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/)
  
  if (arxivMatch) {
    const paperId = arxivMatch[1]
    
    // Try to get the abstract page first for metadata
    const abstractUrl = `https://arxiv.org/abs/${paperId}`
    
    try {
      const abstractResponse = await fetchUrlWithTimeout(abstractUrl)
      if (abstractResponse.ok) {
        const html = await abstractResponse.text()
        const dom = new JSDOM(html, { url: abstractUrl })
        const document = dom.window.document
        
        const title = document.querySelector('h1.title')?.textContent?.replace('Title:', '').trim() ||
                     document.querySelector('meta[name="citation_title"]')?.getAttribute('content') ||
                     `arXiv:${paperId}`
        
        const authors = document.querySelector('.authors')?.textContent?.replace('Authors:', '').trim()
        const abstract = document.querySelector('blockquote.abstract')?.textContent?.replace('Abstract:', '').trim()
        
        // Now try to fetch the PDF
        const pdfUrl = `https://arxiv.org/pdf/${paperId}.pdf`
        
        try {
          const pdfResult = await handlePdfUrl(pdfUrl)
          return {
            ...pdfResult,
            title,
            byline: authors,
            textContent: abstract ? `${abstract}\n\n[PDF document: ${title}]` : pdfResult.textContent,
            siteName: 'arXiv'
          }
        } catch (pdfError) {
          // If PDF fetch fails, return the abstract page content
          return {
            success: true,
            url,
            finalUrl: abstractUrl,
            title,
            textContent: abstract || `arXiv paper: ${title}`,
            byline: authors,
            siteName: 'arXiv',
            fetchedAt: new Date().toISOString(),
            type: 'html'
          }
        }
      }
    } catch (error) {
      console.log('Failed to fetch arXiv abstract, trying PDF directly')
    }
    
    // Fallback: try to fetch PDF directly
    const pdfUrl = url.includes('.pdf') ? url : `https://arxiv.org/pdf/${paperId}.pdf`
    return await handlePdfUrl(pdfUrl)
  }
  
  return await handleHtmlUrl(url)
}

async function handleHtmlUrl(url: string): Promise<UrlFetchResponse> {
  // Fetch the URL with timeout
  const response = await fetchUrlWithTimeout(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  // Check content type
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    throw new Error(`Unsupported content type: ${contentType}. Only HTML pages are supported.`)
  }
  
  // Check content length
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    throw new Error('Content too large (max 10MB)')
  }
  
  const html = await response.text()
  
  // Use JSDOM and Readability to extract clean content
  const dom = new JSDOM(html, { 
    url,
    referrer: url,
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
                  new URL(url).hostname
  
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
    throw new Error('Could not extract meaningful content from the page')
  }
  
  return {
    success: true,
    url,
    finalUrl: response.url, // Final URL after redirects
    title: article.title || title,
    content: article.content || undefined, // HTML content
    textContent: article.textContent || undefined, // Plain text content
    byline: article.byline || undefined,
    excerpt: article.excerpt || undefined,
    publishedTime: article.publishedTime || undefined,
    siteName: siteName,
    fetchedAt: new Date().toISOString(),
    type: 'html'
  }
}

function determineUrlType(url: string): 'github' | 'pdf' | 'hackernews' | 'twitter' | 'arxiv' | 'html' {
  const urlLower = url.toLowerCase()
  
  if (urlLower.includes('github.com')) {
    return 'github'
  }
  
  if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
    return 'pdf'
  }
  
  if (urlLower.includes('news.ycombinator.com')) {
    return 'hackernews'
  }
  
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'twitter'
  }
  
  if (urlLower.includes('arxiv.org')) {
    return 'arxiv'
  }
  
  return 'html'
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
    
    // Determine URL type and use appropriate handler
    const urlType = determineUrlType(normalizedUrl)
    
    let result: UrlFetchResponse
    
    switch (urlType) {
      case 'github':
        result = await handleGitHubUrl(normalizedUrl)
        break
      case 'pdf':
        result = await handlePdfUrl(normalizedUrl)
        break
      case 'hackernews':
        result = await handleHackerNewsUrl(normalizedUrl)
        break
      case 'twitter':
        result = await handleTwitterUrl(normalizedUrl)
        break
      case 'arxiv':
        result = await handleArxivUrl(normalizedUrl)
        break
      case 'html':
      default:
        result = await handleHtmlUrl(normalizedUrl)
        break
    }
    
    console.log(`Successfully processed ${urlType} URL ${normalizedUrl}: ${result.textContent?.length || 0} characters`)
    
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
