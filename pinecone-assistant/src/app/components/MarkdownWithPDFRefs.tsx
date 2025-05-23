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
      setProcessedContent([content]);
      return;
    }
    // Build an array of React elements and strings
    const contentParts: React.ReactNode[] = [];
    let lastIndex = 0;
    references.forEach((ref, i) => {
      if (ref.matchIndex > lastIndex) {
        contentParts.push(content.substring(lastIndex, ref.matchIndex));
      }
      const matchingFile = findMatchingPDFFile(ref, files);
      if (matchingFile) {
        const displayText = `PDF: ${matchingFile.name} (p. ${ref.startPage}${ref.endPage !== ref.startPage ? `-${ref.endPage}` : ''})`;
        contentParts.push(
          <a
            key={`pdf-link-${i}`}
            href="#"
            onClick={e => {
              e.preventDefault();
              setModalProps({
                pdfUrl: `/api/files/${matchingFile.id}/content`,
                fileName: matchingFile.name,
                startPage: ref.startPage,
                endPage: ref.endPage
              });
              setIsModalOpen(true);
            }}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline inline-flex items-center bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-700 shadow-sm"
            title={displayText}
          >
            <svg
              className="w-4 h-4 mr-1 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
            </svg>
            <span className="truncate max-w-[200px]">{displayText}</span>
          </a>
        );
      } else {
        contentParts.push(ref.fullMatch);
      }
      lastIndex = ref.matchIndex + ref.fullMatch.length;
    });
    if (lastIndex < content.length) {
      contentParts.push(content.substring(lastIndex));
    }
    setProcessedContent(contentParts);
  }, [content, files]);

  return (
    <>
      {(Array.isArray(processedContent) ? processedContent.flat() : [processedContent])
        .filter(x => typeof x === 'string' || typeof x === 'number' || React.isValidElement(x))
        .map((x, i) =>
          typeof x === 'string' || typeof x === 'number'
            ? x
            : React.isValidElement(x)
            ? React.cloneElement(x, { key: x.key ?? i })
            : null
        )
        .filter(x => x !== null)}
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