// In production (built), we use the same origin. In dev, we point to localhost:8000
export const API_URL = import.meta.env.PROD ? "" : "http://localhost:8000";
