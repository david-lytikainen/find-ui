const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export type Location = { latitude: number; longitude: number };
export type Thing = { id: number; name: string; clicks: number; archived: boolean };
export type ThingLocation = { id: number; description: string; latitude: number; longitude: number; votes: number; distance_meters: number; my_vote: number };
export type DuplicateThingLocation = Omit<ThingLocation, "my_vote"> & { my_vote?: number };
export type Comment = { id: number; report_id: number | null; body: string; votes: number; created_at: string; my_vote: number };
type ApiThingLocation = Omit<ThingLocation, "my_vote">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.detail || "Something went wrong. Please try again.");
  }
  return response.json() as Promise<T>;
}

export const waterApi = {
  things: () => request<{ things: Thing[] }>("/things"),
  clickThing: (thingId: number) => request<{ clicks: number }>(`/things/${thingId}/click`, { method: "POST" }),
  adminThings: (token: string) => request<{ things: Thing[] }>("/admin/things", { headers: { Authorization: `Bearer ${token}` } }),
  createThing: (name: string, token: string) => request<Thing>("/admin/things", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) }),
  updateThing: (thing: Thing, token: string) => request<Thing>(`/admin/things/${thing.id}`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: thing.name, archived: thing.archived }) }),
  reports: (thingId: number, location: Location) => request<{ reports: ApiThingLocation[] }>(`/things/${thingId}/locations?latitude=${location.latitude}&longitude=${location.longitude}`),
  create: (thingId: number, description: string, location: Location, forceDuplicate = false) => request<{ created: boolean; duplicate?: DuplicateThingLocation; report?: Pick<ThingLocation, "id" | "description" | "latitude" | "longitude" | "votes"> }>(`/things/${thingId}/locations`, { method: "POST", body: JSON.stringify({ description, ...location, force_duplicate: forceDuplicate }) }),
  vote: (reportId: number, delta: number) => request<{ votes: number }>(`/things/locations/${reportId}/vote`, { method: "PUT", body: JSON.stringify({ delta }) }),
  comments: (reportId: number | null, page: number) => request<{ comments: Omit<Comment, "my_vote">[]; page: number; page_size: number; total: number; pages: number }>(`/comments?page=${page}${reportId === null ? "" : `&report_id=${reportId}`}`),
  addComment: (reportId: number | null, body: string) => request<Omit<Comment, "my_vote">>("/comments", { method: "POST", body: JSON.stringify({ report_id: reportId, body }) }),
  voteComment: (commentId: number, delta: number) => request<{ votes: number }>(`/comments/${commentId}/vote`, { method: "PUT", body: JSON.stringify({ delta }) }),
  deleteComment: (commentId: number, token: string) => request<{ deleted: boolean }>(`/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  login: (email: string, password: string) => request<{ token: string; user: { name: string; email: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<{ name: string; email: string }>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
};
