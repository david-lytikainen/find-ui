const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export type Location = { latitude: number; longitude: number };
export type WaterReport = { id: number; description: string; latitude: number; longitude: number; votes: number; distance_meters: number; my_vote: number };
export type DuplicateReport = Omit<WaterReport, "my_vote"> & { my_vote?: number };
export type Comment = { id: number; report_id: number | null; body: string; votes: number; created_at: string; my_vote: number };
type ApiReport = Omit<WaterReport, "my_vote">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.detail || "Something went wrong. Please try again.");
  }
  return response.json() as Promise<T>;
}

export const waterApi = {
  reports: (location: Location) => request<{ reports: ApiReport[] }>(`/water/reports?latitude=${location.latitude}&longitude=${location.longitude}`),
  create: (description: string, location: Location, forceDuplicate = false) => request<{ created: boolean; duplicate?: DuplicateReport; report?: Pick<WaterReport, "id" | "description" | "latitude" | "longitude" | "votes"> }>("/water/reports", { method: "POST", body: JSON.stringify({ description, ...location, force_duplicate: forceDuplicate }) }),
  vote: (reportId: number, delta: number) => request<{ votes: number }>(`/water/reports/${reportId}/vote`, { method: "PUT", body: JSON.stringify({ delta }) }),
  comments: (reportId: number | null, page: number) => request<{ comments: Omit<Comment, "my_vote">[]; page: number; page_size: number; total: number; pages: number }>(`/water/comments?page=${page}${reportId === null ? "" : `&report_id=${reportId}`}`),
  addComment: (reportId: number | null, body: string) => request<Omit<Comment, "my_vote">>("/water/comments", { method: "POST", body: JSON.stringify({ report_id: reportId, body }) }),
  voteComment: (commentId: number, delta: number) => request<{ votes: number }>(`/water/comments/${commentId}/vote`, { method: "PUT", body: JSON.stringify({ delta }) }),
  deleteComment: (commentId: number, token: string) => request<{ deleted: boolean }>(`/water/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  login: (email: string, password: string) => request<{ token: string; user: { name: string; email: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<{ name: string; email: string }>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
};
