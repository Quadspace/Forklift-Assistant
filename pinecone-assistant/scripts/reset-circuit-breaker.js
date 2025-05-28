#!/usr/bin/env node

/**
 * Circuit Breaker Reset and Health Check Script
 * 
 * This script helps diagnose and fix connection issues with the Forklift Assistant
 * by resetting the circuit breaker and checking service health.
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const isHttps = BASE_URL.startsWith('https');

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
        'User-Agent': 'Circuit-Breaker-Reset-Script/1.0'
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
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
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

async function checkHealth() {
  console.log('🔍 Checking service health...');
  try {
    const response = await makeRequest('/api/health');
    
    if (response.status === 200 || response.status === 503) {
      const health = response.data;
      console.log(`\n📊 Service Status: ${health.status.toUpperCase()}`);
      console.log(`⏰ Timestamp: ${health.timestamp}`);
      console.log(`🔄 Uptime: ${Math.round(health.uptime)} seconds`);
      
      if (health.checks?.connection_diagnostics) {
        const conn = health.checks.connection_diagnostics;
        console.log(`\n🔌 Connection Health:`);
        console.log(`   Circuit Breaker: ${conn.circuit_breaker_active ? '🔴 ACTIVE' : '🟢 INACTIVE'}`);
        console.log(`   Success Rate: ${conn.success_rate}%`);
        console.log(`   Consecutive Failures: ${conn.consecutive_failures}`);
        console.log(`   Pinecone Endpoint: ${conn.pinecone_endpoint}`);
      }
      
      if (health.issues && health.issues.length > 0) {
        console.log(`\n⚠️  Issues:`);
        health.issues.forEach(issue => console.log(`   - ${issue}`));
      }
      
      if (health.recommendations && health.recommendations.length > 0) {
        console.log(`\n💡 Recommendations:`);
        health.recommendations.forEach(rec => console.log(`   - ${rec}`));
      }
      
      return health;
    } else {
      console.error(`❌ Health check failed with status ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Failed to check health: ${error.message}`);
    return null;
  }
}

async function resetCircuitBreaker() {
  console.log('🔄 Resetting circuit breaker...');
  try {
    const response = await makeRequest('/api/health', 'POST', { 
      action: 'reset_circuit_breaker' 
    });
    
    if (response.status === 200) {
      console.log('✅ Circuit breaker reset successfully');
      console.log(`   Actions performed: ${response.data.actions_performed.join(', ')}`);
      return true;
    } else {
      console.error(`❌ Failed to reset circuit breaker: ${response.data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to reset circuit breaker: ${error.message}`);
    return false;
  }
}

async function resetAll() {
  console.log('🔄 Performing full reset (circuit breaker + cache + metrics)...');
  try {
    const response = await makeRequest('/api/health', 'POST', { 
      action: 'reset_all' 
    });
    
    if (response.status === 200) {
      console.log('✅ Full reset completed successfully');
      console.log(`   Actions performed: ${response.data.actions_performed.join(', ')}`);
      return true;
    } else {
      console.error(`❌ Failed to perform full reset: ${response.data.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to perform full reset: ${error.message}`);
    return false;
  }
}

async function testConnection() {
  console.log('🧪 Testing basic connectivity...');
  try {
    const response = await makeRequest('/api/assistants');
    
    if (response.status === 200) {
      console.log('✅ Basic API connectivity working');
      console.log(`   Assistant exists: ${response.data.exists ? 'Yes' : 'No'}`);
      console.log(`   Assistant name: ${response.data.assistant_name || 'Not configured'}`);
      return true;
    } else {
      console.error(`❌ API test failed with status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Connection test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Forklift Assistant Circuit Breaker Reset Tool\n');
  
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  
  switch (command) {
    case 'check':
    case 'health':
      await checkHealth();
      break;
      
    case 'reset':
      const health = await checkHealth();
      if (health?.checks?.connection_diagnostics?.circuit_breaker_active) {
        await resetCircuitBreaker();
        console.log('\n⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await checkHealth();
      } else {
        console.log('ℹ️  Circuit breaker is not active, no reset needed');
      }
      break;
      
    case 'reset-all':
      await resetAll();
      console.log('\n⏳ Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await checkHealth();
      break;
      
    case 'test':
      await testConnection();
      break;
      
    case 'full':
      console.log('🔍 Running full diagnostic...\n');
      await checkHealth();
      console.log('\n🧪 Testing connection...');
      await testConnection();
      
      const healthCheck = await checkHealth();
      if (healthCheck?.checks?.connection_diagnostics?.circuit_breaker_active) {
        console.log('\n🔄 Circuit breaker is active, resetting...');
        await resetCircuitBreaker();
        console.log('\n⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await checkHealth();
      }
      break;
      
    default:
      console.log('Usage: node reset-circuit-breaker.js [command]');
      console.log('');
      console.log('Commands:');
      console.log('  check, health    - Check service health status');
      console.log('  reset           - Reset circuit breaker if active');
      console.log('  reset-all       - Reset circuit breaker, cache, and metrics');
      console.log('  test            - Test basic API connectivity');
      console.log('  full            - Run full diagnostic and reset if needed');
      console.log('');
      console.log('Environment Variables:');
      console.log('  APP_URL         - Base URL of your app (default: http://localhost:3000)');
      console.log('');
      console.log('Examples:');
      console.log('  APP_URL=https://your-app.onrender.com node reset-circuit-breaker.js full');
      console.log('  node reset-circuit-breaker.js reset');
      break;
  }
}

main().catch(error => {
  console.error(`💥 Script failed: ${error.message}`);
  process.exit(1);
}); 