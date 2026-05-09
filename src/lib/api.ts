import type { RemotePost, Reply } from "../types";

export async function fetchPostsRange(params: { sinceIso: string; untilIso: string }) {
  const sp = new URLSearchParams({
    since: params.sinceIso,
    until: params.untilIso,
  });

  const res = await fetch(`/api/posts?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed to load posts");
  const data = (await res.json()) as RemotePost[];
  return data;
}

export async function createPost(displayName: string, body: string) {
  const res = await fetch(`/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ displayName, body }),
  });

  const data = (await res.json().catch(() => ({}))) as
    | (RemotePost & { editToken: string })
    | { error?: string };

  if (!res.ok) throw new Error("error" in data && typeof data.error === "string" ? data.error : "Could not publish");
  if (!("editToken" in data) || typeof data.editToken !== "string") throw new Error("Missing edit token");

  const { editToken, ...rest } = data as RemotePost & { editToken: string };
  return { post: rest as RemotePost, editToken };
}

export async function updatePost(postId: string, token: string, displayName: string, body: string) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ displayName, body }),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof j.error === "string" ? j.error : "Could not save changes");
  }
}

export async function deletePost(postId: string, token: string) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof j.error === "string" ? j.error : "Could not delete");
  }
}

export type PostDetail = RemotePost & { replies?: Reply[]; anonIp?: string | null };

export async function fetchPostDetail(postId: string): Promise<PostDetail> {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
  if (!res.ok) throw new Error("Missing post");
  return (await res.json()) as PostDetail;
}

export async function replyToPost(postId: string, displayName: string, body: string) {
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ displayName, body }),
  });
  const data = (await res.json()) as Reply | { error?: string };

  if (!res.ok) {
    throw new Error(typeof (data as { error?: string }).error === "string" ? String((data as { error?: string }).error) : "Could not reply");
  }

  return data as Reply;
}

export async function adminLogin(username: string, password: string) {
  const res = await fetch(`/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not login");
  return true;
}

export async function adminMe() {
  const res = await fetch(`/api/admin/me`, { credentials: "include" });
  return res.ok;
}

export async function adminOverview() {
  const res = await fetch(`/api/admin/overview`, { credentials: "include" });
  return (await res.json()) as { postsTotal: number; repliesTotal: number; trafficHits24h: number };
}

export async function adminTraffic(limit = 250) {
  const res = await fetch(`/api/admin/traffic?limit=${encodeURIComponent(String(limit))}`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not fetch traffic");

  const j = (await res.json()) as {
    items: Array<{ createdAt: string; method: string; path: string; ip: string | null; ua: string | null }>;
  };

  return j.items;
}

export async function adminPosts(limit = 250) {
  const res = await fetch(`/api/admin/posts?limit=${encodeURIComponent(String(limit))}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Could not fetch posts");

  const j = (await res.json()) as {
    items: Array<{
      id: string;
      createdAt: string;
      displayName: string;
      body: string;
      anonIp: string | null;
      locked: number | boolean;
    }>;
  };

  return j.items;
}

export async function adminDeletePost(postId: string) {
  const res = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    credentials: "include",
  });

  const data = (await res.json()) as { ok?: boolean };

  if (!res.ok || !data.ok) throw new Error("Could not delete");
}
