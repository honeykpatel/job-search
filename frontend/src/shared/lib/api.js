export async function apiRequest(path, options = {}) {
  const { accessToken, guestToken, adminToken, headers, body, ...rest } = options;
  const requestHeaders = new Headers(headers || {});

  if (!(body instanceof FormData) && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  if (guestToken) requestHeaders.set("X-Guest-Token", guestToken);
  if (adminToken) requestHeaders.set("X-Admin-Token", adminToken);

  const response = await fetch(path, {
    ...rest,
    headers: requestHeaders,
    body,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" ? payload.detail || payload.message : payload;
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return payload;
}

export function createWorkspaceApi({ accessToken, guestToken }) {
  return (path, options = {}) => apiRequest(path, { ...options, accessToken, guestToken });
}
