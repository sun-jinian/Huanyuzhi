import backend from '../../../lib/backend.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return await backend.handleCities();
  } catch (error) {
    return backend.handleError(error);
  }
}
