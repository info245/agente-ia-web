"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { SETTINGS_TABS } from "@/lib/settings-nav";

export function SettingsTabs() {
  const pathname = usePathname();
  const { can } = useSession();
  return (
    <nav className="tabs" aria-label="Configuración">
      {SETTINGS_TABS.filter((t) => can(t.perm)).map((t) => (
        <Link key={t.href} href={t.href} className="chip" aria-current={pathname.startsWith(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
