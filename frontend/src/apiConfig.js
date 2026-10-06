// src/apiConfig.js

// Si está en localhost apunta directo al VPS Ferozo; en Vercel usa la ruta relativa.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://66.97.34.163:3001"
    : "");

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};
