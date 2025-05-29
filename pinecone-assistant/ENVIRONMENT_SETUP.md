# 🔧 CRITICAL ENVIRONMENT SETUP - PDF & REFERENCE SYSTEM FIX

## IMMEDIATE ACTION REQUIRED

The PDF preview and reference formatting system is failing due to missing environment configuration. Follow these steps to restore functionality:

### 1. Create `.env.local` file in project root:

```bash
# Pinecone API Configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ASSISTANT_NAME=your_assistant_name_here
PINECONE_ASSISTANT_URL=https://prod-1-data.ke.pinecone.io
PINECONE_ASSISTANT_ID=your_project_id_here

# Application Configuration
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: Enable debug logging
DEBUG=true
```

### 2. Get Your Pinecone Credentials:

1. **API Key**: Go to [Pinecone Console](https://app.pinecone.io/) → API Keys
2. **Assistant Name**: Your assistant's name from the Assistants page
3. **Project ID**: Found in your Pinecone project settings
4. **Assistant URL**: Use `https://prod-1-data.ke.pinecone.io` (standard endpoint)

### 3. Verify Configuration:

```bash
npm run dev
curl http://localhost:3000/api/health
```

The health endpoint should show all environment variables as configured.

## CRITICAL FIXES APPLIED

### API Endpoint Standardization
- All APIs now use consistent base URL from `PINECONE_ASSISTANT_URL`
- Authentication headers standardized across all endpoints
- Proper error handling for missing environment variables

### PDF System Restoration
- Enhanced signed URL validation and refresh
- Improved CORS handling in PDF proxy
- Fallback mechanisms for expired URLs

### Reference Formatting Fix
- Clean reference display without giant URLs
- Graceful degradation when APIs are unavailable
- Proper error boundaries for failed file lookups

## TROUBLESHOOTING

### If APIs still return 404/403:
1. Verify your API key has the correct permissions
2. Check that your assistant name exactly matches Pinecone
3. Ensure your project ID is correct
4. Try regenerating your API key

### If PDFs won't load:
1. Check browser console for CORS errors
2. Verify signed URLs are not expired
3. Test the PDF proxy endpoint directly
4. Check Google Cloud Storage permissions

### If references show as plain text:
1. Ensure streaming is complete before processing
2. Check that files are properly loaded from Pinecone
3. Verify reference detection regex patterns
4. Test with simple bracket citations like `[1, pp. 40-51]`

## TESTING CHECKLIST

- [ ] Environment variables loaded correctly
- [ ] `/api/health` shows all systems green
- [ ] `/api/assistants` confirms assistant exists
- [ ] `/api/files` returns file list with signed URLs
- [ ] PDF preview modal opens and loads documents
- [ ] References display as clean clickable buttons
- [ ] No console errors during normal operation

## PRODUCTION DEPLOYMENT

For production, set these environment variables in your hosting platform:
- Vercel: Project Settings → Environment Variables
- Netlify: Site Settings → Environment Variables  
- Railway: Project → Variables
- Render: Environment → Environment Variables

**SECURITY NOTE**: Never commit `.env.local` to version control. It's already in `.gitignore`. 