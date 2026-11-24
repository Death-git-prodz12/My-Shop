export function json(statusCode, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders } });
}

export async function requireUser(request) {
  const header = request.headers?.get?.("authorization") || request.headers?.authorization || request.headers?.Authorization || "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) return { error: json(401, { error: "Connexion requise." }) };
  let auth;
  try {
    auth = (await import("./firebase-admin.js")).adminAuth();
  } catch {
    return { error: json(503, { error: "Le service d'authentification est temporairement indisponible." }) };
  }
  try {
    return { user: await auth.verifyIdToken(token) };
  } catch {
    return { error: json(401, { error: "Session invalide ou expirée." }) };
  }
}

export async function fetchWithTimeout(url, options = {}, ms = 10000) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? Math.min(retryAfter * 1000, 1000) : 300 * (2 ** attempt)));
      lastError = new Error(`Temporary provider status ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * (2 ** attempt)));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export function recordsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  const queue = [{ value: payload, depth: 0 }];
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || depth > 6) continue;
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) && /products|items|results|records|offers/i.test(key)) return child;
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
    }
  }
  return [];
}
