import { Configuration, RedirectRequest } from '@azure/msal-browser'

// MSAL Configuration for Azure AD B2C
export const msalConfig: Configuration = {
  auth: {
    clientId: 'c83c5908-2b64-4304-8c53-b964ace5a1ea',
    authority: 'https://jsraauth.b2clogin.com/jsraauth.onmicrosoft.com/B2C_1_SIGNUP_SIGNIN',
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
    navigateToLoginRequestUrl: false, // stay on callback while handling
    knownAuthorities: ['jsraauth.b2clogin.com'] // Required for B2C
  },
  cache: {
    cacheLocation: 'sessionStorage', // or 'localStorage'
    storeAuthStateInCookie: false
  }
}

// B2C-specific scopes configuration
export const MSAL_SCOPES = {
  admin: 'https://jsraauth.onmicrosoft.com/c83c5908-2b64-4304-8c53-b964ace5a1ea/Consolidated.Administrator',
  client: 'https://jsraauth.onmicrosoft.com/c83c5908-2b64-4304-8c53-b964ace5a1ea/Consolidated.Client',
  user: 'https://jsraauth.onmicrosoft.com/c83c5908-2b64-4304-8c53-b964ace5a1ea/Consolidated.User',
} as const

// Add scopes for B2C APIs - changed to RedirectRequest
export const loginRequest: RedirectRequest = {
  scopes: ['openid', 'profile', 'email']
}

// Silent token acquisition request for B2C
export const tokenRequest = {
  scopes: ['openid', 'profile', 'email'],
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
  issuer: process.env.NEXT_PUBLIC_MSAL_AUTHORITY ||'https://jsraauth.b2clogin.com/jsraauth.onmicrosoft.com/B2C_1_SIGNUP_SIGNIN',
  audience: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "c83c5908-2b64-4304-8c53-b964ace5a1ea",
  scopes: ["openid", "profile", "email"],
  tokenExpiryMinutes: 30,
  isEnabled: true,
})

export const idpConfig = getDefaultIdpConfiguration()
