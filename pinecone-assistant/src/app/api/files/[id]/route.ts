import { NextRequest, NextResponse } from 'next/server';

const PINECONE_API_BASE = process.env.PINECONE_ASSISTANT_URL;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const ASSISTANT_NAME = process.env.PINECONE_ASSISTANT_NAME;

// GET - Get file details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id;

    const response = await fetch(
      `${PINECONE_API_BASE}/assistant/files/${ASSISTANT_NAME}/${fileId}`,
      {
        method: 'GET',
        headers: {
          'Api-Key': PINECONE_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file details: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ status: 'success', file: data });

  } catch (error) {
    console.error('Error getting file details:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to get file details' },
      { status: 500 }
    );
  }
}

// DELETE - Delete file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const fileId = params.id;

    const response = await fetch(
      `${PINECONE_API_BASE}/assistant/files/${ASSISTANT_NAME}/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          'Api-Key': PINECONE_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }

    return NextResponse.json({ status: 'success', message: 'File deleted successfully' });

  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to delete file' },
      { status: 500 }
    );
  }
} 