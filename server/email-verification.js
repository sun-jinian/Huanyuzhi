const crypto = require('crypto');
const { Resend } = require('resend');

const MAX_BODY_BYTES = 8 * 1024;
const VERIFICATION_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES || 5);
const MAIL_FROM = process.env.MAIL_FROM || 'Huanyuzhi <onboarding@resend.dev>';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const rateLimitBuckets = new Map();
let pool = null;

function setEmailVerificationPool(dbPool) {
  pool = dbPool;
}

function getPool() {
  if (!pool) {
    throw new Error('Email verification database pool is not configured');
  }
  return pool;
}

async function ensureEmailVerificationSchema() {
  await getPool().execute(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      verification_id bigint unsigned NOT NULL AUTO_INCREMENT,
      email varchar(100) NOT NULL,
      code_hash char(64) NOT NULL,
      status enum('active','invalid','used','expired') NOT NULL DEFAULT 'active',
      attempts tinyint unsigned NOT NULL DEFAULT 0,
      expires_at datetime NOT NULL,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      invalidated_at datetime DEFAULT NULL,
      used_at datetime DEFAULT NULL,
      PRIMARY KEY (verification_id),
      KEY idx_email_verification_email_status (email, status),
      KEY idx_email_verification_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const [columns] = await getPool().execute('SHOW COLUMNS FROM email_verification_codes');
  const columnNames = new Set(columns.map(column => column.Field));

  if (!columnNames.has('verification_id')) {
    await getPool().execute('ALTER TABLE email_verification_codes DROP PRIMARY KEY');
    await getPool().execute(`
      ALTER TABLE email_verification_codes
      ADD COLUMN verification_id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST
    `);
  }

  if (columnNames.has('registration_payload')) {
    await getPool().execute('ALTER TABLE email_verification_codes DROP COLUMN registration_payload');
  }

  if (!columnNames.has('status')) {
    await getPool().execute(`
      ALTER TABLE email_verification_codes
      ADD COLUMN status enum('active','invalid','used','expired') NOT NULL DEFAULT 'active' AFTER code_hash
    `);
  }

  if (!columnNames.has('invalidated_at')) {
    await getPool().execute('ALTER TABLE email_verification_codes ADD COLUMN invalidated_at datetime DEFAULT NULL AFTER created_at');
  }

  if (!columnNames.has('used_at')) {
    await getPool().execute('ALTER TABLE email_verification_codes ADD COLUMN used_at datetime DEFAULT NULL AFTER invalidated_at');
  }

  await getPool().execute('ALTER TABLE email_verification_codes MODIFY attempts tinyint unsigned NOT NULL DEFAULT 0');

  const [indexes] = await getPool().execute('SHOW INDEX FROM email_verification_codes');
  const indexNames = new Set(indexes.map(index => index.Key_name));
  if (!indexNames.has('idx_email_verification_email_status')) {
    await getPool().execute('CREATE INDEX idx_email_verification_email_status ON email_verification_codes (email, status)');
  }
  if (!indexNames.has('idx_email_verification_expires_at')) {
    await getPool().execute('CREATE INDEX idx_email_verification_expires_at ON email_verification_codes (expires_at)');
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function rateLimit(req, limit = 6, windowMs = 60000) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(ip, bucket);
  return bucket.count <= limit;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 100);
}

function assertEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Invalid email'), { status: 400 });
  }
}

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashVerificationCode(email, code) {
  return crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || 'missing-resend-key')
    .update(`${email}:${code}`)
    .digest('hex');
}

