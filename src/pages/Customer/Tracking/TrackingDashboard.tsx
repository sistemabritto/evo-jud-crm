// evo-jud-crm: painel de tráfego pago. Funil do anúncio ao pagamento, por origem.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@evoapi/design-system';
import { Loader2, RefreshCw, Settings2 } from 'lucide-react';
import {
  brl, num, pct, trackingService,
  type CampaignsData, type FunnelData, type TrackingChannel, type TrackingStatus,
} from '@/services/tracking/trackingService';

const MAIN: { key: TrackingChannel; label: string }[] = [
  { key: 'meta', label: 'Meta' },
  { key: 'google', label: 'Google' },
  { key: 'pago', label: 'Meta + Google' },
  { key: 'todos', label: 'Todas as origens' },
];
const ORGANIC: { key: TrackingChannel; label: string }[] = [
  { key: 'site', label: 'Site' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'postiz', label: 'Postiz' },
  { key: 'openreply', label: 'OpenReply' },
  { key: 'organico', label: 'Direto / sem código' },
];
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries([...MAIN, ...ORGANIC].map((c) => [c.key, c.label]));
const STAGE_SHORT: Record<string, string> = {
  conversa_iniciada: 'Conversas',
  link_agendamento_enviado: 'Link agenda',
  reuniao_agendada: 'Reuniões',
  contrato_assinado: 'Contratos',
  pagamento_efetuado: 'Pagos',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

export default function TrackingDashboard() {
  const [channel, setChannel] = useState<TrackingChannel>('pago');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignsData | null>(null);
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { channel, from, to };
      const [f, c] = await Promise.all([trackingService.funnel(params), trackingService.campaigns(params)]);
      setFunnel(f);
      setCampaigns(c);
    } catch {
      setError('Não foi possível carregar o funil.');
    } finally {
      setLoading(false);
    }
  }, [channel, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { trackingService.status().then(setStatus).catch(() => setStatus(null)); }, []);

  const preset = (days: number) => { setFrom(daysAgo(days)); setTo(iso(new Date())); };
  const conversations = funnel?.stages.find((s) => s.key === 'conversa_iniciada')?.value ?? 0;
  const contracts = funnel?.stages.find((s) => s.key === 'contrato_assinado')?.value ?? 0;
  const meetings = funnel?.stages.find((s) => s.key === 'reuniao_agendada')?.value ?? 0;
  const paidView = channel === 'meta' || channel === 'google' || channel === 'pago';
  const missing = useMemo(() => {
    if (!status) return [];
    const m: string[] = [];
    if ((channel === 'meta' || channel === 'pago') && !status.meta_insights) m.push('Meta Ads (gasto e cliques)');
    if ((channel === 'google' || channel === 'pago') && !status.google_ingest) m.push('Google Ads (script da conta)');
    return m;
  }, [status, channel]);

  const kpis = [
    { label: 'Investimento', value: funnel?.ads ? brl(funnel.ads.spend_cents) : '—' },
    { label: 'Cliques nos anúncios', value: funnel?.ads ? num(funnel.ads.clicks) : '—' },
    { label: 'Cliques no WhatsApp do site (orgânico)', value: num(funnel?.site_clicks?.organic ?? 0) },
    { label: 'Conversas', value: num(conversations) },
    { label: 'Custo por conversa', value: brl(funnel?.costs?.per_conversation_cents) },
    { label: 'Reuniões', value: num(meetings) },
    { label: 'Custo por reunião', value: brl(funnel?.costs?.per_meeting_cents) },
    { label: 'Contratos', value: num(contracts) },
    { label: 'Custo por contrato', value: brl(funnel?.costs?.per_contract_cents) },
    { label: 'Receita recebida', value: brl(funnel?.revenue_cents ?? 0) },
    { label: 'ROAS', value: funnel?.costs?.roas != null ? `${funnel.costs.roas.toLocaleString('pt-BR')}x` : '—' },
  ];

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tráfego</h1>
          <p className="text-sm text-muted-foreground">Do clique no anúncio ao pagamento, por origem do contato.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/admin/tracking"><Settings2 className="h-4 w-4 mr-1" />Conexões</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="inline-flex rounded-lg border p-1 bg-muted/40">
          {MAIN.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChannel(c.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${channel === c.key ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-muted'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ORGANIC.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChannel(c.key)}
              className={`px-2.5 py-1 text-xs rounded-full border ${channel === c.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 ml-auto">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant="ghost" size="sm" onClick={() => preset(d)}>{d} dias</Button>
          ))}
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
          </div>
        </div>
      </div>

      {paidView && missing.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm">
          Sem dados de anúncio de: {missing.join(' e ')}. As etapas do CRM já aparecem; gasto e cliques entram quando você conectar em{' '}
          <Link className="underline" to="/settings/admin/tracking">Configurações › Admin › Tracking</Link>.
        </div>
      )}
      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="text-xl font-semibold mt-1">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Funil · {CHANNEL_LABEL[channel]} · {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {funnel?.stages.map((s) => (
            <div key={s.key} className="grid grid-cols-12 items-center gap-3">
              <div className="col-span-3 text-sm">{s.label}</div>
              <div className="col-span-6">
                <div className="h-7 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary/80 flex items-center justify-end pr-2 text-xs text-primary-foreground font-medium transition-all"
                    style={{ width: `${Math.max(s.pct_top ?? 0, s.value > 0 ? 4 : 0)}%` }}
                  >
                    {(s.pct_top ?? 0) >= 12 ? num(s.value) : ''}
                  </div>
                </div>
              </div>
              <div className="col-span-1 text-right font-semibold">{num(s.value)}</div>
              <div className="col-span-2 text-right text-xs text-muted-foreground">
                {s.pct_prev !== null ? <>{pct(s.pct_prev)} da etapa anterior<br /></> : null}
                {pct(s.pct_top)} do topo
              </div>
            </div>
          ))}
          {!loading && funnel && funnel.stages.every((s) => s.value === 0) && (
            <p className="text-sm text-muted-foreground">Nenhum contato com essa origem no período.</p>
          )}
        </CardContent>
      </Card>

      {funnel && Object.keys(funnel.by_channel).length > 0 && channel === 'todos' && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(funnel.by_channel).map(([k, v]) => (
            <Badge key={k} variant="secondary">{CHANNEL_LABEL[k] ?? k}: {num(v)}</Badge>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Por código de campanha (CRM)</CardTitle></CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Origem</th><th>Código</th>
                  {Object.values(STAGE_SHORT).map((l) => <th key={l} className="text-right">{l}</th>)}
                  <th className="text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {campaigns?.codes.map((c) => (
                  <tr key={`${c.channel}-${c.code}`} className="border-t">
                    <td className="py-1">{CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                    <td>{c.code}</td>
                    {Object.keys(STAGE_SHORT).map((s) => <td key={s} className="text-right">{num(c.stages[s] ?? 0)}</td>)}
                    <td className="text-right">{brl(c.revenue_cents)}</td>
                  </tr>
                ))}
                {campaigns && campaigns.codes.length === 0 && (
                  <tr><td colSpan={8} className="py-2 text-muted-foreground">Sem contatos no período.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Por campanha (plataforma)</CardTitle></CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Campanha</th><th className="text-right">Gasto</th><th className="text-right">Impressões</th>
                  <th className="text-right">Cliques</th><th className="text-right">Conversas*</th>
                </tr>
              </thead>
              <tbody>
                {campaigns?.ad_campaigns.map((c) => (
                  <tr key={`${c.platform}-${c.campaign_id}`} className="border-t">
                    <td className="py-1"><Badge variant="outline" className="mr-1">{c.platform === 'meta' ? 'Meta' : 'Google'}</Badge>{c.campaign_name || c.campaign_id}</td>
                    <td className="text-right">{brl(c.spend_cents)}</td>
                    <td className="text-right">{num(c.impressions)}</td>
                    <td className="text-right">{num(c.clicks)}</td>
                    <td className="text-right">{num(c.conversations)}</td>
                  </tr>
                ))}
                {campaigns && campaigns.ad_campaigns.length === 0 && (
                  <tr><td colSpan={5} className="py-2 text-muted-foreground">Nenhuma métrica de anúncio no período.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">* conversas contadas pela plataforma (Meta) ou conversões (Google).</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
