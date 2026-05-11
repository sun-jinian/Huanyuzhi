const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = __dirname;
const MAX_BODY_BYTES = 16 * 1024;
const CHAT_MESSAGE_LOAD_LIMIT = 10;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'YOUR_DB_USER',
  password: process.env.DB_PASSWORD || 'YOUR_DB_PASSWORD',
  database: process.env.DB_NAME || 'YOUR_DB_NAME',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  charset: 'utf8mb4'
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const cityRooms = new Map();
const postBuckets = new Map();

async function getCityTranslations(cityIds) {
  if (cityIds.length === 0) return new Map();

  const placeholders = cityIds.map(() => '?').join(', ');
  const [rows] = await pool.execute(`
    SELECT city_id, language_code, city_name
    FROM city_translations
    WHERE city_id IN (${placeholders})
  `, cityIds);

  return rows.reduce((translationsByCity, row) => {
    const cityId = Number(row.city_id);
    const translations = translationsByCity.get(cityId) || {};
    translations[row.language_code] = row.city_name;
    translationsByCity.set(cityId, translations);
    return translationsByCity;
  }, new Map());
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(Object.assign(error, { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseCityId(value) {
  const cityId = Number(value);
  return Number.isInteger(cityId) && cityId > 0 ? cityId : null;
}

function rateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = postBuckets.get(ip) || { count: 0, resetAt: now + 10000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 10000;
  }
  bucket.count += 1;
  postBuckets.set(ip, bucket);
  return bucket.count <= 12;
}

function serializeMessage(row) {
  return {
    messageId: Number(row.message_id),
    cityId: Number(row.city_id),
    senderName: row.sender_name,
    messageText: row.message_text,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!rateLimit(req)) {
      sendJson(res, 429, { error: 'Too many login attempts. Please wait.' });
      return true;
    }

    const payload = await readJsonBody(req);
    const email = sanitizeText(payload.email, 100).toLowerCase();
    const password = String(payload.password || '');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: 'Invalid email' });
      return true;
    }

    if (password.length < 1 || password.length > 256) {
      sendJson(res, 400, { error: 'Invalid password' });
      return true;
    }

    const [rows] = await pool.execute(`
      SELECT user_id, nickname, email, password_hash
      FROM users
      WHERE LOWER(email) = ?
      LIMIT 1
    `, [email]);

    const user = rows[0];
    const passwordOk = user && user.password_hash
      ? await argon2.verify(String(user.password_hash), password)
      : false;
    if (!passwordOk) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return true;
    }

    await pool.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);
    sendJson(res, 200, {
      user: {
        userId: Number(user.user_id),
        nickname: user.nickname || '',
        email: user.email
      }
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/countries') {
    const languageCode = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
    const [rows] = await pool.execute(`
      SELECT
        c.country_code,
        c.country_name AS default_country_name,
        COALESCE(NULLIF(ct.country_name, ''), c.country_name) AS display_country_name
      FROM countries c
      LEFT JOIN country_translations ct
        ON ct.country_code = c.country_code
        AND ct.language_code = ?
      WHERE c.country_name IS NOT NULL AND c.country_name <> ''
      ORDER BY display_country_name ASC, c.country_code ASC
    `, [languageCode]);
    sendJson(res, 200, {
      countries: rows.map(row => {
        const countryName = String(row.display_country_name || row.default_country_name).trim();
        return {
          countryCode: row.country_code,
          countryName,
          name: countryName
        };
      })
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/cities') {
    const [rows] = await pool.execute(`
      SELECT city_id, country_code, city_name, latitude, longitude
      FROM cities
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY city_id
    `);
    const translationsByCity = await getCityTranslations(rows.map(row => Number(row.city_id)));

    sendJson(res, 200, {
      cities: rows.map(row => {
        const cityId = Number(row.city_id);
        const cityNames = {
          en: row.city_name,
          ...(translationsByCity.get(cityId) || {})
        };

        return {
          cityId,
          countryCode: row.country_code,
          cityName: row.city_name,
          cityNames,
          cityNameZh: cityNames.zh || row.city_name,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude)
        };
      })
    });
    return true;
  }

  const messagesMatch = url.pathname.match(/^\/api\/chat\/(\d+)\/messages$/);
  if (messagesMatch && req.method === 'GET') {
    const cityId = parseCityId(messagesMatch[1]);
    if (!cityId) {
      sendJson(res, 400, { error: 'Invalid city id' });
      return true;
    }

    const [rows] = await pool.execute(`
      SELECT message_id, city_id, sender_name, message_text, created_at
      FROM (
        SELECT message_id, city_id, sender_name, message_text, created_at
        FROM city_chat_messages
        WHERE city_id = ?
        ORDER BY created_at DESC, message_id DESC
        LIMIT ${CHAT_MESSAGE_LOAD_LIMIT}
      ) latest
      ORDER BY created_at ASC, message_id ASC
    `, [cityId]);
    sendJson(res, 200, { messages: rows.map(serializeMessage) });
    return true;
  }

  if (messagesMatch && req.method === 'POST') {
    if (!rateLimit(req)) {
      sendJson(res, 429, { error: 'Too many messages. Please wait.' });
      return true;
    }

    const cityId = parseCityId(messagesMatch[1]);
    if (!cityId) {
      sendJson(res, 400, { error: 'Invalid city id' });
      return true;
    }

    const payload = await readJsonBody(req);
    const senderName = sanitizeText(payload.senderName, 50) || 'Anonymous';
    const messageText = sanitizeText(payload.messageText, 1000);
    if (!messageText) {
      sendJson(res, 400, { error: 'Message is required' });
      return true;
    }

    const [cityRows] = await pool.execute('SELECT city_id FROM cities WHERE city_id = ? LIMIT 1', [cityId]);
    if (cityRows.length === 0) {
      sendJson(res, 404, { error: 'City not found' });
      return true;
    }

    const [result] = await pool.execute(
      'INSERT INTO city_chat_messages (city_id, sender_name, message_text) VALUES (?, ?, ?)',
      [cityId, senderName, messageText]
    );
    const [rows] = await pool.execute(
      'SELECT message_id, city_id, sender_name, message_text, created_at FROM city_chat_messages WHERE message_id = ?',
      [result.insertId]
    );
    const message = serializeMessage(rows[0]);
    broadcastCityMessage(cityId, message);
    sendJson(res, 201, { message });
    return true;
  }

  return false;
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!requestedPath.startsWith(PUBLIC_DIR) || requestedPath.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(requestedPath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(requestedPath).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
}

function broadcastCityMessage(cityId, message) {
  const room = cityRooms.get(String(cityId));
  if (!room) return;

  const payload = JSON.stringify({ type: 'message', message });
  room.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { error: 'Not found' });
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { error: status === 500 ? 'Server error' : error.message });
    if (status === 500) console.error(error);
  }
});

const wss = new WebSocketServer({ server, path: '/ws/chat' });

wss.on('connection', (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const cityId = parseCityId(url.searchParams.get('cityId'));
  if (!cityId) {
    socket.close(1008, 'Invalid city id');
    return;
  }

  const roomKey = String(cityId);
  if (!cityRooms.has(roomKey)) cityRooms.set(roomKey, new Set());
  cityRooms.get(roomKey).add(socket);
  socket.id = crypto.randomUUID();

  socket.on('close', () => {
    const room = cityRooms.get(roomKey);
    if (!room) return;
    room.delete(socket);
    if (room.size === 0) cityRooms.delete(roomKey);
  });
});

ensureSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Yuanyuzhi server running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  });

