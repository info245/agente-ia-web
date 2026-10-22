"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { ROLE_OPTIONS, roleLabel } from "@/lib/format";
import type { User } from "@/lib/types";

type Msg = { kind: "ok" | "error" | "warn"; text: string } | null;

export default function EquipoPage() {
  const { user: me } = useSession();
  const [users, setUsers] = useState<User[] | null>(null);
  const [ownOnly, setOwnOnly] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", role: "sales" });
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(
    () =>
      api<{ users: User[]; settings: { sales_own_leads_only: boolean } }>("/crm/team")
        .then((d) => {
          setUsers(d.users);
          setOwnOnly(d.settings.sales_own_leads_only);
        })
        .catch((e) => setMsg({ kind: "error", text: e.message })),
    []
  );
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function act(fn: () => Promise<Msg | void>) {
    setMsg(null);
    try {
      const next = await fn();
      if (next) setMsg(next);
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    act(async () => {
      const r = await api<{ invite_sent: boolean; setup_url?: string }>("/crm/team", { method: "POST", body: form });
      setForm({ email: "", display_name: "", role: form.role });
      return r.invite_sent
        ? { kind: "ok", text: `Invitación enviada a ${form.email}.` }
        : { kind: "warn", text: `Usuario creado, pero el email no salió. Envíale este enlace: ${r.setup_url}` };
    });
  };
  const resend = (u: User) =>
    act(async () => {
      const r = await api<{ invite_sent: boolean; setup_url?: string }>(`/crm/team/${u.id}/invite`, { method: "POST" });
      return r.invite_sent ? { kind: "ok", text: `Invitación reenviada a ${u.email}.` } : { kind: "warn", text: `No salió el email. Enlace: ${r.setup_url}` };
    });
  const update = (u: User, body: { role?: string; status?: string }) => act(() => api(`/crm/team/${u.id}`, { method: "PATCH", body }).then(() => {}));
  const saveOwnOnly = (value: boolean) => act(() => api("/crm/team/settings", { method: "PUT", body: { sales_own_leads_only: value } }).then(() => {}));

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Equipo</h1>
          <p className="sub">Invita a tu equipo y decide qué puede hacer cada persona.</p>
        </div>
      </div>

      <div className="card" style={{ padding: "6px 16px 16px" }}>
        {!users && <p className="loading">Cargando…</p>}
        {users?.map((u) => {
          const self = u.id === me.id;
          return (
            <div className="todo" key={u.id} style={{ flexWrap: "wrap" }}>
              <div className="who"><b>{u.display_name || u.email}{self && " (tú)"}</b><span>{u.email}</span></div>
              <span className={`pill ${u.status === "active" ? "p-good" : u.status === "invited" ? "p-new" : "p-muted"}`}>{u.status === "active" ? "Activo" : u.status === "invited" ? "Invitado" : "Desactivado"}</span>
              {self ? (
                <span className="pill p-muted">{roleLabel(u.role)}</span>
              ) : (
                <select className="search" style={{ width: "auto" }} aria-label={`Rol de ${u.email}`} value={u.role === "client_admin" ? "owner" : u.role} onChange={(e) => update(u, { role: e.target.value })}>
                  {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              )}
              {!self && u.status === "invited" && <button className="btn small" onClick={() => resend(u)}>Reenviar invitación</button>}
              {!self && <button className="btn small" onClick={() => update(u, { status: u.status === "disabled" ? "active" : "disabled" })}>{u.status === "disabled" ? "Reactivar" : "Desactivar"}</button>}
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: 24 }}>Invitar a alguien</h2>
      <form onSubmit={invite} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="i" style={{ flex: "1 1 220px" }} type="email" required placeholder="email@tuempresa.com" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="i" style={{ flex: "1 1 180px" }} placeholder="Nombre" aria-label="Nombre" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <select className="i" style={{ flex: "0 1 180px" }} aria-label="Rol" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="btn primary">Enviar invitación</button>
      </form>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}

      <h2 style={{ marginTop: 24 }}>Qué puede hacer cada rol</h2>
      <ul className="sub" style={{ lineHeight: 1.7 }}>
        <li><b>Propietario:</b> todo, incluida la facturación y el equipo.</li>
        <li><b>Gestor:</b> todo salvo facturación y equipo (también el asistente y los canales).</li>
        <li><b>Comercial:</b> Conversaciones, Contactos, Agenda y Propuestas.</li>
        <li><b>Solo lectura:</b> ve lo mismo que un comercial, sin poder cambiar nada.</li>
      </ul>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <input type="checkbox" checked={ownOnly} disabled={!users} onChange={(e) => saveOwnOnly(e.target.checked)} />
        Los comerciales solo ven los contactos que tienen asignados
      </label>
    </section>
  );
}
