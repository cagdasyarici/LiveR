import type { HttpResponse, HttpRequest } from 'uWebSockets.js';

export function extractApiKey(req: HttpRequest): string | null {
  const header = req.getHeader('authorization');
  if (!header) return null;
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

export function requireApiKey(
  res: HttpResponse,
  req: HttpRequest,
  apiKey: string,
): boolean {
  const provided = extractApiKey(req);
  if (provided !== apiKey) {
    res.cork(() => {
      res
        .writeStatus('401 Unauthorized')
        .writeHeader('Content-Type', 'application/json')
        .end(JSON.stringify({ error: 'Invalid or missing API key' }));
    });
    return false;
  }
  return true;
}
