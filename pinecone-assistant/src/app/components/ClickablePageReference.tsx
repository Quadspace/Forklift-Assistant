'use client';

import { useState } from 'react';

interface ClickablePageReferenceProps {
  text: string;
  pdfUrl: string;
  fileName: string;
  startPage: number;
  endPage?: number;
  onOpenModal: (pdfUrl: string, fileName: string, startPage: number, endPage?: number) => void;
}

export default function ClickablePageReference({
  text,
  pdfUrl,
  fileName,
  startPage,
  endPage,
  onOpenModal,
}: ClickablePageReferenceProps) {
  const handleClick = () => {
    onOpenModal(pdfUrl, fileName, startPage, endPage);
  };

  // Format a clean display text that doesn't show the full file path
  const displayText = `PDF: ${fileName} (p. ${startPage}${endPage && endPage !== startPage ? `-${endPage}` : ''})`;

  return (
    <span
      onClick={handleClick}
      className="cursor-pointer text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline inline-flex items-center"
    >
      <svg
        className="w-4 h-4 mr-1"
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
      </svg>
      {displayText}
    </span>
  );
} 