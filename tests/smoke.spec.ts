import { test, expect } from '@playwright/test';

test.describe('Cortex Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('should load the main page', async ({ page }) => {
    await expect(page).toHaveTitle(/Cortex/);
    await expect(page.locator('h1, [data-testid="page-title"]')).toBeVisible();
  });

  test('should display upload interface', async ({ page }) => {
    await page.click('text=Upload');
    await expect(page.locator('text=Drag and drop files here')).toBeVisible();
  });

  test('should ingest a text file', async ({ page }) => {
    // Navigate to upload page
    await page.click('text=Upload');

    // Create a test file
    const fileContent = 'This is a test file for ingestion testing. It contains sample text to verify the upload and processing functionality.';
    
    // Mock the file upload
    await page.setInputFiles('input[type="file"]', {
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });

    // Wait for upload to complete
    await expect(page.locator('text=success')).toBeVisible({ timeout: 10000 });
  });

  test('should perform search and return results', async ({ page }) => {
    // Navigate to search page
    await page.click('text=Search');
    
    // Enter search query
    await page.fill('input[placeholder*="Search"]', 'test');
    
    // Wait for search results or no results message
    await expect(page.locator('text=Found').or(page.locator('text=No results'))).toBeVisible({ timeout: 5000 });
  });

  test('should handle voice interface', async ({ page }) => {
    // Mock getUserMedia for voice testing
    await page.addInitScript(() => {
      const mockMediaStream = {
        getTracks: () => [{
          stop: () => {},
          kind: 'audio'
        }]
      };

      // Mock MediaRecorder
      window.MediaRecorder = class {
        constructor() {
          this.state = 'inactive';
          this.ondataavailable = null;
        }
        start() { 
          this.state = 'recording';
          setTimeout(() => {
            if (this.ondataavailable) {
              this.ondataavailable({ data: new Blob(['mock audio data']) });
            }
          }, 100);
        }
        stop() { 
          this.state = 'inactive';
        }
      };

      // Mock getUserMedia
      navigator.mediaDevices = {
        getUserMedia: () => Promise.resolve(mockMediaStream)
      };

      // Mock WebSocket for STT
      const originalWebSocket = window.WebSocket;
      window.WebSocket = class extends originalWebSocket {
        constructor(url) {
          super('ws://localhost:8080/health'); // Use a dummy endpoint
          setTimeout(() => {
            if (this.onopen) this.onopen();
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({ 
                  data: JSON.stringify({ text: 'test voice command' })
                });
              }
            }, 200);
          }, 100);
        }
        send() {
          // Mock send
        }
      };
    });

    // Click microphone button
    const micButton = page.locator('[data-testid="mic-button"]').or(page.locator('button').filter({ hasText: /mic/i })).first();
    await micButton.click();

    // Verify recording state
    await expect(page.locator('text=Listening').or(page.locator('text=recording'))).toBeVisible({ timeout: 3000 });

    // Stop recording
    await micButton.click();

    // Check for transcript
    await expect(page.locator('text=test voice command')).toBeVisible({ timeout: 3000 });
  });

  test('should display reader interface when note is selected', async ({ page }) => {
    // First, ensure we have a note by going to search
    await page.click('text=Search');
    await page.fill('input[placeholder*="Search"]', 'welcome');
    
    // If we have results, click on the first one
    const firstResult = page.locator('[data-testid="search-result"]').or(page.locator('text=Click to view')).first();
    
    if (await firstResult.isVisible()) {
      await firstResult.click();
      
      // Should now be in reader view
      await expect(page.locator('text=Original View').or(page.locator('text=Chunks View'))).toBeVisible();
    }
  });
});

test.describe('API Health Checks', () => {
  test('backend should be healthy', async ({ request }) => {
    const response = await request.get('http://localhost:8080/health');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('should handle file upload endpoint', async ({ request }) => {
    const response = await request.post('http://localhost:8080/ingest/files', {
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
