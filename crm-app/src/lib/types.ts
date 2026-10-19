export type Account = { id: string; name?: string; slug?: string };

export type User = {
  id: string;
  email: string;
  display_name?: string;
  role: "super_admin" | string;
  account_id?: string;
  account?: Account | null;
};

export type Message = {
  id?: string;
  role: "user" | "assistant" | string;
  content: string | null;
  created_at?: string;
  metadata?: { sender?: string; author?: string } | null;
};

export type Lead = {
  id: string;
  conversation_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  business_type?: string | null;
  interest_service?: string | null;
  budget_range?: string | null;
  main_goal?: string | null;
  summary?: string | null;
  crm_status?: string | null;
  next_action?: string | null;
  internal_notes?: string | null;
  source_platform?: string | null;
  created_at?: string;
  updated_at?: string;
  channel?: string;
  ai_status?: string;
  inbox_status?: string;
  external_user_id?: string | null;
  last_message?: Message | null;
};

export type Conversation = { channel?: string; ai_status?: string; inbox_status?: string; assigned_to?: string | null };

export type PipelineStage = { key: string; label?: string; is_active?: boolean };

export type Offer = {
  category?: string;
  description?: string;
  url?: string;
  min_monthly_fee?: string;
  min_project_fee?: string;
  [key: string]: unknown;
};

export type Faq = { question: string; answer: string };

export type AppConfig = {
  agent_engine?: "legacy" | "v2";
  brand?: { name?: string; website_url?: string; primary_color?: string };
  agent?: {
    tone?: string;
    initial_message?: string;
    faq?: Faq[];
    meeting?: { days?: number[]; start_hour?: number; end_hour?: number; timezone?: string; duration_minutes?: number };
  };
  offers?: Record<string, Offer>;
  services?: Record<string, Offer>;
  contact?: { public_whatsapp_number?: string; support_email?: string };
  pipeline?: { stages?: PipelineStage[] };
  integrations?: {
    calendar?: { google_connected_email?: string; google_refresh_token_configured?: boolean; connected_at?: string };
  };
};

export type Booking = { id: string; conversation_id?: string | null; starts_at: string; attendee_name?: string | null };
