# Cortex Authentication Setup Guide

## MSAL.js Integration

Cortex now uses Microsoft Authentication Library (MSAL) for secure user authentication. This guide will help you configure Azure AD authentication for your deployment.

## Prerequisites

1. An Azure AD tenant (free tier available)
2. Administrative access to register applications in Azure AD

## Azure AD App Registration

### Step 1: Create App Registration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the details:
   - **Name**: `Cortex Knowledge Hub`
   - **Supported account types**: Choose based on your needs:
     - **Accounts in this organizational directory only** (Single tenant)
     - **Accounts in any organizational directory** (Multi-tenant)
     - **Accounts in any organizational directory and personal Microsoft accounts** (Multi-tenant + personal)
   - **Redirect URI**: 
     - Platform: **Single-page application (SPA)**
     - URI: `http://localhost:3001` (for development)

### Step 2: Configure Authentication

1. In your app registration, go to **Authentication**
2. Under **Single-page application**, add these URIs:
   - `http://localhost:3001` (development)
   - `https://yourdomain.com` (production)
3. Under **Logout URLs**, add:
   - `http://localhost:3001` (development)
   - `https://yourdomain.com` (production)
4. Under **Implicit grant and hybrid flows**, ensure these are **unchecked** (SPA uses PKCE):
   - Access tokens
   - ID tokens

### Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add these permissions:
   - `openid` (should be added by default)
   - `profile` (should be added by default)
   - `email` (should be added by default)
   - `User.Read` (to read user profile)

### Step 4: Get Application Details

1. Go to **Overview** in your app registration
2. Copy the **Application (client) ID**
3. Copy the **Directory (tenant) ID** (optional, can use 'common' for multi-tenant)

## Frontend Configuration

### Step 1: Environment Variables

1. Copy the example environment file:
   ```bash
   cp frontend/.env.local.example frontend/.env.local
   ```

2. Update `frontend/.env.local` with your Azure AD details:
   ```env
   # Replace with your actual Azure AD client ID
   NEXT_PUBLIC_AZURE_AD_CLIENT_ID=your-client-id-here

   # For single tenant, use: https://login.microsoftonline.com/{tenant-id}
   # For multi-tenant, use: https://login.microsoftonline.com/common
   NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common

   # Redirect URIs (must match app registration)
   NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001
   NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI=http://localhost:3001

   # Backend API URL
   NEXT_PUBLIC_API_URL=http://localhost:8081
   ```

### Step 2: Install Dependencies

The required packages are already installed:
- `@azure/msal-browser` - Core MSAL library for browser
- `@azure/msal-react` - React wrapper for MSAL

## Backend Configuration

The backend has been configured to accept JWT tokens from Microsoft's identity platform.

### JWT Configuration

The backend is configured in `Program.cs` to:
- Accept JWT Bearer tokens
- Validate tokens from Microsoft's authority
- Extract user claims (subject ID, email, name) for data binding

### User Context

The `UserContextAccessor` service extracts user information from JWT claims:
- `UserSubjectId` - Unique identifier for the user (from 'sub' claim)
- `UserEmail` - User's email address
- `UserName` - User's display name

## Features

### Authentication Flow

1. **Login**: Users click "Continue with Microsoft" and are redirected to Microsoft's login page
2. **Token Acquisition**: MSAL handles the OAuth 2.0 flow and acquires access tokens
3. **API Calls**: All API requests include the Bearer token for authentication
4. **User Data Binding**: Backend uses the subject ID to isolate user data

### Seed Data

- New users automatically get 40 sample notes (20 Shakespeare works, 20 science articles)
- Seed data is created on first successful login
- Each user's data is completely isolated using their subject ID

### Dark Mode

- Dark mode is enabled by default
- Users can toggle between light and dark themes
- Theme preference is saved in localStorage

### User Profile

- Displays user information from Microsoft Graph
- Shows user avatar with initials
- Provides logout functionality
- Theme toggle controls

## Security Features

- **Token Validation**: All tokens are validated against Microsoft's endpoints
- **User Isolation**: Data is bound to authenticated user's subject ID
- **Secure Storage**: Tokens stored in sessionStorage (configurable)
- **PKCE Flow**: Uses Proof Key for Code Exchange for enhanced security

## Development

### Starting the Application

1. Start the backend:
   ```bash
   cd backend
   dotnet run --project CortexApi.csproj
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open http://localhost:3001 in your browser

### Testing Authentication

1. Navigate to the application
2. You should see the login page with "Continue with Microsoft" button
3. Click the button and complete the Microsoft login flow
4. After successful login, you'll be redirected to the main application
5. Check the settings page to see your user profile

## Production Deployment

### Frontend

1. Update environment variables for production URLs
2. Ensure redirect URIs are configured in Azure AD for your production domain
3. Build and deploy the Next.js application

### Backend

1. Configure production JWT settings
2. Ensure CORS is configured for your frontend domain
3. Deploy the .NET API

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**: Ensure redirect URIs in Azure AD exactly match your application URLs
2. **CORS Errors**: Configure CORS in the backend for your frontend domain
3. **Token Validation Errors**: Check that the audience and issuer are correctly configured
4. **Permission Errors**: Ensure required permissions are granted in Azure AD

### Debug Mode

Enable debug logging by updating the MSAL configuration in `authConfig.ts`:

```typescript
export const msalConfig: Configuration = {
  // ... existing config
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Verbose,
    }
  }
}
```

## Support

For authentication issues:
1. Check the browser console for MSAL errors
2. Verify Azure AD app registration configuration
3. Ensure environment variables are correctly set
4. Test with Microsoft's MSAL playground for debugging

For more information, see:
- [MSAL.js Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/msal-overview)
- [Azure AD App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
