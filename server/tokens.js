import crypto from "node:crypto";

export function randomEditToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** @param {string} raw */
export function hashEditToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function randomId() {
  return crypto.randomUUID();
}
