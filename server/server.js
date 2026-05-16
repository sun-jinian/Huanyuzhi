const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');

loadEnv([
  process.env.HUANYUZHI_ENV_PATH,
  process.env.TOURINGGUIDE_ENV_PATH,
  'E:\\env\\huanyuzhi',
  'E:\\env\\TouringGuide'
]);

const emailVerification = require('./email-verification');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..');
const MAX_BODY_BYTES = 16 * 1024;
const CHAT_MESSAGE_LOAD_LIMIT = 10;
const SESSION_COOKIE_NAME = 'huanyuzhi_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'YOUR_DB_USER',
  password: process.env.DB_PASSWORD || 'YOUR_DB_PASSWORD',
  database: process.env.DB_NAME || 'db_huanyuzhi',
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

function loadEnv(envPaths) {
  const filePath = envPaths
    .filter(Boolean)
    .map(candidate => {
      const resolved = path.resolve(candidate);
      if (!fs.existsSync(resolved)) return null;
      return fs.statSync(resolved).isDirectory()
        ? path.join(resolved, '.env')
        : resolved;
    })
    .find(candidate => candidate && fs.existsSync(candidate));

  if (!filePath) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) return;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

emailVerification.setEmailVerificationPool(pool);


async function getCityTranslations(cityIds) {
  if (cityIds.length === 0) return new Map();

  const placeholders = cityIds.map(() => '?').join(', ');
  let rows = [];
  try {
    [rows] = await pool.execute(`
      SELECT city_id, language_code, city_name
      FROM city_translations
      WHERE city_id IN (${placeholders})
    `, cityIds);
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw error;
  }

  return rows.reduce((translationsByCity, row) => {
    const cityId = Number(row.city_id);
    const translations = translationsByCity.get(cityId) || {};
    translations[row.language_code] = row.city_name;
    translationsByCity.set(cityId, translations);
    return translationsByCity;
  }, new Map());
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    ...extraHeaders
  });
  res.end(body);
}

function sendNoContent(res, extraHeaders = {}) {
  res.writeHead(204, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    ...extraHeaders
  });
  res.end();
}

function getCredentialCorsHeaders(req) {
  const origin = req.headers.origin;
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin'
      }
    : {};
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

function sanitizeOptionalText(value, maxLength) {
  const text = sanitizeText(value, maxLength);
  return text || null;
}

function normalizeCountryCode(value) {
  const countryCode = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
}

