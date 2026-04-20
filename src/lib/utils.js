export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

export function scoreNameSimilarity(a, b) {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.9;
  }

  const left = new Set(tokenize(normalizedA));
  const right = new Set(tokenize(normalizedB));

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(left.size, right.size);
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

export function notFound(response) {
  respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Resource not found" } });
}

export function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}
