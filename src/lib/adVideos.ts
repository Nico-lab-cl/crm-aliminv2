export const AD_VIDEO_MAPPING: Record<string, string> = {
  "RO | MOFU Marzo 26 | FM 35-65+ | Reel 4": "/videos/ads/Reel4.mp4",
  "RO | MOFU Marzo 26 | FM 35-65+ | Reel 2": "/videos/ads/Reel 2.mp4",
  "RO | MOFU Marzo 26 | FM 35-65+ | Reel 3": "/videos/ads/Reel3.mp4",
  "RO | MOFU Marzo 26 | FM 35-65+ | Reel 1": "/videos/ads/Reel1.mp4",
  "RO | MOFU | FM 35-65+ | Arena y Sol | 1 Arena": "/videos/ads/Arena 1.mp4",
  "RO | MOFU | FM 35-65+ | Arena y Sol | 2 Arena": "/videos/ads/arena2.mp4",
  "RO | MOFU | FM 35-65+ | Promo Verano | 3No es estafa": "/videos/ads/arena 3.mp4",
  "RO | MOFU | FM 35-65+ | Promo Verano | 1 Pie Mas Bajo": "/videos/ads/arena 4.mp4",
  "RO | MOFU | FM 35-65+ | Promo Verano | 4 Pie inicial lomas": "/videos/ads/arena 4.mp4",
  "MOFU| Arena y sol 25-03-2026": "/videos/ads/arena-y-sol-25-03.mp4",
  "MOFU | Arena y sol 25-03-2026": "/videos/ads/arena-y-sol-25-03.mp4",
  "MOFU | Lomas del mar 25-03-2026": "/videos/ads/lomas-del-mar-25-03.mp4",
  "MOFU| Lomas del mar 25-03-2026": "/videos/ads/lomas-del-mar-25-03.mp4",
  "MOFU | Lomas del mar| 02 | 25-03-2026": "/videos/ads/lomas-del-mar-02-25-03.mp4",
  "MOFU| Lomas del mar| 02 | 25-03-2026": "/videos/ads/lomas-del-mar-02-25-03.mp4",
  "RO | MOFU Abril 9 | FM 35-65+ | Reel 3": "/videos/ads/Reel3_Abril9.mp4",
};

/**
 * Gets the video URL for a given ad name by looking it up in the mapping.
 * Uses trimmed matching to handle leading/trailing whitespace.
 */
export function getAdVideoUrl(adName: string | undefined): string | null {
  if (!adName) return null;
  
  const trimmedName = adName.trim();
  
  // Try exact match first
  if (AD_VIDEO_MAPPING[trimmedName]) return AD_VIDEO_MAPPING[trimmedName];
  
  // Try case-insensitive search if needed
  const found = Object.keys(AD_VIDEO_MAPPING).find(key => 
    key.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  
  return found ? AD_VIDEO_MAPPING[found] : null;
}
