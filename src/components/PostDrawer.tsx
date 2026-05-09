import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Cluster, Reply } from "../types";
import { deletePost, fetchPostDetail, replyToPost, updatePost } from "../lib/api";
import { editTokenByPostId } from "../lib/editTokens";

type Detail = Awaited<ReturnType<typeof fetchPostDetail>>;

type Props = {
  cluster: Cluster | null;
  onClose: () => void;
  onRefresh: () => void;
};

function isLocked(d: Detail | null) {
  return d?.locked === true || Number(d?.locked) === 1;
}

export default function PostDrawer({ cluster, onClose, onRefresh }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [replyName, setReplyName] = useState("");
  const [replyBody, setReplyBody] = useState("");

  const orderedIds = cluster?.postIds ?? [];
  const token = detail ? editTokenByPostId.get(detail.id) ?? null : null;
  const canEditLocally = Boolean(token) && Boolean(detail) && !isLocked(detail);

  useEffect(() => {
    if (!cluster) {
      setFocusId(null);
      setDetail(null);
      setError(null);
      return;
    }
    const ids = [...cluster.postIds];
    ids.sort();
    setFocusId(ids[ids.length - 1] ?? ids[0] ?? null);
    setReplyName("");
    setReplyBody("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cluster swaps reset cleanly
  }, [cluster]);

  useEffect(() => {
    if (!focusId) {
      setDetail(null);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const d = await fetchPostDetail(focusId);
        if (cancelled) return;
        setDetail(d);
        setDraftName(d.displayName);
        setDraftBody(d.body);
        setError(null);
      } catch {
        if (!cancelled) setError("Could not fetch this thread.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  const subtitle = useMemo(() => {
    if (!cluster) return "";
    if (cluster.count === 1) return "Roughly placed from IP centroid · pseudonymous name only.";
    return `${cluster.count} thoughts converge around this marker · swap between threads below.`;
  }, [cluster]);

  if (!cluster) return null;

  async function finalizeNow() {
    if (!detail || !token) return;
    await fetch(`/api/posts/${encodeURIComponent(detail.id)}/finalize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: "{}",
    });

    editTokenByPostId.delete(detail.id);
    onRefresh();
    setDetail(await fetchPostDetail(detail.id));
  }

  async function deleteNow() {
    if (!detail || !token) return;
    await deletePost(detail.id, token);
    editTokenByPostId.delete(detail.id);
    onRefresh();

    const remaining = orderedIds.filter((id) => id !== detail.id);
    if (remaining.length === 0) {
      onClose();
      return;
    }
    setFocusId(remaining[remaining.length - 1] ?? remaining[0] ?? null);
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!detail || !token) return;

    await updatePost(detail.id, token, draftName, draftBody);

    onRefresh();
    setDetail(await fetchPostDetail(detail.id));
  }

  async function submitReply(e: FormEvent) {
    e.preventDefault();
    if (!detail || !replyName.trim() || !replyBody.trim()) return;

    const posted = await replyToPost(detail.id, replyName.trim(), replyBody.trim());
    const nextReply = posted as Reply;
    setDetail((d) => (!d ? d : { ...d, replies: [...(d.replies ?? []), nextReply] }));

    setReplyBody("");
  }

  function chips() {
    if (orderedIds.length <= 1) return null;

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {orderedIds.map((id, idx) => (
          <button
            key={id}
            type="button"
            className="btn-ghost"
            style={{
              borderRadius: 999,
              padding: "6px 11px",
              opacity: focusId === id ? 1 : 0.65,
              border: focusId === id ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.16)",
            }}
            onClick={() => setFocusId(id)}
          >
            Thought {idx + 1}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="drawer-mask" onClick={() => onClose()} />

      <aside className="drawer-sheet" aria-label="Thread detail">
        <div className="frost inner" style={{ margin: 16, padding: 16, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="serif-title" style={{ fontSize: 28, lineHeight: 1 }}>
                Nearby voices
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "rgba(235,237,252,0.58)" }}>{subtitle}</div>
              {chips()}
            </div>
            <button className="btn-ghost" type="button" onClick={() => onClose()}>
              Close
            </button>
          </div>

          {error ? <div style={{ color: "#ffb6c9", fontSize: 13 }}>{error}</div> : null}

          {loading || !detail ? (
            <div style={{ color: "rgba(235,237,252,0.62)", fontSize: 13 }}>Pulling constellation…</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {isLocked(detail) ? (
                <div style={{ borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)" }}>
                  Sealed permanently · removals are admin-only moderation.
                </div>
              ) : null}

              {!token && !isLocked(detail) ? (
                <div style={{ borderRadius: 12, padding: 12, background: "rgba(124,137,255,0.06)", border: "1px solid rgba(124,137,255,0.18)" }}>
                  <strong style={{ fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(229,231,253,0.78)" }}>
                    Read-only vantage
                  </strong>
                  <div style={{ marginTop: 6, color: "rgba(235,237,252,0.74)", fontSize: 13, lineHeight: 1.52 }}>
                    This browser does not carry the ephemeral edit signature for the author anymore. Threads remain public;
                    admins can intervene if moderation is necessary.
                  </div>
                </div>
              ) : null}

              {!canEditLocally || isLocked(detail) ? (
                <article style={{ margin: 0 }}>
                  <div style={{ fontSize: 12, color: "rgba(235,237,252,0.5)" }}>
                    {detail.displayName} ·{" "}
                    {new Date(detail.createdAt).toLocaleString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>

                  <p style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#f9faff" }}>
                    {detail.body}
                  </p>
                </article>
              ) : (
                <form onSubmit={(e) => void submitEdit(e)} style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label htmlFor="edit-name">Name</label>
                    <input id="edit-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </div>

                  <div className="field">
                    <label htmlFor="edit-body">Thought</label>
                    <textarea id="edit-body" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
                  </div>

                  <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn-danger" type="button" onClick={() => void deleteNow()}>
                      Delete draft
                    </button>
                    <button className="btn-ghost" type="button" onClick={() => void finalizeNow()}>
                      Seal forever
                    </button>
                    <button className="btn-primary" type="submit">
                      Save tweaks
                    </button>
                  </div>
                </form>
              )}

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(235,237,252,0.54)" }}>
                  Whisper back
                </div>

                <form onSubmit={(e) => void submitReply(e)} style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <div className="field">
                    <label htmlFor="reply-name">Name</label>
                    <input id="reply-name" value={replyName} autoComplete="off" onChange={(e) => setReplyName(e.target.value)} />
                  </div>

                  <div className="field">
                    <label htmlFor="reply-body">Reply</label>
                    <textarea id="reply-body" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn-primary" type="submit">
                      Respond
                    </button>
                  </div>
                </form>
              </div>

              {(detail.replies ?? []).length > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {(detail.replies ?? []).map((reply) => (
                    <div key={reply.id} style={{ borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <div style={{ fontSize: 12, color: "rgba(235,237,252,0.5)" }}>
                        {reply.displayName} · {new Date(reply.createdAt).toLocaleString()}
                      </div>
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{reply.body}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "rgba(235,237,252,0.54)", fontSize: 13 }}>No echoes yet · be generous.</div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
