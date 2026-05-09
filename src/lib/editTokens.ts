/** In-memory registry; clearing on reload is intentional. */
export const editTokenByPostId = new Map<string, string>();

export function rememberEditToken(postId: string, token: string) {
  editTokenByPostId.set(postId, token);
}

/** Finalize (“commit”) editable posts before the tab goes away — matches the product rule after refresh/new load. */
export function finalizeEditablePosts() {
  const entries = Array.from(editTokenByPostId.entries());
  for (const [postId, token] of entries) {
    fetch(`/api/posts/${encodeURIComponent(postId)}/finalize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      credentials: "include",
      keepalive: true,
      body: "{}",
    }).catch(() => {
      /** ignore */
    });
  }
}
