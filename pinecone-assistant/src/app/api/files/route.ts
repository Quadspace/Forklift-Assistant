import { NextRequest, NextResponse } from 'next/server';

const PINECONE_API_BASE = process.env.PINECONE_ASSISTANT_HOST;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const ASSISTANT_NAME = process.env.PINECONE_ASSISTANT_NAME;

// GET - List files
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter');

    let url = `${PINECONE_API_BASE}/assistant/files/${ASSISTANT_NAME}`;
    
    const options: RequestInit = {
      method: 'GET',
      headers: {
        'Api-Key': PINECONE_API_KEY!,
        'X-Project-Id': process.env.PINECONE_ASSISTANT_ID!,
        'X-Pinecone-API-Version': '2025-04',
        'Content-Type': 'application/json',
      },
    };

    // Add filter if provided
    if (filter) {
      options.method = 'POST';
      options.body = JSON.stringify({ filter: JSON.parse(filter) });
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ status: 'success', files: data.files || [] });

  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to list files' },
      { status: 500 }
    );
  }
}

// POST - Upload file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadata = formData.get('metadata') as string;

    if (!file) {
      return NextResponse.json(
        { status: 'error', message: 'No file provided' },
        { status: 400 }
      );
    }

    // Create form data for Pinecone API
    const pineconeFormData = new FormData();
    pineconeFormData.append('file', file);

    let url = `${PINECONE_API_BASE}/assistant/files/${ASSISTANT_NAME}`;
    
    // Add metadata to URL if provided
    if (metadata) {
      const encodedMetadata = encodeURIComponent(metadata);
      url += `?metadata=${encodedMetadata}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY!,
        'X-Project-Id': process.env.PINECONE_ASSISTANT_ID!,
        'X-Pinecone-API-Version': '2025-04',
      },
      body: pineconeFormData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ status: 'success', file: data });

  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to upload file' },
      { status: 500 }
    );
  }
} 