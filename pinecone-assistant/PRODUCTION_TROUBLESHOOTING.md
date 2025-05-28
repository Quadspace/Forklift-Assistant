# Production Troubleshooting Guide - Forklift Maintenance Assistant

## Current Issue: EventSource Connection Timeouts on Render

### Problem Summary
Your forklift maintenance assistant is experiencing EventSource connection timeouts when deployed on Render, causing the circuit breaker to activate after 3 consecutive failures.

**Error Pattern:**
```
[ERROR] Unexpected error in chat function { error: 'EventSource connection timeout' }
[ERROR] Circuit breaker activated - too many consecutive failures { consecutive_failures: 3, threshold: 3 }
```

## Immediate Solutions

### 1. Reset Circuit Breaker (Quick Fix)

**Option A: Using the diagnostic script**
```bash
# From your local machine
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js reset
```

**Option B: Using curl**
```bash
# Reset circuit breaker
curl -X POST https://your-app.onrender.com/api/health \
  -H "Content-Type: application/json" \
  -d '{"action": "reset_circuit_breaker"}'

# Check health status
curl https://your-app.onrender.com/api/health
```

**Option C: Via browser**
Visit: `https://your-app.onrender.com/api/health` to check status

### 2. Environment Variables Check

Ensure these are properly configured in your Render dashboard:

```bash
PINECONE_API_KEY=your_api_key_here
PINECONE_ASSISTANT_NAME=your_assistant_name
PINECONE_ASSISTANT_URL=https://prod-1-data.ke.pinecone.io
PINECONE_ASSISTANT_ID=your_assistant_id
NODE_ENV=production
```

**To verify in Render:**
1. Go to your service dashboard
2. Click "Environment" tab
3. Ensure all variables are set and values are correct

## Root Cause Analysis

### Why EventSource Timeouts Occur on Render

1. **Cold Starts**: Render services may have cold start delays
2. **Network Latency**: Cloud-to-cloud communication delays
3. **Resource Constraints**: Limited CPU/memory during startup
4. **Pinecone API Latency**: External API response times
5. **Connection Limits**: Render's connection handling

### Recent Optimizations Applied

✅ **Extended Timeouts for Production:**
- Connection timeout: 30 seconds (was 15s)
- Total timeout: 45 seconds (was 20s)
- Activity timeout: 40 seconds (was 25s)

✅ **Enhanced Error Handling:**
- Better error classification
- Graceful timeout handling
- Improved logging for diagnostics

✅ **Connection Health Monitoring:**
- Circuit breaker pattern
- Automatic failure tracking
- Manual reset capability

## Monitoring and Diagnostics

### Health Check Endpoint

**Check service status:**
```bash
curl https://your-app.onrender.com/api/health
```

**Expected healthy response:**
```json
{
  "status": "healthy",
  "checks": {
    "connection_diagnostics": {
      "circuit_breaker_active": false,
      "consecutive_failures": 0,
      "success_rate": 100
    }
  }
}
```

### Key Metrics to Monitor

1. **Circuit Breaker Status**: Should be `false`
2. **Success Rate**: Should be > 90%
3. **Consecutive Failures**: Should be < 3
4. **Average Response Time**: Should be < 10 seconds

## Step-by-Step Recovery Process

### Step 1: Immediate Assessment
```bash
# Check current health
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js check
```

### Step 2: Reset if Needed
```bash
# Full diagnostic and reset
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js full
```

### Step 3: Test Connection
```bash
# Test basic connectivity
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js test
```

### Step 4: Monitor Recovery
```bash
# Check health again after 1-2 minutes
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js check
```

## Long-term Solutions

### 1. Render Service Configuration

**Recommended Render settings:**
- **Plan**: Starter or higher (avoid Free tier for production)
- **Region**: Choose closest to your users
- **Health Check Path**: `/api/health`
- **Auto-Deploy**: Enable for automatic updates

### 2. Environment Optimization

**Add these environment variables for better performance:**
```bash
# Optimize Node.js for production
NODE_OPTIONS="--max-old-space-size=512"
UV_THREADPOOL_SIZE=4

# Disable development features
NEXT_TELEMETRY_DISABLED=1
```

