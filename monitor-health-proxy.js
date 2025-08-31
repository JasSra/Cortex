#!/usr/bin/env node

// Monitor health endpoint requests to verify fix
const http = require('http');
const url = require('url');

let requestCount = 0;
const startTime = Date.now();

// Create a simple proxy to count requests
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    requestCount++;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Health request #${requestCount} at ${elapsed}s`);
    
    // Forward to actual backend
    const options = {
      hostname: 'localhost',
      port: 8081,
      path: '/health',
      method: 'GET'
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      res.writeHead(500);
      res.end('Proxy error');
    });
    
    proxyReq.end();
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(8082, () => {
  console.log('Health monitor proxy running on port 8082');
  console.log('Update frontend to use http://localhost:8082 as API_URL to monitor calls');
});

// Report stats every 10 seconds
setInterval(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = requestCount > 0 ? (requestCount / (elapsed / 60)).toFixed(1) : '0';
  console.log(`Total: ${requestCount} requests in ${elapsed}s (${rate} req/min)`);
}, 10000);
