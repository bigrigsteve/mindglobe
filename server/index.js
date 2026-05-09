import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, seedAdminFromEnv } from "./db.js";
import { locateIp } from "./geo.js";
import { hashEditToken, randomEditToken, randomId } from "./tokens.js";

const PORT = Number(process.env.PORT || 4157);
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || randomEditToken();

seedAdminFromEnv({
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin: [/^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/, /^https?:\/\/\[::1\]:\d+$/],
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "96kb" }));

function requireAdminJwt() {
  return /** @type {express.RequestHandler} **/ function (req, res, next) {
    const header = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const token = bearer || (typeof req.cookies?.adminJwt === "string" ? req.cookies.adminJwt : "");

    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const payload = jwt.verify(token, ADMIN_JWT_SECRET);
      if (payload && typeof payload === "object" && "role" in payload && payload.role === "admin") {
        next();
        return;
      }
    } catch {
      // fallthrough
    }
    res.status(401).json({ error: "Unauthorized" });
  };
}

/** @returns {string} **/
function clientIp(req) {
  const xff =
    typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : undefined;
  return xff || String(req.socket.remoteAddress ?? "") || String(req.ip ?? "");
}

/** @type {express.RequestHandler} **/
function trafficMiddleware(req, _res, next) {
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const ref = typeof req.headers.referer === "string" ? req.headers.referer : null;
  try {
    db.prepare(
      `INSERT INTO traffic_log (method, path, ip, ua, referer)
       VALUES (@method, @path, @ip, @ua, @referer)`,
    ).run({
      method: req.method,
      path: String(req.originalUrl ?? "").slice(0, 480),
      ip: clientIp(req) ? String(clientIp(req)).slice(0, 80) : null,
      ua: ua ? ua.slice(0, 480) : null,
      referer: ref ? ref.slice(0, 480) : null,
    });
  } catch {
    // noop
  }
  next();
}

app.use(trafficMiddleware);

function audit(actor, action, payload) {
  try {
    db.prepare("INSERT INTO audit_log (actor, action, payload) VALUES (?,?,?)").run(
      actor,
      action,
      JSON.stringify(payload)?.slice(0, 4096),
    );
  } catch {
    // noop
  }
}

