import type { MetadataRoute } from "next";

// Lets a self-hosted instance be installed to the home screen: on iOS via
// Share -> "Add to Home Screen", on Android through the install prompt. It then
// opens standalone, without browser chrome, which makes checking campaigns from
// a phone practical.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BeReply",
    short_name: "BeReply",
    description: "Instagram comment-to-DM automation",
    start_url: "/overview",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050C29",
    theme_color: "#0c3bb9",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
