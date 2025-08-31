/**
 * Connectivity Monitor Web Worker
 * Monitors backend health endpoint and reports connectivity status
 */

let isOnline = true;
let checkInterval = 10000; // Default: 10 seconds
let timeoutDuration = 5000; // 5 second timeout
let baseUrl = 'http://localhost:8081'; // Default fallback
let intervalId = null;

// Enhanced connectivity check with retry logic
async function checkConnectivity() {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
    
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      // Check if the response indicates healthy status
      const isHealthy = data && (data.status === 'healthy' || data.status === 'ok');
      
      if (isHealthy && !isOnline) {
        // Backend came back online
        isOnline = true;
        postMessage({
          type: 'CONNECTIVITY_CHANGED',
          isOnline: true,
          responseTime,
          timestamp: new Date().toISOString(),
          details: 'Backend is healthy'
        });
      } else if (!isHealthy && isOnline) {
        // Backend became unhealthy
        isOnline = false;
        postMessage({
          type: 'CONNECTIVITY_CHANGED',
          isOnline: false,
          responseTime,
          timestamp: new Date().toISOString(),
          details: 'Backend returned unhealthy status'
        });
      }
      
      // Send periodic status updates (even when status hasn't changed)
      postMessage({
        type: 'HEALTH_CHECK',
        isOnline: true,
        responseTime,
        timestamp: new Date().toISOString(),
        details: 'Health check successful'
      });
      
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (isOnline) {
      // Backend went offline
      isOnline = false;
      postMessage({
        type: 'CONNECTIVITY_CHANGED',
        isOnline: false,
        responseTime,
        timestamp: new Date().toISOString(),
        details: error.message || 'Backend unreachable',
        error: error.name
      });
    }
    
    // Send periodic error updates
    postMessage({
      type: 'HEALTH_CHECK',
      isOnline: false,
      responseTime,
      timestamp: new Date().toISOString(),
      details: error.message || 'Backend unreachable',
      error: error.name
    });
  }
}

// Start monitoring
function startMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  
  // Initial check
  checkConnectivity();
  
  // Set up periodic checks
  intervalId = setInterval(checkConnectivity, checkInterval);
  
  postMessage({
    type: 'MONITOR_STARTED',
    checkInterval,
    baseUrl,
    timestamp: new Date().toISOString()
  });
}

// Stop monitoring
function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  
  postMessage({
    type: 'MONITOR_STOPPED',
    timestamp: new Date().toISOString()
  });
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'START_MONITORING':
      if (data?.baseUrl) {
        baseUrl = data.baseUrl;
      }
      if (data?.checkInterval) {
        checkInterval = Math.max(5000, data.checkInterval); // Minimum 5 seconds
      }
      if (data?.timeout) {
        timeoutDuration = Math.max(2000, data.timeout); // Minimum 2 seconds
      }
      startMonitoring();
      break;
      
    case 'STOP_MONITORING':
      stopMonitoring();
      break;
      
    case 'UPDATE_CONFIG':
      if (data?.baseUrl) {
        baseUrl = data.baseUrl;
      }
      if (data?.checkInterval) {
        checkInterval = Math.max(5000, data.checkInterval);
        // Restart with new interval
        if (intervalId) {
          startMonitoring();
        }
      }
      if (data?.timeout) {
        timeoutDuration = Math.max(2000, data.timeout);
      }
      break;
      
    case 'MANUAL_CHECK':
      checkConnectivity();
      break;
      
    default:
      postMessage({
        type: 'ERROR',
        message: `Unknown message type: ${type}`,
        timestamp: new Date().toISOString()
      });
  }
});

// Handle worker errors
self.addEventListener('error', (error) => {
  postMessage({
    type: 'WORKER_ERROR',
    message: error.message,
    filename: error.filename,
    lineno: error.lineno,
    timestamp: new Date().toISOString()
  });
});

// Send ready signal
postMessage({
  type: 'WORKER_READY',
  timestamp: new Date().toISOString()
});