### 3. Connection Pooling (Future Enhancement)

Consider implementing connection pooling for better resource management:
```javascript
// Future enhancement - connection pool
const connectionPool = {
  maxConnections: 5,
  timeout: 30000,
  retryDelay: 2000
};
```

## Troubleshooting Common Issues

### Issue: "Missing environment variables"

**Solution:**
1. Check Render environment variables
2. Ensure no typos in variable names
3. Verify values are not empty
4. Redeploy after changes

### Issue: "Authentication error"

**Solution:**
1. Verify `PINECONE_API_KEY` is correct
2. Check API key permissions in Pinecone console
3. Ensure key hasn't expired

### Issue: "High response times"

**Solution:**
1. Check Pinecone API status
2. Consider upgrading Render plan
3. Monitor during different times of day
4. Check cache hit rates

### Issue: "Circuit breaker keeps activating"

**Solution:**
1. Check Pinecone service status
2. Verify network connectivity
3. Review Render logs for patterns
4. Consider increasing timeout values

## Render-Specific Optimizations

### 1. Build Optimization

**In `package.json`:**
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start -p $PORT"
  }
}
```

### 2. Health Check Configuration

**In Render dashboard:**
- Health Check Path: `/api/health`
- Health Check Grace Period: 60 seconds
- Health Check Interval: 30 seconds

### 3. Log Monitoring

**View logs in Render:**
1. Go to service dashboard
2. Click "Logs" tab
3. Look for connection patterns
4. Monitor error frequencies

## Performance Monitoring

### Key Performance Indicators

1. **Response Time**: < 10 seconds average
2. **Success Rate**: > 95%
3. **Error Rate**: < 5%
4. **Circuit Breaker Activations**: 0 per hour

### Monitoring Commands

```bash
# Continuous health monitoring (run every 5 minutes)
while true; do
  echo "$(date): Checking health..."
  APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js check
  sleep 300
done
```

## Emergency Procedures

### If Service is Completely Down

1. **Check Render Status**: Visit Render status page
2. **Restart Service**: Use Render dashboard to restart
3. **Reset Everything**: Use `reset-all` command
4. **Check Logs**: Review recent deployment logs
5. **Rollback**: If needed, rollback to previous deployment

### If Circuit Breaker Won't Reset

1. **Manual Service Restart**: Restart via Render dashboard
2. **Environment Check**: Verify all variables are set
3. **API Key Rotation**: Generate new Pinecone API key
4. **Support Contact**: Contact Render support if persistent

## Prevention Strategies

### 1. Proactive Monitoring

Set up automated health checks:
```bash
# Cron job example (every 5 minutes)
*/5 * * * * APP_URL=https://your-app.onrender.com node /path/to/reset-circuit-breaker.js check
```

### 2. Gradual Load Testing

Test with increasing load:
1. Single user test
2. 5 concurrent users
3. 10 concurrent users
4. Monitor performance at each level

### 3. Backup Plans

- Keep previous working deployment ready
- Document all environment variables
- Have rollback procedure documented
- Monitor Pinecone service status

## Contact Information

### When to Escalate

- Circuit breaker activates > 3 times per hour
- Success rate drops below 80%
- Response times consistently > 15 seconds
- Multiple environment issues

### Support Resources

1. **Render Support**: For infrastructure issues
2. **Pinecone Support**: For API connectivity issues
3. **Application Logs**: For debugging specific errors

## Success Metrics

After implementing fixes, you should see:

✅ **Circuit breaker inactive**
✅ **Success rate > 95%**
✅ **Response times 5-10 seconds**
✅ **Zero consecutive failures**
✅ **Stable connection health**

## Quick Reference Commands

```bash
# Health check
curl https://your-app.onrender.com/api/health

# Reset circuit breaker
curl -X POST https://your-app.onrender.com/api/health -H "Content-Type: application/json" -d '{"action": "reset_circuit_breaker"}'

# Full diagnostic
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js full

# Test connection
APP_URL=https://your-app.onrender.com node scripts/reset-circuit-breaker.js test
```

---

**Last Updated**: January 2025
**Version**: 1.0
**Status**: Production Ready 