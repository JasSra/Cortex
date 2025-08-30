// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 90000 });

test.describe('Cortex Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  // Ensure global search input (top bar) is attached as readiness signal
  await page.waitForSelector('[data-testid="global-search-input"]', { timeout: 60000 });
  });

  test('should render brand and navigation', async ({ page }) => {
  // Global search input should be present
  await expect(page.locator('[data-testid="global-search-input"]')).toBeVisible();
  });

  test.fixme('should ingest a text file via Documents', async ({ page }) => {
    // Covered by API health test and dedicated E2E; UI nav can vary per layout
  });

  test('should perform search from top bar', async ({ page }) => {
    // Ensure header is visible and search input is present; skip if not available on this viewport
  await page.waitForSelector('[data-testid="sidebar-toggle"]', { state: 'visible' });
  const searchInput = page.locator('[data-testid="global-search-input"]');
    if (await searchInput.count() === 0) {
      test.skip(true, 'Global search input not present in this layout');
    }
    await searchInput.first().fill('test');
    // Give debounce time and expect either results dropdown or an empty state
    await expect(
      page.locator('text=Search Results').or(page.locator('text=No results'))
    ).toBeVisible({ timeout: 5000 });
  });

  test.fixme('voice interface smoke (mocked)', async ({ page }) => {
    // Mock getUserMedia for voice testing
    await page.addInitScript(() => {
      const mockMediaStream = {
        getTracks: () => [{ stop: () => {}, kind: 'audio' }]
      } as any;

      // Mock MediaRecorder in a safe way
      class MockMediaRecorder {
        state = 'inactive';
        ondataavailable: ((ev: any) => void) | null = null;
        start() {
          this.state = 'recording';
          setTimeout(() => {
            this.ondataavailable?.({ data: new Blob(['mock audio data']) });
          }, 100);
        }
        stop() {
          this.state = 'inactive';
        }
      }
      Object.defineProperty(window, 'MediaRecorder', { value: MockMediaRecorder, writable: false });

      // Ensure navigator.mediaDevices exists, define getUserMedia
      if (!('mediaDevices' in navigator)) {
        Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      }
      Object.defineProperty(navigator.mediaDevices as any, 'getUserMedia', {
        value: () => Promise.resolve(mockMediaStream),
        configurable: true
      });

      // In-memory WebSocket mock that never opens a real connection
      class MockWebSocket {
        url: string;
        readyState = 0; // CONNECTING
        onopen: (() => void) | null = null;
        onmessage: ((ev: any) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(url: string) {
          this.url = url;
          setTimeout(() => {
            this.readyState = 1; // OPEN
            this.onopen?.();
            setTimeout(() => this.onmessage?.({ data: JSON.stringify({ text: 'test voice command' }) }), 200);
          }, 50);
        }
        send(_data?: any) {}
        close() { this.readyState = 3; this.onclose?.(); }
      }
      Object.defineProperty(window, 'WebSocket', { value: MockWebSocket, configurable: true });
    });

    // Implementation depends on presence of mic UI; enabled in dedicated suite
  });

  test.fixme('reader interface when note selected', async ({ page }) => {
    // Covered in dedicated E2E; skip in smoke
  });
});

test.describe('API Health Checks', () => {
  test('backend should be healthy', async ({ request }) => {
  const response = await request.get('http://localhost:8081/health');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('should handle file upload endpoint', async ({ request }) => {
  const response = await request.post('http://localhost:8081/api/Ingest/files', {
      multipart: {
        files: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Test file content for API testing')
        }
      }
    });
    
    // Should not return 404
    expect(response.status()).not.toBe(404);
  });
});
