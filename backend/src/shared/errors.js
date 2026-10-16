export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(error, req, res, _next) {
  if (error.name === 'ZodError') {
    return res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid input.', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, requestId: req.id });
  }
  if (error.code === '23505') error = new ApiError(409, 'CONFLICT', 'A record with these unique values already exists.');
  if (error.code === '23503' || error.code === '23514') error = new ApiError(422, 'CONSTRAINT', 'The requested change violates a data constraint.');
  if (error.type === 'entity.parse.failed') error = new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  if (error.type === 'entity.too.large') error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 500) console.error(JSON.stringify({ requestId: req.id, event: 'request_failed', code: error.code ?? error.name }));
  res.status(status).json({ error: { code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', message: status === 500 ? 'The request could not be completed.' : error.message }, requestId: req.id });
}
