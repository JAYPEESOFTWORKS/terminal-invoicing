/**
 * terminal-invoicing — companion web server with authentication
 *
 * Drop into the root of your terminal-invoicing repo.
 *
 * ─── First-time setup ────────────────────────────────────────────────────────
 *   npm install express cors bcrypt jsonwebtoken cookie-parser express-rate-limit
 *   node server.js --create-admin        # interactive admin user seed
 *
 * ─── Run ─────────────────────────────────────────────────────────────────────
 *   node server.js                       # http://localhost:4000
 *   PORT=5000 node server.js             # custom port
 *   JWT_SECRET=mysecret node server.js   # override JWT secret (recommended in prod)
 *
 * ─── How auth works ──────────────────────────────────────────────────────────
 *   POST /api/auth/login   { username, password }  → sets httpOnly JWT cookie
 *                                                    + returns token in body
 *   POST /api/auth/logout                          → clears cookie
 *   GET  /api/auth/me                              → { username, role }
 *
 *   Every /api/* route (except /api/auth/login) requires either:
 *     - Cookie: ti_token=<jwt>         (browser, set automatically on login)
 *     - Authorization: Bearer <jwt>    (CLI / scripts / dev)
 *
 * ─── Users file ──────────────────────────────────────────────────────────────
 *   Stored in <DATA_ROOT>/config/users.json
 *   Passwords are bcrypt-hashed (cost 12) — never stored in plain text.
 *   Roles: "admin" (full access). Future: "viewer" (read-only).
 *
 * ─── Data root ───────────────────────────────────────────────────────────────
 *   TERMINAL_INVOICING_ROOT env var  →  that path
 *   (not set)                        →  process.cwd()
 */

"use strict";

const path         = require("path");
const fs           = require("fs");
const readline     = require("readline");
const express      = require("express");
const cors         = require("cors");
const bcrypt       = require("bcrypt");
const jwt          = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const rateLimit    = require("express-rate-limit");

// ─── Constants ────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const TOKEN_TTL     = "8h";   // JWT expiry
const COOKIE_NAME   = "ti_token";

const DATA_ROOT = process.env.TERMINAL_INVOICING_ROOT
  ? path.resolve(process.env.TERMINAL_INVOICING_ROOT)
  : path.resolve(process.cwd());

const USERS_FILE = path.join(DATA_ROOT, "config", "users.json");

// JWT secret: must be set via env var in production
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    console.error("[terminal-invoicing] FATAL: JWT_SECRET env var must be set in production.");
    process.exit(1);
  }
  // Dev-only fallback: derive a stable secret from the data root so it
  // survives server restarts without invalidating sessions during dev.
  const crypto = require("crypto");
  const secret = crypto.createHash("sha256").update("ti-dev-" + DATA_ROOT).digest("hex");
  console.warn("[terminal-invoicing] WARNING: JWT_SECRET not set. Using derived dev secret.");
  console.warn("[terminal-invoicing]          Set JWT_SECRET env var before exposing to a network.");
  return secret;
})();

// ══════════════════════════════════════════════════════════════════════════════
// --create-admin  CLI flag — runs interactively then exits
// ══════════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--create-admin")) {
  createAdminCLI().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  return; // stop the rest of the file from running
}

async function createAdminCLI() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  console.log("\n─── Terminal Invoicing: Create Admin User ───────────────────\n");

  // Load existing users
  const users = loadUsers();
  if (users.length > 0) {
    console.log(`Existing users: ${users.map(u => u.username).join(", ")}`);
    const cont = await ask("Users already exist. Add another? [y/N] ");
    if (!cont.trim().toLowerCase().startsWith("y")) { rl.close(); return; }
  }

  const username = (await ask("Username: ")).trim();
  if (!username) throw new Error("Username cannot be empty.");
  if (users.find(u => u.username === username)) throw new Error(`User "${username}" already exists.`);

  // Read password without echo where possible
  const password = await askPassword(rl, "Password: ");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const confirm  = await askPassword(rl, "Confirm password: ");
  if (password !== confirm) throw new Error("Passwords do not match.");

  rl.close();

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  users.push({ username, password_hash: hash, role: "admin", created_at: new Date().toISOString() });
  saveUsers(users);

  console.log(`\n✓ Admin user "${username}" created in ${USERS_FILE}`);
  console.log("  Start the server with: node server.js\n");
}

