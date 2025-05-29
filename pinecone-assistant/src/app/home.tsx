'use client';

import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { readStreamableValue } from 'ai/rsc';
import { chat } from './actions';
import ReactMarkdown from 'react-markdown';
import AssistantFiles from './components/AssistantFiles';
import PromptSuggestions from './components/PromptSuggestions';
import { File, Reference, Message } from './types';
import { v4 as uuidv4 } from 'uuid';
import FileManager from './components/FileManager';

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
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');

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
          
          console.log('Raw chunk:', chunk);
          const data = JSON.parse(chunk);
          console.log('📡 Stream event:', {
            type: data.type,
            has_content: !!data.content,
            has_citation: !!data.citation,
            finish_reason: data.finish_reason,
            timestamp: new Date().toISOString()
          });
          
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
              // Citation from the assistant - handle structured citation objects
              if (data.citation) {
                const citation = data.citation;
                console.log('📋 Received citation event:', {
                  type: 'citation',
                  position: citation.position,
                  references_count: citation.references?.length || 0,
                  full_citation: JSON.stringify(citation, null, 2)
                });
                
                // Handle the structured citation format from Pinecone
                if (citation.references && citation.references.length > 0) {
                  citation.references.forEach((reference: any) => {
                    if (reference.file) {
                      // Only use signed_url if file status is Available
                      const isFileAvailable = reference.file.status === 'Available';
                      const fileUrl = isFileAvailable && reference.file.signed_url 
                        ? reference.file.signed_url 
                        : `#file-${reference.file.id || 'unavailable'}`;
                      
                      const structuredReference = {
                        name: reference.file.name || `Citation ${citation.position || ''}`,
                        url: fileUrl,
                        pages: reference.pages ? reference.pages.join(', ') : undefined,
                        highlight: reference.highlight?.content,
                        position: citation.position,
                        fileId: reference.file.id,
                        fileStatus: reference.file.status
                      };
                      
                      console.log('Processed citation reference:', structuredReference);
                      
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
                  });
                } else {
                  // Fallback for simpler citation format
                  const isFileAvailable = citation.file?.status === 'Available';
                  const fileUrl = isFileAvailable && citation.file?.signed_url 
                    ? citation.file.signed_url 
                    : `#citation-${citation.position || Math.random()}`;
                    
                  const structuredReference = {
                    name: citation.file?.name || `Citation ${citation.position || ''}`,
                    url: fileUrl,
                    pages: citation.pages ? (Array.isArray(citation.pages) ? citation.pages.join(', ') : citation.pages) : undefined,
                    highlight: citation.highlight?.content,
                    position: citation.position,
                    fileStatus: citation.file?.status
                  };
                  
                  console.log('Processed fallback citation:', structuredReference);
                  
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
          
          console.log('Raw chunk:', chunk);
          const data = JSON.parse(chunk);
          console.log('📡 Stream event:', {
            type: data.type,
            has_content: !!data.content,
            has_citation: !!data.citation,
            finish_reason: data.finish_reason,
            timestamp: new Date().toISOString()
          });
          
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
              // Citation from the assistant - handle structured citation objects
              if (data.citation) {
                const citation = data.citation;
                console.log('📋 Received citation event:', {
                  type: 'citation',
                  position: citation.position,
                  references_count: citation.references?.length || 0,
                  full_citation: JSON.stringify(citation, null, 2)
                });
                
                // Handle the structured citation format from Pinecone
                if (citation.references && citation.references.length > 0) {
                  citation.references.forEach((reference: any) => {
                    if (reference.file) {
                      // Only use signed_url if file status is Available
                      const isFileAvailable = reference.file.status === 'Available';
                      const fileUrl = isFileAvailable && reference.file.signed_url 
                        ? reference.file.signed_url 
                        : `#file-${reference.file.id || 'unavailable'}`;
                      
                      const structuredReference = {
                        name: reference.file.name || `Citation ${citation.position || ''}`,
                        url: fileUrl,
                        pages: reference.pages ? reference.pages.join(', ') : undefined,
                        highlight: reference.highlight?.content,
                        position: citation.position,
                        fileId: reference.file.id,
                        fileStatus: reference.file.status
                      };
                      
                      console.log('Processed citation reference:', structuredReference);
                      
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
                  });
                } else {
                  // Fallback for simpler citation format
                  const isFileAvailable = citation.file?.status === 'Available';
                  const fileUrl = isFileAvailable && citation.file?.signed_url 
                    ? citation.file.signed_url 
                    : `#citation-${citation.position || Math.random()}`;
                    
                  const structuredReference = {
                    name: citation.file?.name || `Citation ${citation.position || ''}`,
                    url: fileUrl,
                    pages: citation.pages ? (Array.isArray(citation.pages) ? citation.pages.join(', ') : citation.pages) : undefined,
                    highlight: citation.highlight?.content,
                    position: citation.position,
                    fileStatus: citation.file?.status
                  };
                  
                  console.log('Processed fallback citation:', structuredReference);
                  
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

  // Insert inline citations function from Pinecone's official guide
  const insertInlineCitations = (content: string, citations: Reference[]): string => {
    if (!citations || citations.length === 0) return content;
    
    let result = content;
    let offset = 0; // Keep track of how much we've shifted the text
    
    // Sort citations by position to process them in order
    const sortedCitations = [...citations].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    sortedCitations.forEach((cite, index) => {
      const citationNumber = index + 1;
      const citation = `[${citationNumber}]`;
      const position = cite.position || 0;
      
      const adjustedPosition = position + offset;
      result = result.slice(0, adjustedPosition) + citation + result.slice(adjustedPosition);
      
      offset += citation.length;
    });
    
    return result;
  };

  // Enhanced URL formatting for page-specific links
  const formatCitationUrl = (ref: Reference): string => {
    if (!ref.url || ref.url.startsWith('#')) return ref.url || '#';
    
    // Add page fragment if pages are specified (Pinecone format: signed_url#page=78)
    if (ref.pages && ref.url.includes('storage.googleapis.com')) {
      const pageNumber = typeof ref.pages === 'string' ? ref.pages.split(',')[0].trim() : ref.pages;
      return `${ref.url}#page=${pageNumber}`;
    }
    
    return ref.url;
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
            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                💬 Chat
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'files'
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                📁 Files
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'chat' ? (
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
                          {insertInlineCitations(message.content, message.references || [])}
                        </ReactMarkdown>
                        {message.references && showCitations && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-600 rounded-lg border-l-4 border-blue-500">
                            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zm8 0a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-6z" clipRule="evenodd" />
                              </svg>
                              Sources ({message.references.length})
                            </div>
                            <div className="space-y-2">
                              {message.references.map((ref, i) => (
                                <div key={i} className="bg-white dark:bg-gray-700 p-3 rounded border">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                                          [{i + 1}]
                                        </span>
                                        {ref.fileStatus === 'Available' && ref.url && !ref.url.startsWith('#') ? (
                                          <a 
                                            href={formatCitationUrl(ref)} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium hover:underline flex items-center"
                                          >
                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            {ref.name}
                                          </a>
                                        ) : (
                                          <div className="flex items-center text-gray-600 dark:text-gray-400">
                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {ref.name}
                                            {ref.fileStatus !== 'Available' && (
                                              <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                                                (File {ref.fileStatus})
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                                        {ref.pages && (
                                          <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                            Page {ref.pages}
                                          </span>
                                        )}
                                        {ref.fileStatus && (
                                          <span className={`px-2 py-1 rounded text-xs ${
                                            ref.fileStatus === 'Available' 
                                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                              : ref.fileStatus === 'Processing'
                                              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                          }`}>
                                            {ref.fileStatus}
                                          </span>
                                        )}
                                        {ref.position && (
                                          <span className="text-gray-400">
                                            Position: {ref.position}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {ref.highlight && (
                                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-3 border-yellow-400 rounded">
                                      <div className="text-xs text-yellow-800 dark:text-yellow-200 font-medium mb-2 flex items-center">
                                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zm8 0a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-6z" clipRule="evenodd" />
                                        </svg>
                                        Citation Highlight:
                                      </div>
                                      <div className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">
                                        "{ref.highlight}"
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
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
            ) : null}
            
            {activeTab === 'files' && (
              <div className="w-full">
                <FileManager onFilesChange={setFiles} />
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