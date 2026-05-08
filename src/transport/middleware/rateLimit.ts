import type { HttpResponse, HttpRequest } from 'uWebSockets.js';
import type { RateLimiter } from '../../core/RateLimiter.js';

/**
 * Rate limit an HTTP request by IP address.
 * Returns true if allowed, false if rate limited (response already sent).
 */
export async function checkHttpRateLimit(
  res: HttpResponse,
  req: HttpRequest,
  rateLimiter: RateLimiter,
): Promise<boolean> {
  // uWS doesn't expose remote IP easily in all setups;
  // use X-Forwarded-For if behind proxy, fallback to a generic key
  const forwarded = req.getHeader('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  const identifier = `http:${ip}`;

  const result = await rateLimiter.checkLimit(identifier);

  if (!result.allowed) {
    res.cork(() => {
      res
        .writeStatus('429 Too Many Requests')
        .writeHeader('Content-Type', 'application/json')
        .writeHeader('Retry-After', Math.ceil(result.resetIn / 1000).toString())
        .writeHeader('X-RateLimit-Limit', result.limit.toString())
        .writeHeader('X-RateLimit-Remaining', '0')
        .end(JSON.stringify({ error: 'Too many requests', retryAfter: Math.ceil(result.resetIn / 1000) }));
    });
    return false;
  }

  return true;
}
