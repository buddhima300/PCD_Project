export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: Record<string, string | number>) {
    super(message);
    this.name = 'ApiError';
  }
}