function askPassword(rl, prompt) {
  return new Promise(resolve => {
    // Try to suppress echo on TTY
    if (process.stdout.isTTY) {
      process.stdout.write(prompt);
      process.stdin.setRawMode(true);
      let input = "";
      const onData = buf => {
        const ch = buf.toString();
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input);
        } else if (ch === "\u0003") { // Ctrl+C
          process.exit(0);
        } else if (ch === "\u007f") { // Backspace
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += ch;
        }
      };
      process.stdin.resume();
      process.stdin.on("data", onData);
    } else {
      rl.question(prompt, resolve);
    }
  });
}

// ─── User store ───────────────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch { return []; }
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ─── CLI lib imports ──────────────────────────────────────────────────────────
const cliConfig        = require(path.join(__dirname, "src/lib/config-manager"));
const invoiceProcessor = require(path.join(__dirname, "src/lib/invoice-processor"));
const layoutManager    = require(path.join(__dirname, "src/lib/layout-manager"));
const emailManager     = require(path.join(__dirname, "src/lib/email-manager"));
const cronManager      = require(path.join(__dirname, "src/lib/cron-manager"));


// ─── YAML file helpers ────────────────────────────────────────────────────────
const yaml = require("js-yaml");

const dataDir = sub => path.join(DATA_ROOT, sub);

