import html from '../../lib/html-response.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return html.htmlResponse('register.html');
}
