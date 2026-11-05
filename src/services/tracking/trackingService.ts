// evo-jud-crm: funil de tráfego pago (backend: /api/v1/tracking/*).
import api from '../core/api';
import { extractData } from '../../utils/apiHelpers';

export type TrackingChannel =
  | 'meta' | 'google' | 'pago' | 'todos' | 'site' | 'instagram' | 'postiz' | 'openreply' | 'organico';

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  pct_top: number | null;
  pct_prev: number | null;
}

export interface FunnelData {
  channel: TrackingChannel;
  from: string;
  to: string;
  stages: FunnelStage[];
  ads: { spend_cents: number; impressions: number; clicks: number; platform_conversations: number } | null;
  revenue_cents: number;
  costs: {
    per_click_cents: number | null;
    per_conversation_cents: number | null;
    per_meeting_cents: number | null;
    per_contract_cents: number | null;
    roas: number | null;
  } | null;
  by_channel: Record<string, number>;
  site_clicks?: { organic: number; from_ads: number; by_code: Record<string, number> };
}

export interface CampaignsData {
  codes: { channel: string; code: string; stages: Record<string, number>; revenue_cents: number }[];
  ad_campaigns: {
    platform: string; campaign_id: string; campaign_name: string; spend_cents: number;
    impressions: number; clicks: number; conversations: number;
  }[];
}

export interface TrackingStatus {
  meta_insights: boolean;
  meta_capi: boolean;
  meta_last_sync_at: string | null;
  google_ads_customer_id: string | null;
  google_ingest: boolean;
  google_last_ingest_at: string | null;
  postiz: boolean;
  openreply: boolean;
  whatsapp_number: string | null;
  events: Record<string, number>;
}

export interface TrackingLink { channel: string; area?: string; code: string; text: string; url: string }

interface Params { channel: TrackingChannel; from: string; to: string }

class TrackingService {
  async funnel(params: Params): Promise<FunnelData> {
    return extractData<FunnelData>(await api.get('/tracking/funnel', { params }));
  }

  async campaigns(params: Params): Promise<CampaignsData> {
    return extractData<CampaignsData>(await api.get('/tracking/campaigns', { params }));
  }

  async status(): Promise<TrackingStatus> {
    return extractData<TrackingStatus>(await api.get('/tracking/status'));
  }

  async links(params: { channel?: string; area?: string; variant?: number; text?: string; number?: string }): Promise<TrackingLink[]> {
    return extractData<TrackingLink[]>(await api.get('/tracking/links', { params }));
  }
}

export const trackingService = new TrackingService();

export const brl = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? '—'
    : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('pt-BR'));

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-BR')}%`);