function readYAMLDir(sub) {
  const dir = dataDir(sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map(f => { try { return yaml.load(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } })
    .filter(Boolean);
}

function readYAMLFile(sub, id) {
  for (const ext of [".yaml", ".yml"]) {
    const p = path.join(dataDir(sub), id + ext);
    if (fs.existsSync(p)) return yaml.load(fs.readFileSync(p, "utf8"));
  }
  return null;
}

function writeYAMLFile(sub, id, data) {
  const dir = dataDir(sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.yaml`), yaml.dump(data), "utf8");
}

function deleteYAMLFile(sub, id) {
  for (const ext of [".yaml", ".yml"]) {
    const p = path.join(dataDir(sub), id + ext);
    if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
  }
  return false;
}

function readHistory() {
  const histDir = dataDir("history");
  if (!fs.existsSync(histDir)) return [];
  const results = [];
  const walk = dir => {
    fs.readdirSync(dir).forEach(entry => {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) { walk(full); return; }
      if (!entry.endsWith(".zip")) return;
      try {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(full);
        const pe = zip.getEntry("invoice-params.yaml");
        const de = zip.getEntry("delivery.yaml");
        if (pe) {
          const params   = yaml.load(pe.getData().toString("utf8"));
          const delivery = de ? yaml.load(de.getData().toString("utf8")) : {};
          results.push({ id: params.invoice_number || path.basename(entry, ".zip"), invoice_def: params.invoice_id || "", customer: params.customer_name || params.customer?.name || "", date: params.invoice_date || "", due: params.due_date || "", total: params.total || 0, status: delivery.status || "sent", pdf: true, archive_path: full });
        }
      } catch {
        results.push({ id: path.basename(entry, ".zip"), invoice_def: "", customer: "", date: "", due: "", total: 0, status: "sent", pdf: true, archive_path: full });
      }
    });
  };
  walk(histDir);
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

// ══════════════════════════════════════════════════════════════════════════════
// Express app
// ══════════════════════════════════════════════════════════════════════════════
const app = express();

// CORS: in production lock this down to your actual origin
app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // true = reflect request Origin
  credentials: true,                        // allow cookies cross-origin in dev
}));
app.use(express.json());
app.use(cookieParser());

// Serve built UI
const uiDir = path.join(__dirname, "ui/dist");
if (fs.existsSync(uiDir)) {
  app.use("/", express.static(uiDir));
}

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => { console.error(err); res.status(500).json({ error: err.message }); });

// ── Guard: abort startup if no users exist (except --create-admin mode) ───────
const users = loadUsers();
if (users.length === 0) {
  console.error("\n[terminal-invoicing] No users found. Create an admin first:");
  console.error("  node server.js --create-admin\n");
  process.exit(1);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on invalid/expired
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production", // HTTPS-only in prod
    sameSite: "lax",
    maxAge:   8 * 60 * 60 * 1000, // 8 hours in ms
  });
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // 1. httpOnly cookie (browser)
  let token = req.cookies?.[COOKIE_NAME];

  // 2. Authorization: Bearer <token> (scripts / CLI tools)
  if (!token) {
    const authHeader = req.headers["authorization"] || "";
    if (authHeader.startsWith("Bearer ")) token = authHeader.slice(7);
  }

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: "Session expired or invalid — please log in again" });
  }
}

// ── Rate limiter on login (10 attempts / 15 min per IP) ──────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts — try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES  (no requireAuth — these are the public endpoints)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post("/api/auth/login", loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });

  const users = loadUsers(); // re-read each time so new users are picked up live
  const user  = users.find(u => u.username === username);

  // Constant-time compare even on "not found" to prevent username enumeration
  const hash = user?.password_hash || "$2b$12$invalidhashpaddingtoconstanttime";
  const ok   = await bcrypt.compare(password, hash);

  if (!ok || !user) {
    console.warn(`[auth] Failed login for "${username}" from ${req.ip}`);
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const payload = { username: user.username, role: user.role };
  const token   = signToken(payload);
  setAuthCookie(res, token);

  console.log(`[auth] Login: ${user.username} from ${req.ip}`);
  res.json({ ok: true, token, user: payload });
}));

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// GET /api/auth/me  — lets the UI check if the session is still valid
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ══════════════════════════════════════════════════════════════════════════════
// ALL ROUTES BELOW ARE PROTECTED
// ══════════════════════════════════════════════════════════════════════════════
app.use("/api", requireAuth);

// ─── Config ──────────────────────────────────────────────────────────────────
app.get("/api/config", wrap(async (req, res) => {
  res.json({ company: cliConfig.getCompanyConfig(), email: cliConfig.getEmailConfig(), state: cliConfig.getState(), invoice_template: cliConfig.getEmailTemplate() });
}));
app.put("/api/config/company",  wrap(async (req, res) => { cliConfig.saveCompanyConfig(req.body);  res.json({ ok: true }); }));
app.put("/api/config/email",    wrap(async (req, res) => { cliConfig.saveEmailConfig(req.body);    res.json({ ok: true }); }));
app.put("/api/config/template", wrap(async (req, res) => { cliConfig.saveEmailTemplate(req.body); res.json({ ok: true }); }));
app.put("/api/config/state",    wrap(async (req, res) => { cliConfig.saveState(req.body);          res.json({ ok: true }); }));

// ─── Customers ────────────────────────────────────────────────────────────────
app.get   ("/api/customers",     wrap(async (req, res) => { res.json(readYAMLDir("customers")); }));
app.get   ("/api/customers/:id", wrap(async (req, res) => { const c = readYAMLFile("customers", req.params.id); if (!c) return res.status(404).json({ error: "Not found" }); res.json(c); }));
app.post  ("/api/customers",     wrap(async (req, res) => { if (!req.body.id) return res.status(400).json({ error: "id required" }); writeYAMLFile("customers", req.body.id, req.body); res.json(req.body); }));
app.put   ("/api/customers/:id", wrap(async (req, res) => { const d = { ...req.body, id: req.params.id }; writeYAMLFile("customers", req.params.id, d); res.json(d); }));
app.delete("/api/customers/:id", wrap(async (req, res) => { if (!deleteYAMLFile("customers", req.params.id)) return res.status(404).json({ error: "Not found" }); res.json({ ok: true }); }));

// ─── Items ────────────────────────────────────────────────────────────────────
app.get   ("/api/items",     wrap(async (req, res) => { res.json(readYAMLDir("items")); }));
app.get   ("/api/items/:id", wrap(async (req, res) => { const i = readYAMLFile("items", req.params.id); if (!i) return res.status(404).json({ error: "Not found" }); res.json(i); }));
app.post  ("/api/items",     wrap(async (req, res) => { if (!req.body.id) return res.status(400).json({ error: "id required" }); writeYAMLFile("items", req.body.id, req.body); res.json(req.body); }));
app.put   ("/api/items/:id", wrap(async (req, res) => { const d = { ...req.body, id: req.params.id }; writeYAMLFile("items", req.params.id, d); res.json(d); }));
app.delete("/api/items/:id", wrap(async (req, res) => { if (!deleteYAMLFile("items", req.params.id)) return res.status(404).json({ error: "Not found" }); res.json({ ok: true }); }));

// ─── Invoices ─────────────────────────────────────────────────────────────────
app.get   ("/api/invoices",     wrap(async (req, res) => { res.json(readYAMLDir("invoices")); }));
app.get   ("/api/invoices/:id", wrap(async (req, res) => { const i = readYAMLFile("invoices", req.params.id); if (!i) return res.status(404).json({ error: "Not found" }); res.json(i); }));
app.post  ("/api/invoices",     wrap(async (req, res) => { if (!req.body.id) return res.status(400).json({ error: "id required" }); writeYAMLFile("invoices", req.body.id, req.body); res.json(req.body); }));
app.put   ("/api/invoices/:id", wrap(async (req, res) => { const d = { ...req.body, id: req.params.id }; writeYAMLFile("invoices", req.params.id, d); res.json(d); }));
app.delete("/api/invoices/:id", wrap(async (req, res) => { if (!deleteYAMLFile("invoices", req.params.id)) return res.status(404).json({ error: "Not found" }); res.json({ ok: true }); }));

app.post("/api/invoices/:id/generate", wrap(async (req, res) => {
  const inv = readYAMLFile("invoices", req.params.id);
  if (!inv) return res.status(404).json({ error: "Invoice definition not found" });
  const result = await invoiceProcessor.generate(inv, { dryRun: !!req.body.dryRun, noSend: !!req.body.noSend, preview: !!req.body.preview });
  res.json(result);
}));

// ─── Schedule ─────────────────────────────────────────────────────────────────
app.get   ("/api/schedule",       wrap(async (req, res) => { res.json(await cronManager.list()); }));
app.post  ("/api/schedule/setup", wrap(async (req, res) => { await cronManager.setup(); res.json({ ok: true }); }));
app.delete("/api/schedule",       wrap(async (req, res) => { await cronManager.remove(); res.json({ ok: true }); }));

// ─── History ──────────────────────────────────────────────────────────────────
app.get("/api/history", wrap(async (req, res) => { res.json(readHistory()); }));
app.get("/api/history/:id/export", wrap(async (req, res) => {
  const entry = readHistory().find(h => h.id === req.params.id);
  if (!entry?.archive_path) return res.status(404).json({ error: "Not found" });
  res.download(entry.archive_path, `${entry.id}.zip`);
}));

// ─── Email ────────────────────────────────────────────────────────────────────
app.post("/api/email/test",     wrap(async (req, res) => { res.json(await emailManager.sendTest(req.body.to || cliConfig.getCompanyConfig().email)); }));
app.get ("/api/email/providers",wrap(async (req, res) => { res.json(emailManager.listProviders()); }));

// ─── Layouts ──────────────────────────────────────────────────────────────────
app.get("/api/layouts", wrap(async (req, res) => { res.json(layoutManager.listLayouts()); }));

// ─── User management (admin only) ─────────────────────────────────────────────
app.get("/api/users", wrap(async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  res.json(loadUsers().map(u => ({ username: u.username, role: u.role, created_at: u.created_at })));
}));

app.post("/api/users", wrap(async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { username, password, role = "admin" } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (password.length < 8)    return res.status(400).json({ error: "Password must be at least 8 characters" });
  const users = loadUsers();
  if (users.find(u => u.username === username)) return res.status(409).json({ error: "User already exists" });
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  users.push({ username, password_hash: hash, role, created_at: new Date().toISOString() });
  saveUsers(users);
  res.json({ ok: true, username, role });
}));

app.delete("/api/users/:username", wrap(async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  if (req.params.username === req.user.username) return res.status(400).json({ error: "Cannot delete your own account" });
  const users = loadUsers();
  const next  = users.filter(u => u.username !== req.params.username);
  if (next.length === users.length) return res.status(404).json({ error: "User not found" });
  if (next.filter(u => u.role === "admin").length === 0) return res.status(400).json({ error: "Cannot remove the last admin" });
  saveUsers(next);
  res.json({ ok: true });
}));

// Change own password
app.put("/api/users/me/password", wrap(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password and new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const users = loadUsers();
  const user  = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: "User not found" });
  const ok = await bcrypt.compare(current_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
  user.password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  saveUsers(users);
  res.json({ ok: true });
}));

// Catch-all: serve React app for any non-API route (SPA routing)
if (fs.existsSync(uiDir)) {
  app.get("*", (req, res) => res.sendFile(path.join(uiDir, "index.html")));
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n[terminal-invoicing] Server running at http://localhost:${PORT}`);
  console.log(`[terminal-invoicing] Data root:  ${DATA_ROOT}`);
  console.log(`[terminal-invoicing] Users file: ${USERS_FILE}`);
  console.log(`[terminal-invoicing] Users:      ${loadUsers().map(u => u.username).join(", ")}\n`);
});
