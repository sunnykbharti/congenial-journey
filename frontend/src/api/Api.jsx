import axios from "axios";

// fix #15: read API base URL from a Vite env variable so it works in
// staging / production without code changes.
// Set VITE_API_URL=https://your-api.com/api in .env.production
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api",
});

export const fetchDashboardSummary    = () => api.get("/dashboard/summary").then(r => r.data);
export const fetchRecentSessions      = () => api.get("/dashboard/recent_sessions").then(r => r.data);
export const fetchWeeklyActivity      = () => api.get("/dashboard/weekly").then(r => r.data);

export default api;