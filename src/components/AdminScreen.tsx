import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  adminDeletePost,
  adminLogin,
  adminMe,
  adminOverview,
  adminPosts,
  adminTraffic,
} from "../lib/api";

type Overview = { postsTotal: number; repliesTotal: number; trafficHits24h: number };
type TrafficRow = { createdAt: string; method: string; path: string; ip: string | null; ua: string | null };
type ModPost = {
  id: string;
  createdAt: string;
  displayName: string;
  body: string;
  anonIp: string | null;
  locked: number | boolean;
};

export default function AdminScreen() {
  const [logged, setLogged] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [traffic, setTraffic] = useState<TrafficRow[]>([]);
  const [posts, setPosts] = useState<ModPost[]>([]);

  const reloadTables = useCallback(async () => {
    try {
      const ov = await adminOverview();
      const tf = await adminTraffic();
      const pg = await adminPosts();
      setOverview(ov);
      setTraffic(tf);
      setPosts(pg);
    } catch {
      setLogged(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ok = await adminMe();
        setLogged(ok);
        if (ok) await reloadTables();
      } finally {
        setBooting(false);
      }
    })();
  }, [reloadTables]);

  async function onLogin(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    try {
      await adminLogin(username, password);
      setLogged(true);
      await reloadTables();
      setUsername("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setLogged(false);
    setOverview(null);
    setTraffic([]);
    setPosts([]);
  }

  async function removePost(id: string) {
    if (!window.confirm("Delete this thread permanently?")) return;
    try {
      await adminDeletePost(id);
      await reloadTables();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (booting) {
    return (
      <div style={{ minHeight: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.62)" }}>
        Priming moderator console…
      </div>
    );
  }

  if (!logged) {
    return (
      <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 22 }}>
        <form
          className="frost"
          onSubmit={(e) => void onLogin(e)}
          style={{ width: "min(460px, 94vw)", padding: 20, display: "grid", gap: 14 }}
        >
          <div className="serif-title" style={{ fontSize: 32 }}>
            Admin access
          </div>
          <div style={{ color: "rgba(228,229,246,0.58)", fontSize: 13, lineHeight: 1.5 }}>
            Set <code style={{ opacity: 0.75 }}>ADMIN_USERNAME</code>/<code style={{ opacity: 0.75 }}>ADMIN_PASSWORD</code>
            {" "}
            locally, then authenticate to stream traffic traces and intervene on moderation cases.
          </div>

          {error ? <div style={{ color: "#ffb6c9", fontSize: 13 }}>{error}</div> : null}

          <div className="field">
            <label htmlFor="adm-user">Username</label>
            <input id="adm-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>

          <div className="field">
            <label htmlFor="adm-pass">Password</label>
            <input id="adm-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>

          <button className="btn-primary" type="submit">
            Enter cockpit
          </button>

          <a className="tiny-link" href="#/">
            ← Back to Mindglobe
          </a>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", padding: "18px 18px 32px", maxWidth: 1220, margin: "0 auto" }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="serif-title" style={{ fontSize: 34 }}>
            Moderation cockpit
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "rgba(224,226,246,0.58)" }}>
            Live counters · recent traffic fingerprints · irrevocable removals
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn-ghost" type="button" onClick={() => void reloadTables()}>
            Refresh
          </button>
          <button className="btn-ghost" type="button" onClick={() => void logout()}>
            Log out
          </button>
          <a className="btn-ghost" href="#/" style={{ display: "inline-flex", alignItems: "center" }}>
            Return to globe
          </a>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12, marginTop: 18 }}>
        <Metric label="Thoughts persisted" value={overview?.postsTotal ?? 0} accent="rgba(124,137,255,0.5)" />
        <Metric label="Replies" value={overview?.repliesTotal ?? 0} accent="rgba(255,124,173,0.45)" />
        <Metric label="Traffic pings (24h)" value={overview?.trafficHits24h ?? 0} accent="rgba(82,239,219,0.45)" />
      </section>

      <section style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(230,231,246,0.55)" }}>Traffic log</div>
        <div className="frost" style={{ marginTop: 12, overflow: "auto", maxHeight: 320, padding: "8px 0" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Route</th>
                <th>IP</th>
                <th>UA</th>
              </tr>
            </thead>
            <tbody>
              {traffic.map((row) => (
                <tr key={`${row.createdAt}-${row.path}-${row.ip}`}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(row.createdAt).toLocaleString()}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo", fontSize: 11 }}>
                    {row.method} {row.path}
                  </td>
                  <td style={{ wordBreak: "break-all" }}>{row.ip ?? "∅"}</td>
                  <td style={{ maxWidth: 360, wordBreak: "break-word", fontSize: 11 }}>
                    {row.ua ?? "∅"}
                  </td>
                </tr>
              ))}
              {traffic.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: "rgba(230,231,246,0.5)" }}>
                    Nothing captured yet · move around the globe to generate signal.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(230,231,246,0.55)" }}>Thoughts</div>
        <div className="frost" style={{ marginTop: 12, overflow: "auto", maxHeight: 520, padding: "8px 0" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Author</th>
                <th>Body</th>
                <th>IP</th>
                <th>Lock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(post.createdAt).toLocaleString()}</td>
                  <td>{post.displayName}</td>
                  <td style={{ maxWidth: 360, wordBreak: "break-word", fontSize: 12 }}>
                    {shorten(post.body, 240)}
                  </td>
                  <td style={{ wordBreak: "break-all", fontFamily: "ui-monospace", fontSize: 11 }}>
                    {post.anonIp ?? "∅"}
                  </td>
                  <td>{post.locked ? "sealed" : "open"}</td>
                  <td>
                    <button className="btn-danger" type="button" onClick={() => void removePost(post.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "rgba(230,231,246,0.52)" }}>
                    Silence on the wires — invite the first constellation.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="frost" style={{ padding: "14px 16px", borderTop: "3px solid " + accent }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(230,231,246,0.5)" }}>{label}</div>
      <div style={{ fontSize: 32, marginTop: 10, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function shorten(body: string, max: number) {
  const t = body.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}
