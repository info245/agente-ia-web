import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Cargando…</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
