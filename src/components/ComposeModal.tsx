import { FormEvent, useEffect, useState } from "react";
import { createPost } from "../lib/api";
import { rememberEditToken } from "../lib/editTokens";
import type { RemotePost } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** returns the authoritative server record so the globe can ingest it instantly */
  onPublished: (post: RemotePost) => void;
};

type GeoState = "acquiring" | "ok" | "unavailable";

function getBrowserCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function ComposeModal({ open, onClose, onPublished }: Props) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<GeoState>("acquiring");

  useEffect(() => {
    if (!open) return;
    setGeoState("acquiring");
    setCoords(null);
    getBrowserCoords().then((c) => {
      setCoords(c);
      setGeoState(c ? "ok" : "unavailable");
    });
  }, [open]);

  if (!open) return null;

  async function publish(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      setBusy(true);

      const { post, editToken } = await createPost(name, body, coords ?? undefined);
      rememberEditToken(post.id, editToken);
      onPublished(post);
      setName("");
      setBody("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-mask" role="dialog" aria-modal="true" aria-label="Share a thought">
      <div className="modal-card frost" style={{ padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="serif-title" style={{ fontSize: 28, lineHeight: 1.05 }}>
              Release a thought
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13, maxWidth: 420 }}>
              No account. Choose a name, write freely. Your browser keeps a fragile edit token until this tab disappears,
              then the thought becomes permanent moderation-only.
            </div>
          </div>
          <button className="btn-ghost" type="button" onClick={() => onClose()} style={{ alignSelf: "flex-start" }}>
            Close
          </button>
        </div>

        <form onSubmit={(e) => void publish(e)} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="composer-name">Name</label>
            <input id="composer-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Nova" />
          </div>

          <div className="field">
            <label htmlFor="composer-body">Thought</label>
            <textarea id="composer-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What is alive in you today?" />
          </div>

          <div style={{ fontSize: 12, color: "rgba(230,231,246,0.45)" }}>
            {geoState === "acquiring" && "Acquiring your location…"}
            {geoState === "ok" && "Location acquired — your pin will land in the right place."}
            {geoState === "unavailable" && "Location unavailable — pin will be placed by IP address."}
          </div>

          {error ? <div style={{ color: "#ffb4c6", fontSize: 13 }}>{error}</div> : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn-ghost" type="button" onClick={() => onClose()} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Appear on Earth"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
