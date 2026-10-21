import type { MetadataRoute } from "next";

// Permite instalar el CRM en el móvil (en iPhone es obligatorio para recibir avisos).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM · T-Media Global",
    short_name: "CRM",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f5f4f8",
    theme_color: "#9b52ea",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
