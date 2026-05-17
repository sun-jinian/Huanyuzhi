# 寰宇志 · Huanyuzhi
Huanyuzhi is a cultural travel map where you explore a 3D Earth, browse city guides, and chat with others in location-based rooms — all wrapped in an ink-wash UI.

> ⚠️ This project is currently under active development. Features may be incomplete, broken, or subject to change without notice.

---

## Project Status

This project is currently under active development.

The repository is intended for private development and personal portfolio use.  
It is not an open-source project at this stage.

---

## Features

- 3D interactive globe based on Three.js
- Drag to rotate the globe
- Mouse wheel zoom
- Explore mode transition
- Left-side explore dock
- Favorite places panel
- Place detail panel
- Search panel
- Settings panel
- Chat panel UI
- Loading animation
- Mock profile data for development

---

## Tech Stack

- Next.js
- React
- HTML5
- CSS3
- JavaScript
- Three.js
- MySQL
- Resend


## Local Development

### Requirements

- Node.js
- MySQL 8
- npm

### Install dependencies

```bash
npm install
```

### Create the local database

Import the included SQL dump into MySQL:

```bash
mysql -u YOUR_DB_USER -p < database/db_huanyuzhi.sql
```

The SQL file creates the `db_huanyuzhi` database and inserts the included records.

### Configure database connection

The server reads database settings from environment variables:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=db_huanyuzhi
DB_SSL=true
DB_SSL_CA_PATH=E:\env\TouringGuide\ca.pem
SKIP_SCHEMA_MIGRATIONS=true
RESEND_API_KEY=your_resend_api_key_here
MAIL_FROM=Huanyuzhi <onboarding@resend.dev>
ABLY_API_KEY=your_ably_api_key
```

On PowerShell, set them for the current terminal session like this:

```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_USER="YOUR_DB_USER"
$env:DB_PASSWORD="YOUR_DB_PASSWORD"
$env:DB_NAME="db_huanyuzhi"
$env:DB_SSL="true"
$env:DB_SSL_CA_PATH="E:\env\TouringGuide\ca.pem"
$env:RESEND_API_KEY="your_resend_api_key_here"
$env:MAIL_FROM="Huanyuzhi <onboarding@resend.dev>"
$env:ABLY_API_KEY="your_ably_api_key"
```

Alternatively, local development can load an env file from outside the repository:

```powershell
$env:HUANYUZHI_ENV_PATH="E:\env\TouringGuide\.env"
npm run dev
```

The loader refuses to read env files from inside the project directory and does not print secret values.

For Aiven MySQL, download the CA certificate from the Aiven console. In local development, either put the certificate text in `DB_SSL_CA` with escaped newlines, or point to the certificate file:

```text
DB_SSL_CA_PATH=E:\env\TouringGuide\ca.pem
```

### Run the local Next.js server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

### Build for Vercel

```bash
npm run build
```

Vercel must be configured with these environment variables:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
DB_SSL
DB_SSL_CA
DB_SSL_CA_PATH
SKIP_SCHEMA_MIGRATIONS
RESEND_API_KEY
MAIL_FROM
ABLY_API_KEY
```

Deploy steps:

1. Push this repository to GitHub.
2. Import the repository in Vercel as a Next.js project.
3. Add the Aiven MySQL values to the `DB_*` environment variables. Set `DB_SSL=true` for Aiven.
4. Set `SKIP_SCHEMA_MIGRATIONS=true` on Vercel after importing `database/db_huanyuzhi.sql` into Aiven.
5. Add `RESEND_API_KEY`, `MAIL_FROM`, and `ABLY_API_KEY`.
6. Redeploy after adding or changing environment variables.

### Ably realtime chat

Create an Ably app, copy its API key, and set it as:

```text
ABLY_API_KEY
```

The browser requests `/api/ably/token`, subscribes to city chat channels, and the server publishes new database-backed chat messages to Ably after they are inserted.

---

## Copyright Notice

Copyright © 2026 Sun Jinian. All rights reserved.

This project, including its source code, UI design, visual layout, text, mock data structure, interaction design, and implementation details, is protected by copyright.

No part of this project may be copied, modified, redistributed, published, sublicensed, sold, or used commercially without prior written permission from the author.

---
