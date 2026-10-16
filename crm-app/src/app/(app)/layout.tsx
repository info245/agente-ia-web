import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

// Screens load their data in the browser through the Express API, so navigations are not instant by design.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Cargando…</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
