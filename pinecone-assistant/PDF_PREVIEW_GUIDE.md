# PDF Preview Functionality Guide

## Overview

The Forklift Assistant now includes comprehensive in-page PDF preview functionality that allows users to view PDF documents without leaving the chat interface. This feature automatically detects PDF references in AI responses and makes them clickable.

## Features

### 🔍 **Automatic Reference Detection**
- Detects various PDF reference formats:
  - Direct filenames: `WP2000S.pdf`
  - Page references: `pp. 5-13`, `page 42`
  - Citation formats: `[1, pp. 22-31]`, `[2] (pp. 45-50)`
  - Document references: `WP 2000 p. 23`

### 📄 **In-Page PDF Viewer**
- Full PDF viewing with page navigation
- Automatic highlighting of referenced text
- Zoom and scroll functionality
- Page range indicators
- Full document browsing option

### 📚 **Enhanced Content Discovery**
- **PDF Preview Tab**: View the actual PDF pages
- **Relevant Content Tab**: See extracted text chunks from the document
- **Smart Chunking**: Shows only content relevant to the referenced pages

### 🔧 **Robust Error Handling**
- Automatic CORS issue detection and resolution
- PDF proxy for problematic URLs
- Retry mechanisms with fallback options
- Detailed error messages and recovery suggestions

## How It Works

### 1. **Reference Detection**
When the AI mentions a PDF or page reference, the system:
- Scans the response text for PDF patterns
- Matches references to available files
- Creates clickable links automatically

### 2. **Modal Opening**
Clicking a PDF reference:
- Opens an in-page modal (no new tabs!)
- Loads the PDF at the specified page
- Shows relevant content chunks
- Provides navigation controls

### 3. **File Access**
- Uses signed URLs from Pinecone for secure access
- Handles CORS issues automatically
- Provides proxy fallback for problematic URLs

## User Interface

### **Assistant Files Panel**
- Click any PDF file to preview it
- Visual indicators for referenced files
- File size and creation date information

### **Chat Message Links**
- PDF references become clickable buttons
- Show file name and page range
- Styled with PDF icon for easy identification

### **PDF Modal**
- **Header**: File name and navigation options
- **Tabs**: Preview, Relevant Content, Debug (dev mode)
- **Footer**: Page navigation and controls

## Troubleshooting

### **PDF Won't Load**
1. Check the Debug tab (development mode)
2. Try the "Retry" button
3. Use "Try Proxy" for CORS issues
4. Verify the file exists in Pinecone

### **No Clickable References**
1. Ensure files are uploaded to Pinecone
2. Check that signed URLs are available
3. Verify reference format matches patterns
4. Look for console errors in browser dev tools

### **CORS Issues**
The system automatically handles CORS issues by:
1. Detecting cross-origin requests
2. Falling back to PDF proxy
3. Providing alternative loading methods

### **Performance Issues**
- PDFs are cached for better performance
- Large files may take time to load
- Use page-specific viewing for faster access

## Development

### **Debug Mode**
In development, a Debug tab provides:
- URL inspection (original vs processed)
- Modal state information
- Manual retry options
- Console logging controls

### **Configuration**
Key environment variables:
- `PINECONE_API_KEY`: For file access
- `PINECONE_ASSISTANT_NAME`: Assistant identifier
- `NODE_ENV`: Enables debug features in development

### **File Structure**
```
src/
├── components/
│   ├── EnhancedPDFPreviewModal.tsx  # Main PDF viewer
│   ├── AssistantFiles.tsx           # File list with preview
│   └── ClickablePageReference.tsx   # Reference components
├── utils/
│   ├── pdfReferences.ts             # Reference detection
│   └── pdfUtils.ts                  # URL processing
└── api/
    └── pdf-proxy/                   # CORS proxy
```

## Best Practices

### **For Users**
1. Wait for PDFs to fully load before navigating
2. Use the page range feature for large documents
3. Check the Relevant Content tab for quick text access
4. Report any loading issues with specific file names

### **For Developers**
1. Monitor console logs for PDF loading issues
2. Test with various PDF sizes and formats
3. Verify signed URL expiration handling
4. Ensure proper error boundaries

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| PDF opens in new tab | Direct link instead of modal | Check `handleOpenPdfModal` usage |
| CORS errors | Cross-origin restrictions | Automatic proxy fallback |
| Slow loading | Large PDF files | Use page-specific viewing |
| No references detected | Pattern mismatch | Update regex patterns |
| Modal won't open | JavaScript errors | Check console for errors |

## Future Enhancements

- [ ] PDF annotation support
- [ ] Multi-document comparison
- [ ] Advanced search within documents
- [ ] Thumbnail previews
- [ ] Export functionality
- [ ] Offline PDF caching

## Support

For issues or questions:
1. Check browser console for errors
2. Use Debug tab in development mode
3. Verify Pinecone file availability
4. Test with different PDF files

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Status**: Production Ready 