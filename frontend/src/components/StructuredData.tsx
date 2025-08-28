'use client'

export function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Cortex - Personal Knowledge Hub",
    "description": "A secure, AI-powered personal knowledge management system with voice capabilities and Azure AD B2C authentication",
    "url": "https://cortex.yourdomain.com",
    "applicationCategory": "ProductivityApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "AI-powered document search",
      "Voice note recording",
      "Secure Azure AD B2C authentication",
      "Document upload and organization",
      "Intelligent tagging and classification",
      "Dark mode interface",
      "Personal knowledge management"
    ],
    "applicationSubCategory": "Knowledge Management",
    "browserRequirements": "Requires modern web browser with JavaScript enabled",
    "permissions": "Microphone access for voice features"
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}
