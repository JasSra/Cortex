// Monitor health endpoint calls
let callCount = 0;
const startTime = Date.now();

// Override fetch to monitor calls to health endpoint
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  if (typeof url === 'string' && url.includes('/health')) {
    callCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Health API call #${callCount} at ${elapsed}s: ${url}`);
  }
  return originalFetch.apply(this, args);
};

// Report every 5 seconds
setInterval(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Health API monitor: ${callCount} calls in ${elapsed}s (${(callCount / (elapsed/60)).toFixed(1)} calls/min)`);
}, 5000);

console.log('Health API monitoring started...');
