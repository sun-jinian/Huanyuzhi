# Security rules

- Never open, read, print, summarize, or modify `.env`.
- Never inspect files matching `.env*` except `.env.example`.
- Never expose API keys, database passwords, tokens, cookies, or secrets.
- Use `.env.example` to understand required environment variables.
- If environment variables are needed, reference them by name only, for example `process.env.RESEND_API_KEY`.