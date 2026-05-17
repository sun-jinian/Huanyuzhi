export function GET(request) {
  return Response.redirect(new URL('/index.html', request.url), 307);
}
