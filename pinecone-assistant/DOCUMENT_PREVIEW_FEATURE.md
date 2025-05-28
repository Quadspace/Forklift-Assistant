# Document Preview Feature

## Overview

The Document Preview feature enhances your forklift maintenance assistant by providing seamless integration between AI responses and document viewing. When the AI references specific pages in documents (e.g., "[1, pp. 51-65]"), users can now click on these references to view the relevant document sections with contextual information from Pinecone.

## Features

### 1. **Intelligent Reference Detection**
- Automatically detects various citation formats in AI responses:
  - `[1, pp. 51-65]` - Document 1, pages 51-65
  - `pp. 22-31` - Pages 22-31
  - `page 42` - Single page reference
  - `WP 123 p. 15` - Work procedure references

### 2. **Enhanced PDF Preview Modal**
- **Dual-tab interface**: PDF Preview and Relevant Content
- **PDF Preview Tab**:
  - High-quality PDF rendering with react-pdf
  - Page navigation with Previous/Next buttons
  - Text highlighting for search terms
  - Full document view option
  - Page range indicators
- **Relevant Content Tab**:
  - Displays Pinecone-retrieved document chunks
  - Shows relevance scores for each chunk
  - Quick navigation to specific pages
  - Contextual search results

### 3. **Pinecone Integration**
- Fetches relevant document chunks based on:
  - File name
  - Page range (start and end pages)
  - Search query terms
- Displays relevance scores and metadata
- Sorts results by page number and relevance

### 4. **Smart File Matching**
- Automatically matches document references to available PDF files
- Supports numbered references (e.g., [1] maps to first file alphabetically)
- Handles various file naming conventions

## Technical Implementation

### API Endpoints

#### `/api/document-chunks` (POST)
Fetches relevant document chunks from Pinecone for specific pages.

**Request Body:**
```json
{
  "fileName": "maintenance-manual.pdf",
  "startPage": 51,
  "endPage": 65,
  "searchQuery": "hydraulic system"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Found 8 relevant chunks",
  "chunks": [
    {
      "id": "chunk-123",
      "score": 0.95,
      "text": "Hydraulic system maintenance procedures...",
      "page": 52,
      "fileName": "maintenance-manual.pdf",
      "metadata": {...}
    }
  ],
  "query": "filename:maintenance-manual.pdf page:51-65 hydraulic system"
}
```

### Components

#### `EnhancedPDFPreviewModal`
Main modal component with tabbed interface for PDF viewing and chunk display.

**Props:**
- `isOpen`: boolean - Modal visibility
- `onClose`: function - Close handler
- `pdfUrl`: string - PDF file URL
- `fileName`: string - Document name
- `startPage`: number - Starting page
- `endPage?`: number - Ending page (optional)
- `searchText?`: string - Text to highlight (optional)

#### `DocumentPreviewButton`
Clickable button component for document references.

**Props:**
- `fileName`: string - Document name
- `startPage`: number - Starting page
- `endPage?`: number - Ending page (optional)
- `searchText?`: string - Search context (optional)
- `onClick`: function - Click handler

### Utilities

#### `documentPreviewUtils.ts`
Enhanced utilities for document reference processing:
- `detectEnhancedPageReferences()` - Detect and enrich page references
- `createDocumentPreviewContexts()` - Create preview contexts
- `shouldAutoShowPreview()` - Determine auto-preview eligibility
- `formatPageRange()` - Format page ranges for display

## Usage Examples

### Basic Page Reference
When AI responds with: "According to the maintenance manual [1, pp. 51-65], the hydraulic system requires..."

The reference `[1, pp. 51-65]` becomes a clickable link that:
1. Opens the PDF preview modal
2. Navigates to page 51
3. Fetches relevant chunks for pages 51-65
4. Highlights any search terms

### Multiple References
AI response: "See the safety procedures on page 23 and the troubleshooting guide [2, pp. 45-50]."

Both references become clickable, each opening the appropriate document and page range.

## Configuration

### Environment Variables
Ensure these are set in your environment:
- `PINECONE_API_KEY` - Your Pinecone API key
- `PINECONE_ASSISTANT_NAME` - Your assistant name
- `PINECONE_ASSISTANT_URL` - Pinecone API base URL

### File Requirements
- PDF files must be uploaded to your Pinecone assistant
- Files should have proper metadata including page numbers
- Signed URLs must be available for PDF viewing

## Error Handling

The feature includes comprehensive error handling:
- **Missing PDF URL**: Shows error message in modal
- **Pinecone API errors**: Displays error in chunks tab
- **File not found**: Graceful fallback to basic text display
- **Network issues**: Loading states and retry mechanisms

## Performance Considerations

- **Lazy loading**: PDF components are dynamically imported
- **Chunk caching**: Document chunks are cached per modal session
- **Optimized queries**: Pinecone queries are constructed efficiently
- **Responsive design**: Modal adapts to different screen sizes

## Browser Compatibility

- Modern browsers with PDF.js support
- React 18+ compatibility
- Tailwind CSS for styling
- Dark mode support

## Future Enhancements

Potential improvements for future versions:
- Thumbnail previews in chunk results
- Advanced search within documents
- Annotation and highlighting persistence
- Multi-document comparison view
- Export functionality for relevant sections 