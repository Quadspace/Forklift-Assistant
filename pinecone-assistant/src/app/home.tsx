'use client';

import { useState, useEffect, FormEvent, useRef, useCallback, useMemo } from 'react';
import { readStreamableValue } from 'ai/rsc';
import { chat } from './actions';
import ReactMarkdown from 'react-markdown';
import AssistantFiles from './components/AssistantFiles';
import { File, Reference, Message } from './types';
import { v4 as uuidv4 } from 'uuid';
import { detectPageReferences, findMatchingPDFFile, PDFReference } from './utils/pdfReferences';
import { processPdfUrl } from './utils/pdfUtils';
import dynamic from 'next/dynamic';
import EnhancedPDFPreviewModal from './components/EnhancedPDFPreviewModal';
import PromptSuggestions from './components/PromptSuggestions';
import { logger } from './utils/logger';
import ErrorBoundary from './components/ErrorBoundary';
import { 
  ConnectionLoading, 
  StreamingIndicator, 
  FileLoading, 
  LoadingOverlay,
  TypingIndicator 
} from './components/LoadingStates';

interface HomeProps {
  initialShowAssistantFiles: boolean;
  showCitations: boolean;
}

export default function Home({ initialShowAssistantFiles, showCitations }: HomeProps) {
  const [loading, setLoading] = useState(true);
  const [assistantExists, setAssistantExists] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [referencedFiles, setReferencedFiles] = useState<Reference[]>([]);
  const [showAssistantFiles, setShowAssistantFiles] = useState(initialShowAssistantFiles);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pdfModalState, setPdfModalState] = useState({
    isOpen: false,
    pdfUrl: '',
    fileName: '',
    startPage: 1,
    endPage: undefined as number | undefined,
    searchText: undefined as string | undefined
  });
  
  // Enhanced error handling
  const handleError = useCallback((error: Error, context: string) => {
    logger.error(`Error in ${context}`, {
      error: error.message,
      stack: error.stack,
      context
    });
    
    // Set user-friendly error message
    if (error.message.includes('fetch') || error.message.includes('network')) {
      setError('Connection error. Please check your internet connection and try again.');
    } else if (error.message.includes('timeout')) {
      setError('Request timed out. Please try again.');
    } else {
      setError('An unexpected error occurred. Please try again.');
    }
  }, []);

  // Memoize expensive operations
  const extractReferences = useCallback((content: string): Reference[] => {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const references: Reference[] = [];
    
    // Extract markdown links with signed URLs: [filename.pdf](https://storage.googleapis.com/...)
    const markdownLinkRegex = /\[([^\]]+\.pdf)\]\((https?:\/\/[^\)]+)\)/gi;
    let match;
    
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const fileName = match[1].trim();
      const url = match[2].trim();
      references.push({ 
        name: fileName,
        url: url
      });
    }
    
    // Fallback: Extract plain file names if no markdown links found
    if (references.length === 0) {
      const fileNameRegex = /([^:\n]+\.[a-zA-Z0-9]+)/g;
      const fileMatches = content.match(fileNameRegex);
      
      if (fileMatches) {
        fileMatches.forEach(fileName => {
          references.push({ name: fileName.trim() });
        });
      }
    }

    logger.debug('📋 Extracted references from AI response', { count: references.length });
    return references;
  }, []);

  // Memoize the sorted files for consistent document number matching
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);
  
  // Simplified scroll function that ONLY targets the messages container
  const scrollToBottom = useCallback(() => {
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set a new timeout to scroll after a short delay
    scrollTimeoutRef.current = setTimeout(() => {
      const messagesContainer = document.getElementById('messages-container');
      if (messagesContainer) {
        // Get the current scroll position
        const scrollPosition = messagesContainer.scrollTop;
        const scrollHeight = messagesContainer.scrollHeight;
        const clientHeight = messagesContainer.clientHeight;
        
        // Only auto-scroll if user is already near the bottom
        // or if this is a new message sequence
        const isNearBottom = scrollHeight - scrollPosition - clientHeight < 100;
        
        if (isNearBottom || messages.length <= 2) {
          messagesContainer.scrollTop = scrollHeight;
        }
      }
    }, 100); // 100ms delay to batch scroll operations
  }, [messages.length]);

  // Add back the effect to scroll when messages change
  useEffect(() => {
    // Scroll to bottom when messages change
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Clean up timeout on component unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Check for dark mode preference
    if (typeof window !== 'undefined') {
      const isDarkMode = localStorage.getItem('darkMode') === 'true';
      setDarkMode(isDarkMode);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      }
      
      // REMOVE all document/body scroll locking
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', (!darkMode).toString());
      document.documentElement.classList.toggle('dark');
    }
  };

  useEffect(() => {
    checkAssistant();
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setFilesLoading(true);
    setError(''); // Clear any previous errors
    
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      
      if (data.status === 'success') {
        logger.debug('🗂️ Files fetched successfully', { 
          count: data.files.length,
          withSignedUrl: data.files.filter((f: File) => f.signed_url).length
        });
        setFiles(data.files);
      } else {
        throw new Error(data.message || 'Failed to fetch files');
      }
    } catch (error) {
      handleError(error as Error, 'fetchFiles');
    } finally {
      setFilesLoading(false);
    }
  };

  const checkAssistant = async () => {
    setLoading(true);
    setError(''); // Clear any previous errors
    
    try {
      const response = await fetch('/api/assistants');
      const data = await response.json();
      
      setAssistantExists(data.exists);
      setAssistantName(data.assistant_name);
      
      if (!data.exists) {
        setError('Please create an Assistant');
      }
    } catch (error) {
      handleError(error as Error, 'checkAssistant');
    } finally {
      setLoading(false);
    }
  };

  const handlePromptSelect = (prompt: string) => {
    setInput(prompt);
    
    // Auto-submit the prompt after a short delay for better UX
    setTimeout(() => {
      const newUserMessage: Message = {
        id: uuidv4(), 
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString() 
      };

      setMessages(prevMessages => [...prevMessages, newUserMessage]);
      setInput('');
      setIsStreaming(true);
      
      // Use the existing chat logic
      handleChatWithMessage(newUserMessage);
    }, 100);
  };

  const handleChatWithMessage = async (userMessage: Message) => {
    // Set a global timeout to force reset streaming state after 60 seconds maximum
    const globalTimeout = setTimeout(() => {
      logger.info('Global timeout reached - forcing streaming state reset');
      setIsStreaming(false);
    }, 60000); // 60 seconds absolute maximum

    try {
      const { object } = await chat([userMessage]);
      let accumulatedContent = '';
      const newAssistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        references: []
      };
      
      setMessages(prevMessages => [...prevMessages, newAssistantMessage]);

      // Use the existing streaming logic from handleChat
      let streamTimeout: NodeJS.Timeout | null = null;
      let activityTimeout: NodeJS.Timeout | null = null;
      let chunkCount = 0;
      
      const MAX_IDLE_TIME = 15000;
      
      const setStreamSafetyTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
          logger.info('Stream timed out - no chunks received for 15 seconds');
          setIsStreaming(false);
        }, MAX_IDLE_TIME);
      };

      const setActivityTimeout = () => {
        if (activityTimeout) clearTimeout(activityTimeout);
        if (chunkCount > 0) {
          activityTimeout = setTimeout(() => {
            logger.info('Activity stopped after receiving chunks - considering stream complete');
            setIsStreaming(false);
          }, 8000);
        }
      };

      setStreamSafetyTimeout();

      try {
        for await (const chunk of readStreamableValue(object)) {
          try {
            setStreamSafetyTimeout();
            setActivityTimeout();
            chunkCount++;

            if (typeof chunk !== 'string') {
              logger.debug('Received non-string chunk, skipping', typeof chunk);
              continue;
            }

            const data = JSON.parse(chunk);
            if (data && Array.isArray(data.choices) && data.choices.length === 0) {
              logger.debug('Stream finished: Received empty choices array');
              setIsStreaming(false);
              break;
            } else if (data?.choices[0]?.finish_reason) {
              logger.debug('Stream finished by assistant', data.choices[0].finish_reason);
              setIsStreaming(false);
              break;
            }
            
            const content = data.choices[0]?.delta?.content;
            
            if (content) {
              accumulatedContent += content;
              
              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                lastMessage.content = accumulatedContent;
                return updatedMessages;
              });
            }
          } catch (error) {
            logger.error('Error parsing chunk', error instanceof Error ? error.message : String(error));
          }
        }
      } catch (streamError) {
        logger.error('Stream processing error:', streamError);
        setIsStreaming(false);
      } finally {
        if (streamTimeout) clearTimeout(streamTimeout);
        if (activityTimeout) clearTimeout(activityTimeout);
        setIsStreaming(false);
      }

      const extractedReferences = extractReferences(accumulatedContent);
      setReferencedFiles(extractedReferences);

    } catch (error) {
      logger.error('Error in chat:', error);
      setError('An error occurred while chatting.');
    } finally {
      clearTimeout(globalTimeout);
      setIsStreaming(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim()) return;

    // Set a global timeout to force reset streaming state after 60 seconds maximum
    const globalTimeout = setTimeout(() => {
      logger.info('Global timeout reached - forcing streaming state reset');
      setIsStreaming(false);
    }, 60000); // 60 seconds absolute maximum

    const newUserMessage: Message = {
      id: uuidv4(), 
      role: 'user',
      content: input,
      timestamp: new Date().toISOString() 
    };

    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInput('');
    setIsStreaming(true);
    
    try {
      const { object } = await chat([newUserMessage]);
      let accumulatedContent = '';
      const newAssistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        references: []
      };
      
      setMessages(prevMessages => [...prevMessages, newAssistantMessage]);

      // Improved stream handling with multiple timeouts
      let streamTimeout: NodeJS.Timeout | null = null;
      let activityTimeout: NodeJS.Timeout | null = null;
      let chunkCount = 0;
      
      // Shorter idle time - 15 seconds
      const MAX_IDLE_TIME = 15000;
      
      // Set a safety timeout to prevent getting stuck
      const setStreamSafetyTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
          logger.info('Stream timed out - no chunks received for 15 seconds');
          setIsStreaming(false);
        }, MAX_IDLE_TIME);
      };

      // Set an activity timeout - if we get a few chunks but then it stops, consider done
      const setActivityTimeout = () => {
        if (activityTimeout) clearTimeout(activityTimeout);
        if (chunkCount > 0) {
          activityTimeout = setTimeout(() => {
            logger.info('Activity stopped after receiving chunks - considering stream complete');
            setIsStreaming(false);
          }, 8000); // 8 seconds after activity stops
        }
      };

      setStreamSafetyTimeout();

      // Process the stream with improved error handling
      try {
        for await (const chunk of readStreamableValue(object)) {
          try {
            // Reset timeouts on each chunk
            setStreamSafetyTimeout();
            setActivityTimeout();
            chunkCount++;

            // Ensure chunk is a string before parsing
            if (typeof chunk !== 'string') {
              logger.debug('Received non-string chunk, skipping', typeof chunk);
              continue;
            }

            const data = JSON.parse(chunk);
            // Check for empty choices array first as it might signify stream completion
            if (data && Array.isArray(data.choices) && data.choices.length === 0) {
              logger.debug('Stream finished: Received empty choices array');
              setIsStreaming(false);
              break; // Exit the loop when done
            } else if (data?.choices[0]?.finish_reason) {
              logger.debug('Stream finished by assistant', data.choices[0].finish_reason);
              setIsStreaming(false);
              break; // Exit the loop when done
            }
            
            const content = data.choices[0]?.delta?.content;
            
            if (content) {
              accumulatedContent += content;
              
              setMessages(prevMessages => {
                const updatedMessages = [...prevMessages];
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                lastMessage.content = accumulatedContent;
                return updatedMessages;
              });
            }
          } catch (error) {
            logger.error('Error parsing chunk', error instanceof Error ? error.message : String(error));
          }
        }
      } catch (streamError) {
        logger.error('Stream processing error:', streamError);
        setIsStreaming(false);
      } finally {
        // Clear all timeouts
        if (streamTimeout) clearTimeout(streamTimeout);
        if (activityTimeout) clearTimeout(activityTimeout);
        setIsStreaming(false);
      }

      // Extract references after the full message is received
      const extractedReferences = extractReferences(accumulatedContent);
      setReferencedFiles(extractedReferences);

    } catch (error) {
      logger.error('Error in chat:', error);
      setError('An error occurred while chatting.');
    } finally {
      clearTimeout(globalTimeout);
      setIsStreaming(false);
    }
  };

  const handleOpenPdfModal = async (pdfUrl: string, fileName: string, startPage: number, endPage?: number, searchText?: string) => {
    logger.info('🎬 handleOpenPdfModal called with:', {
      pdfUrl: pdfUrl ? `${pdfUrl.substring(0, 50)}...` : 'No URL',
      fileName,
      startPage,
      endPage,
      searchText
    });
    
    if (!pdfUrl) {
      logger.error('❌ Cannot open PDF modal: No PDF URL provided');
      return;
    }
    
    logger.info('✅ Processing PDF URL...');
    
    try {
      // Process the PDF URL to ensure it works with the viewer
      const processedUrl = processPdfUrl(pdfUrl);
      logger.info('📄 PDF URL processed successfully');
      
      setPdfModalState({
        isOpen: true,
        pdfUrl: processedUrl,
        fileName,
        startPage,
        endPage,
        searchText
      });
      
      logger.info('🎯 PDF modal state updated, modal should open');
    } catch (error) {
      logger.error('❌ Error processing PDF URL:', error);
      // Fallback to original URL
      setPdfModalState({
        isOpen: true,
        pdfUrl,
        fileName,
        startPage,
        endPage,
        searchText
      });
    }
  };

  const handleClosePdfModal = () => {
    setPdfModalState(prev => ({ ...prev, isOpen: false }));
  };

  // Memoized function to render message with clickable PDF references
  const renderMessageContent = useCallback((content: string, isAssistant: boolean, messageId?: string) => {
    if (!content || typeof content !== 'string') {
      return null;
    }

    if (!isAssistant) {
      return (
        <ReactMarkdown
          components={{
            a: ({ node, ...props }) => (
              <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline">
                🔗 {props.children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    // For assistant messages during streaming, render as-is without processing
    if (isStreaming) {
      logger.debug('🔄 Streaming in progress, rendering content as-is without PDF processing');
      return (
        <ReactMarkdown
          components={{
            a: ({ node, ...props }) => (
              <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline">
                🔗 {props.children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    // Only process PDF references when streaming is complete and content hasn't been processed
    logger.debug('✅ Streaming complete, processing PDF references...');
    
    // FIRST: Clean up any raw Google Storage URLs that might be showing
    let cleanedContent = content;
    
    // Replace raw Google Storage URLs with clean text
    const googleStorageUrlRegex = /https:\/\/storage\.googleapis\.com\/[^\s\)]+/gi;
    cleanedContent = cleanedContent.replace(googleStorageUrlRegex, (match) => {
      logger.debug('🧹 Cleaning up raw Google Storage URL', { url: match.substring(0, 50) + '...' });
      return '[Document reference - Preview unavailable]';
    });
    
    // Replace any other long URLs that might be showing
    const longUrlRegex = /https?:\/\/[^\s\)]{50,}/gi;
    cleanedContent = cleanedContent.replace(longUrlRegex, (match) => {
      logger.debug('🧹 Cleaning up long URL', { url: match.substring(0, 50) + '...' });
      return '[Document reference - Preview unavailable]';
    });
    
    // Extract references directly from the current content
    const currentReferences = extractReferences(cleanedContent);
    logger.debug('🔗 References extracted from current content', { count: currentReferences.length });
    
    const references = detectPageReferences(cleanedContent);
    
    // Enhanced debug logging
    logger.debug('🎯 Detected PDF references', { 
      count: references.length,
      highConfidence: references.filter(r => r.confidence > 0.8).length
    });
    
    if (references.length === 0) {
      logger.debug('❌ No PDF references detected, rendering cleaned content');
      // If no references, render the cleaned content
      return (
        <ReactMarkdown
          components={{
            a: ({ node, ...props }) => (
              <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline">
                🔗 {props.children}
              </a>
            ),
          }}
        >
          {cleanedContent}
        </ReactMarkdown>
      );
    }

    logger.debug('✅ Found PDF references, processing message...');
    
    // FIXED: Process references in FORWARD order with offset tracking
    let processedContent = cleanedContent;
    let offsetAdjustment = 0; // Track how much the content length has changed
    
    // Sort references by position (earliest first) to process in forward order
    const sortedReferences = [...references].sort((a, b) => a.matchIndex - b.matchIndex);
    
    for (let i = 0; i < sortedReferences.length; i++) {
      const ref = sortedReferences[i];
      const adjustedIndex = ref.matchIndex + offsetAdjustment;
      
      // Bounds checking to prevent corruption
      if (adjustedIndex < 0 || adjustedIndex >= processedContent.length) {
        logger.warn(`⚠️ Reference index out of bounds, skipping`, { 
          originalIndex: ref.matchIndex,
          adjustedIndex,
          contentLength: processedContent.length,
          match: ref.fullMatch
        });
        continue;
      }
      
      logger.debug(`🔗 Processing reference ${i + 1}/${sortedReferences.length}`, { 
        match: ref.fullMatch,
        confidence: ref.confidence,
        adjustedIndex
      });
      
      // Enhanced error handling for file matching
      let matchingFile = null;
      try {
        matchingFile = findMatchingPDFFile(ref, sortedFiles, currentReferences);
      } catch (error) {
        logger.error('Error finding matching PDF file', { 
          error: error instanceof Error ? error.message : String(error),
          reference: ref.fullMatch 
        });
        continue;
      }
      
      logger.debug(`📋 Matching file for reference`, { 
        fileName: matchingFile?.name || 'None found',
        confidence: ref.confidence
      });
      
      if (matchingFile) {
        const beforeRef = processedContent.substring(0, adjustedIndex);
        const afterRef = processedContent.substring(adjustedIndex + ref.fullMatch.length);
        const pdfUrl = matchingFile.signed_url; 
        
        if (!pdfUrl) {
          logger.error("❌ Error: matchingFile.signed_url is missing for file:", matchingFile.name);
          // Create a fallback reference without URL
          const fileNameOnly = matchingFile.name.split(/[\\/]/).pop() || matchingFile.name;
          const cleanFileName = fileNameOnly.replace('_compressed.pdf', '').replace('.pdf', '');
          const displayText = `${cleanFileName}, pp. ${ref.startPage}${ref.endPage !== ref.startPage ? `-${ref.endPage}` : ''} (Preview unavailable)`;
          
          const fallbackSpan = `<span class="text-gray-500 dark:text-gray-400 italic break-words">${displayText}</span>`;
          const newContent = `${beforeRef}${fallbackSpan}${afterRef}`;
          
          // Update offset tracking
          offsetAdjustment += fallbackSpan.length - ref.fullMatch.length;
          processedContent = newContent;
          
          logger.debug(`⚠️ Created fallback reference for ${fileNameOnly} (no signed URL)`);
        } else {
          const fileNameOnly = matchingFile.name.split(/[\\/]/).pop() || matchingFile.name;
          
          // Create clean display text - just filename and pages, no "PDF:" prefix
          const cleanFileName = fileNameOnly.replace('_compressed.pdf', '').replace('.pdf', '');
          const displayText = `${cleanFileName}, pp. ${ref.startPage}${ref.endPage !== ref.startPage ? `-${ref.endPage}` : ''}`;
          
          const pdfLink = `[${displayText}](#pdf-preview?url=${encodeURIComponent(pdfUrl)}&file=${encodeURIComponent(fileNameOnly)}&start=${ref.startPage}&end=${ref.endPage || ref.startPage})`;
          const newContent = `${beforeRef}${pdfLink}${afterRef}`;
          
          // Update offset tracking
          offsetAdjustment += pdfLink.length - ref.fullMatch.length;
          processedContent = newContent;
          
          logger.debug(`✅ Created clean PDF link for ${fileNameOnly}`, { confidence: ref.confidence });
        }
      } else {
        logger.debug(`❌ No matching file found for reference`, { 
          match: ref.fullMatch,
          confidence: ref.confidence 
        });
        
        // Create a generic reference when no file is found
        const beforeRef = processedContent.substring(0, adjustedIndex);
        const afterRef = processedContent.substring(adjustedIndex + ref.fullMatch.length);
        const displayText = `Document reference: ${ref.fullMatch} (File not available)`;
        
        const fallbackSpan = `<span class="text-gray-500 dark:text-gray-400 italic break-words">${displayText}</span>`;
        const newContent = `${beforeRef}${fallbackSpan}${afterRef}`;
        
        // Update offset tracking
        offsetAdjustment += fallbackSpan.length - ref.fullMatch.length;
        processedContent = newContent;
        
        logger.debug(`⚠️ Created fallback reference for unmatched citation: ${ref.fullMatch}`);
      }
    }
    
    logger.debug('📝 Final processed content ready', { 
      originalLength: content.length,
      processedLength: processedContent.length,
      referencesProcessed: sortedReferences.length,
      offsetAdjustment
    });
    
    return (
      <ReactMarkdown
        components={{
          a: ({ node, href, ...props }) => {
            if (href?.startsWith('#pdf-preview')) {
              const queryParams = new URLSearchParams(href.substring(href.indexOf('?')));
              const pdfUrlFromLink = queryParams.get('url') || '';
              // Ensure fileNameForModal uses only the filename part
              let fileNameForModal = queryParams.get('file') || '';
              fileNameForModal = fileNameForModal.split(/[\\/]/).pop() || fileNameForModal;

              const startPage = parseInt(queryParams.get('start') || '1', 10);
              const endPage = queryParams.has('end') ? parseInt(queryParams.get('end') || '1', 10) : undefined;
              const refText = Array.isArray(props.children) 
                ? props.children.filter(child => typeof child === 'string').join(' ') 
                : typeof props.children === 'string' 
                  ? props.children 
                  : '';
              const searchText = refText
                .replace(/^PDF:\s*/, '')
                .replace(/\s*\(p\.\s*\d+(?:-\d+)?\)$/, '')
                .replace(/^\[.*\]\s*/, '')
                .trim();
              
              logger.debug('🖱️ PDF link clicked', { fileNameForModal, startPage, endPage, searchText });
              
              return (
                <a 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    logger.debug('🚀 Opening PDF modal', { pdfUrlFromLink, fileNameForModal, startPage, endPage, searchText });
                    
                    // Enhanced error handling for PDF modal opening
                    try {
                      handleOpenPdfModal(
                        pdfUrlFromLink, 
                        fileNameForModal, 
                        startPage, 
                        endPage,
                        searchText
                      );
                    } catch (error) {
                      logger.error('Error opening PDF modal', { 
                        error: error instanceof Error ? error.message : String(error),
                        fileNameForModal,
                        pdfUrlFromLink: pdfUrlFromLink.substring(0, 100) + '...'
                      });
                      // Show user-friendly error message
                      alert('Unable to open PDF preview. Please try again or check the console for details.');
                    }
                  }}
                  title={`View ${fileNameForModal.replace('_compressed.pdf', '').replace('.pdf', '')} (pages ${startPage}${endPage && endPage !== startPage ? `-${endPage}` : ''})`}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline inline-flex items-center bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-700 shadow-sm transition-colors duration-200 break-words max-w-full"
                >
                  <svg
                    className="w-4 h-4 mr-1 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
                  </svg>
                  <span className="truncate max-w-[300px] sm:max-w-[400px] md:max-w-[500px] font-medium">{refText}</span>
                </a>
              );
            }
            return (
              <a {...props} href={href} className="text-blue-600 dark:text-blue-400 hover:underline break-words">
                🔗 {props.children}
              </a>
            );
          },
          // Handle fallback spans for unavailable references
          span: ({ node, className, ...props }) => {
            if (className?.includes('text-gray-500')) {
              return <span {...props} className={`${className} break-words max-w-full`} />;
            }
            return <span {...props} className="break-words" />;
          },
        }}
        className="break-words overflow-wrap-anywhere"
      >
        {processedContent}
      </ReactMarkdown>
    );
  }, [isStreaming, extractReferences, sortedFiles, handleOpenPdfModal]);

  return (
    <ErrorBoundary>
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={toggleDarkMode}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        
        {loading ? (
          <ConnectionLoading message="Connecting to your Assistant..." />
        ) : assistantExists ? (
          <div className="w-full max-w-6xl xl:max-w-7xl">
            <h1 className="text-2xl font-bold mb-4 text-indigo-900 dark:text-indigo-100">
              <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                Industrial Engineer.ai Assistant
              </a>: {assistantName} <span className="text-green-500">●</span>
            </h1>
            
            <div className="flex flex-col gap-4">
              <div className="w-full">
                <div id="messages-container" className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg mb-4 h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden min-w-0 break-long-words markdown-content">
                  {messages.map((message, index) => (
                    <div key={index} className={`mb-2 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}>
                      <div className={`flex items-start ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-full min-w-0`}>
                        <div className={`${message.role === 'user' ? 'ml-2' : 'mr-2'}`}>
                          {message.role === 'user' ? (
                            <span className="text-2xl">👤</span>
                          ) : (
                            <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer">
                              <img
                                src="/industrialengineer-ai-logo.png"
                                alt="Industrial Engineer.ai Assistant"
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            </a>
                          )}
                        </div>
                        <span className={`inline-block p-2 rounded-lg ${
                          message.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        } max-w-[80%] sm:max-w-[70%] md:max-w-[60%] break-words overflow-wrap-anywhere word-break-break-word min-w-0 whitespace-pre-wrap`}>
                          {renderMessageContent(message.content, message.role === 'assistant', message.id)}
                          {message.references && showCitations && (
                            <div className="mt-2">
                              <ul>
                                {message.references.map((ref, i) => (
                                  <li key={i}>
                                    <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                                      {ref.name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {/* Show streaming indicator when AI is responding */}
                  {isStreaming && (
                    <div className="mb-2 flex justify-start">
                      <div className="flex items-start">
                        <div className="mr-2">
                          <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer">
                            <img
                              src="/industrialengineer-ai-logo.png"
                              alt="Industrial Engineer.ai Assistant"
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          </a>
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                          <StreamingIndicator />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Files Loading Indicator */}
                {filesLoading && (
                  <FileLoading 
                    fileCount={files.length}
                    className="mb-4"
                  />
                )}
                
                {/* Prompt Suggestions */}
                <ErrorBoundary
                  resetKeys={[messages.length, files.length]}
                  resetOnPropsChange={true}
                >
                  <PromptSuggestions 
                    messages={messages}
                    files={files}
                    onPromptSelect={handlePromptSelect}
                    isStreaming={isStreaming}
                  />
                </ErrorBoundary>
                
                <form onSubmit={(e) => { e.preventDefault(); handleChat(); }} className="flex mb-4">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-grow p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black dark:text-white dark:bg-gray-800 dark:border-gray-600"
                    placeholder="Type your message..."
                    disabled={isStreaming}
                  />
                  <button
                    type="submit"
                    className="bg-indigo-500 text-white p-2 rounded-r-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={isStreaming || !input.trim()}
                  >
                    {isStreaming ? (
                      <div className="flex items-center space-x-2">
                        <TypingIndicator variant="dots" className="scale-75" />
                        <span>Sending...</span>
                      </div>
                    ) : (
                      'Send'
                    )}
                  </button>
                </form>
                
                {/* Enhanced Error Display */}
                {error && (
                  <ErrorBoundary>
                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 p-4 mb-4 rounded-md shadow-md">
                      <div className="flex items-center">
                        <svg className="h-6 w-6 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <p className="font-semibold">Error</p>
                      </div>
                      <p className="mt-2">{error}</p>
                      <button
                        onClick={() => setError('')}
                        className="mt-3 text-sm bg-red-100 dark:bg-red-800 hover:bg-red-200 dark:hover:bg-red-700 text-red-800 dark:text-red-200 px-3 py-1 rounded transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </ErrorBoundary>
                )}
              </div>
              
              {/* Assistant Files Section with Error Boundary */}
              {showAssistantFiles && (
                <div className="w-full">
                  <ErrorBoundary
                    resetKeys={[files.length, referencedFiles.length]}
                    resetOnPropsChange={true}
                  >
                    <AssistantFiles 
                      files={files} 
                      referencedFiles={referencedFiles} 
                      onOpenPdfModal={handleOpenPdfModal}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 p-4 rounded-md shadow-md max-w-2xl">
            <div className="flex items-center">
              <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="font-semibold">Error</p>
            </div>
            <p className="mt-2">{error}</p>
            <div className="mt-4 text-sm">
              <p className="font-semibold">To resolve this issue:</p>
              <ol className="list-decimal list-inside mt-2 space-y-2">
                <li>Create a Industrial Engineer.ai Assistant at <a href="https://app.industrialengineer.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://app.industrialengineer.ai</a></li>
                <li>Export the environment variable <code className="bg-red-200 dark:bg-red-800 px-1 rounded">PINECONE_ASSISTANT_NAME</code> with the value of your assistant&apos;s name</li>
                <li>Restart your application</li>
              </ol>
            </div>
            <button
              onClick={() => {
                setError('');
                checkAssistant();
              }}
              className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}
        
        <div className="mt-8 text-sm text-gray-500 dark:text-gray-400 flex space-x-4">
          <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            ℹ️ What are Industrial Engineer.ai Assistants?
          </a>
          <a href="https://app.industrialengineer.ai" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            🤖 Create your own Industrial Engineer.ai Assistant today
          </a>
        </div>

        {/* PDF Preview Modal with Error Boundary */}
        <ErrorBoundary>
          {pdfModalState.isOpen && (
            <EnhancedPDFPreviewModal 
              isOpen={pdfModalState.isOpen}
              onClose={handleClosePdfModal}
              pdfUrl={pdfModalState.pdfUrl}
              fileName={pdfModalState.fileName}
              startPage={pdfModalState.startPage}
              endPage={pdfModalState.endPage}
              searchText={pdfModalState.searchText}
            />
          )}
        </ErrorBoundary>
        
        {/* Loading Overlay for Initial Connection */}
        <LoadingOverlay 
          isVisible={loading}
          message="Connecting to your Assistant..."
        />
      </main>
    </ErrorBoundary>
  );
}