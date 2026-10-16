"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useConfig } from "@/lib/use-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Tabs still served by the current CRM until they are ported.
const LEGACY_TABS = [
  ["identidad", "Identidad y tono"],
  ["estrategia", "Estrategia y acciones"],
  ["conocimiento", "Conocimiento"],
  ["plantillas", "Plantillas"],
  ["seguimientos", "Seguimientos"],
  ["etapas", "Etapas del CRM"],
  ["web", "Importar desde la web"],
] as const;

const POLICY_FIELDS = [
  ["policy", "Política del agente", "Reglas propias de este cliente: producto, precios, límites, seguridad…", 14],
  ["handoff_when", "Cuándo pasar a una persona", "Ej.: cuando pidan hablar con alguien del equipo.", 3],
  ["offer_meeting_when", "Cuándo ofrecer reunión", "Ej.: cuando quiera avanzar y haya calendario conectado.", 3],
] as const;

type PolicyKey = (typeof POLICY_FIELDS)[number][0];

function errorText(err: unknown) {
  const blockers = (err as ApiError).data?.readiness?.blockers as unknown[] | undefined;
  return [String((err as Error).message), ...(blockers || []).map((b) => (b as { message?: string }).message || String(b))]
    .filter(Boolean)
    .join(" · ");
}

export default function AgentePage() {
  const { config, setConfig, error: loadError } = useConfig();
  const [busy, setBusy] = useState("");
  const searchParams = useSearchParams();
  // Back from Google: /agente?calendar_oauth=connected|error&calendar_oauth_message=…
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(() => {
    const result = searchParams.get("calendar_oauth");
    if (!result) return null;
    const message = searchParams.get("calendar_oauth_message") || "";
    return result === "connected"
      ? { tone: "ok", text: `Google Calendar conectado${message ? ` (${message})` : ""}.` }
      : { tone: "error", text: message || "No se pudo conectar Google Calendar." };
  });

  useEffect(() => {
    if (searchParams.get("calendar_oauth")) window.history.replaceState(null, "", "/agente");
  }, [searchParams]);

  if (loadError) return <p role="alert" className="text-sm text-destructive">{loadError}</p>;
  if (!config) return <p className="text-sm text-muted-foreground">Cargando configuración…</p>;

  const agent = config.agent || {};
  const calendar = config.integrations?.calendar || {};
  const calendarConnected = Boolean(calendar.google_refresh_token_configured);

  function patchAgent(key: PolicyKey, value: string) {
    setConfig({ ...config!, agent: { ...agent, [key]: value } });
  }

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setStatus(null);
    try {
      setStatus({ tone: "ok", text: await action() });
    } catch (err) {
      setStatus({ tone: "error", text: errorText(err) });
    } finally {
      setBusy("");
    }
  }

  const saveDraft = () =>
    run("save", async () => {
      const data = await api<{ config: AppConfig }>("/crm/config", {
        method: "POST",
        body: {
          agent_engine: config.agent_engine,
          agent: { policy: agent.policy, handoff_when: agent.handoff_when, offer_meeting_when: agent.offer_meeting_when },
          change_summary: "Agente v2 editado desde la app nueva",
        },
      });
      setConfig(data.config);
      return "Borrador guardado. Publica para aplicarlo al agente en producción.";
    });

  const publish = () =>
    run("publish", async () => {
      await api("/crm/config/publish-agent", { method: "POST", body: { change_summary: "Publicado desde la app nueva" } });
      return "Agente publicado.";
    });

  const connectCalendar = () =>
    run("calendar", async () => {
      const data = await api<{ auth_url: string }>("/crm/integrations/calendar/google/connect-url", {
        method: "POST",
        body: { return_to: "app" },
      });
      window.location.href = data.auth_url;
      return "Redirigiendo a Google…";
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Configuración del agente</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={Boolean(busy)}>
            {busy === "save" ? "Guardando…" : "Guardar borrador"}
          </Button>
          <Button onClick={publish} disabled={Boolean(busy)}>
            {busy === "publish" ? "Publicando…" : "Publicar"}
          </Button>
        </div>
      </div>

      {status && (
        <p role="status" className={status.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {status.text}
        </p>
      )}

      <Tabs defaultValue="motor">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="motor">Agente v2</TabsTrigger>
          <TabsTrigger value="canales">Canales y conexiones</TabsTrigger>
          {LEGACY_TABS.map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="motor" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Motor y política</CardTitle>
              <CardDescription>
                El motor v2 responde con herramientas y sigue esta política. El cambio se aplica al publicar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-center gap-3">
                <Switch
                  id="agent_engine"
                  checked={config.agent_engine === "v2"}
                  onCheckedChange={(checked) => setConfig({ ...config, agent_engine: checked ? "v2" : "legacy" })}
                />
                <Label htmlFor="agent_engine">Usar motor v2</Label>
                <Badge variant={config.agent_engine === "v2" ? "default" : "outline"}>
                  {config.agent_engine === "v2" ? "v2" : "legacy"}
                </Badge>
              </div>
              {POLICY_FIELDS.map(([key, label, hint, rows]) => (
                <div key={key} className="grid gap-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                  <Textarea
                    id={key}
                    rows={rows}
                    value={agent[key] || ""}
                    onChange={(e) => patchAgent(key, e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="canales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-5" aria-hidden /> Google Calendar
              </CardTitle>
              <CardDescription>
                Con el calendario conectado, el agente consulta huecos libres y reserva reuniones.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {calendarConnected ? (
                <Badge>Conectado{calendar.google_connected_email ? ` · ${calendar.google_connected_email}` : ""}</Badge>
              ) : (
                <Badge variant="outline">Sin conectar</Badge>
              )}
              {calendar.connected_at && (
                <span className="text-xs text-muted-foreground">desde {formatDate(calendar.connected_at)}</span>
              )}
              <Button onClick={connectCalendar} disabled={Boolean(busy)} variant={calendarConnected ? "outline" : "default"}>
                {busy === "calendar" ? "Abriendo Google…" : calendarConnected ? "Reconectar" : "Conectar Google Calendar"}
              </Button>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            WhatsApp, email y formularios siguen en el CRM actual por ahora.
          </p>
        </TabsContent>

        {LEGACY_TABS.map(([value, label]) => (
          <TabsContent key={value} value={value} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
                <CardDescription>Esta sección todavía se edita en el CRM actual.</CardDescription>
              </CardHeader>
              {process.env.NEXT_PUBLIC_LEGACY_CRM_URL && (
                <CardContent>
                  <a className="text-sm underline" href={process.env.NEXT_PUBLIC_LEGACY_CRM_URL}>
                    Abrir el CRM actual
                  </a>
                </CardContent>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
