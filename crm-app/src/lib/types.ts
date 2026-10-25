export type Account = { id: string; name?: string; slug?: string };

export type User = {
  id: string;
  email: string;
  display_name?: string;
  role: "super_admin" | string;
  account_id?: string;
  account?: Account | null;
  status?: string;
  // Lo que el rol permite (lo calcula el servidor): home, inbox, contacts, agenda, proposals, settings, delete, team, billing, write.
  permissions?: string[];
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
  interest_plan?: string | null;
  budget_range?: string | null;
  main_goal?: string | null;
  current_situation?: string | null;
  pain_points?: string | null;
  summary?: string | null;
  crm_status?: string | null;
  quote_status?: string | null;
  tags?: string[] | null;
  next_action?: string | null;
  internal_notes?: string | null;
  assigned_to?: string | null;
  source_platform?: string | null;
  consent?: boolean | null;
  consent_at?: string | null;
  whatsapp_consent?: boolean | null;
  marketing_consent?: boolean | null;
  created_at?: string;
  updated_at?: string;
  channel?: string;
  ai_status?: string;
  inbox_status?: string;
  external_user_id?: string | null;
  last_message?: Message | null;
};

export type Conversation = { channel?: string; ai_status?: string; inbox_status?: string; assigned_to?: string | null };

export type PipelineStage = { key: string; label?: string; is_active?: boolean; category?: "open" | "won" | "lost"; color?: string; position?: number };

export type Offer = {
  category?: string;
  description?: string;
  url?: string;
  min_monthly_fee?: string;
  min_project_fee?: string;
  pricing_plans?: { plan?: string; notes?: string; monthly_price?: string; setup?: string; annual_price?: string }[];
  [key: string]: unknown;
};

export type Faq = { question: string; answer: string };

export type Meeting = {
  days?: number[]; start_hour?: number; end_hour?: number; timezone?: string; duration_minutes?: number;
  ranges?: { start: string; end: string }[]; min_notice_hours?: number; max_days_ahead?: number; buffer_minutes?: number; slot_step_minutes?: number;
  confirmation_email?: boolean; reminders?: number[]; reminder_template_name?: string; reminder_template_language?: string;
};

export type FlowStep = {
  active?: boolean;
  channel?: string;
  delay_value?: string;
  delay_unit?: string;
  template_key?: string;
  whatsapp_template_name?: string;
  whatsapp_template_language?: string;
};
export type Flow = { label?: string; description?: string; enabled?: boolean; contact_chat_leads?: boolean; steps?: FlowStep[] };
export type MessageTemplate = { channel?: string; label?: string; subject?: string; body?: string };

export type AppConfig = {
  agent_engine?: "legacy" | "v2";
  brand?: { name?: string; website_url?: string; primary_color?: string };
  agent?: {
    tone?: string;
    initial_message?: string;
    faq?: Faq[];
    handoff_when?: string;
    offer_meeting_when?: string;
    meeting?: Meeting;
  };
  business_profile?: { value_proposition?: string; audience?: string; human_team_label?: string };
  notifications?: { email_to?: string; notify_new_lead?: boolean };
  knowledge_sources?: { website_urls?: string[]; internal_notes?: string; spreadsheet_mapping?: string };
  automation_flows?: Record<string, Flow>;
  message_templates?: Record<string, MessageTemplate>;
  offers?: Record<string, Offer>;
  services?: Record<string, Offer>;
  contact?: { public_whatsapp_number?: string; support_email?: string };
  pipeline?: { stages?: PipelineStage[] };
  privacy?: Privacy;
  integrations?: {
    calendar?: { google_connected_email?: string; google_refresh_token_configured?: boolean; connected_at?: string };
    whatsapp?: { form_autocontact_enabled?: boolean; intro_template_name?: string; intro_template_language?: string };
  };
};

export type Booking = {
  id: string;
  conversation_id?: string | null;
  lead_id?: string | null;
  starts_at: string;
  ends_at?: string;
  timezone?: string;
  attendee_name?: string | null;
  attendee_email?: string | null;
};

export type WhatsAppTemplate = { name: string; language: string; category: string; header: string; body: string; footer: string; params: number; sendable: boolean };

export type Billing = {
  status: "managed" | "trial" | "active" | "past_due" | "paused";
  agent_active: boolean;
  reason?: "unpaid" | "canceled" | "trial_ended";
  plan_key?: string;
  has_customer?: boolean;
  trial_ends_at?: string | null;
  grace_ends_at?: string;
  period_end?: string | null;
  cancel_at_period_end?: boolean;
  days_left?: number | null;
  subscribed?: boolean;
};
export type BillingPlan = { key: string; name: string; price_label?: string; description?: string };
export type Onboarding = { steps: { key: string; label: string; done: boolean }[]; completed: boolean; completed_at: string | null };

export type Privacy = { notice_text?: string; policy_url?: string; retention_months?: number; retention_action?: "anonymize" | "delete" };

export type ConsentRecord = { id: string; channel?: string | null; created_at: string; payload?: { granted?: boolean | null; basis?: string; text?: string; policy_url?: string; source?: string } | null };
export type AccessLogEntry = { action: "view" | "export" | "delete" | "anonymize"; actor_email?: string | null; created_at: string; details?: Record<string, unknown> };

// Plantilla de propuesta por servicio (Propuestas → Plantillas).
export type QuoteTemplate = {
  id?: string; name: string; service: string; title: string; billing_type: string; tax_rate: number;
  items: { concept: string; quantity: number; unit_price: number }[]; summary: string; scope: string; body: string; assumptions: string;
};
