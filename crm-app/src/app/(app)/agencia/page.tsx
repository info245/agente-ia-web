"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api, setAccountId } from "@/lib/api";

type AccountRow = {
  id: string;
  slug: string;
  name: string;
  status?: string;
  plan?: string;
  agent_engine?: string | null;
  calendar_connected?: boolean;
  whatsapp?: { configured?: boolean; display_phone_number?: string } | null;
  leads_30d?: number;
  setup_health?: { progress?: string; next_step?: string };
};
type User = { id: string; email: string; display_name?: string; role: string; status: string };
type WaChannel = { configured?: boolean; status?: string; phone_number_id?: string; waba_id?: string; display_phone_number?: string; verified_name?: string; access_token_masked?: string };
type AgentSettings = { agent_engine: string; policy: string; prompt_additions: string; allowed_domains: string[] };

const API_BASE = "https://tmedia-global-ai.onrender.com";
const TABS = [["datos", "Datos"], ["usuarios", "Usuarios"], ["whatsapp", "WhatsApp"], ["agente", "Agente"], ["formularios", "Formularios"]] as const;
type Tab = (typeof TABS)[number][0];

export default function AgenciaPage() {
  const { user } = useSession();
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ accounts: AccountRow[] }>("/admin/overview");
      setAccounts(data.accounts);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (user.role !== "super_admin") return <section className="page"><p className="alert error">Esta sección es solo para la agencia.</p></section>;
  if (error) return <section className="page"><p className="alert error">{error}</p></section>;
  if (!accounts) return <p className="loading">Cargando cuentas…</p>;

  const account = accounts.find((a) => a.id === selected) || null;

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Consola de agencia</h1>
          <p className="sub">Tus clientes, sus usuarios y lo técnico que ellos no ven</p>
        </div>
        <button className="btn primary" onClick={() => { setCreating(true); setSelected(""); }}>+ Nueva cuenta</button>
      </div>

      {creating && <NewAccount onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await load(); setSelected(id); }} />}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>{["Cliente", "Estado", "Motor", "WhatsApp", "Calendario", "Leads 30 días", "Configuración"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} onClick={() => { setSelected(a.id === selected ? "" : a.id); setCreating(false); }} aria-selected={a.id === selected} tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(a.id)}>
                <td><b>{a.name}</b><br /><small style={{ color: "var(--muted)" }}>{a.slug}</small></td>
                <td><span className={`pill ${a.status === "active" ? "p-good" : "p-muted"}`}>{({ active: "Activa", trial: "Prueba", paused: "Pausada" } as Record<string, string>)[a.status || ""] || a.status || "—"}</span></td>
                <td>{a.agent_engine ? <span className={`pill ${a.agent_engine === "v2" ? "p-ai" : "p-muted"}`}>{a.agent_engine === "v2" ? "v2" : "antiguo"}</span> : "—"}</td>
                <td>{a.whatsapp?.configured ? <span className="pill p-good">{a.whatsapp.display_phone_number || "Conectado"}</span> : <span className="pill p-muted">No</span>}</td>
                <td>{a.calendar_connected ? <span className="pill p-good">Sí</span> : <span className="pill p-muted">No</span>}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{a.leads_30d ?? "—"}</td>
                <td><small>{a.setup_health?.progress || ""} {a.setup_health?.next_step && a.setup_health.next_step !== "Listo para publicar" ? `· falta ${a.setup_health.next_step.toLowerCase()}` : ""}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {account && <AccountDetail key={account.id} account={account} onChanged={load} onDeleted={async () => { setSelected(""); await load(); }} />}
    </section>
  );
}

