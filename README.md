# 寰宇志 · Yuanyuzhi
Yuanyuzhi is a cultural travel map where you explore a 3D Earth, browse city guides, and chat with others in location-based rooms — all wrapped in an ink-wash UI.

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

- HTML5
- CSS3
- JavaScript
- Three.js
- DOM APIs


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
mysql -u YOUR_DB_USER -p < database/db_yuanyuzhi.sql
```

The SQL file creates the `db_yuanyuzhi` database and inserts the included records.

### Configure database connection

The server reads database settings from environment variables:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=db_yuanyuzhi
PORT=3000
```

On PowerShell, set them for the current terminal session like this:

```powershell
$env:DB_HOST="localhost"
$env:DB_PORT="3306"
$env:DB_USER="YOUR_DB_USER"
$env:DB_PASSWORD="YOUR_DB_PASSWORD"
$env:DB_NAME="db_yuanyuzhi"
$env:PORT="3000"
```

### Run the local server

```bash
node scripts/server.js
```

Then open:

```text
http://localhost:3000
```

---

## Copyright Notice

Copyright © 2026 Sun Jinian. All rights reserved.

This project, including its source code, UI design, visual layout, text, mock data structure, interaction design, and implementation details, is protected by copyright.

No part of this project may be copied, modified, redistributed, published, sublicensed, sold, or used commercially without prior written permission from the author.

---