function clip(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function clampNum(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function toSqliteDateTime(iso) {
  return String(iso).replaceAll("T", " ").replaceAll("Z", "").slice(0, 19);
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/posts", (req, res) => {
  const since =
    typeof req.query.since === "string" && req.query.since ? req.query.since : "1970-01-01T00:00:00.000Z";
  const until =
    typeof req.query.until === "string" && req.query.until ? req.query.until : new Date().toISOString();

  const rows =
    db
      .prepare(
        `SELECT id, display_name as displayName, body, lat, lng, datetime(created_at) as createdAt, locked
         FROM posts
         WHERE datetime(created_at) >= datetime(?)
           AND datetime(created_at) <= datetime(?)
         ORDER BY datetime(created_at) ASC`,
      )
      .all(toSqliteDateTime(since), toSqliteDateTime(until)) ?? [];

  res.json(rows);
});

app.get("/api/posts/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, display_name as displayName, body, lat, lng, anon_ip as anonIp,
              datetime(created_at) as createdAt, locked
       FROM posts WHERE id = ?`,
    )
    .get(req.params.id);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const replies =
    db
      .prepare(
        `SELECT id, display_name as displayName, body, datetime(created_at) as createdAt
         FROM replies WHERE post_id = ? ORDER BY datetime(created_at) ASC`,
      )
      .all(req.params.id) ?? [];

  res.json({ ...row, replies });
});

/** @typedef {{ ok: true } | { errorCode: string; status: number }} VerifyResult **/

/**
 * @param {express.Request} req
 * @returns {VerifyResult}
 */
function verifyBearerEdit(req) {
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  if (!auth.startsWith("Bearer ") || auth.length <= "Bearer ".length + 12) {
    return { errorCode: "missing", status: 401 };
  }

  const bearer = auth.slice("Bearer ".length).trim();
  const row = db.prepare("SELECT locked, edit_token_hash FROM posts WHERE id=?").get(req.params.id);
  if (!row) return { errorCode: "notfound", status: 404 };
  if (Number(row.locked) === 1) return { errorCode: "locked", status: 423 };

  const h = hashEditToken(bearer);
  if (!(typeof row.edit_token_hash === "string" && row.edit_token_hash === h)) {
    return { errorCode: "badtoken", status: 403 };
  }

  return { ok: true };
}

/** @typedef {express.Response<any, any>} R **/

/**
 * @param {R} res
 * @param {Exclude<VerifyResult, { ok:true }>} v
 */
function sendVerifyError(res, v) {
  const msg =
    {
      missing: "Bearer edit token missing.",
      locked: "This post has been finalized; only admins can remove it.",
      badtoken: "Invalid edit token.",
      notfound: "Not found",
    }[v.errorCode] || "Forbidden";

  res.status(v.status).json({ error: msg });
}

app.post("/api/posts", async (req, res) => {
  const dn = clip(String(req.body?.displayName ?? "").trim(), 56);
  const bd = clip(String(req.body?.body ?? "").trim(), 8000);

  if (!dn || !bd) {
    res.status(400).json({ error: "Name and body are required." });
    return;
  }

  const anonIp = clientIp(req) ? String(clientIp(req)).slice(0, 160) : null;
  const geo = await locateIp(clientIp(req));

  const id = randomId();
  const editRaw = randomEditToken();
  const editHash = hashEditToken(editRaw);

  db.prepare(
    `INSERT INTO posts (id, display_name, body, lat, lng, anon_ip, edit_token_hash, locked)
     VALUES (@id,@dn,@bd,@lat,@lng,@anonIp,@editHash,0)`,
  ).run({
    id,
    dn,
    bd,
    lat: geo.lat,
    lng: geo.lng,
    anonIp,
    editHash,
  });

  audit("anonymous", "post:create", {
    postId: id,
    anonIpDigest: anonIp ? hashEditToken(`ip:${anonIp}`).slice(0, 24) : null,
  });

  res.status(201).json({
    id,
    displayName: dn,
    body: bd,
    lat: geo.lat,
    lng: geo.lng,
    createdAt: new Date().toISOString(),
    locked: false,
    editToken: editRaw,
  });
});

app.patch("/api/posts/:id", (req, res) => {
  const v = verifyBearerEdit(req);
  if ("errorCode" in v) return sendVerifyError(res, v);

  const dn = clip(String(req.body?.displayName ?? "").trim(), 56);
  const bd = clip(String(req.body?.body ?? "").trim(), 8000);

  if (!dn || !bd) {
    res.status(400).json({ error: "Name and body are required." });
    return;
  }

  db.prepare("UPDATE posts SET display_name=@dn, body=@bd WHERE id=@id AND locked=0").run({
    id: req.params.id,
    dn,
    bd,
  });

  res.json({ ok: true });
});

app.delete("/api/posts/:id", (req, res) => {
  const v = verifyBearerEdit(req);
  if ("errorCode" in v) return sendVerifyError(res, v);

  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  audit("anonymous", "post:delete", { postId: req.params.id });
  res.status(204).end();
});

app.post("/api/posts/:id/finalize", (req, res) => {
  const v = verifyBearerEdit(req);
  if ("errorCode" in v) return sendVerifyError(res, v);

  db.prepare("UPDATE posts SET locked=1 WHERE id=? AND locked=0").run(req.params.id);
  res.json({ ok: true, locked: true });
});

app.post("/api/posts/:id/replies", (req, res) => {
  const exists = db.prepare("SELECT id FROM posts WHERE id=?").get(req.params.id);
  if (!exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rn = clip(String(req.body?.displayName ?? "").trim(), 56);
  const rb = clip(String(req.body?.body ?? "").trim(), 4000);

  if (!rn || !rb) {
    res.status(400).json({ error: "Name and reply text are required." });
    return;
  }

  const rid = randomId();
  db.prepare(`INSERT INTO replies (id, post_id, display_name, body) VALUES (@id,@postId,@rn,@rb)`).run({
    id: rid,
    postId: req.params.id,
    rn,
    rb,
  });

  res.status(201).json({
    id: rid,
    displayName: rn,
    body: rb,
    createdAt: new Date().toISOString(),
  });
});

app.post("/api/admin/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  const row = db.prepare("SELECT id, password_hash FROM admins WHERE username=?").get(username);
  const okHash = typeof row?.password_hash === "string" ? row.password_hash : "";

  if (!row || !(await bcrypt.compare(password, okHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    audit("admin", "login:failure", {});
    return;
  }

  const token = jwt.sign({ role: "admin", sub: String(row.id), u: username }, ADMIN_JWT_SECRET, {
    expiresIn: "8h",
  });

  audit("admin", "login:success", {});
  res.cookie("adminJwt", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.SECURE_COOKIE === "true"),
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("adminJwt");
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdminJwt(), (_req, res) => res.json({ ok: true }));

app.get("/api/admin/overview", requireAdminJwt(), (_req, res) => {
  const postsTotal = Number(db.prepare("SELECT COUNT(*) c FROM posts").get()?.c ?? 0);
  const repliesTotal = Number(db.prepare("SELECT COUNT(*) c FROM replies").get()?.c ?? 0);
  const trafficHits24h = Number(
    db.prepare(`SELECT COUNT(*) c FROM traffic_log WHERE datetime(created_at) >= datetime('now', '-24 hours')`).get()?.c ??
      0,
  );

  res.json({
    postsTotal,
    repliesTotal,
    trafficHits24h,
  });
});

app.get("/api/admin/traffic", requireAdminJwt(), (req, res) => {
  const limit = clampNum(Number.parseInt(String(req.query.limit ?? ""), 10) || 200, 1, 2000);
  const rows =
    db.prepare(`SELECT datetime(created_at) as createdAt, method, path, ip, ua FROM traffic_log ORDER BY id DESC LIMIT ?`).all(
      limit,
    ) ?? [];
  res.json({ items: rows });
});

app.get("/api/admin/posts", requireAdminJwt(), (req, res) => {
  const limit = clampNum(Number.parseInt(String(req.query.limit ?? ""), 10) || 200, 1, 2000);

  audit("admin", "posts:list", { limit });

  const rows =
    db.prepare(
      `SELECT id, datetime(created_at) as createdAt, display_name AS displayName, body, anon_ip AS anonIp, locked
       FROM posts
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    ).all(limit) ?? [];

  res.json({ items: rows });
});

app.delete("/api/admin/posts/:id", requireAdminJwt(), (req, res) => {
  db.prepare(`DELETE FROM posts WHERE id=?`).run(req.params.id);
  audit("admin", "post:moderation_delete", { postId: req.params.id });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[mindglobe] API listening on http://localhost:${PORT}`);
});

