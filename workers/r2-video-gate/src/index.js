const DEFAULT_ALLOWED_ORIGINS = ["https://violin86318.github.io"];
const DEFAULT_ALLOWED_KEY_PREFIXES = ["videos/"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrigin(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins(env) {
  const configured = splitCsv(env.ALLOWED_ORIGINS);
  return new Set((configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS).map(normalizeOrigin));
}

function isEnabled(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return /^(1|true|yes|on)$/i.test(String(value));
}

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function getRequestSource(request) {
  const origin = normalizeOrigin(request.headers.get("Origin"));

  if (origin) {
    return { type: "origin", origin };
  }

  const referer = normalizeOrigin(request.headers.get("Referer"));

  if (referer) {
    return { type: "referer", origin: referer };
  }

  return null;
}

function isAllowedRequest(request, env) {
  const source = getRequestSource(request);

  if (!source) {
    return isEnabled(env.ALLOW_EMPTY_REFERER, false);
  }

  if (getAllowedOrigins(env).has(source.origin)) {
    return true;
  }

  return isEnabled(env.ALLOW_LOCAL_PREVIEW, true) && isLoopbackOrigin(source.origin);
}

function getCorsHeaders(request, env) {
  const source = getRequestSource(request);

  if (!source || !isAllowedRequest(request, env)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": source.origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Referer"
  };
}

function getAllowedKeyPrefixes(env) {
  const configured = splitCsv(env.ALLOWED_KEY_PREFIXES);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_KEY_PREFIXES;
}

function getObjectKey(url, env) {
  const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (!key || key.includes("..")) {
    return "";
  }

  const allowedPrefixes = getAllowedKeyPrefixes(env);
  return allowedPrefixes.some((prefix) => key.startsWith(prefix)) ? key : "";
}

function addObjectHeaders(headers, object) {
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");

  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "video/mp4");
  }

  if (object.range?.offset !== undefined && object.range?.length !== undefined) {
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
    headers.set("Content-Length", String(object.range.length));
    return 206;
  }

  headers.set("Content-Length", String(object.size));
  return 200;
}

function textResponse(message, status, headers = {}) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

async function handleObjectRequest(request, env) {
  if (!isAllowedRequest(request, env)) {
    return textResponse("Forbidden", 403, getCorsHeaders(request, env));
  }

  const url = new URL(request.url);
  const key = getObjectKey(url, env);

  if (!key) {
    return textResponse("Not Found", 404, getCorsHeaders(request, env));
  }

  const responseHeaders = new Headers(getCorsHeaders(request, env));

  if (request.method === "HEAD") {
    const head = await env.VIDEOS.head(key);

    if (!head) {
      return textResponse("Not Found", 404, getCorsHeaders(request, env));
    }

    const status = addObjectHeaders(responseHeaders, head);
    return new Response(null, { status: status === 206 ? 200 : status, headers: responseHeaders });
  }

  const object = await env.VIDEOS.get(key, {
    onlyIf: request.headers,
    range: request.headers
  });

  if (!object) {
    return textResponse("Not Found", 404, getCorsHeaders(request, env));
  }

  const status = addObjectHeaders(responseHeaders, object);
  return new Response("body" in object ? object.body : undefined, {
    status: "body" in object ? status : 412,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return textResponse("ok", 200);
    }

    if (request.method === "OPTIONS") {
      if (!isAllowedRequest(request, env)) {
        return textResponse("Forbidden", 403);
      }

      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env)
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse(`${request.method} is not allowed`, 405, {
        Allow: "GET, HEAD, OPTIONS"
      });
    }

    return handleObjectRequest(request, env);
  }
};
