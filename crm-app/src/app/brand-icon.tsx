import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Icono de la app: logo blanco de T-Media Global sobre el degradado de la marca (colores de t-mediaglobal.com).
export async function brandIcon(size: number) {
  const logo = await readFile(join(process.cwd(), "public/brand-logo.png"));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #9b52ea 0%, #ba54bc 100%)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${logo.toString("base64")}`} width={size} height={size} alt="" />
    </div>,
    { width: size, height: size }
  );
}
