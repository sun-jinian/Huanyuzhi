const fs = require('fs/promises');
const path = require('path');

async function htmlResponse(filename) {
  const filePath = path.join(process.cwd(), filename);
  const html = await fs.readFile(filePath, 'utf8');
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
}

module.exports = { htmlResponse };
