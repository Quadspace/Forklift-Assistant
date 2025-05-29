import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';

const CACHE_DIR = path.join(process.cwd(), 'public', 'cache', 'pdfs');

// Get cache statistics
async function getCacheStats() {
  try {
    const files = await fs.readdir(CACHE_DIR).catch(() => []);
    let totalSize = 0;
    const fileStats = [];

    for (const file of files) {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        fileStats.push({
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      } catch (error) {
        logger.warn('Failed to get stats for cached file', { file, error });
      }
    }

    return {
      fileCount: files.length,
      totalSize,
      files: fileStats.sort((a, b) => b.modified.getTime() - a.modified.getTime()),
      memoryCache: cache.getStats()
    };
  } catch (error) {
    logger.error('Failed to get cache stats', { error });
    return {
      fileCount: 0,
      totalSize: 0,
      files: [],
      memoryCache: cache.getStats(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Clear cache files
async function clearCache(olderThanHours?: number) {
  try {
    const files = await fs.readdir(CACHE_DIR).catch(() => []);
    let deletedCount = 0;
    let deletedSize = 0;
    const cutoffTime = olderThanHours ? Date.now() - (olderThanHours * 60 * 60 * 1000) : 0;

    for (const file of files) {
      try {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (cutoffTime === 0 || stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
          deletedSize += stats.size;
          logger.debug('Deleted cached file', { file, size: stats.size });
        }
      } catch (error) {
        logger.warn('Failed to delete cached file', { file, error });
      }
    }

    // Clear memory cache
    cache.clear();

    return {
      deletedFiles: deletedCount,
      deletedSize,
      remainingFiles: files.length - deletedCount
    };
  } catch (error) {
    logger.error('Failed to clear cache', { error });
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const stats = await getCacheStats();
    
    return NextResponse.json({
      status: 'success',
      cache: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting cache stats', { error });
    return NextResponse.json({
      status: 'error',
      message: 'Failed to get cache statistics',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThanHours = searchParams.get('olderThan') ? 
      parseInt(searchParams.get('olderThan')!, 10) : undefined;

    const result = await clearCache(olderThanHours);
    
    logger.info('Cache cleared successfully', result);
    
    return NextResponse.json({
      status: 'success',
      message: `Cleared ${result.deletedFiles} files (${(result.deletedSize / 1024 / 1024).toFixed(2)} MB)`,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error clearing cache', { error });
    return NextResponse.json({
      status: 'error',
      message: 'Failed to clear cache',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, fileId } = body;

    if (action === 'delete' && fileId) {
      // Delete specific cached file
      try {
        const files = await fs.readdir(CACHE_DIR);
        const targetFile = files.find(file => file.startsWith(fileId));
        
        if (targetFile) {
          const filePath = path.join(CACHE_DIR, targetFile);
          const stats = await fs.stat(filePath);
          await fs.unlink(filePath);
          
          logger.info('Deleted specific cached file', { fileId, file: targetFile, size: stats.size });
          
          return NextResponse.json({
            status: 'success',
            message: `Deleted cached file for ${fileId}`,
            deletedFile: targetFile,
            deletedSize: stats.size
          });
        } else {
          return NextResponse.json({
            status: 'error',
            message: `No cached file found for ${fileId}`
          }, { status: 404 });
        }
      } catch (error) {
        logger.error('Error deleting specific cached file', { fileId, error });
        return NextResponse.json({
          status: 'error',
          message: 'Failed to delete cached file',
          error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      status: 'error',
      message: 'Invalid action or missing parameters'
    }, { status: 400 });

  } catch (error) {
    logger.error('Error processing cache action', { error });
    return NextResponse.json({
      status: 'error',
      message: 'Failed to process cache action',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 