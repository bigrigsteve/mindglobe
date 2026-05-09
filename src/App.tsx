import { useCallback, useEffect, useMemo, useState } from "react";
import AdminScreen from "./components/AdminScreen";
import ComposeModal from "./components/ComposeModal";
import GlobeView from "./components/GlobeView";
import PostDrawer from "./components/PostDrawer";
import { fetchPostsRange } from "./lib/api";
import { finalizeEditablePosts } from "./lib/editTokens";
import { altitudeBand } from "./lib/clusterPosts";
import type { Cluster, RemotePost } from "./types";

function readRoute() {
  return window.location.hash === "#/admin" ? "admin" : "globe";
}

function sortPosts(list: RemotePost[]) {
  return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export default function App() {
  const [route, setRoute] = useState(() => readRoute());

  const [posts, setPosts] = useState<RemotePost[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState<Cluster | null>(null);
  const [globeAlt, setGlobeAlt] = useState(2.65);

  const [startPct, setStartPct] = useState(0);
  const [endPct, setEndPct] = useState(1);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onLeave = () => finalizeEditablePosts();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);

  const reload = useCallback(async () => {
    setLoadErr(null);
    try {
      const rows = await fetchPostsRange({
        sinceIso: "1970-01-01T00:00:00.000Z",
        untilIso: new Date().toISOString(),
      });
      setPosts(sortPosts(rows));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load thoughts");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const extent = useMemo(() => {
    if (!posts.length) return null;
    const times = posts.map((p) => new Date(p.createdAt).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min, max, span: Math.max(1, max - min) };
  }, [posts]);

  const visiblePosts = useMemo(() => {
    if (!extent) return posts;
    const a = Math.min(startPct, endPct);
    const b = Math.max(startPct, endPct);
    const lo = extent.min + a * extent.span;
    const hi = extent.min + b * extent.span;
    return posts.filter((p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= lo && t <= hi;
    });
  }, [posts, extent, startPct, endPct]);

  const band = altitudeBand(globeAlt);

  const zoomHint =
    band === "orbit"
      ? "Bird’s-eye orbit · pins read as pulses. Spiral inward to skim previews."
      : band === "regional"
        ? "Regional lens · clustered stacks condense chatter; keep descending for verbatim excerpts."
        : "Street orbit · excerpts unlock. Tap a halo to drift into replies.";

  if (route === "admin") return <AdminScreen />;

  return (
    <div className="surface">
      <GlobeView posts={visiblePosts} onAltitudeChange={(a) => setGlobeAlt(a)} onInspectCluster={(c) => setSelected(c)} />

      <div className="hud-layer">
        <div style={{ position: "absolute", top: 18, left: 18, maxWidth: 360 }} className="frost" aria-live="polite">
          <div className="serif-title" style={{ fontSize: 28, letterSpacing: "-0.02em" }}>
            Mindglobe
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "rgba(230,231,246,0.6)", lineHeight: 1.45 }}>{zoomHint}</div>
          {loadErr ? <div style={{ marginTop: 10, color: "#ffb6cb", fontSize: 13 }}>{loadErr}</div> : null}
        </div>

        <div style={{ position: "absolute", top: 18, right: 18 }}>
          <button className="btn-primary" type="button" onClick={() => setComposerOpen(true)}>
            Post thought
          </button>
        </div>

        <div style={{ position: "absolute", left: 18, bottom: 18 }}>
          <a className="tiny-link" href="#/admin">
            Admin console →
          </a>
        </div>

        <div className="frost" style={{ position: "absolute", bottom: 18, right: 18, left: "min(780px, 52vw)", padding: "14px 16px" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(230,231,246,0.48)" }}>
            Temporal window
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(231,231,246,0.65)" }}>
              Older boundary
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={startPct}
                disabled={!extent}
                onChange={(e) => setStartPct(Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(231,231,246,0.65)" }}>
              Newer boundary
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={endPct}
                disabled={!extent}
                onChange={(e) => setEndPct(Number(e.target.value))}
              />
            </label>
          </div>
          {!extent ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(230,231,246,0.5)" }}>
              Once the constellation contains posts, glide this window across history.
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(230,231,246,0.55)" }}>
              Showing {visiblePosts.length} of {posts.length} thoughts · clustered automatically when perspectives zoom out · hot
              fields pulse akin to densely layered stories elsewhere.
            </div>
          )}
        </div>
      </div>

      <ComposeModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={(post) => {
          setPosts((prev) => sortPosts([...prev, post]));
          setComposerOpen(false);
        }}
      />

      <PostDrawer
        cluster={selected}
        onClose={() => setSelected(null)}
        onRefresh={() => void reload()}
      />
    </div>
  );
}
