import { Configuration, RedirectRequest } from '@azure/msal-browser'

// MSAL Configuration for Azure AD B2C
const AUTH_CLIENT_ID = (globalThis as any).process?.env?.NEXT_PUBLIC_MSAL_CLIENT_ID || 'c83c5908-2b64-4304-8c53-b964ace5a1ea'
const AUTH_AUTHORITY = (globalThis as any).process?.env?.NEXT_PUBLIC_MSAL_AUTHORITY || 'https://jsraauth.b2clogin.com/jsraauth.onmicrosoft.com/B2C_1_SIGNUP_SIGNIN/v2.0'
const AUTH_KNOWN_AUTHORITIES = ((globalThis as any).process?.env?.NEXT_PUBLIC_MSAL_KNOWN_AUTHORITIES || 'jsraauth.b2clogin.com').split(',').map((s: string) => s.trim()).filter(Boolean)

export const msalConfig: Configuration = {
  auth: {
    clientId: AUTH_CLIENT_ID,
    authority: AUTH_AUTHORITY,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    navigateToLoginRequestUrl: false, // stay on callback while handling
    knownAuthorities: AUTH_KNOWN_AUTHORITIES // Required for B2C
  },
  cache: {
    cacheLocation: 'sessionStorage', // or 'localStorage'
    storeAuthStateInCookie: false
  }
}

// B2C-specific scopes configuration
const TENANT_DOMAIN = (globalThis as any).process?.env?.NEXT_PUBLIC_TENANT_DOMAIN || 'jsraauth.onmicrosoft.com'
const APP_ID = AUTH_CLIENT_ID
export const MSAL_SCOPES = {
  admin: `https://${TENANT_DOMAIN}/${APP_ID}/Consolidated.Administrator`,
  client: `https://${TENANT_DOMAIN}/${APP_ID}/Consolidated.Client`,
  user: `https://${TENANT_DOMAIN}/${APP_ID}/Consolidated.User`,
} as const

// Add scopes for B2C APIs - changed to RedirectRequest
export const loginRequest: RedirectRequest = {
  scopes: [
    'openid',
    'profile',
    'email',
    // Request at least one API scope so we get an access token acceptable to backend
    MSAL_SCOPES.user
  ]
}

// Silent token acquisition request for B2C
export const tokenRequest = {
  scopes: ['openid', 'profile', 'email', MSAL_SCOPES.user],
  account: null as any
}

// IDP Configuration for additional identity providers
interface IdpConfiguration {
  id: string
  name: string
  issuer: string
  audience: string
  scopes: string[]
  tokenExpiryMinutes: number
  isEnabled: boolean
}

const getDefaultIdpConfiguration = (): IdpConfiguration => ({
  id: process.env.NEXT_PUBLIC_IDP_ID || "default-idp",
  name: process.env.NEXT_PUBLIC_IDP_NAME || "Default Identity Provider",
  issuer: process.env.NEXT_PUBLIC_MSAL_AUTHORITY || AUTH_AUTHORITY,
  audience: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || AUTH_CLIENT_ID,
  scopes: ["openid", "profile", "email"],
  tokenExpiryMinutes: 30,
  isEnabled: true,
})

export const idpConfig = getDefaultIdpConfiguration()