function NewAccount({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", slug: "", admin_email: "", admin_display_name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slugify = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ account: { id: string } }>("/admin/accounts", {
        method: "POST",
        body: { ...form, slug: form.slug || slugify(form.name), admin_send_invite: Boolean(form.admin_email) },
      });
      await onCreated(data.account.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card block" onSubmit={submit} style={{ marginBottom: 14 }}>
      <h2>Nueva cuenta</h2>
      <p className="hint">Se crea con su asistente vacío. Si pones el email del cliente, le llega una invitación para crear su contraseña.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <label className="f">Nombre del negocio<input className="i" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || "" })} /></label>
        <label className="f">Identificador (para el chat)<input className="i" placeholder={slugify(form.name) || "clinica-sol"} value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} /></label>
        <label className="f">Email del cliente<input className="i" type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></label>
        <label className="f">Nombre del cliente<input className="i" value={form.admin_display_name} onChange={(e) => setForm({ ...form, admin_display_name: e.target.value })} /></label>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  );
}

function AccountDetail({ account, onChanged, onDeleted }: { account: AccountRow; onChanged: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("datos");
  const router = useRouter();
  return (
    <div className="card block" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2>{account.name}</h2>
        <button className="btn" onClick={() => { setAccountId(account.id); router.push("/inicio"); window.setTimeout(() => window.location.reload(), 50); }}>Abrir su CRM →</button>
      </div>
      <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
        {TABS.map(([key, label]) => <button key={key} role="tab" className="chip" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === "datos" && <AccountData account={account} onChanged={onChanged} onDeleted={onDeleted} />}
      {tab === "usuarios" && <AccountUsers account={account} />}
      {tab === "whatsapp" && <AccountWhatsApp account={account} onChanged={onChanged} />}
      {tab === "agente" && <AccountAgent account={account} onChanged={onChanged} />}
      {tab === "formularios" && <AccountForms account={account} />}
    </div>
  );
}

function Status({ msg }: { msg: { kind: "ok" | "error" | "warn"; text: string } | null }) {
  return msg ? <p className={`alert ${msg.kind}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p> : null;
}

function AccountData({ account, onChanged, onDeleted }: { account: AccountRow; onChanged: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [form, setForm] = useState({ name: account.name, status: account.status || "active", plan: account.plan || "starter" });
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save() {
    try {
      await api(`/admin/accounts/${account.id}`, { method: "PATCH", body: form });
      setMsg({ kind: "ok", text: "Guardado." });
      await onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function remove() {
    try {
      await api(`/admin/accounts/${account.id}`, { method: "DELETE" });
      await onDeleted();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <label className="f">Nombre<input className="i" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="f">Estado
          <select className="i" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="trial">Prueba</option><option value="active">Activa</option><option value="paused">Pausada</option>
          </select>
        </label>
        <label className="f">Plan<input className="i" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></label>
        <label className="f">Identificador<input className="i" value={account.slug} disabled /></label>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={save}>Guardar</button>
      <Status msg={msg} />
      <details style={{ marginTop: 18 }}>
        <summary style={{ cursor: "pointer", color: "var(--bad)", fontWeight: 600 }}>Eliminar cuenta</summary>
        <p className="hint" style={{ marginTop: 8 }}>Borra la cuenta, su configuración y sus usuarios. Escribe <b>{account.slug}</b> para confirmar.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="i" style={{ maxWidth: 260 }} aria-label="Confirmación" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="btn" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} disabled={confirm !== account.slug} onClick={remove}>Eliminar definitivamente</button>
        </div>
      </details>
    </>
  );
}

function AccountUsers({ account }: { account: AccountRow }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const load = useCallback(() => api<{ users: User[] }>(`/admin/users?account_id=${encodeURIComponent(account.id)}`).then((d) => setUsers(d.users)).catch((e) => setMsg({ kind: "error", text: e.message })), [account.id]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ invite_sent: boolean; setup_url?: string }>("/admin/users", { method: "POST", body: { ...form, account_id: account.id } });
      setForm({ email: "", display_name: "" });
      setMsg(r.invite_sent ? { kind: "ok", text: `Invitación enviada a ${form.email}.` } : { kind: "warn", text: `Usuario creado, pero el email no salió. Envíale este enlace: ${r.setup_url}` });
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function resend(u: User) {
    try {
      const r = await api<{ invite_sent: boolean; setup_url?: string }>(`/admin/users/${u.id}/invite`, { method: "POST" });
      setMsg(r.invite_sent ? { kind: "ok", text: `Invitación reenviada a ${u.email}.` } : { kind: "warn", text: `No salió el email. Enlace: ${r.setup_url}` });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function toggle(u: User) {
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body: { status: u.status === "disabled" ? "active" : "disabled" } });
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      {!users && <p className="loading">Cargando…</p>}
      {users?.length === 0 && <p className="empty">Esta cuenta no tiene usuarios todavía.</p>}
      {users?.map((u) => (
        <div className="todo" key={u.id}>
          <div className="who"><b>{u.display_name || u.email}</b><span>{u.email}</span></div>
          <span className={`pill ${u.status === "active" ? "p-good" : u.status === "invited" ? "p-new" : "p-muted"}`}>{u.status === "active" ? "Activo" : u.status === "invited" ? "Invitado" : "Desactivado"}</span>
          {u.status !== "disabled" && <button className="btn small" onClick={() => resend(u)}>Reenviar invitación</button>}
          <button className="btn small" onClick={() => toggle(u)}>{u.status === "disabled" ? "Reactivar" : "Desactivar"}</button>
        </div>
      ))}
      <form onSubmit={invite} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input className="i" style={{ flex: "1 1 220px" }} type="email" required placeholder="email@cliente.com" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="i" style={{ flex: "1 1 180px" }} placeholder="Nombre" aria-label="Nombre" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <button className="btn primary">Invitar usuario</button>
      </form>
      <Status msg={msg} />
    </>
  );
}

function AccountWhatsApp({ account, onChanged }: { account: AccountRow; onChanged: () => Promise<void> }) {
  const q = `account_id=${encodeURIComponent(account.id)}`;
  const [channel, setChannel] = useState<WaChannel | null>(null);
  const [form, setForm] = useState({ phone_number_id: "", business_account_id: "", access_token: "", display_phone_number: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ channel: WaChannel }>(`/crm/integrations/whatsapp/channel?${q}`).then((d) => setChannel(d.channel)).catch((e) => setMsg({ kind: "error", text: e.message })), [q]);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ kind: "ok", text: await fn() });
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      {channel?.configured ? (
        <div className="faq-row">
          <b>{channel.display_phone_number || channel.phone_number_id} {channel.verified_name ? `· ${channel.verified_name}` : ""}</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Phone Number ID {channel.phone_number_id} · WABA {channel.waba_id || "—"} · token {channel.access_token_masked}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small" disabled={busy} onClick={() => run(async () => { const r = await api<{ channel: { display_phone_number?: string; verified_name?: string } }>(`/crm/integrations/whatsapp/test?${q}`, { method: "POST", body: {} }); return `Meta responde: ${r.channel.display_phone_number} ${r.channel.verified_name || ""}`; })}>Probar conexión</button>
            <button className="btn small" disabled={busy} onClick={() => run(async () => { await api(`/crm/integrations/whatsapp/channel?${q}`, { method: "DELETE" }); return "WhatsApp desconectado."; })}>Desconectar</button>
          </div>
        </div>
      ) : (
        <p className="hint">Sin WhatsApp conectado. Pega los datos del número desde Meta (WhatsApp Manager → Configuración de la API).</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 8 }}>
        <label className="f">Phone Number ID<input className="i" value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value.trim() })} /></label>
        <label className="f">WhatsApp Business Account ID<input className="i" value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value.trim() })} /></label>
        <label className="f">Número visible<input className="i" placeholder="+34 600 000 000" value={form.display_phone_number} onChange={(e) => setForm({ ...form, display_phone_number: e.target.value })} /></label>
        <label className="f">Token de acceso permanente<input className="i" type="password" autoComplete="off" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value.trim() })} /></label>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !form.phone_number_id || !form.business_account_id || !form.access_token}
        onClick={() => run(async () => { await api(`/crm/integrations/whatsapp/channel?${q}`, { method: "PUT", body: form }); setForm({ phone_number_id: "", business_account_id: "", access_token: "", display_phone_number: "" }); return "Número guardado. Pulsa «Probar conexión»."; })}>
        {channel?.configured ? "Reemplazar número" : "Conectar número"}
      </button>
      <p className="hint" style={{ marginTop: 12 }}>
        En la app de Meta, el webhook debe apuntar a <code>{API_BASE}/webhooks/whatsapp</code> con el token de verificación de Render (<code>WHATSAPP_VERIFY_TOKEN</code>) y la suscripción a <code>messages</code>.
      </p>
      <Status msg={msg} />
    </>
  );
}

function AccountAgent({ account, onChanged }: { account: AccountRow; onChanged: () => Promise<void> }) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [domains, setDomains] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<AgentSettings>(`/admin/accounts/${account.id}/agent`)
      .then((d) => { setSettings(d); setDomains((d.allowed_domains || []).join(", ")); })
      .catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [account.id]);

  if (!settings) return msg ? <Status msg={msg} /> : <p className="loading">Cargando…</p>;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ version: number }>(`/admin/accounts/${account.id}/agent`, { method: "POST", body: { ...settings, allowed_domains: domains } });
      setMsg({ kind: "ok", text: `Publicado (versión ${r.version}).` });
      await onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      <label className="f">Motor del agente</label>
      <div className="tones">
        <button className="chip" aria-pressed={settings.agent_engine === "v2"} onClick={() => setSettings({ ...settings, agent_engine: "v2" })}>v2 (IA con herramientas)</button>
        <button className="chip" aria-pressed={settings.agent_engine !== "v2"} onClick={() => setSettings({ ...settings, agent_engine: "legacy" })}>Antiguo</button>
      </div>
      <label className="f" htmlFor="policy">Política del agente (solo agencia)</label>
      <textarea className="i" id="policy" rows={8} value={settings.policy} onChange={(e) => setSettings({ ...settings, policy: e.target.value })} placeholder="Reglas propias de este cliente: qué no prometer, cómo tratar ciertos casos…" />
      <label className="f" htmlFor="extra">Instrucciones extra</label>
      <textarea className="i" id="extra" rows={3} value={settings.prompt_additions} onChange={(e) => setSettings({ ...settings, prompt_additions: e.target.value })} />
      <label className="f" htmlFor="domains">Webs donde puede funcionar el chat</label>
      <input className="i" id="domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="clinicasol.com, www.clinicasol.com" />
      <button className="btn primary" style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? "Publicando…" : "Guardar y publicar"}</button>
      <Status msg={msg} />
    </>
  );
}

function AccountForms({ account }: { account: AccountRow }) {
  const endpoint = `${API_BASE}/api/integrations/external-lead`;
  const body = JSON.stringify({ account_slug: account.slug, source_platform: "fb", source_form_name: "Nombre del formulario", external_user_id: "{{id del lead}}", field_data: "{{field_data del lead}}", consent: true, auto_start: true }, null, 2);
  return (
    <>
      <p className="hint">Cómo enviar a este cliente los leads de Meta, Google o cualquier formulario (por ejemplo desde n8n):</p>
      <div className="faq-row"><b>URL</b><code style={{ overflowWrap: "anywhere" }}>POST {endpoint}</code></div>
      <div className="faq-row">
        <b>Cabeceras</b>
        <code>x-integrations-secret: (valor de INTEGRATIONS_SECRET en Render, servicio tmedia-global-ai)</code>
        <code>Idempotency-Key: meta:lead:(id del lead)</code>
      </div>
      <div className="faq-row"><b>Cuerpo (Meta Lead Ads)</b><pre className="code" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{body}</pre></div>
      <p className="hint">El lead aparece en Conversaciones al momento. Si tiene teléfono y consentimiento, el asistente le escribe por WhatsApp con la plantilla configurada.</p>
    </>
  );
}
