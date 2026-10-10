import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "F1 Live",
    short_name: "F1 Live",
    description: "Live Formula 1 timing, track map, race alerts, schedule, standings and replays.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0d10",
    theme_color: "#0e0d10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
