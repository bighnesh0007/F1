import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "F1 Live",
    short_name: "F1 Live",
    description: "Live Formula 1 timing, track map, race alerts, schedule, standings and replays.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#0e0d10",
    theme_color: "#0e0d10",
    categories: ["sports", "news", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Race centre", short_name: "Live", url: "/live", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Predict & play", short_name: "Play", url: "/play", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Schedule", url: "/schedule", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "News", url: "/news", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
