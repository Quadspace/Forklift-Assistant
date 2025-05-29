export interface File {
    id: string;
    name: string;
    size: number;
    created_at: string;
    updated_at: string;
    status: string;
    metadata: any;
    signed_url: string;
  }
 
  // A 'Reference' is a file that the Assistant has access to and used 
  // when answering a user question
  export interface Reference {
    name: string;
    url?: string;
    pages?: string | number; // Page numbers from Pinecone citations
    highlight?: string; // Highlighted text from Pinecone citations
    position?: number; // Position in the citation array
    fileId?: string; // File ID from Pinecone
    fileStatus?: string; // File status from Pinecone
  }

  export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: string;
    references?: Reference[]; 
  }
