const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const STORE = process.env.STORE_DIR || "/data";
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || "52428800", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>File Drop</title>
<style>
  :root { --line:#e4e4e7; --muted:#6b7280; --fg:#111; }
  body { font-family: system-ui, -apple-system, sans-serif; color:var(--fg);
         max-width:640px; margin:64px auto; padding:0 20px; line-height:1.5; }
  h1 { font-size:20px; font-weight:600; margin:0 0 24px; }
  form { display:flex; gap:8px; margin-bottom:32px; }
  input[type=file] { flex:1; }
  button { padding:8px 16px; border:1px solid var(--fg); background:var(--fg);
           color:#fff; border-radius:6px; cursor:pointer; font-size:14px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; color:var(--muted); font-weight:500;
       border-bottom:1px solid var(--line); padding:8px 0; }
  td { border-bottom:1px solid var(--line); padding:10px 0; }
  td.size, th.size { text-align:right; color:var(--muted); padding-right:32px; }
  td.dl, th.dl { text-align:right; white-space:nowrap; }
  a { color:#2563eb; text-decoration:none; }
  a:hover { text-decoration:underline; }
  .empty { color:var(--muted); padding:24px 0; text-align:center; }
</style>
</head>
<body>
  <h1>File Drop</h1>
  <form action="/upload" method="post" enctype="multipart/form-data">
    <input type="file" name="file" required>
    <button type="submit">Upload</button>
  </form>
  <table>
    <tr><th>File</th><th class="size">Size</th><th class="dl"></th></tr>
    {rows}
  </table>
</body>
</html>`;

function renderPage(files) {
  let rows;
  if (files.length === 0) {
    rows = '<tr><td colspan="3" class="empty">No files yet</td></tr>';
  } else {
    rows = files
      .map(
        (f) =>
          `<tr><td>${escapeHtml(f.name)}</td>` +
          `<td class="size">${f.size.toLocaleString("en-US")} B</td>` +
          `<td class="dl"><a href="/file/${f.id}">Download</a></td></tr>`
      )
      .join("");
  }
  return PAGE.replace("{rows}", rows);
}

async function connectWithRetry() {
  const dbUrl = new URL(process.env.DATABASE_URL);
  const config = {
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || "3306", 10),
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1),
    waitForConnections: true,
    connectionLimit: 10,
  };

  for (let i = 0; i < 30; i++) {
    try {
      const pool = mysql.createPool(config);
      await pool.query("SELECT 1");
      return pool;
    } catch (err) {
      console.log(`waiting for database (${i + 1}/30)...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("could not connect to database after 30 attempts");
}

async function startServer() {
  fs.mkdirSync(STORE, { recursive: true });

  const pool = await connectWithRetry();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id VARCHAR(16) PRIMARY KEY,
      name VARCHAR(512) NOT NULL,
      size BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const app = express();

  const upload = multer({
    dest: STORE,
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  app.get("/", async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id, name, size FROM files ORDER BY created_at DESC"
    );
    res.send(renderPage(rows));
  });

  app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.redirect(303, "/");

    const fileId = crypto.randomBytes(8).toString("base64url");
    const name = path.basename(req.file.originalname);
    const dest = path.join(STORE, fileId);

    fs.renameSync(req.file.path, dest);

    const size = fs.statSync(dest).size;
    await pool.query("INSERT INTO files (id, name, size) VALUES (?, ?, ?)", [
      fileId,
      name,
      size,
    ]);

    res.redirect(303, "/");
  });

  app.get("/file/:id", async (req, res) => {
    const [rows] = await pool.query("SELECT name FROM files WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).send("not found");

    const filePath = path.join(STORE, req.params.id);
    if (!fs.existsSync(filePath)) return res.status(404).send("not found");

    res.download(filePath, rows[0].name);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`File Drop running at http://0.0.0.0:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { renderPage, escapeHtml };
