import { test, expect } from '@playwright/test'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

function devHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-UserId': 'dev-user',
    'X-Roles': 'Admin,Editor,Reader',
  } as Record<string, string>
}

test.describe('Chunking and ingestion via API', () => {
  test('ingests text with empty lines removed -> at least 1 chunk', async ({ request }) => {
    const headers = devHeaders()
    const content = '\n\nHello world\n\nThis is a test.\n\n\nAnother line.\n\n'
    const res = await request.post(`${API}/api/Notes`, { data: { title: 'Empty-line test', content }, headers })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect((body.countChunks ?? body.CountChunks ?? 0)).toBeGreaterThan(0)
  })

  test('long text produces multiple chunks', async ({ request }) => {
    const headers = devHeaders()
    const para = 'Sentence one. Sentence two is a bit longer and continues here. Another sentence? End!'
    const content = Array.from({ length: 200 }).map(() => para).join('\n')
    const res = await request.post(`${API}/api/Notes`, { data: { title: 'Long content', content }, headers })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const chunks = body.countChunks ?? body.CountChunks ?? 0
    expect(chunks).toBeGreaterThan(1)
  })

  test('file upload one-by-one returns result', async ({ request }) => {
    // Build multipart form manually using form-data boundary
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    const parts = [
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="files"; filename="hello.txt"\r\n'),
      Buffer.from('Content-Type: text/plain\r\n\r\n'),
      Buffer.from('Hello file world.\n\nLine two.'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]
    const payload = Buffer.concat(parts)

    const res = await request.post(`${API}/api/Ingest/files`, {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-UserId': 'dev-user',
        'X-Roles': 'Admin,Editor,Reader',
      },
      data: payload
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
    if (Array.isArray(body) && body[0]) {
      expect((body[0].countChunks ?? body[0].CountChunks ?? 0)).toBeGreaterThan(0)
    }
  })
})
