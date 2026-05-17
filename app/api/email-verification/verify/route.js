import backend from '../../../../lib/backend.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    return await backend.handleVerifyRegistration(request);
  } catch (error) {
    return backend.handleError(error);
  }
}
