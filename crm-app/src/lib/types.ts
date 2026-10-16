export type Account = { id: string; name?: string; slug?: string };

export type User = {
  id: string;
  email: string;
  display_name?: string;
  role: "super_admin" | string;
  account_id?: string;
  account?: Account | null;
};

export type Message = { id?: string; role: string; content: string | null; created_at?: string };

export type Lead = {
  id: string;
  conversation_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  interest_service?: string | null;
  budget_range?: string | null;
  main_goal?: string | null;
  summary?: string | null;
  crm_status?: string | null;
  quote_status?: string | null;
  next_action?: string | null;
  follow_up_at?: string | null;
  internal_notes?: string | null;
  assigned_to?: string | null;
  lead_score?: number | null;
  created_at?: string;
  updated_at?: string;
  channel?: string;
  ai_status?: string;
  inbox_status?: string;
  last_message?: Message | null;
};

export type PipelineStage = { key: string; label?: string; is_active?: boolean };

export type AppConfig = {
  agent_engine?: "legacy" | "v2";
  agent?: { name?: string; policy?: string; handoff_when?: string; offer_meeting_when?: string };
  pipeline?: { stages?: PipelineStage[] };
  integrations?: {
    calendar?: {
      calendar_id?: string;
      google_connected_email?: string;
      google_refresh_token_configured?: boolean;
      connected_at?: string;
    };
  };
};
