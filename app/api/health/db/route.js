import backend from '../../../../lib/backend.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    return await backend.handleDatabaseHealth();
  } catch (error) {
    return backend.handleError(error, request);
  }
}
