import ipaddr from "ipaddr.js";

const DEFAULT = { lat: 20.0, lng: 0.0, label: "Unknown" };

/** @returns {Promise<{lat:number,lng:number,label?:string}>} */
export async function locateIp(rawIp, fetchImpl = fetch) {
  const ip = normalizeIp(rawIp);
  if (!ip) return DEFAULT;

  if (!isGeocodablePublicIp(ip)) {
    return DEFAULT;
  }

  try {
    const res = await fetchImpl(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,lat,lon,city,country`);
    if (!res.ok) return DEFAULT;
    const j = /** @type {any} */ (await res.json());
    if (j.status !== "success" || typeof j.lat !== "number" || typeof j.lon !== "number") {
      return DEFAULT;
    }
    const label = [j.city, j.country].filter(Boolean).join(", ") || undefined;
    return { lat: j.lat, lng: j.lon, label };
  } catch {
    return DEFAULT;
  }
}

/** @returns {string | null} */
function normalizeIp(raw) {
  if (!raw || typeof raw !== "string") return null;
  const x = raw.split(",")[0]?.trim();
  if (!x) return null;
  return x;
}

/** @param {string} ip */
function isGeocodablePublicIp(ip) {
  try {
    const a = ipaddr.parse(ip);
    const r = a.range();
    const blocked = new Set([
      "private",
      "loopback",
      "linkLocal",
      "uniqueLocal",
      "carrierGradeNat",
      "benchmarking",
      "reserved",
    ]);
    return !blocked.has(r);
  } catch {
    return false;
  }
}
