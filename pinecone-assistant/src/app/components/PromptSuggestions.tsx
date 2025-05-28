'use client';

import { useState, useEffect } from 'react';
import { Message, File } from '../types';

interface PromptSuggestionsProps {
  messages: Message[];
  files: File[];
  onPromptSelect: (prompt: string) => void;
  isStreaming: boolean;
}

// Starter prompts for when there are no messages
const STARTER_PROMPTS = [
  {
    category: "Safety & Maintenance",
    prompts: [
      "What are the daily safety checks I should perform on my forklift?",
      "How do I properly inspect the hydraulic system?",
      "What's the recommended maintenance schedule for electric forklifts?",
      "Show me the emergency shutdown procedures"
    ]
  },
  {
    category: "Troubleshooting",
    prompts: [
      "My forklift won't start - what should I check first?",
      "The hydraulic lift is moving slowly, what could be wrong?",
      "How do I diagnose battery charging issues?",
      "What causes steering problems in forklifts?"
    ]
  },
  {
    category: "Operations",
    prompts: [
      "What's the proper way to load and unload materials?",
      "How do I calculate load capacity for different heights?",
      "What are the best practices for warehouse navigation?",
      "Show me the correct lifting techniques"
    ]
  },
  {
    category: "Documentation",
    prompts: [
      "Where can I find the operator manual for my forklift model?",
      "What maintenance records should I keep?",
      "Show me the parts diagram for the hydraulic system",
      "What are the certification requirements for operators?"
    ]
  }
];

// Keywords that trigger specific follow-up suggestions
const FOLLOW_UP_PATTERNS = [
  {
    keywords: ["safety", "check", "inspection"],
    suggestions: [
      "What happens if I skip a safety check?",
      "How often should I perform these inspections?",
      "Show me a safety checklist template",
      "What are the most common safety violations?"
    ]
  },
  {
    keywords: ["maintenance", "service", "repair"],
    suggestions: [
      "How much does this maintenance typically cost?",
      "Can I perform this maintenance myself?",
      "What tools do I need for this repair?",
      "How long should this maintenance take?"
    ]
  },
  {
    keywords: ["hydraulic", "lift", "mast"],
    suggestions: [
      "What hydraulic fluid should I use?",
      "How do I check hydraulic fluid levels?",
      "What causes hydraulic leaks?",
      "How do I adjust lift speed?"
    ]
  },
  {
    keywords: ["battery", "electric", "charging"],
    suggestions: [
      "How long should the battery last?",
      "What's the proper charging procedure?",
      "How do I extend battery life?",
      "What are signs of battery failure?"
    ]
  },
  {
    keywords: ["troubleshoot", "problem", "issue", "won't", "doesn't"],
    suggestions: [
      "What are the most common causes of this problem?",
      "Is this something I can fix myself?",
      "How urgent is this issue?",
      "What should I do if the problem persists?"
    ]
  },
  {
    keywords: ["load", "capacity", "weight", "lifting"],
    suggestions: [
      "What's the maximum weight I can lift?",
      "How does height affect load capacity?",
      "What happens if I exceed the load limit?",
      "How do I calculate the load center?"
    ]
  },
  {
    keywords: ["manual", "documentation", "guide", "procedure"],
    suggestions: [
      "Where can I find more detailed information?",
      "Are there video tutorials available?",
      "What other related procedures should I know?",
      "How do I access the latest version of this document?"
    ]
  }
];

