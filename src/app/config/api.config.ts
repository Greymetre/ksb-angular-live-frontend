declare global {
  interface Window {
    __KSB_CONFIG__?: {
      apiOrigin?: string;
      googleMapsApiKey?: string;
    };
  }
}

export const API_ORIGIN =
  window.__KSB_CONFIG__?.apiOrigin ||
  'http://localhost:8080';
export const API_BASE_URL = `${API_ORIGIN}/api`;
export const GOOGLE_MAPS_API_KEY = window.__KSB_CONFIG__?.googleMapsApiKey || '';
