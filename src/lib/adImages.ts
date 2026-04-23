export const AD_IMAGE_MAPPING: Record<string, string[]> = {
  "Atraer | Abril 21| FM 35-65 | v1": [
    "/images/ads/7 (1).png",
    "/images/ads/10 (3).png"
  ],
  "Atraer | Abril 21| FM 35-65 | v2": [
    "/images/ads/3 (2).png",
    "/images/ads/11 (2).png"
  ],
  "Atraer | Abril 21| FM 35-65 | v3": [
    "/images/ads/1 (2).png",
    "/images/ads/2 (2).png"
  ]
};

/**
 * Gets the image URLs for a given ad name by looking it up in the mapping.
 */
export function getAdImages(adName: string | undefined): string[] {
  if (!adName) return [];
  
  // Clean the name: trim, remove surrounding quotes, and normalize internal whitespace
  const normalize = (s: string) => s.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').toLowerCase();
  
  const normalizedInput = normalize(adName);
  
  // Try to find a match by comparing normalized versions
  const found = Object.keys(AD_IMAGE_MAPPING).find(key => 
    normalize(key) === normalizedInput
  );
  
  return found ? AD_IMAGE_MAPPING[found] : [];
}
