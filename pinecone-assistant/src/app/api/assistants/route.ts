import { NextResponse } from 'next/server';
import { checkAssistantPrerequisites } from '../../utils/assistantUtils';

export async function GET() {
  const { apiKey, assistantName } = await checkAssistantPrerequisites();
  
  if (!apiKey || !assistantName) {
    console.error('Missing required environment variables for assistants API');
    return NextResponse.json({
      status: "error",
      message: "PINECONE_API_KEY and PINECONE_ASSISTANT_NAME are required.",
      exists: false
    }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.pinecone.io/assistant/assistants', {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const assistants = await response.json();
    const assistantExists = assistants.assistants.some((assistant: any) => assistant.name === assistantName);

    console.info(`Assistant check completed`, { 
      assistantName, 
      exists: assistantExists
    });

    return NextResponse.json({
      status: "success",
      message: `Assistant '${assistantName}' check completed.`,
      exists: assistantExists,
      assistant_name: assistantName
    }, { status: 200 });

  } catch (error) {
    console.error('Error checking assistant', { 
      error: error instanceof Error ? error.message : String(error),
      assistantName 
    });
    
    return NextResponse.json({
      status: "error",
      message: `Failed to check assistant: ${error instanceof Error ? error.message : String(error)}`,
      exists: false
    }, { status: 500 });
  }
}