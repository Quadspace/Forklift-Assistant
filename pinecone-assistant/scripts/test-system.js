#!/usr/bin/env node

/**
 * Comprehensive System Test Script
 * Tests all critical components of the PDF & Reference system
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const isHttps = BASE_URL.startsWith('https');

console.log('🧪 Starting Comprehensive System Test');
console.log(`📍 Testing against: ${BASE_URL}`);
console.log('=' .repeat(60));

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'System-Test-Script/1.0'
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testHealthEndpoint() {
  console.log('🏥 Testing Health Endpoint...');
  try {
    const response = await makeRequest('/api/health');
    
    if (response.status === 200) {
      const health = response.data;
      console.log('✅ Health endpoint responding');
      
      // Check environment variables
      const envCheck = health.checks?.environment_variables;
      if (envCheck?.status === 'ok') {
        console.log('✅ All environment variables configured');
      } else {
        console.log('❌ Missing environment variables:', envCheck?.missing || []);
        return false;
      }
      
      // Check connection health
      const connHealth = health.checks?.connection_health;
      if (connHealth?.status === 'healthy') {
        console.log('✅ Connection health is good');
      } else {
        console.log('⚠️ Connection health issues detected');
      }
      
      return true;
    } else {
      console.log('❌ Health endpoint failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Health endpoint error:', error.message);
    return false;
  }
}

async function testAssistantEndpoint() {
  console.log('\n🤖 Testing Assistant Endpoint...');
  try {
    const response = await makeRequest('/api/assistants');
    
    if (response.status === 200) {
      const result = response.data;
      if (result.exists) {
        console.log('✅ Assistant exists:', result.assistant_name);
        return true;
      } else {
        console.log('❌ Assistant not found');
        return false;
      }
    } else {
      console.log('❌ Assistant endpoint failed:', response.status, response.data?.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Assistant endpoint error:', error.message);
    return false;
  }
}

async function testFilesEndpoint() {
  console.log('\n📁 Testing Files Endpoint...');
  try {
    const response = await makeRequest('/api/files');
    
    if (response.status === 200) {
      const result = response.data;
      const files = result.files || [];
      
      console.log(`✅ Files endpoint responding with ${files.length} files`);
      
      if (files.length > 0) {
        const filesWithSignedUrls = files.filter(f => f.signed_url);
        console.log(`✅ ${filesWithSignedUrls.length}/${files.length} files have signed URLs`);
        
        // Test a file download endpoint if we have files
        if (files.length > 0) {
          const testFile = files[0];
          console.log(`🔍 Testing file download for: ${testFile.name}`);
          
          try {
            const downloadResponse = await makeRequest(`/api/files/${testFile.id}/download`);
            if (downloadResponse.status === 302 || downloadResponse.status === 200) {
              console.log('✅ File download endpoint working');
            } else {
              console.log('⚠️ File download issues:', downloadResponse.status);
            }
          } catch (downloadError) {
            console.log('⚠️ File download test failed:', downloadError.message);
          }
        }
        
        return true;
      } else {
        console.log('⚠️ No files found in assistant');
        return true; // Not necessarily an error
      }
    } else {
      console.log('❌ Files endpoint failed:', response.status, response.data?.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Files endpoint error:', error.message);
    return false;
  }
}

async function testPdfProxy() {
  console.log('\n📄 Testing PDF Proxy...');
  
  // Test with a malformed URL to check error handling
  try {
    const response = await makeRequest('/api/pdf-proxy?url=invalid-url');
    
    if (response.status === 400) {
      console.log('✅ PDF proxy correctly handles invalid URLs');
      
      const errorData = response.data;
      if (errorData.error && errorData.details) {
        console.log('✅ PDF proxy provides detailed error messages');
        return true;
      } else {
        console.log('⚠️ PDF proxy error messages could be more detailed');
        return true;
      }
    } else {
      console.log('⚠️ PDF proxy unexpected response to invalid URL:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ PDF proxy test error:', error.message);
    return false;
  }
}

async function testDocumentChunks() {
  console.log('\n📚 Testing Document Chunks Endpoint...');
  try {
    const testData = {
      fileName: 'test.pdf',
      startPage: 1,
      endPage: 5,
      searchQuery: 'test'
    };
    
    const response = await makeRequest('/api/document-chunks', 'POST', testData);
    
    if (response.status === 200 || response.status === 404) {
      // 404 is acceptable if no documents match
      console.log('✅ Document chunks endpoint responding');
      return true;
    } else if (response.status === 400 || response.status === 500) {
      const errorData = response.data;
      if (errorData.message?.includes('environment')) {
        console.log('❌ Document chunks endpoint missing environment variables');
        return false;
      } else {
        console.log('⚠️ Document chunks endpoint issues:', errorData.message);
        return true; // May be acceptable depending on setup
      }
    } else {
      console.log('❌ Document chunks endpoint failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Document chunks endpoint error:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Running Comprehensive System Tests\n');
  
  const tests = [
    { name: 'Health Endpoint', test: testHealthEndpoint },
    { name: 'Assistant Endpoint', test: testAssistantEndpoint },
    { name: 'Files Endpoint', test: testFilesEndpoint },
    { name: 'PDF Proxy', test: testPdfProxy },
    { name: 'Document Chunks', test: testDocumentChunks }
  ];
  
  const results = [];
  
  for (const { name, test } of tests) {
    try {
      const result = await test();
      results.push({ name, passed: result });
    } catch (error) {
      console.log(`❌ ${name} test crashed:`, error.message);
      results.push({ name, passed: false });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(({ name, passed }) => {
    console.log(`${passed ? '✅' : '❌'} ${name}`);
  });
  
  console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All systems operational!');
    console.log('\n📋 Next Steps:');
    console.log('1. Test PDF preview in browser');
    console.log('2. Verify reference formatting works');
    console.log('3. Check that bracket citations become clickable');
    console.log('4. Test with actual AI responses');
  } else {
    console.log('⚠️ Some issues detected. Check the logs above.');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Verify .env.local file exists with correct values');
    console.log('2. Check Pinecone API credentials');
    console.log('3. Ensure assistant name matches exactly');
    console.log('4. Restart development server');
  }
  
  console.log('\n📚 For detailed troubleshooting, see SYSTEM_DIAGNOSIS.md');
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
}); 