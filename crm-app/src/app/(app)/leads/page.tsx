"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Lead } from "@/lib/types";
import { CHANNEL_LABELS, formatDate } from "@/lib/format";
import { stageLabel, useConfig } from "@/lib/use-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE = 200;
const DAY = 24 * 60 * 60 * 1000;
const DATE_RANGES: Record<string, number> = { today: 1, "7d": 7, "30d": 30 };

type LeadsResponse = { leads: Lead[]; pagination: { next_offset: number | null } };

export default function LeadsPage() {
  const { config } = useConfig();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");

  const [loadedAt, setLoadedAt] = useState(0);

  function fetchPage(offset: number) {
    return api<LeadsResponse>(`/crm/leads?limit=${PAGE}&offset=${offset}`)
      .then((data) => {
        setLeads((prev) => (offset ? [...prev, ...data.leads] : data.leads));
        setNextOffset(data.pagination.next_offset);
        setLoadedAt(Date.now());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchPage(0);
  }, []);

  function loadMore() {
    setLoading(true);
    fetchPage(nextOffset!);
  }

  // ponytail: filters run client-side over the loaded pages (as public-crm does); move them to the API past a few thousand leads.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since = DATE_RANGES[range] ? loadedAt - DATE_RANGES[range] * DAY : 0;
    return leads.filter((lead) => {
      if (channel !== "all" && lead.channel !== channel) return false;
      if (status !== "all" && lead.crm_status !== status) return false;
      if (since && new Date(lead.created_at || 0).getTime() < since) return false;
      if (!q) return true;
      return [lead.name, lead.email, lead.phone, lead.company_name, lead.interest_service].some((v) =>
        v?.toLowerCase().includes(q)
      );
    });
  }, [leads, query, channel, status, range, loadedAt]);

  const stages = config?.pipeline?.stages?.filter((s) => s.is_active !== false) || [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold">Leads</h1>
        <span className="text-sm text-muted-foreground">
          {filtered.length} de {leads.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Buscar"
          placeholder="Buscar nombre, email, teléfono…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-64"
        />
        <NativeSelect aria-label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Todos los canales</option>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos los estados</option>
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label || s.key}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Fecha" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="all">Cualquier fecha</option>
          <option value="today">Últimas 24 h</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
        </NativeSelect>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden lg:table-cell">Interés</TableHead>
              <TableHead className="hidden md:table-cell">Último mensaje</TableHead>
              <TableHead>Creado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((lead) => (
              <TableRow key={lead.id} className="relative">
                <TableCell>
                  <Link href={`/leads/${lead.conversation_id}`} className="font-medium after:absolute after:inset-0">
                    {lead.name || lead.email || lead.phone || "Sin nombre"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {[lead.company_name, lead.email, lead.phone].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell>{CHANNEL_LABELS[lead.channel || ""] || lead.channel}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{stageLabel(config, lead.crm_status)}</Badge>
                  {lead.ai_status === "paused" && (
                    <Badge variant="outline" className="ml-1">
                      IA pausada
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-48 truncate lg:table-cell">{lead.interest_service || "—"}</TableCell>
                <TableCell className="hidden max-w-72 truncate text-muted-foreground md:table-cell">
                  {lead.last_message?.content || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
              </TableRow>
            ))}
            {!loading && !filtered.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay leads con estos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando leads…</p>}
      {!loading && nextOffset !== null && (
        <Button variant="outline" className="justify-self-center" onClick={loadMore}>
          Cargar más
        </Button>
      )}
    </div>
  );
}
