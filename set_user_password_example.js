const argon2 = require('argon2');
const mysql = require('mysql2/promise');

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  const email = String(emailArg || '').trim().toLowerCase();
  const password = String(passwordArg || '');

  if (!email || !password) {
    console.error('Usage: node set_user_password_example.js <email> <password>');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'YOUR_DB_USER',
    password: process.env.DB_PASSWORD || 'YOUR_DB_PASSWORD',
    database: process.env.DB_NAME || 'YOUR_DB_NAME',
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4'
  });

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const [result] = await pool.execute(
    'UPDATE users SET password_hash = ? WHERE LOWER(email) = ?',
    [passwordHash, email]
  );

  await pool.end();

  if (result.affectedRows === 0) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  console.log(`Password updated for ${email}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

