'use client';

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { readStreamableValue } from 'ai/rsc';
import { chat } from './actions';
import ReactMarkdown from 'react-markdown';
import AssistantFiles from './components/AssistantFiles';
import { File, Reference, Message } from './types';
import { v4 as uuidv4 } from 'uuid';
import { detectPageReferences, findMatchingPDFFile } from './utils/pdfReferences';
import dynamic from 'next/dynamic';

// Dynamically import the PDF modal component
const PDFPreviewModal = dynamic(() => import('./components/PDFPreviewModal'), { ssr: false });

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

  // Simplified scroll function that ONLY targets the chat container with ID
  const scrollToBottom = useCallback(() => {
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set a new timeout to scroll after a short delay
    scrollTimeoutRef.current = setTimeout(() => {
      const chatContainer = document.getElementById('chat-container');
      if (chatContainer) {
        // Get the current scroll position
        const scrollPosition = chatContainer.scrollTop;
        const scrollHeight = chatContainer.scrollHeight;
        const clientHeight = chatContainer.clientHeight;
        
        // Only auto-scroll if user is already near the bottom
        // or if this is a new message sequence
        const isNearBottom = scrollHeight - scrollPosition - clientHeight < 100;
        
        if (isNearBottom || messages.length <= 2) {
          chatContainer.scrollTop = scrollHeight;
        }
      }
    }, 100); // 100ms delay to batch scroll operations
  }, [messages.length]);

  // Clean up timeout on component unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Add back the effect to scroll when messages change
  useEffect(() => {
    // Scroll to bottom when messages change
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Add chat container-specific scroll handling
  useEffect(() => {
    const chatContainer = document.getElementById('chat-container');
    
    if (chatContainer) {
      // Event listener for chat container scroll
      const handleChatScroll = (e: Event) => {
        // Prevent any potential bubbling to parent elements
        e.stopPropagation();
      };
      
      // Only attach to the specific chat container
      chatContainer.addEventListener('scroll', handleChatScroll);
      
      return () => {
        chatContainer.removeEventListener('scroll', handleChatScroll);
      };
    }
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

  const extractReferences = (content: string): Reference[] => {
    const references: Reference[] = [];
    
    // Extract full file names from the content
    const fileNameRegex = /([^:\n]+\.[a-zA-Z0-9]+)/g;
    const fileMatches = content.match(fileNameRegex);
    
    if (fileMatches) {
      fileMatches.forEach(fileName => {
        references.push({ name: fileName.trim() });
      });
    }

    return references;
  };

  useEffect(() => {
    checkAssistant();
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      if (data.status === 'success') {
        setFiles(data.files);
      } else {
        console.error('Error fetching files:', data.message);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const checkAssistant = async () => {
    try {
      const response = await fetch('/api/assistants')
      const data = await response.json()
      
      setLoading(false)
      setAssistantExists(data.exists)
      setAssistantName(data.assistant_name)
      if (!data.exists) {
        setError('Please create an Assistant')
      }
    } catch (error) {
      setLoading(false)
      setError('Error connecting to the Assistant')
      
    }
  }

  const handleChat = async () => {
    if (!input.trim()) return;

    // Set a global timeout to force reset streaming state after 60 seconds maximum
    const globalTimeout = setTimeout(() => {
      console.log('Global timeout reached - forcing streaming state reset');
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
          console.log('Stream timed out - no chunks received for 15 seconds');
          setIsStreaming(false);
        }, MAX_IDLE_TIME);
      };

      // Set an activity timeout - if we get a few chunks but then it stops, consider done
      const setActivityTimeout = () => {
        if (activityTimeout) clearTimeout(activityTimeout);
        if (chunkCount > 0) {
          activityTimeout = setTimeout(() => {
            console.log('Activity stopped after receiving chunks - considering stream complete');
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

            const data = JSON.parse(chunk);
            // Check for empty choices array first as it might signify stream completion
            if (data && Array.isArray(data.choices) && data.choices.length === 0) {
              console.log('Stream finished: Received empty choices array.');
              setIsStreaming(false);
              break; // Exit the loop when done
            } else if (data?.choices[0]?.finish_reason) {
              console.log('Stream finished by assistant with finish_reason:', data.choices[0].finish_reason);
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
            console.error('Error parsing chunk:', error);
          }
        }
      } catch (streamError) {
        console.error('Stream processing error:', streamError);
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
      console.error('Error in chat:', error);
      setError('An error occurred while chatting.');
    } finally {
      clearTimeout(globalTimeout);
      setIsStreaming(false);
    }
  };

  const handleOpenPdfModal = (pdfUrl: string, fileName: string, startPage: number, endPage?: number, searchText?: string) => {
    setPdfModalState({
      isOpen: true,
      pdfUrl,
      fileName,
      startPage,
      endPage,
      searchText
    });
  };

  const handleClosePdfModal = () => {
    setPdfModalState(prev => ({ ...prev, isOpen: false }));
  };

  // Function to render message with clickable PDF references
  const renderMessageContent = (content: string, isAssistant: boolean) => {
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

    // For assistant messages, look for PDF references
    const references = detectPageReferences(content);
    
    if (references.length === 0) {
      // If no references, render normally
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

    // If we have references, process the message
    let processedContent = content;
    // Process in reverse order to not affect indices
    for (let i = references.length - 1; i >= 0; i--) {
      const ref = references[i];
      const matchingFile = findMatchingPDFFile(ref, files);
      
      if (matchingFile) {
        const beforeRef = processedContent.substring(0, ref.matchIndex);
        const afterRef = processedContent.substring(ref.matchIndex + ref.fullMatch.length);
        const pdfUrl = `/api/files/${matchingFile.id}/content`;
        
        processedContent = `${beforeRef}[PDF: ${ref.fullMatch}](pdf:${pdfUrl}|${matchingFile.name}|${ref.startPage}|${ref.endPage || ref.startPage})${afterRef}`;
      }
    }

    return (
      <ReactMarkdown
        components={{
          a: ({ node, href, ...props }) => {
            if (href?.startsWith('pdf:')) {
              const [pdfUrl, fileName, startPage, endPage] = href.substring(4).split('|');
              // Extract text to search for based on what was clicked
              const refText = Array.isArray(props.children) 
                ? props.children.filter(child => typeof child === 'string').join(' ') 
                : typeof props.children === 'string' 
                  ? props.children 
                  : '';
              
              // Remove the "PDF: " prefix if it exists
              const searchText = refText.replace(/^PDF:\s*/, '');
              
              return (
                <a 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenPdfModal(
                      pdfUrl, 
                      fileName, 
                      parseInt(startPage, 10), 
                      endPage ? parseInt(endPage, 10) : undefined,
                      searchText
                    );
                  }}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline inline-flex items-center"
                >
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
                  </svg>
                  {props.children}
                </a>
              );
            }
            return (
              <a {...props} href={href} className="text-blue-600 dark:text-blue-400 hover:underline">
                🔗 {props.children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    );
  };

  // Keep the simple direct scroll function
  useEffect(() => {
    // Simple, direct scroll to bottom of messages container
    if (messages.length > 0) {
      const container = document.getElementById('messages-container');
      if (container) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 50);
      }
    }
  }, [messages]);

  return (
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-900 mb-4"></div>
          <p className="text-gray-500">Connecting to your Assistant...</p>
        </div>
      ) : assistantExists ? (
        <div className="w-full max-w-6xl xl:max-w-7xl">
          <h1 className="text-2xl font-bold mb-4 text-indigo-900 dark:text-indigo-100"><a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer" className="hover:underline">Industrial Engineer.ai Assistant</a>: {assistantName} <span className="text-green-500">●</span></h1>
          <div className="flex flex-col gap-4">
            <div className="w-full">
              <div id="messages-container" className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg mb-4 h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
                {messages.map((message, index) => (
                  <div key={index} className={`mb-2 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
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
                      } max-w-[80%] break-words`}>
                        {renderMessageContent(message.content, message.role === 'assistant')}
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
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleChat(); }} className="flex mb-4">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-grow p-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black dark:text-white"
                  placeholder="Type your message..."
                  disabled={isStreaming}
                />
                <button
                  type="submit"
                  className="bg-indigo-500 text-white p-2 rounded-r-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={isStreaming}
                >
                  {isStreaming ? 'Streaming...' : 'Send'}
                </button>
              </form>
              {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md shadow-md">
                  <div className="flex items-center">
                    <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="font-semibold">Error</p>
                  </div>
                  <p className="mt-2">{error}</p>
                </div>
              )}
            </div>
            {showAssistantFiles && (
              <div className="w-full">
                <AssistantFiles files={files} referencedFiles={referencedFiles} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md max-w-2xl">
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
              <li>Export the environment variable <code className="bg-red-200 px-1 rounded">PINECONE_ASSISTANT_NAME</code> with the value of your assistant&apos;s name</li>
              <li>Restart your application</li>
            </ol>
          </div>
        </div>
      )}
      <div className="mt-8 text-sm text-gray-500 flex space-x-4">
        <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
          ℹ️ What are Industrial Engineer.ai Assistants?
        </a>
        <a href="https://app.industrialengineer.ai" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
          🤖 Create your own Industrial Engineer.ai Assistant today
        </a>
      </div>

      {/* PDF Preview Modal */}
      {pdfModalState.isOpen && (
        <PDFPreviewModal 
          isOpen={pdfModalState.isOpen}
          onClose={handleClosePdfModal}
          pdfUrl={pdfModalState.pdfUrl}
          fileName={pdfModalState.fileName}
          startPage={pdfModalState.startPage}
          endPage={pdfModalState.endPage}
          searchText={pdfModalState.searchText}
        />
      )}
    </main>
  );
}