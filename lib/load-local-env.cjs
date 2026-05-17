const fs = require('fs');
const path = require('path');

function loadLocalEnvFromPath() {
  const configuredPath = process.env.HUANYUZHI_ENV_PATH;
  if (!configuredPath) return;

  const resolved = path.resolve(configuredPath);
  if (resolved.startsWith(process.cwd())) {
    throw new Error('Refusing to load local env from the project directory');
  }
  if (!fs.existsSync(resolved)) return;

  const stat = fs.statSync(resolved);
  const filePath = stat.isDirectory() ? path.join(resolved, '.env') : resolved;
  if (!fs.existsSync(filePath)) return;

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

module.exports = { loadLocalEnvFromPath };
