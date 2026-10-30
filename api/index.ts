import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server/src/app';

const ORIGINAL_API_PATH_HEADER = 'x-ac-original-api-path';
type VercelRequest = IncomingMessage;

export default function handler(request: VercelRequest, response: ServerResponse): void {
  const capturedPath = request.headers[ORIGINAL_API_PATH_HEADER];
  const apiPath = typeof capturedPath === 'string' ? capturedPath.replace(/^\/+/, '') : '';
  delete request.headers[ORIGINAL_API_PATH_HEADER];

  if (!apiPath || (apiPath !== 'v1' && !apiPath.startsWith('v1/'))) {
    response.statusCode = 400;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ success: false, error: { code: 'INVALID_API_PATH', message: 'The API path is invalid.' } }));
    return;
  }

  // Vercel routes /api/v1/* to this function and supplies the captured path
  // in a private header. Preserve the incoming query string while restoring
  // the original Express path, then remove the private header before dispatch.
  const incomingUrl = request.url ?? '/';
  const queryStart = incomingUrl.indexOf('?');
  const originalSearch = queryStart >= 0 ? incomingUrl.slice(queryStart) : '';
  request.url = `/api/${apiPath}${originalSearch}`;
  app(request, response);
}
