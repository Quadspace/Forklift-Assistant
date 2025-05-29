'use client';

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { readStreamableValue } from 'ai/rsc';
import { chat } from './actions';
import ReactMarkdown from 'react-markdown';
import AssistantFiles from './components/AssistantFiles';
import PromptSuggestions from './components/PromptSuggestions';
import { File, Reference, Message } from './types';
import { v4 as uuidv4 } from 'uuid';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check for dark mode preference
    if (typeof window !== 'undefined') {
      const isDarkMode = localStorage.getItem('darkMode') === 'true';
      setDarkMode(isDarkMode);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      }
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', (!darkMode).toString());
      document.documentElement.classList.toggle('dark');
    }
  };

  const extractReferences = useCallback((content: string): Reference[] => {
    const references: Reference[] = [];
    
    // Extract markdown links with signed URLs: [filename.pdf](https://storage.googleapis.com/...)
    const markdownLinkRegex = /\[([^\]]+\.(?:pdf|doc|docx|txt|md))\]\((https?:\/\/[^\)]+)\)/gi;
    let match;
    
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      const fileName = match[1].trim();
      const url = match[2].trim();
      references.push({ 
        name: fileName,
        url: url
      });
    }
    
    // Extract file names that appear in the text (like "RT 4000 SERIES_compressed.pdf")
    const fileNameRegex = /\b([A-Za-z0-9_\s-]+\.(?:pdf|doc|docx|txt|md))\b/gi;
    while ((match = fileNameRegex.exec(content)) !== null) {
      const fileName = match[1].trim();
      if (!references.some(ref => ref.name === fileName)) {
        references.push({ 
          name: fileName,
          url: `#file-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}` // Create anchor link
        });
      }
    }
    
    // Extract page references (like "Pages 45, 46, 47, 48, 49, 50, 51")
    const pageRegex = /Pages?\s+([\d,\s-]+)/gi;
    while ((match = pageRegex.exec(content)) !== null) {
      const pageNumbers = match[1].trim();
      references.push({ 
        name: `Pages ${pageNumbers}`,
        url: `#pages-${pageNumbers.replace(/[^0-9]/g, '-')}` // Create anchor link
      });
    }
    
    // Extract bracket-style citations like [1, pp. 18-25] or [2, pp. 47-59] (fallback)
    const bracketCitationRegex = /\[(\d+),?\s*pp?\.\s*[\d-]+\]/gi;
    while ((match = bracketCitationRegex.exec(content)) !== null) {
      const citationNumber = match[1];
      const citationText = match[0]; // Full match like "[1, pp. 18-25]"
      if (!references.some(ref => ref.name.includes(`Citation ${citationNumber}`))) {
        references.push({ 
          name: `Citation ${citationNumber}`,
          url: `#citation-${citationNumber}`
        });
      }
    }
    
    // Extract simple bracket citations like [1] or [2] (fallback)
    const simpleBracketRegex = /\[(\d+)\]/gi;
    while ((match = simpleBracketRegex.exec(content)) !== null) {
      const citationNumber = match[1];
      // Only add if we don't already have a more detailed citation for this number
      if (!references.some(ref => ref.name.includes(`Citation ${citationNumber}`) || ref.name.includes(`Source ${citationNumber}`))) {
        references.push({ 
          name: `Source ${citationNumber}`,
          url: `#source-${citationNumber}`
        });
      }
    }

    return references;
  }, []);

  useEffect(() => {
    // Simplified initialization - no API calls needed
    setLoading(false);
    setAssistantExists(true);
    setAssistantName('forklift-maintenance');
    setError(''); // Clear any error state
  }, []);

  const fetchFiles = async () => {
    // Simplified - no files API needed for basic functionality
    setFiles([]);
  };

  const checkAssistant = async () => {
    // Simplified - assume assistant exists if we have the required env vars
    setLoading(false);
    setAssistantExists(true);
    setAssistantName('forklift-maintenance');
    setError(''); // Clear any error state
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
    try {
      // Get all messages including the new user message
      const allMessages = [...messages, userMessage];
      const { object } = await chat(allMessages);
      let accumulatedContent = '';
      const newAssistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        references: []
      };
      
      setMessages(prevMessages => [...prevMessages, newAssistantMessage]);

      // Process the response stream from the Assistant
      for await (const chunk of readStreamableValue(object)) {
        try {
          // The chunk is already the event data string from the backend
          if (!chunk || typeof chunk !== 'string') continue;
          
          const data = JSON.parse(chunk);
          
          // Handle different message types from Pinecone streaming (as per official docs)
          switch (data.type) {
            case 'start':
              // Message started - assistant is beginning to respond
              break;
              
            case 'content':
              // Content chunk from the assistant
              if (data.content) {
                accumulatedContent += data.content;
                
                setMessages(prevMessages => {
                  const updatedMessages = [...prevMessages];
                  const lastMessage = updatedMessages[updatedMessages.length - 1];
                  lastMessage.content = accumulatedContent;
                  return updatedMessages;
                });
              }
              break;
              
            case 'citation':
              // Citation from the assistant
              if (data.citation) {
                const citation = data.citation;
                const structuredReference = {
                  name: citation.references?.[0]?.file?.name || `Citation ${citation.position || ''}`,
                  url: citation.references?.[0]?.file?.signed_url || `#citation-${citation.position || Math.random()}`,
                  pages: citation.references?.[0]?.pages,
                  highlight: citation.references?.[0]?.highlight?.content,
                  position: citation.position
                };
                
                // Update the current message with the new citation
                setMessages(prevMessages => {
                  const updatedMessages = [...prevMessages];
                  const lastMessage = updatedMessages[updatedMessages.length - 1];
                  if (!lastMessage.references) {
                    lastMessage.references = [];
                  }
                  lastMessage.references.push(structuredReference);
                  return updatedMessages;
                });
                
                // Also update the global referenced files
                setReferencedFiles(prevFiles => [...prevFiles, structuredReference]);
              }
              break;
              
            case 'end':
              // Message ended - assistant finished responding
              break;
              
            default:
              // Handle legacy format for backward compatibility
              if (data?.choices[0]?.delta?.content) {
                const content = data.choices[0].delta.content;
                if (content) {
                  accumulatedContent += content;
                  
                  setMessages(prevMessages => {
                    const updatedMessages = [...prevMessages];
                    const lastMessage = updatedMessages[updatedMessages.length - 1];
                    lastMessage.content = accumulatedContent;
                    return updatedMessages;
                  });
                }
              }
          }

        } catch (error) {
          console.error('Error parsing chunk:', error);
        }
      }

    } catch (error) {
      console.error('Error in chat:', error);
      setError('An error occurred while chatting.');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim()) return;

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
      // Get all messages including the new user message
      const allMessages = [...messages, newUserMessage];
      const { object } = await chat(allMessages);
      let accumulatedContent = '';
      const newAssistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        references: []
      };
      
      setMessages(prevMessages => [...prevMessages, newAssistantMessage]);

      // Process the response stream from the Assistant
      for await (const chunk of readStreamableValue(object)) {
        try {
          // The chunk is already the event data string from the backend
          if (!chunk || typeof chunk !== 'string') continue;
          
          const data = JSON.parse(chunk);
          
          // Handle different message types from Pinecone streaming (as per official docs)
          switch (data.type) {
            case 'start':
              // Message started - assistant is beginning to respond
              break;
              
            case 'content':
              // Content chunk from the assistant
              if (data.content) {
                accumulatedContent += data.content;
                
                setMessages(prevMessages => {
                  const updatedMessages = [...prevMessages];
                  const lastMessage = updatedMessages[updatedMessages.length - 1];
                  lastMessage.content = accumulatedContent;
                  return updatedMessages;
                });
              }
              break;
              
            case 'citation':
              // Citation from the assistant
              if (data.citation) {
                const citation = data.citation;
                const structuredReference = {
                  name: citation.references?.[0]?.file?.name || `Citation ${citation.position || ''}`,
                  url: citation.references?.[0]?.file?.signed_url || `#citation-${citation.position || Math.random()}`,
                  pages: citation.references?.[0]?.pages,
                  highlight: citation.references?.[0]?.highlight?.content,
                  position: citation.position
                };
                
                // Update the current message with the new citation
                setMessages(prevMessages => {
                  const updatedMessages = [...prevMessages];
                  const lastMessage = updatedMessages[updatedMessages.length - 1];
                  if (!lastMessage.references) {
                    lastMessage.references = [];
                  }
                  lastMessage.references.push(structuredReference);
                  return updatedMessages;
                });
                
                // Also update the global referenced files
                setReferencedFiles(prevFiles => [...prevFiles, structuredReference]);
              }
              break;
              
            case 'end':
              // Message ended - assistant finished responding
              break;
              
            default:
              // Handle legacy format for backward compatibility
              if (data?.choices[0]?.delta?.content) {
                const content = data.choices[0].delta.content;
                if (content) {
                  accumulatedContent += content;
                  
                  setMessages(prevMessages => {
                    const updatedMessages = [...prevMessages];
                    const lastMessage = updatedMessages[updatedMessages.length - 1];
                    lastMessage.content = accumulatedContent;
                    return updatedMessages;
                  });
                }
              }
          }

        } catch (error) {
          console.error('Error parsing chunk:', error);
        }
      }

    } catch (error) {
      console.error('Error in chat:', error);
      setError('An error occurred while chatting.');
    } finally {
      setIsStreaming(false);
    }
  };

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
          <p className="text-gray-500 dark:text-gray-400">Connecting to your Assistant...</p>
        </div>
      ) : assistantExists ? (
        <div className="w-full max-w-6xl xl:max-w-7xl">
          <h1 className="text-2xl font-bold mb-4 text-indigo-900 dark:text-indigo-100">
            <a href="https://www.industrialengineer.ai/blog/industrialengineer-ai-assistant/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Industrial Engineer.ai Assistant
            </a>: {assistantName} <span className="text-green-500">●</span>
          </h1>
          
          <div className="flex flex-col gap-4">
            <div className="w-full">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg mb-4 h-[calc(100vh-500px)] overflow-y-auto">
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
                        <ReactMarkdown
                          components={{
                            a: ({ node, ...props }) => (
                              <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline">
                                🔗 {props.children}
                              </a>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        {message.references && showCitations && (
                          <div className="mt-2">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sources:</div>
                            <ul className="space-y-1">
                              {message.references.map((ref, i) => (
                                <li key={i} className="text-sm">
                                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                                    🔗 {ref.name}
                                    {ref.pages && ` (Pages ${ref.pages})`}
                                  </a>
                                  {ref.highlight && (
                                    <div className="ml-4 mt-1 text-xs text-gray-500 dark:text-gray-400 italic border-l-2 border-gray-300 pl-2">
                                      "{ref.highlight}"
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              
              {/* Prompt Suggestions */}
              <PromptSuggestions 
                messages={messages}
                files={files}
                onPromptSelect={handlePromptSelect}
                isStreaming={isStreaming}
              />
              
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
                  className="bg-indigo-500 text-white p-2 rounded-r-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isStreaming}
                >
                  {isStreaming ? 'Streaming...' : 'Send'}
                </button>
              </form>
              
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 p-4 mb-4 rounded-md shadow-md">
                  <div className="flex items-center">
                    <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
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
    </main>
  );
}