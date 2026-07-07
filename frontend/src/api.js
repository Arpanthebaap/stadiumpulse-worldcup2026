const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const getStatus = () => request("/api/status");
export const getSnapshot = () => request("/api/simulate");
export const getRecommendation = (zoneId) => request(`/api/decide/${zoneId}`);
export const postAnnouncement = (text, languages) =>
  request("/api/announce", { method: "POST", body: JSON.stringify({ text, languages }) });
export const postTriage = (report) =>
  request("/api/triage", { method: "POST", body: JSON.stringify({ report }) });