async function sendVerificationEmail(email, code, language = 'zh') {
  if (!resend) {
    throw Object.assign(new Error('RESEND_API_KEY is not configured'), { status: 500 });
  }

  const isEnglish = language === 'en';
  const subject = isEnglish ? 'Your Huanyuzhi verification code' : '你的寰宇志邮箱验证码';
  const intro = isEnglish
    ? 'Use this code to verify your Huanyuzhi email address:'
    : '请使用以下验证码完成寰宇志邮箱验证：';
  const outro = isEnglish
    ? `This code expires in ${VERIFICATION_TTL_MINUTES} minutes.`
    : `验证码将在 ${VERIFICATION_TTL_MINUTES} 分钟后失效。`;

  await resend.emails.send({
    from: MAIL_FROM,
    to: email,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2933">
        <p>${intro}</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
        <p>${outro}</p>
      </div>
    `,
    text: `${intro}\n\n${code}\n\n${outro}`
  });
}

async function createEmailVerification(email, language = 'zh') {
  assertEmail(email);

  const code = createVerificationCode();
  const codeHash = hashVerificationCode(email, code);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);

  await getPool().execute(`
    UPDATE email_verification_codes
    SET status = 'expired'
    WHERE email = ?
      AND status = 'active'
      AND expires_at <= CURRENT_TIMESTAMP
  `, [email]);

  await getPool().execute(`
    UPDATE email_verification_codes
    SET status = 'invalid', invalidated_at = CURRENT_TIMESTAMP
    WHERE email = ?
      AND status = 'active'
  `, [email]);

  await getPool().execute(`
    INSERT INTO email_verification_codes (email, code_hash, status, attempts, expires_at)
    VALUES (?, ?, 'active', 0, ?)
  `, [email, codeHash, expiresAt]);

  await sendVerificationEmail(email, code, language);
  return { email, expiresInMinutes: VERIFICATION_TTL_MINUTES };
}

async function verifyEmailCode(email, code) {
  assertEmail(email);
  if (!/^\d{6}$/.test(String(code || '').trim())) {
    throw Object.assign(new Error('Invalid verification code'), { status: 400 });
  }

  const [rows] = await getPool().execute(`
    SELECT verification_id, email, code_hash, attempts, expires_at
    FROM email_verification_codes
    WHERE email = ?
      AND status = 'active'
    ORDER BY verification_id DESC
    LIMIT 1
  `, [email]);
  const verification = rows[0];

  if (!verification || new Date(verification.expires_at).getTime() < Date.now()) {
    await getPool().execute(`
      UPDATE email_verification_codes
      SET status = 'expired'
      WHERE email = ?
        AND status = 'active'
        AND expires_at <= CURRENT_TIMESTAMP
    `, [email]);
    throw Object.assign(new Error('Verification code expired'), { status: 400 });
  }

  if (Number(verification.attempts) >= 5) {
    await getPool().execute(
      "UPDATE email_verification_codes SET status = 'invalid', invalidated_at = CURRENT_TIMESTAMP WHERE verification_id = ?",
      [verification.verification_id]
    );
    throw Object.assign(new Error('Too many incorrect attempts. Request a new code.'), { status: 429 });
  }

  const expectedHash = hashVerificationCode(email, String(code).trim());
  const actual = Buffer.from(String(verification.code_hash), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const codeOk = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);

  if (!codeOk) {
    await getPool().execute(
      'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE verification_id = ?',
      [verification.verification_id]
    );
    throw Object.assign(new Error('Invalid verification code'), { status: 400 });
  }

  await getPool().execute(
    "UPDATE email_verification_codes SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE verification_id = ?",
    [verification.verification_id]
  );
  return { email, verified: true };
}

async function handleSendCode(req, res) {
  if (!rateLimit(req, 5, 60000)) {
    sendJson(res, 429, { error: 'Too many verification requests. Please wait.' });
    return;
  }

  const payload = await readJsonBody(req);
  const email = normalizeEmail(payload.email);
  const language = payload.language === 'en' ? 'en' : 'zh';
  const result = await createEmailVerification(email, language);
  sendJson(res, 200, { ok: true, ...result });
}

async function handleVerifyCode(req, res) {
  if (!rateLimit(req, 10, 60000)) {
    sendJson(res, 429, { error: 'Too many verification attempts. Please wait.' });
    return;
  }

  const payload = await readJsonBody(req);
  const email = normalizeEmail(payload.email);
  const code = String(payload.code || '').trim();
  const result = await verifyEmailCode(email, code);
  sendJson(res, 200, { ok: true, ...result });
}

async function handleEmailVerificationApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/email-verification/send-code') {
    await handleSendCode(req, res);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/email-verification/verify') {
    await handleVerifyCode(req, res);
    return true;
  }

  return false;
}

module.exports = {
  setEmailVerificationPool,
  createEmailVerification,
  verifyEmailCode,
  sendVerificationEmail,
  ensureEmailVerificationSchema,
  handleEmailVerificationApi
};