function normalizeBirthdate(value) {
  const birthdate = String(value || '').trim();
  if (!birthdate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    throw Object.assign(new Error('Invalid birthdate'), { status: 400 });
  }

  const date = new Date(`${birthdate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthdate) {
    throw Object.assign(new Error('Invalid birthdate'), { status: 400 });
  }
  if (birthdate > new Date().toISOString().slice(0, 10)) {
    throw Object.assign(new Error('Invalid birthdate'), { status: 400 });
  }
  return birthdate;
}

function getUserAvatar(name, email) {
  const source = sanitizeText(name, 20) || sanitizeText(email, 100) || 'A';
  return source.slice(0, 1).toUpperCase();
}

function getPublicUser(user) {
  return {
    userId: Number(user.user_id || user.userId),
    nickname: user.nickname || '',
    email: user.email,
    avatar: sanitizeText(user.avatar, 120) || getUserAvatar(user.nickname, user.email),
    sessionRecordId: user.sessionRecordId ? Number(user.sessionRecordId) : null
  };
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .reduce((cookies, part) => {
      const equalsIndex = part.indexOf('=');
      if (equalsIndex === -1) return cookies;
      const name = part.slice(0, equalsIndex).trim();
      const value = part.slice(equalsIndex + 1).trim();
      if (name) cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join('; ');
}

function getSessionTokenHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

async function ensureUserSessionSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id bigint unsigned NOT NULL AUTO_INCREMENT,
      user_id int NOT NULL,
      session_token_hash char(64) NOT NULL,
      expires_at datetime NOT NULL,
      remembered tinyint(1) NOT NULL DEFAULT 0,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at datetime DEFAULT NULL,
      revoked_at datetime DEFAULT NULL,
      PRIMARY KEY (session_id),
      UNIQUE KEY session_token_hash (session_token_hash),
      KEY idx_user_sessions_user_id (user_id),
      KEY idx_user_sessions_expires_at (expires_at),
      CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  const connection = await pool.getConnection();
  try {
    await connection.execute("SET SESSION sql_mode = ''");
    const [columns] = await connection.execute('SHOW COLUMNS FROM user_sessions');
    const columnNames = new Set(columns.map(column => column.Field));
    if (!columnNames.has('remembered')) {
      await connection.execute('ALTER TABLE user_sessions ADD COLUMN remembered tinyint(1) NOT NULL DEFAULT 0 AFTER expires_at');
    }
    await connection.execute(`
      UPDATE user_sessions
      SET created_at = CURRENT_TIMESTAMP
      WHERE created_at IS NULL OR created_at = '0000-00-00 00:00:00'
    `);
    await connection.execute(`
      UPDATE user_sessions
      SET last_seen_at = NULL
      WHERE last_seen_at = '0000-00-00 00:00:00'
    `);
    await connection.execute(`
      UPDATE user_sessions
      SET revoked_at = NULL
      WHERE revoked_at = '0000-00-00 00:00:00'
    `);
    await connection.execute('ALTER TABLE user_sessions MODIFY COLUMN expires_at datetime NOT NULL');
    await connection.execute('ALTER TABLE user_sessions MODIFY COLUMN remembered tinyint(1) NOT NULL DEFAULT 0');
    await connection.execute('ALTER TABLE user_sessions MODIFY COLUMN created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await connection.execute('ALTER TABLE user_sessions MODIFY COLUMN last_seen_at datetime DEFAULT NULL');
    await connection.execute('ALTER TABLE user_sessions MODIFY COLUMN revoked_at datetime DEFAULT NULL');
  } finally {
    connection.release();
  }
}

async function ensureUserProfileSchema() {
  const [columns] = await pool.execute('SHOW COLUMNS FROM users');
  const columnNames = new Set(columns.map(column => column.Field));
  if (!columnNames.has('avatar')) {
    await pool.execute('ALTER TABLE users ADD COLUMN avatar varchar(120) DEFAULT NULL AFTER password_hash');
  }
}

function getSessionTtlMs(remembered) {
  return remembered ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS;
}

function getSessionCookieOptions(remembered) {
  return remembered
    ? { maxAge: REMEMBERED_SESSION_TTL_MS / 1000 }
    : {};
}

async function createSession(user, db = pool, options = {}) {
  const remembered = Boolean(options.remembered);
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const publicUser = getPublicUser(user);
  const createdAt = options.createdAt instanceof Date ? options.createdAt : new Date();
  const expiresAt = new Date(createdAt.getTime() + getSessionTtlMs(remembered));
  const [result] = await db.execute(`
    INSERT INTO user_sessions (
      user_id,
      session_token_hash,
      expires_at,
      remembered,
      created_at,
      last_seen_at,
      revoked_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `, [publicUser.userId, getSessionTokenHash(sessionId), expiresAt, remembered ? 1 : 0, createdAt, createdAt]);

  if (!result || result.affectedRows !== 1 || !result.insertId) {
    throw new Error('Failed to create user session');
  }

  const sessionRecordId = Number(result.insertId);
  return {
    sessionId,
    sessionRecordId,
    createdAt,
    remembered,
    user: {
      ...publicUser,
      sessionRecordId
    }
  };
}

async function getSession(req) {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const [rows] = await pool.execute(`
    SELECT
      s.session_id,
      s.remembered,
      s.session_id AS sessionRecordId,
      u.user_id,
      u.nickname,
      u.email,
      u.avatar
    FROM user_sessions s
    INNER JOIN users u ON u.user_id = s.user_id
    WHERE s.session_token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `, [getSessionTokenHash(sessionId)]);

  const session = rows[0];
  if (!session) {
    await pool.execute(`
      DELETE FROM user_sessions
      WHERE expires_at <= CURRENT_TIMESTAMP
    `);
    return null;
  }

  const remembered = Boolean(session.remembered);
  const seenAt = new Date();
  await pool.execute(`
    UPDATE user_sessions
    SET expires_at = ?, last_seen_at = ?
    WHERE session_id = ?
  `, [new Date(seenAt.getTime() + getSessionTtlMs(remembered)), seenAt, session.session_id]);
  await pool.execute(
    'UPDATE users SET last_login = ? WHERE user_id = ?',
    [seenAt, session.user_id]
  );

  return { sessionId, remembered, user: getPublicUser(session) };
}

async function revokeSession(req, payload = {}) {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  const sessionRecordId = Number(payload.sessionRecordId || 0);

  const revokedAt = new Date();
  let result = null;

  if (sessionId) {
    [result] = await pool.execute(`
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE session_token_hash = ?
        AND revoked_at IS NULL
    `, [revokedAt, getSessionTokenHash(sessionId)]);
    if (result && result.affectedRows === 1) {
      return {
        revoked: true,
        revokedBy: 'cookie',
        sessionRecordId: sessionRecordId || null,
        revokedAt
      };
    }
  }

  if (sessionRecordId > 0) {
    [result] = await pool.execute(`
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE session_id = ?
        AND revoked_at IS NULL
    `, [revokedAt, sessionRecordId]);
  }

  return {
    revoked: Boolean(result && result.affectedRows === 1),
    revokedBy: result && result.affectedRows === 1 ? 'sessionRecordId' : null,
    sessionRecordId: sessionRecordId || null,
    revokedAt
  };
}

async function assertCountryExists(countryCode) {
  if (!countryCode) return;
  const [rows] = await pool.execute('SELECT country_code FROM countries WHERE country_code = ? LIMIT 1', [countryCode]);
  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid country'), { status: 400 });
  }
}

async function normalizeRegistrationPayload(payload, verifiedEmail) {
  const registration = payload && typeof payload === 'object' ? payload : null;
  if (!registration) {
    throw Object.assign(new Error('Missing registration payload'), { status: 400 });
  }

  const email = sanitizeText(registration.email, 100).toLowerCase();
  if (email !== verifiedEmail) {
    throw Object.assign(new Error('Registration email does not match verified email'), { status: 400 });
  }

  const nickname = sanitizeText(registration.username, 20);
  const password = String(registration.password || '');
  if (!nickname) {
    throw Object.assign(new Error('Username is required'), { status: 400 });
  }
  if (password.length < 1 || password.length > 256) {
    throw Object.assign(new Error('Invalid password'), { status: 400 });
  }

  const originCountry = normalizeCountryCode(registration.originCountry);
  const preferredCountry = normalizeCountryCode(registration.preferredCountry);
  await assertCountryExists(originCountry);
  await assertCountryExists(preferredCountry);

  return {
    nickname,
    email,
    password,
    firstName: sanitizeOptionalText(registration.firstName, 50),
    lastName: sanitizeOptionalText(registration.lastName, 50),
    birthdate: normalizeBirthdate(registration.birthdate),
    originCountry,
    preferredCountry
  };
}

async function createUser(registration) {
  const [existingRows] = await pool.execute('SELECT user_id FROM users WHERE LOWER(email) = ? LIMIT 1', [registration.email]);
  if (existingRows.length > 0) {
    throw Object.assign(new Error('Email is already registered'), { status: 409 });
  }

  const passwordHash = await argon2.hash(registration.password);
  try {
    const [result] = await pool.execute(`
      INSERT INTO users (
        nickname,
        first_name,
        last_name,
        email,
        password_hash,
        avatar,
        birthdate,
        pref_country,
        origin_country
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      registration.nickname,
      registration.firstName,
      registration.lastName,
      registration.email,
      passwordHash,
      getUserAvatar(registration.nickname, registration.email),
      registration.birthdate,
      registration.preferredCountry,
      registration.originCountry
    ]);

    return {
      userId: Number(result.insertId),
      nickname: registration.nickname,
      email: registration.email,
      avatar: getUserAvatar(registration.nickname, registration.email)
    };
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Email is already registered'), { status: 409 });
    }
    throw error;
  }
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
  if (req.method === 'POST' && url.pathname === '/api/email-verification/verify') {
    if (!rateLimit(req)) {
      sendJson(res, 429, { error: 'Too many verification attempts. Please wait.' });
      return true;
    }

    const payload = await readJsonBody(req);
    const email = sanitizeText(payload.email, 100).toLowerCase();
    const code = String(payload.code || '').trim();
    const registration = await normalizeRegistrationPayload(payload.registration, email);
    const result = await emailVerification.verifyEmailCode(email, code);
    const user = await createUser(registration);
    sendJson(res, 200, { ok: true, ...result, user });
    return true;
  }

  if (await emailVerification.handleEmailVerificationApi(req, res, url)) {
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = await getSession(req);
    if (!session) {
      sendNoContent(res, getCredentialCorsHeaders(req));
      return true;
    }

    sendJson(res, 200, { user: session.user }, {
      ...getCredentialCorsHeaders(req),
      'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, session.sessionId, {
        ...getSessionCookieOptions(session.remembered)
      })
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const payload = await readJsonBody(req);
    const result = await revokeSession(req, payload);
    sendJson(res, 200, { ok: true, ...result }, {
      ...getCredentialCorsHeaders(req),
      'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, '', {
        maxAge: 0,
        expires: new Date(0)
      })
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!rateLimit(req)) {
      sendJson(res, 429, { error: 'Too many login attempts. Please wait.' });
      return true;
    }

    const payload = await readJsonBody(req);
    const email = sanitizeText(payload.email, 100).toLowerCase();
    const password = String(payload.password || '');
    const remember = payload.remember === true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: 'Invalid email' });
      return true;
    }

    if (password.length < 1 || password.length > 256) {
      sendJson(res, 400, { error: 'Invalid password' });
      return true;
    }

    const [rows] = await pool.execute(`
      SELECT user_id, nickname, email, password_hash, avatar
      FROM users
      WHERE LOWER(email) = ?
      LIMIT 1
    `, [email]);

    const user = rows[0];
    if (!user) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return true;
    }

    const passwordOk = user.password_hash
      ? await argon2.verify(String(user.password_hash), password)
      : false;
    if (!passwordOk) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return true;
    }

    const connection = await pool.getConnection();
    let session = null;
    try {
      await connection.beginTransaction();
      const loginAt = new Date();
      const [loginUpdate] = await connection.execute(
        'UPDATE users SET last_login = ? WHERE user_id = ?',
        [loginAt, user.user_id]
      );
      if (!loginUpdate || loginUpdate.affectedRows !== 1) {
        throw new Error('Failed to update last login');
      }
      session = await createSession(user, connection, { remembered: remember, createdAt: loginAt });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    sendJson(res, 200, {
      user: session.user
    }, {
      ...getCredentialCorsHeaders(req),
      'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, session.sessionId, {
        ...getSessionCookieOptions(session.remembered)
      })
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
    const ext = path.extname(requestedPath).toLowerCase();
    const cacheControl = ['.html', '.css', '.js'].includes(ext)
      ? 'no-cache'
      : ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.woff', '.woff2'].includes(ext)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl
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
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin'
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

Promise.all([
  emailVerification.ensureEmailVerificationSchema(),
  ensureUserProfileSchema(),
  ensureUserSessionSchema()
])
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Huanyuzhi server running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  });
