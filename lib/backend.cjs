const crypto = require('crypto');
const argon2 = require('argon2');
const Ably = require('ably');
const mysql = require('mysql2/promise');

const emailVerification = require('./email-verification.cjs');

const SESSION_COOKIE_NAME = 'huanyuzhi_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHAT_MESSAGE_LOAD_LIMIT = 10;

let pool;
let schemaReady;
let ablyRest;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'YOUR_DB_USER',
      password: process.env.DB_PASSWORD || 'YOUR_DB_PASSWORD',
      database: process.env.DB_NAME || 'db_huanyuzhi',
      waitForConnections: true,
      connectionLimit: 5,
      namedPlaceholders: true,
      charset: 'utf8mb4'
    });
    emailVerification.setEmailVerificationPool(pool);
  }
  return pool;
}

function getAblyRest() {
  if (!process.env.ABLY_API_KEY) return null;
  if (!ablyRest) {
    ablyRest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
  }
  return ablyRest;
}

function getChatChannelName(cityId) {
  return `city:${cityId}:chat`;
}

async function ensureSchemas() {
  if (!schemaReady) {
    schemaReady = Promise.all([
      emailVerification.ensureEmailVerificationSchema(),
      ensureUserProfileSchema(),
      ensureUserSessionSchema()
    ]);
  }
  return schemaReady;
}

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function noContent(headers = {}) {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
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

function parseCookies(header) {
  return String(header || '')
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
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function getSessionTokenHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

function getSessionTtlMs(remembered) {
  return remembered ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS;
}

function getSessionCookieOptions(remembered) {
  return remembered ? { maxAge: REMEMBERED_SESSION_TTL_MS / 1000 } : {};
}

async function ensureUserProfileSchema() {
  const [columns] = await getPool().execute('SHOW COLUMNS FROM users');
  const columnNames = new Set(columns.map(column => column.Field));
  if (!columnNames.has('avatar')) {
    await getPool().execute('ALTER TABLE users ADD COLUMN avatar varchar(120) DEFAULT NULL AFTER password_hash');
  }
}

async function ensureUserSessionSchema() {
  await getPool().execute(`
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
}

async function createSession(user, db = getPool(), options = {}) {
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
    remembered,
    user: {
      ...publicUser,
      sessionRecordId
    }
  };
}

async function getSession(request) {
  const sessionId = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const [rows] = await getPool().execute(`
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
    await getPool().execute('DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    return null;
  }

  const remembered = Boolean(session.remembered);
  const seenAt = new Date();
  await getPool().execute(`
    UPDATE user_sessions
    SET expires_at = ?, last_seen_at = ?
    WHERE session_id = ?
  `, [new Date(seenAt.getTime() + getSessionTtlMs(remembered)), seenAt, session.session_id]);
  await getPool().execute('UPDATE users SET last_login = ? WHERE user_id = ?', [seenAt, session.user_id]);

  return { sessionId, remembered, user: getPublicUser(session) };
}

async function revokeSession(request, payload = {}) {
  const sessionId = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE_NAME];
  const sessionRecordId = Number(payload.sessionRecordId || 0);
  const revokedAt = new Date();
  let result = null;

  if (sessionId) {
    [result] = await getPool().execute(`
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE session_token_hash = ?
        AND revoked_at IS NULL
    `, [revokedAt, getSessionTokenHash(sessionId)]);
    if (result && result.affectedRows === 1) {
      return { revoked: true, revokedBy: 'cookie', sessionRecordId: sessionRecordId || null, revokedAt };
    }
  }

  if (sessionRecordId > 0) {
    [result] = await getPool().execute(`
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
  const [rows] = await getPool().execute('SELECT country_code FROM countries WHERE country_code = ? LIMIT 1', [countryCode]);
  if (rows.length === 0) throw Object.assign(new Error('Invalid country'), { status: 400 });
}

async function normalizeRegistrationPayload(payload, verifiedEmail) {
  const registration = payload && typeof payload === 'object' ? payload : null;
  if (!registration) throw Object.assign(new Error('Missing registration payload'), { status: 400 });

  const email = sanitizeText(registration.email, 100).toLowerCase();
  if (email !== verifiedEmail) {
    throw Object.assign(new Error('Registration email does not match verified email'), { status: 400 });
  }

  const nickname = sanitizeText(registration.username, 20);
  const password = String(registration.password || '');
  if (!nickname) throw Object.assign(new Error('Username is required'), { status: 400 });
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
  const [existingRows] = await getPool().execute('SELECT user_id FROM users WHERE LOWER(email) = ? LIMIT 1', [registration.email]);
  if (existingRows.length > 0) {
    throw Object.assign(new Error('Email is already registered'), { status: 409 });
  }

  const passwordHash = await argon2.hash(registration.password);
  const avatar = getUserAvatar(registration.nickname, registration.email);
  const [result] = await getPool().execute(`
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
    avatar,
    registration.birthdate,
    registration.preferredCountry,
    registration.originCountry
  ]);

  return {
    userId: Number(result.insertId),
    nickname: registration.nickname,
    email: registration.email,
    avatar
  };
}

async function getCityTranslations(cityIds) {
  if (cityIds.length === 0) return new Map();
  const placeholders = cityIds.map(() => '?').join(', ');
  let rows = [];
  try {
    [rows] = await getPool().execute(`
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

function parseCityId(value) {
  const cityId = Number(value);
  return Number.isInteger(cityId) && cityId > 0 ? cityId : null;
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

async function handleLogin(request) {
  await ensureSchemas();
  const payload = await readJson(request);
  const email = sanitizeText(payload.email, 100).toLowerCase();
  const password = String(payload.password || '');
  const remember = payload.remember === true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email' }, 400);
  if (password.length < 1 || password.length > 256) return json({ error: 'Invalid password' }, 400);

  const [rows] = await getPool().execute(`
    SELECT user_id, nickname, email, password_hash, avatar
    FROM users
    WHERE LOWER(email) = ?
    LIMIT 1
  `, [email]);
  const user = rows[0];
  if (!user) return json({ error: 'Invalid email or password' }, 401);

  const passwordOk = user.password_hash ? await argon2.verify(String(user.password_hash), password) : false;
  if (!passwordOk) return json({ error: 'Invalid email or password' }, 401);

  const connection = await getPool().getConnection();
  let session = null;
  try {
    await connection.beginTransaction();
    const loginAt = new Date();
    const [loginUpdate] = await connection.execute('UPDATE users SET last_login = ? WHERE user_id = ?', [loginAt, user.user_id]);
    if (!loginUpdate || loginUpdate.affectedRows !== 1) throw new Error('Failed to update last login');
    session = await createSession(user, connection, { remembered: remember, createdAt: loginAt });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return json({ user: session.user }, 200, {
    'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, session.sessionId, getSessionCookieOptions(session.remembered))
  });
}

async function handleSession(request) {
  await ensureSchemas();
  const session = await getSession(request);
  if (!session) return noContent();
  return json({ user: session.user }, 200, {
    'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, session.sessionId, getSessionCookieOptions(session.remembered))
  });
}

async function handleLogout(request) {
  await ensureSchemas();
  const payload = await readJson(request);
  const result = await revokeSession(request, payload);
  return json({ ok: true, ...result }, 200, {
    'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, '', { maxAge: 0, expires: new Date(0) })
  });
}

async function handleCountries(request) {
  const url = new URL(request.url);
  const languageCode = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  const [rows] = await getPool().execute(`
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
  return json({
    countries: rows.map(row => {
      const countryName = String(row.display_country_name || row.default_country_name).trim();
      return { countryCode: row.country_code, countryName, name: countryName };
    })
  });
}

async function handleCities() {
  const [rows] = await getPool().execute(`
    SELECT city_id, country_code, city_name, latitude, longitude
    FROM cities
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    ORDER BY city_id
  `);
  const translationsByCity = await getCityTranslations(rows.map(row => Number(row.city_id)));
  return json({
    cities: rows.map(row => {
      const cityId = Number(row.city_id);
      const cityNames = { en: row.city_name, ...(translationsByCity.get(cityId) || {}) };
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
}

async function handleVerifyRegistration(request) {
  await ensureSchemas();
  const payload = await readJson(request);
  const email = sanitizeText(payload.email, 100).toLowerCase();
  const code = String(payload.code || '').trim();
  const registration = await normalizeRegistrationPayload(payload.registration, email);
  const result = await emailVerification.verifyEmailCode(email, code);
  const user = await createUser(registration);
  return json({ ok: true, ...result, user });
}

async function handleSendVerificationCode(request) {
  await ensureSchemas();
  const payload = await readJson(request);
  const email = String(payload.email || '').trim().toLowerCase().slice(0, 100);
  const language = payload.language === 'en' ? 'en' : 'zh';
  const result = await emailVerification.createEmailVerification(email, language);
  return json({ ok: true, ...result });
}

async function handleChatMessagesGet(cityId) {
  const parsedCityId = parseCityId(cityId);
  if (!parsedCityId) return json({ error: 'Invalid city id' }, 400);
  const [rows] = await getPool().execute(`
    SELECT message_id, city_id, sender_name, message_text, created_at
    FROM (
      SELECT message_id, city_id, sender_name, message_text, created_at
      FROM city_chat_messages
      WHERE city_id = ?
      ORDER BY created_at DESC, message_id DESC
      LIMIT ${CHAT_MESSAGE_LOAD_LIMIT}
    ) latest
    ORDER BY created_at ASC, message_id ASC
  `, [parsedCityId]);
  return json({ messages: rows.map(serializeMessage) });
}

async function handleChatMessagesPost(request, cityId) {
  const parsedCityId = parseCityId(cityId);
  if (!parsedCityId) return json({ error: 'Invalid city id' }, 400);
  const payload = await readJson(request);
  const senderName = sanitizeText(payload.senderName, 50) || 'Anonymous';
  const messageText = sanitizeText(payload.messageText, 1000);
  if (!messageText) return json({ error: 'Message is required' }, 400);

  const [cityRows] = await getPool().execute('SELECT city_id FROM cities WHERE city_id = ? LIMIT 1', [parsedCityId]);
  if (cityRows.length === 0) return json({ error: 'City not found' }, 404);

  const [result] = await getPool().execute(
    'INSERT INTO city_chat_messages (city_id, sender_name, message_text) VALUES (?, ?, ?)',
    [parsedCityId, senderName, messageText]
  );
  const [rows] = await getPool().execute(
    'SELECT message_id, city_id, sender_name, message_text, created_at FROM city_chat_messages WHERE message_id = ?',
    [result.insertId]
  );
  const message = serializeMessage(rows[0]);
  const ably = getAblyRest();
  if (ably) {
    await ably.channels.get(getChatChannelName(parsedCityId)).publish('message', message);
  }
  return json({ message }, 201);
}

async function handleAblyToken(request) {
  const ably = getAblyRest();
  if (!ably) return json({ error: 'ABLY_API_KEY is not configured' }, 500);

  const clientId = `huanyuzhi-${crypto.randomUUID()}`;
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId,
    capability: {
      'city:*:chat': ['subscribe']
    }
  });
  return json(tokenRequest);
}

function handleError(error) {
  const status = error.status || 500;
  return json({ error: status === 500 ? 'Server error' : error.message }, status);
}

module.exports = {
  handleError,
  handleLogin,
  handleSession,
  handleLogout,
  handleCountries,
  handleCities,
  handleVerifyRegistration,
  handleSendVerificationCode,
  handleAblyToken,
  handleChatMessagesGet,
  handleChatMessagesPost
};
