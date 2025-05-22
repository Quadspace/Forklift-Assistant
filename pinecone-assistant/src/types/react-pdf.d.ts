declare module 'react-pdf' {
  import React from 'react';

  export interface DocumentProps {
    file: string | { url: string } | { data: Uint8Array } | { range: Uint8Array };
    onLoadSuccess?: (pdf: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
    loading?: React.ReactNode;
    noData?: React.ReactNode;
    error?: React.ReactNode;
    children?: React.ReactNode;
  }
  
  export interface PageProps {
    pageNumber: number;
    width?: number;
    renderTextLayer?: boolean;
    renderAnnotationLayer?: boolean;
    className?: string;
    scale?: number;
  }
  
  export const Document: React.FC<DocumentProps>;
  export const Page: React.FC<PageProps>;
  
  export const pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    version: string;
  };
} 