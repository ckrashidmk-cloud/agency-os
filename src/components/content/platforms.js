export const PLATFORMS = [
  { value: "instagram_post", label: "Instagram Post", color: "#E1306C" },
  { value: "instagram_reel", label: "Instagram Reel", color: "#C13584" },
  { value: "facebook", label: "Facebook", color: "#1877F2" },
  { value: "twitter", label: "Twitter / X", color: "#1DA1F2" },
  { value: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { value: "tiktok", label: "TikTok", color: "#000000" },
  { value: "youtube", label: "YouTube", color: "#FF0000" },
];

export const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.value, p]));
