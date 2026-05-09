import type { Cluster, RemotePost } from "../types";

function floorKey(lat: number, lng: number, decimals: number) {
  const f = (n: number) => Number.parseFloat(n.toFixed(decimals));
  return `${f(lat)}@${f(lng)}`;
}

/**
 * Density field on a coarse grid for “pulse / heat”.
 */
export function coarseDensity(posts: RemotePost[]) {
  const map = new Map<string, number>();
  for (const p of posts) {
    const k = floorKey(p.lat, p.lng, 1);
    map.set(k, (map.get(k) ?? 0) + 1);
  }

  /** max count in any coarse bucket */
  const max = Math.max(1, ...Array.from(map.values()));
  return { map, max };
}

/** Group posts by rounded coordinates; merges nearby markers when zoomed out. */
export function clusterPosts(posts: RemotePost[], decimals: number, coarseCounts: Map<string, number>, coarseMax: number): Cluster[] {
  const buckets = new Map<string, Cluster>();

  for (const p of posts) {
    const key = floorKey(p.lat, p.lng, decimals);
    const existing = buckets.get(key);
    const coarseKey = floorKey(p.lat, p.lng, 1);

    /** 0 → 1 */
    const areaHeat = Math.min(1, (coarseCounts.get(coarseKey) ?? 1) / coarseMax);

    if (!existing) {
      buckets.set(key, {
        key,
        lat: p.lat,
        lng: p.lng,
        count: 1,
        preview: excerpt(p.body, 112),
        postIds: [p.id],
        intensity: areaHeat,
      });
      continue;
    }

    existing.count += 1;
    existing.postIds.push(p.id);
    existing.preview =
      `${existing.preview ? `${existing.preview} · ` : ""}${p.displayName}: ${excerpt(p.body, 96)}`;

    existing.intensity = Math.max(existing.intensity, areaHeat);

    existing.lat += p.lat;
    existing.lng += p.lng;

    buckets.set(key, existing);
  }

  for (const v of buckets.values()) {
    v.lat /= v.count;
    v.lng /= v.count;

    /** Also boost local stacking when many posts collapsed into same fine bucket */
    v.intensity = Math.min(1, v.intensity + Math.min(0.35, Math.max(0, v.count - 1) * 0.035));
  }

  return Array.from(buckets.values());
}

function excerpt(body: string, max: number) {
  const trimmed = body.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1))}…` : trimmed;
}

export function decimalsForAltitude(altitude: number) {
  if (altitude > 4) return 0;
  if (altitude > 3) return 1;
  if (altitude > 2.2) return 2;
  if (altitude > 1.65) return 3;
  return 4;
}

export function altitudeBand(altitude: number): "orbit" | "regional" | "street" {
  if (altitude > 2.8) return "orbit";
  if (altitude > 1.7) return "regional";
  return "street";
}
