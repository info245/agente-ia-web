"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Lead, Message } from "@/lib/types";
import { CHANNEL_LABELS, formatDate } from "@/lib/format";
import { useConfig } from "@/lib/use-config";
import { useSession } from "@/components/app-shell";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Conversation = { channel?: string; ai_status: string; inbox_status: string; assigned_to: string | null };
type Detail = { lead: Lead; messages: Message[]; conversation: Conversation | null };

const TEXT_FIELDS = [
  ["name", "Nombre"],
  ["email", "Email"],
  ["phone", "Teléfono"],
  ["company_name", "Empresa"],
  ["interest_service", "Servicio de interés"],
  ["budget_range", "Presupuesto"],
  ["main_goal", "Objetivo"],
  ["next_action", "Próxima acción"],
  ["assigned_to", "Responsable"],
] as const;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function LeadDetailPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useSession();
  const { config } = useConfig();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Detail>(`/crm/conversations/${conversationId}/messages`)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [conversationId]);

  if (error && !detail) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Cargando lead…</p>;

  const { lead, conversation } = detail;
  const messages = [...detail.messages]
    .filter((m) => m.content && (m.role === "user" || m.role === "assistant"))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const stages = config?.pipeline?.stages?.filter((s) => s.is_active !== false) || [];
  const aiPaused = conversation?.ai_status === "paused";

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch: Record<string, unknown> = Object.fromEntries(form.entries());
    patch.follow_up_at = patch.follow_up_at ? new Date(String(patch.follow_up_at)).toISOString() : null;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await api<{ lead: Lead }>(`/crm/leads/${lead.id}`, { method: "PATCH", body: patch });
      setDetail({ ...detail!, lead: { ...lead, ...data.lead } });
      setNotice("Cambios guardados.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setAiStatus(aiStatus: "paused" | "active") {
    setError("");
    try {
      const data = await api<{ conversation: Conversation }>(`/crm/conversations/${conversationId}/state`, {
        method: "PATCH",
        body: {
          ai_status: aiStatus,
          inbox_status: aiStatus === "paused" ? "open" : "pending",
          assigned_to: aiStatus === "paused" ? user.display_name || user.email || "Equipo" : null,
        },
      });
      setDetail({ ...detail!, conversation: data.conversation });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/leads" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden /> Leads
        </Link>
        <h1 className="text-xl font-semibold">{lead.name || lead.email || lead.phone || "Lead sin nombre"}</h1>
        <Badge variant="secondary">{CHANNEL_LABELS[conversation?.channel || ""] || conversation?.channel || "Web"}</Badge>
        {aiPaused && <Badge variant="outline">IA pausada · {conversation?.assigned_to}</Badge>}
      </div>
      {lead.summary && <p className="max-w-3xl text-sm text-muted-foreground">{lead.summary}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Gestión</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" key={lead.updated_at}>
              <div className="grid gap-1.5">
                <Label htmlFor="crm_status">Estado</Label>
                <NativeSelect id="crm_status" name="crm_status" defaultValue={lead.crm_status || ""}>
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label || s.key}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="follow_up_at">Seguimiento</Label>
                <Input id="follow_up_at" name="follow_up_at" type="datetime-local" defaultValue={toLocalInput(lead.follow_up_at)} />
              </div>
              {TEXT_FIELDS.map(([name, label]) => (
                <div key={name} className="grid gap-1.5">
                  <Label htmlFor={name}>{label}</Label>
                  <Input id={name} name={name} defaultValue={lead[name] || ""} />
                </div>
              ))}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="internal_notes">Notas internas</Label>
                <Textarea id="internal_notes" name="internal_notes" rows={4} defaultValue={lead.internal_notes || ""} />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit" disabled={saving || !stages.length}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
                {notice && <span className="text-sm text-muted-foreground">{notice}</span>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Conversación</CardTitle>
            {conversation &&
              (aiPaused ? (
                <Button size="sm" variant="outline" onClick={() => setAiStatus("active")}>
                  Reactivar IA
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setAiStatus("paused")}>
                  Tomar conversación
                </Button>
              ))}
          </CardHeader>
          <CardContent>
            <ol className="grid max-h-[70vh] gap-2 overflow-y-auto pr-1">
              {messages.map((m, i) => (
                <li
                  key={m.id || i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "justify-self-start bg-muted" : "justify-self-end bg-primary text-primary-foreground"
                  )}
                >
                  {m.content}
                  <div className="mt-1 text-[11px] opacity-70">{formatDate(m.created_at)}</div>
                </li>
              ))}
              {!messages.length && <li className="text-sm text-muted-foreground">Sin mensajes.</li>}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
