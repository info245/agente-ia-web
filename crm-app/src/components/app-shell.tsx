"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, ExternalLink, LogOut, Users } from "lucide-react";
import { api, getAccountId, setAccountId } from "@/lib/api";
import type { Account, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";

const SessionContext = createContext<{ user: User; accountId: string } | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside AppShell");
  return session;
}

const NAV = [
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/agente", label: "Agente", icon: Bot },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccount] = useState("");

  useEffect(() => {
    (async () => {
      const me = await api<{ user: User }>("/auth/me").catch(() => null);
      if (!me) return router.replace("/login");
      const list = await api<{ accounts: Account[]; active_account: Account }>("/crm/accounts");
      const stored = getAccountId();
      const current = list.accounts.some((a) => a.id === stored) ? stored : list.active_account.id;
      setAccountId(current);
      setAccounts(list.accounts);
      setAccount(current);
      setUser(me.user);
    })();
  }, [router]);

  if (!user) {
    return <p className="p-8 text-sm text-muted-foreground">Cargando…</p>;
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
  }

  return (
    <SessionContext.Provider value={{ user, accountId }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 border-b bg-background p-4 md:w-56 md:border-r md:border-b-0">
          <div className="font-semibold">CRM Comercial</div>
          {user.role === "super_admin" && accounts.length > 1 && (
            <label className="grid gap-1 text-xs text-muted-foreground">
              Cuenta
              <NativeSelect
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  window.location.reload();
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.slug || a.id}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <nav className="flex gap-1 md:flex-col">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
                  pathname.startsWith(href) && "bg-muted font-medium"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
            {process.env.NEXT_PUBLIC_LEGACY_CRM_URL && (
              <a
                href={process.env.NEXT_PUBLIC_LEGACY_CRM_URL}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                <ExternalLink className="size-4" aria-hidden />
                CRM actual
              </a>
            )}
          </nav>
          <div className="mt-auto hidden text-xs text-muted-foreground md:block">
            {user.display_name || user.email}
          </div>
          <Button variant="ghost" size="sm" className="justify-start" onClick={logout}>
            <LogOut className="size-4" aria-hidden /> Salir
          </Button>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </SessionContext.Provider>
  );
}
