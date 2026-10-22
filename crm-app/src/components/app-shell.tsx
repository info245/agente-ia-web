"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getAccountId, setAccountId } from "@/lib/api";
import { BillingBanner } from "@/components/billing-banner";
import { initials, ownerOf } from "@/lib/format";
import type { Account, AppConfig, Billing, Lead, User } from "@/lib/types";

type Session = {
  user: User;
  account: Account;
  leads: Lead[] | null;
  reloadLeads: () => Promise<void>;
  config: AppConfig | null;
  configError: string;
  reloadConfig: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);

export function ConfigPending({ error }: { error: string }) {
  return error ? (
    <p className="alert error" role="alert" style={{ margin: 32 }}>No se pudo cargar la configuración de esta cuenta: {error}</p>
  ) : (
    <p className="loading">Cargando…</p>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession fuera de AppShell");
  return session;
}

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const NAV = [
  { href: "/inicio", label: "Inicio", icon: icon(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />) },
  { href: "/conversaciones", label: "Conversaciones", short: "Mensajes", icon: icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />) },
  { href: "/contactos", label: "Contactos", icon: icon(<><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3" /></>) },
  { href: "/agenda", label: "Agenda", icon: icon(<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>) },
  { href: "/asistente", label: "Mi asistente", short: "Asistente", icon: icon(<><path d="M12 3v3M5 9h14a2 2 0 0 1 2 2v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-6a2 2 0 0 1 2-2z" /><circle cx="9" cy="14" r="1.2" /><circle cx="15" cy="14" r="1.2" /></>) },
  { href: "/canales", label: "Canales", icon: icon(<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />) },
];

const AGENCY_NAV = { href: "/agencia", label: "Agencia", icon: icon(<><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6M9 10h.01M15 10h.01" /></>) };

// ponytail: el listado trae 200 leads con su último mensaje cada 20 s; con miles de leads hará falta paginar en servidor.
const LEADS_PATH = "/crm/leads?limit=200";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [billing, setBilling] = useState<Billing | null>(null);

  const reloadLeads = useCallback(async () => {
    const data = await api<{ leads: Lead[] }>(LEADS_PATH).catch(() => null);
    if (data) setLeads(data.leads);
  }, []);
  const reloadConfig = useCallback(async () => {
    try {
      const data = await api<{ config: AppConfig }>("/crm/config");
      setConfig(data.config);
      setConfigError("");
    } catch (err) {
      setConfigError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api<{ user: User }>("/auth/me").catch(() => null);
      if (!me) return router.replace("/login");
      const list = await api<{ accounts: Account[]; active_account: Account }>("/crm/accounts");
      const stored = getAccountId();
      const current = list.accounts.find((a) => a.id === stored) || list.active_account;
      setAccountId(current.id);
      setAccounts(list.accounts);
      setAccount(current);
      setUser(me.user);
      reloadLeads();
      reloadConfig();
      api<{ billing: Billing }>("/crm/billing").then((d) => setBilling(d.billing)).catch(() => null);
    })();
  }, [router, reloadLeads, reloadConfig]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => !document.hidden && reloadLeads(), 20000);
    return () => clearInterval(timer);
  }, [user, reloadLeads]);

  if (!user || !account) return <p className="loading">Cargando…</p>;

  const waiting = (leads || []).filter((lead) => ownerOf(lead) === "waiting").length;
  const brand = config?.brand?.name || account.name || "Tu negocio";

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
  }

  return (
    <SessionContext.Provider value={{ user, account, leads, reloadLeads, config, configError, reloadConfig }}>
      <div className="app">
        <nav className="side" aria-label="Secciones">
          <div className="brand">
            <div className="logo">{initials(brand).toUpperCase()}</div>
            <div>
              <b>{brand}</b>
              <span>Tu asistente comercial</span>
            </div>
          </div>
          {[...NAV, ...(user.role === "super_admin" ? [AGENCY_NAV] : [])].map((item) => (
            <Link key={item.href} href={item.href} className="nav" aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
              {item.icon}
              <span className="lbl">{item.label}</span>
              <span className="lbl-short">{(item as { short?: string }).short || item.label}</span>
              {item.href === "/conversaciones" && waiting > 0 && <span className="count" aria-label={`${waiting} te esperan`}>{waiting}</span>}
            </Link>
          ))}
          <div className="spacer" />
          {user.role === "super_admin" && accounts.length > 1 && (
            <label className="account-select">
              Cuenta (solo agencia)
              <select
                className="i"
                value={account.id}
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
              </select>
            </label>
          )}
          <div className="me">
            <div className="avatar">{initials(user.display_name || user.email)}</div>
            <div>
              {user.display_name || user.email.split("@")[0]}
              <small>{user.email}</small>
            </div>
            {billing && billing.status !== "managed" && <Link className="logout" href="/facturacion">Plan y pago</Link>}
            <button className="logout" onClick={logout}>Salir</button>
          </div>
        </nav>
        <main>
          <BillingBanner billing={billing} />
          {children}
        </main>
      </div>
    </SessionContext.Provider>
  );
}
