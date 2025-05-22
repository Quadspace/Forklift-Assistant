'use client';

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { detectPageReferences, PageReference, findMatchingPDFFile } from '../utils/pdfReferences';
import ClickablePageReference from './ClickablePageReference';
import PDFPreviewModal from './PDFPreviewModal';
import { File } from '../types';

interface MarkdownWithPDFRefsProps {
  content: string;
  files: File[];
}

export default function MarkdownWithPDFRefs({ content, files }: MarkdownWithPDFRefsProps) {
  const [processedContent, setProcessedContent] = useState<React.ReactNode[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalProps, setModalProps] = useState({
    pdfUrl: '',
    fileName: '',
    startPage: 1,
    endPage: undefined as number | undefined
  });

  const handleOpenModal = (pdfUrl: string, fileName: string, startPage: number, endPage?: number) => {
    setModalProps({ pdfUrl, fileName, startPage, endPage });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  useEffect(() => {
    // Process the content to find and replace PDF references
    const references = detectPageReferences(content);
    
    if (references.length === 0) {
      // If no references, just return the original content
      setProcessedContent([content]);
      return;
    }

    // Split the content by references
    const contentParts: React.ReactNode[] = [];
    let lastIndex = 0;

    references.forEach((ref, index) => {
      // Add text before the reference
      if (ref.matchIndex > lastIndex) {
        contentParts.push(content.substring(lastIndex, ref.matchIndex));
      }

      // Find matching PDF file
      const matchingFile = findMatchingPDFFile(ref, files);
      
      if (matchingFile) {
        // Add clickable reference
        contentParts.push(
          <ClickablePageReference
            key={`pdf-ref-${index}`}
            text={ref.fullMatch}
            pdfUrl={`/api/files/${matchingFile.id}/content`}
            fileName={matchingFile.name}
            startPage={ref.startPage}
            endPage={ref.endPage}
            onOpenModal={handleOpenModal}
          />
        );
      } else {
        // No matching file, just add the text
        contentParts.push(ref.fullMatch);
      }

      lastIndex = ref.matchIndex + ref.fullMatch.length;
    });

    // Add remaining text
    if (lastIndex < content.length) {
      contentParts.push(content.substring(lastIndex));
    }

    setProcessedContent(contentParts);
  }, [content, files]);

  // Create separate components for markdown rendering to avoid type issues
  const renderMarkdown = (text: string, key?: string) => (
    <div key={key} className="inline">
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline">
              🔗 {props.children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );

  // If the content has been processed with references
  if (processedContent.length > 1) {
    return (
      <>
        <div>
          {processedContent.map((part, index) => {
            // If part is a string, render it with markdown
            if (typeof part === 'string') {
              return renderMarkdown(part, `md-part-${index}`);
            }
            // Otherwise, it's already a React element
            return part;
          })}
        </div>

        {isModalOpen && (
          <PDFPreviewModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            pdfUrl={modalProps.pdfUrl}
            fileName={modalProps.fileName}
            startPage={modalProps.startPage}
            endPage={modalProps.endPage}
          />
        )}
      </>
    );
  }

  // If no references were found, render the content as is
  return renderMarkdown(content);
} 