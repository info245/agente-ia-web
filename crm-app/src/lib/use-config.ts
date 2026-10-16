"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api<{ config: AppConfig }>("/crm/config")
      .then((data) => setConfig(data.config))
      .catch((err) => setError(err.message));
  }, []);
  useEffect(reload, [reload]);
  return { config, setConfig, error, reload };
}

export function stageLabel(config: AppConfig | null, key?: string | null) {
  if (!key) return "—";
  return config?.pipeline?.stages?.find((s) => s.key === key)?.label || key;
}