export default function PromptSuggestions({ messages, files, onPromptSelect, isStreaming }: PromptSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showStarterPrompts, setShowStarterPrompts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Generate file-specific prompts based on available documents
  const generateFileSpecificPrompts = () => {
    const filePrompts: string[] = [];
    
    files.forEach(file => {
      const fileName = file.name.toLowerCase();
      const baseName = file.name.split('.')[0];
      
      if (fileName.includes('manual') || fileName.includes('guide')) {
        filePrompts.push(`What's covered in the ${baseName}?`);
        filePrompts.push(`Show me the table of contents for ${baseName}`);
      }
      
      if (fileName.includes('safety') || fileName.includes('sop')) {
        filePrompts.push(`What are the key safety points in ${baseName}?`);
        filePrompts.push(`Show me the emergency procedures from ${baseName}`);
      }
      
      if (fileName.includes('maintenance') || fileName.includes('service')) {
        filePrompts.push(`What maintenance schedule is outlined in ${baseName}?`);
        filePrompts.push(`Show me the troubleshooting section from ${baseName}`);
      }
      
      if (fileName.includes('parts') || fileName.includes('diagram')) {
        filePrompts.push(`Show me the parts diagram from ${baseName}`);
        filePrompts.push(`What components are listed in ${baseName}?`);
      }
    });
    
    return filePrompts.slice(0, 6); // Limit to avoid overwhelming
  };

  // Enhanced starter prompts that include file-specific suggestions
  const getEnhancedStarterPrompts = () => {
    const basePrompts = [...STARTER_PROMPTS];
    const fileSpecificPrompts = generateFileSpecificPrompts();
    
    if (fileSpecificPrompts.length > 0) {
      basePrompts.push({
        category: "Your Documents",
        prompts: fileSpecificPrompts
      });
    }
    
    return basePrompts;
  };

  // Generate follow-up suggestions based on the last AI message
  useEffect(() => {
    if (messages.length === 0) {
      setShowStarterPrompts(true);
      setSuggestions([]);
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.content) {
      setShowStarterPrompts(false);
      generateFollowUpSuggestions(lastMessage.content);
    }
  }, [messages]);

  const generateFollowUpSuggestions = (content: string) => {
    const contentLower = content.toLowerCase();
    const matchedSuggestions: string[] = [];

    // Find patterns that match the content
    FOLLOW_UP_PATTERNS.forEach(pattern => {
      const hasMatch = pattern.keywords.some(keyword => 
        contentLower.includes(keyword.toLowerCase())
      );
      
      if (hasMatch) {
        // Add suggestions from this pattern, but limit to avoid overwhelming
        matchedSuggestions.push(...pattern.suggestions.slice(0, 2));
      }
    });

    // Remove duplicates and limit total suggestions
    const uniqueSuggestions = [...new Set(matchedSuggestions)].slice(0, 4);
    setSuggestions(uniqueSuggestions);
  };

  const handlePromptClick = (prompt: string) => {
    onPromptSelect(prompt);
  };

  if (isStreaming) {
    return null; // Hide suggestions while streaming
  }

  return (
    <div className="w-full mb-4">
      {showStarterPrompts ? (
        // Starter prompts when no conversation exists
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 animate-fade-in">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
            💡 What would you like to know about forklift operations?
            <span className="ml-2 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
              Click to ask
            </span>
          </h3>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {getEnhancedStarterPrompts().map((category) => (
              <button
                key={category.category}
                onClick={() => setSelectedCategory(
                  selectedCategory === category.category ? null : category.category
                )}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 transform hover:scale-105 ${
                  selectedCategory === category.category
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {category.category === "Your Documents" && "📄 "}
                {category.category === "Safety & Maintenance" && "🔧 "}
                {category.category === "Troubleshooting" && "🔍 "}
                {category.category === "Operations" && "⚙️ "}
                {category.category === "Documentation" && "📋 "}
                {category.category}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {getEnhancedStarterPrompts()
              .filter(category => !selectedCategory || category.category === selectedCategory)
              .flatMap(category => category.prompts)
              .map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handlePromptClick(prompt)}
                  className="text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 border border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transform hover:scale-[1.02]"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {prompt}
                  </span>
                </button>
              ))}
          </div>
          
          {files.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
                </svg>
                {files.length} document{files.length !== 1 ? 's' : ''} available for reference
              </p>
            </div>
          )}
        </div>
      ) : suggestions.length > 0 ? (
        // Follow-up suggestions based on conversation
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 animate-slide-up">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center">
            🔍 Follow-up questions you might have:
            <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
              Smart suggestions
            </span>
          </h4>
          
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handlePromptClick(suggestion)}
                className="text-left px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all duration-200 border border-blue-200 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300 hover:shadow-md transform hover:scale-105"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => setShowStarterPrompts(true)}
            className="mt-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline transition-colors duration-200 flex items-center"
          >
            ← Back to main topics
          </button>
        </div>
      ) : null}
      
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
} 