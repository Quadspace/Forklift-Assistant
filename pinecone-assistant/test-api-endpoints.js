#!/usr/bin/env node

/**
 * Test script to verify API endpoints are working
 * Run with: node test-api-endpoints.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    console.log(`🔍 Testing: ${url}`);
    
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`✅ ${path} - Status: ${res.statusCode}`);
        if (res.statusCode >= 400) {
          console.log(`❌ Error response: ${data.substring(0, 200)}...`);
        }
        resolve({
          status: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ ${path} - Error: ${err.message}`);
      reject(err);
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${path} - Timeout`);
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function testEndpoints() {
  console.log('🚀 Testing API Endpoints...\n');
  
  try {
    // Test 1: Health check (if exists)
    try {
      await makeRequest('/api/health');
    } catch (e) {
      console.log('ℹ️ Health endpoint not available (optional)');
    }
    
    // Test 2: Files listing
    console.log('\n📁 Testing files listing...');
    const filesResponse = await makeRequest('/api/files');
    
    if (filesResponse.status === 200) {
      const filesData = JSON.parse(filesResponse.data);
      console.log(`📊 Files found: ${filesData.files?.length || 0}`);
      
      // Test 3: File download (if files exist)
      if (filesData.files && filesData.files.length > 0) {
        const testFile = filesData.files[0];
        console.log(`\n📄 Testing file download for: ${testFile.name}`);
        
        try {
          const downloadResponse = await makeRequest(`/api/files/${testFile.id}/download`);
          console.log(`📥 Download test result: ${downloadResponse.status}`);
        } catch (e) {
          console.log(`⚠️ Download test failed: ${e.message}`);
        }
      } else {
        console.log('ℹ️ No files available for download test');
      }
    }
    
    // Test 4: PDF Proxy
    console.log('\n🔗 Testing PDF proxy...');
    try {
      const proxyResponse = await makeRequest('/api/pdf-proxy?url=https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
      console.log(`🔄 PDF proxy test result: ${proxyResponse.status}`);
    } catch (e) {
      console.log(`⚠️ PDF proxy test failed: ${e.message}`);
    }
    
    console.log('\n✅ API endpoint testing complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running
console.log('🔍 Checking if development server is running...');
makeRequest('/')
  .then(() => {
    console.log('✅ Server is running, starting API tests...\n');
    testEndpoints();
  })
  .catch(() => {
    console.log('❌ Server is not running!');
    console.log('Please start the development server first:');
    console.log('  npm run dev');
    console.log('Then run this test again.');
    process.exit(1);
  }); 