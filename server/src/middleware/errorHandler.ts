import type { ErrorRequestHandler } from 'express';
import { sendError } from '../utils/response';
import { isDatabaseConnectionError, reportDevelopmentError, reportProductionError } from '../utils/safeDiagnostics';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { field?: string; reason: string }[]) { super(message); }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const requestId = response.locals.requestId as string | undefined;
  if (error instanceof HttpError) { sendError(response, error.status, error.code, error.message, { requestId, details: error.details }); return; }
  if (error instanceof SyntaxError && 'body' in error) { sendError(response, 400, 'INVALID_JSON', 'Request body must be valid JSON.', { requestId }); return; }
  if (isDatabaseConnectionError(error)) {
    if ((process.env.NODE_ENV ?? 'development') === 'development') reportDevelopmentError(error, requestId, 'PostgreSQL');
    else reportProductionError(error, requestId, 'PostgreSQL');
    sendError(response, 503, 'DATABASE_UNAVAILABLE', 'Database is temporarily unavailable.', { requestId });
    return;
  }
  const kind = error instanceof Error ? error.name : 'unknown';
  if ((process.env.NODE_ENV ?? 'development') === 'development') reportDevelopmentError(error, requestId);
  else reportProductionError(error, requestId);
  sendError(response, 500, 'INTERNAL_ERROR', 'Something went wrong.', { requestId });
};
