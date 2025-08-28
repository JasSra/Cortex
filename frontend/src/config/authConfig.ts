import { Configuration, PopupRequest } from '@azure/msal-browser'

// MSAL Configuration for Azure AD B2C
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || 'c83c5908-2b64-4304-8c53-b964ace5a1ea',
    authority: process.env.NEXT_PUBLIC_AZURE_AD_AUTHORITY || 'https://jsraauth.b2clogin.com/jsraauth.onmicrosoft.com/B2C_1_SIGNUP_SIGNIN',
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000',
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000',
    knownAuthorities: ['jsraauth.b2clogin.com'] // Required for B2C
  },
  cache: {
    cacheLocation: 'sessionStorage', // or 'localStorage'
    storeAuthStateInCookie: false
  }
}

// Add scopes for B2C APIs
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'email']
}

// Silent token acquisition request for B2C
export const tokenRequest = {
  scopes: ['openid', 'profile', 'email'],
  account: null as any
}

// Microsoft Graph configuration (may not be available in B2C)
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me'
}
