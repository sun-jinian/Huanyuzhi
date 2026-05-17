import backend from '../../../../../lib/backend.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  try {
    return await backend.handleChatMessagesGet(context.params.cityId);
  } catch (error) {
    return backend.handleError(error);
  }
}

export async function POST(request, context) {
  try {
    return await backend.handleChatMessagesPost(request, context.params.cityId);
  } catch (error) {
    return backend.handleError(error);
  }
}
