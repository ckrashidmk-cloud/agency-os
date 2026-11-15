function normalizedHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLocalhostHostname(value: string) {
  const hostname = normalizedHostname(value);
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

export function isLocalhostUrl(url: URL) {
  return isLocalhostHostname(url.hostname);
}

function isPublicHostname(hostname: string) {
  const normalized = normalizedHostname(hostname);
  if (isLocalhostHostname(normalized)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(":")) return false;
  const labels = normalized.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  const topLevelDomain = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(topLevelDomain)) return false;
  return !["example", "internal", "invalid", "local", "localhost", "test"].includes(topLevelDomain.toLowerCase());
}

export function isPublicHttpsUrl(url: URL) {
  return url.protocol === "https:"
    && url.username === ""
    && url.password === ""
    && url.pathname === "/"
    && url.search === ""
    && url.hash === ""
    && isPublicHostname(url.hostname);
}

export function isValidApplicationUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    return isLocalhostUrl(url)
      ? ["http:", "https:"].includes(url.protocol)
      : isPublicHttpsUrl(url);
  } catch {
    return false;
  }
}

export function isAllowedApplicationOrigin(value: string, configuredValue: string) {
  try {
    const origin = new URL(value).origin;
    if ([
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ].includes(origin)) return true;
    if (!configuredValue) return false;
    const configuredUrl = new URL(configuredValue);
    if (configuredUrl.pathname !== "/" || configuredUrl.search || configuredUrl.hash) return false;
    return origin === configuredUrl.origin;
  } catch {
    return false;
  }
}
