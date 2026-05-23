function base64UrlToBase64(input) {
  return input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadB64 = base64UrlToBase64(parts[1]);
    const json = atob(payloadB64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function usernameFromJwt(token) {
  const payload = decodeJwtPayload(token);
  const sub = payload && payload.sub;
  return typeof sub === "string" && sub.trim() ? sub : "";
}

