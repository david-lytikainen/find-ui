const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export type Location = { latitude: number; longitude: number };
export type WaterReport = { id: number; description: string; latitude: number; longitude: number; credibility: number; distance_meters: number; my_vote: number };
export type DuplicateReport = Omit<WaterReport, "my_vote"> & { my_vote?: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.detail || "Something went wrong. Please try again.");
  }
  return response.json() as Promise<T>;
}

export const waterApi = {
  reports: (location: Location, sessionId: string) => request<{ reports: WaterReport[] }>(`/water/reports?latitude=${location.latitude}&longitude=${location.longitude}&session_id=${sessionId}`),
  create: (description: string, location: Location, forceDuplicate = false) => request<{ created: boolean; duplicate?: DuplicateReport; report?: Pick<WaterReport, "id" | "description" | "latitude" | "longitude" | "credibility"> }>("/water/reports", { method: "POST", body: JSON.stringify({ description, ...location, force_duplicate: forceDuplicate }) }),
  vote: (reportId: number, sessionId: string, direction: -1 | 0 | 1) => request<{ credibility: number; my_vote: number }>(`/water/reports/${reportId}/vote`, { method: "PUT", body: JSON.stringify({ session_id: sessionId, direction }) }),
};
