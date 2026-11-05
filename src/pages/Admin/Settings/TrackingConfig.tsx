// evo-jud-crm: Configurações › Admin › Tracking. Conexões do painel de tráfego (Meta, Google Ads,
// etapas do funil, Postiz, OpenReply) e gerador de links de WhatsApp com código de origem.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Switch, Textarea } from '@evoapi/design-system';
import { toast } from 'sonner';
import { Copy, Loader2, Wand2 } from 'lucide-react';
import { adminConfigService } from '@/services/admin/adminConfigService';
import { pipelinesService } from '@/services/pipelines';
import { trackingService, type TrackingLink, type TrackingStatus } from '@/services/tracking/trackingService';
import { extractError } from '@/utils/apiHelpers';
import type { AdminConfigData } from '@/types/admin/adminConfig';

type Field = { key: string; label: string; help?: string; secret?: boolean; placeholder?: string };

const SECTIONS: { title: string; description: string; fields: Field[] }[] = [
  {
    title: 'WhatsApp e funil',
    description: 'Número que recebe os anúncios e como o CRM reconhece o link de agendamento.',
    fields: [
      { key: 'TRACKING_WHATSAPP_NUMBER', label: 'Número do WhatsApp (com DDI)', placeholder: '5571997059693' },
      { key: 'TRACKING_SCHEDULING_URLS', label: 'Endereços de agendamento', help: 'Separados por vírgula. Padrão: cal.com/, calendly.com/, agenda.', placeholder: 'agenda.seudominio.com.br, cal.com/seu-perfil' },
    ],
  },
  {
    title: 'Meta Ads',
    description: 'Token de usuário do sistema do portfólio (Business Manager) com ads_read na conta de anúncios. Pixel e CAPI são opcionais.',
    fields: [
      { key: 'TRACKING_META_AD_ACCOUNT_ID', label: 'ID da conta de anúncios', placeholder: '28873857435629471' },
      { key: 'TRACKING_META_ACCESS_TOKEN_SECRET', label: 'Token de acesso (usuário do sistema)', secret: true },
      { key: 'TRACKING_META_PIXEL_ID', label: 'ID do pixel / conjunto de dados' },
      { key: 'TRACKING_META_CAPI_TOKEN_SECRET', label: 'Token da API de Conversões', help: 'Vazio = usa o token de acesso acima.', secret: true },
      { key: 'TRACKING_META_PAGE_ID', label: 'ID da página do Facebook' },
      { key: 'TRACKING_META_WABA_ID', label: 'ID da conta do WhatsApp Business (WABA)', help: 'Só para atribuir conversões ao anúncio de WhatsApp (ctwa_clid).' },
      { key: 'TRACKING_META_TEST_EVENT_CODE', label: 'Código de evento de teste', help: 'Use enquanto valida no Gerenciador de Eventos; depois apague.' },
    ],
  },
  {
    title: 'Google Ads',
    description: 'As métricas chegam por um script colado na própria conta do Google Ads (sem developer token).',
    fields: [
      { key: 'TRACKING_GOOGLE_ADS_CUSTOMER_ID', label: 'ID da conta (cliente)', placeholder: '858-570-9801' },
      { key: 'TRACKING_GOOGLE_ADS_INGEST_SECRET', label: 'Chave do script', secret: true, help: 'Gere uma chave e cole a mesma no script abaixo.' },
    ],
  },
  {
    title: 'Postiz e OpenReply',
    description: 'Posts (Postiz) e respostas automáticas de direct (OpenReply) usam links com código P e O, contados como origens próprias.',
    fields: [
      { key: 'TRACKING_POSTIZ_URL', label: 'Endereço do Postiz', placeholder: 'https://post.seudominio.com.br' },
      { key: 'TRACKING_POSTIZ_API_SECRET', label: 'Chave da API do Postiz', secret: true },
      { key: 'TRACKING_OPENREPLY_URL', label: 'Endereço do OpenReply', placeholder: 'https://openreply.seudominio.com.br' },
      { key: 'TRACKING_OPENREPLY_API_SECRET', label: 'Chave da API do OpenReply', secret: true },
    ],
  },
];

const STAGE_KINDS = [
  { key: 'TRACKING_STAGE_MEETING_IDS', label: 'Reunião agendada' },
  { key: 'TRACKING_STAGE_CONTRACT_IDS', label: 'Contrato assinado' },
  { key: 'TRACKING_STAGE_PAYMENT_IDS', label: 'Pagamento efetuado' },
];

const AREAS: Record<string, string> = {
  GER: 'Geral', INV: 'Inventário', DIV: 'Divórcio', IMO: 'Imobiliário', EXT: 'Exterior', PRE: 'Previdenciário',
  CIV: 'Cível', ELE: 'Eleitoral', AGR: 'Agrário', AMB: 'Ambiental', ADM: 'Administrativo',
};
const LINK_CHANNELS: Record<string, string> = {
  meta: 'Anúncio Meta', google: 'Anúncio Google', site: 'Site', postiz: 'Post (Postiz)', openreply: 'Direct (OpenReply)', instagram: 'Instagram (bio)',
};

const isMasked = (v: unknown) => typeof v === 'string' && v.startsWith('•');

function googleScript(endpoint: string, secret: string) {
  return `// evo-jud-crm: cole em Google Ads › Ferramentas › Ações em massa › Scripts e agende "a cada hora".
var ENDPOINT = '${endpoint}';
var SECRET = '${secret || 'COLE_A_CHAVE_DO_SCRIPT'}';
function main() {
  var rows = [];
  var report = AdsApp.report(
    "SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions " +
    "FROM campaign WHERE segments.date DURING LAST_30_DAYS");
  var it = report.rows();
  while (it.hasNext()) {
    var r = it.next();
    rows.push({ date: r['segments.date'], campaign_id: r['campaign.id'], campaign_name: r['campaign.name'],
      cost_micros: r['metrics.cost_micros'], impressions: r['metrics.impressions'], clicks: r['metrics.clicks'],
      conversions: r['metrics.conversions'] });
  }
  var res = UrlFetchApp.fetch(ENDPOINT, { method: 'post', contentType: 'application/json',
    headers: { 'X-Tracking-Secret': SECRET }, payload: JSON.stringify({ rows: rows }), muteHttpExceptions: true });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}`;
}

export default function TrackingConfig() {
  const [values, setValues] = useState<AdminConfigData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<{ id: string; label: string }[]>([]);
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [link, setLink] = useState({ channel: 'meta', area: 'INV', variant: 1, text: '' });
  const [generated, setGenerated] = useState<TrackingLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, st] = await Promise.all([adminConfigService.getConfig('tracking'), trackingService.status().catch(() => null)]);
      setValues(cfg || {});
      setStatus(st);
      const pipes = await pipelinesService.getPipelines();
      const list: { id: string; label: string }[] = [];
      for (const p of pipes.data || []) {
        const ss = p.stages?.length ? p.stages : (await pipelinesService.getPipelineStages(p.id)).data || [];
        ss.forEach((s: { id: string; name: string }) => list.push({ id: s.id, label: `${p.name} › ${s.name}` }));
      }
      setStages(list);
    } catch (e) {
      toast.error(extractError(e).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key: string, v: string | boolean) => setValues((prev) => ({ ...prev, [key]: v }));
  const selected = (key: string) => String(values[key] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const toggleStage = (key: string, id: string) => {
    const cur = selected(key);
    set(key, (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]).join(','));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: AdminConfigData = {};
      Object.entries(values).forEach(([k, v]) => { payload[k] = isMasked(v) ? null : (v as never); });
      const saved = await adminConfigService.saveConfig('tracking', payload);
      setValues(saved);
      toast.success('Tracking salvo');
      trackingService.status().then(setStatus).catch(() => undefined);
    } catch (e) {
      toast.error(extractError(e).message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const genSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    set('TRACKING_GOOGLE_ADS_INGEST_SECRET', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  };

  const endpoint = `${import.meta.env.VITE_API_URL}/api/v1/webhooks/tracking/google_ads`;
  const secretForScript = isMasked(values.TRACKING_GOOGLE_ADS_INGEST_SECRET) ? '' : String(values.TRACKING_GOOGLE_ADS_INGEST_SECRET || '');
  const script = useMemo(() => googleScript(endpoint, secretForScript), [endpoint, secretForScript]);
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Copiado'));

  const generate = async () => {
    try {
      const res = await trackingService.links({
        channel: link.channel, area: link.channel === 'instagram' ? undefined : link.area, variant: link.variant, text: link.text || undefined,
      });
      setGenerated(res[0] || null);
    } catch (e) {
      toast.error(extractError(e).message || 'Configure o número do WhatsApp e salve');
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tracking</h2>
        <p className="text-sm text-muted-foreground">Conexões do painel Tráfego. Tudo é opcional: sem credenciais o funil do CRM continua funcionando.</p>
        {status && (
          <p className="text-xs text-muted-foreground mt-1">
            Meta: {status.meta_insights ? `conectado${status.meta_last_sync_at ? ` (sincronizado ${new Date(status.meta_last_sync_at).toLocaleString('pt-BR')})` : ''}` : 'não conectado'}
            {' · '}CAPI: {status.meta_capi ? 'ligada' : 'desligada'}
            {' · '}Google: {status.google_last_ingest_at ? `último envio ${new Date(status.google_last_ingest_at).toLocaleString('pt-BR')}` : status.google_ingest ? 'aguardando o script' : 'não conectado'}
          </p>
        )}
      </div>

      {SECTIONS.map((sec) => (
        <Card key={sec.title}>
          <CardHeader>
            <CardTitle className="text-base">{sec.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{sec.description}</p>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            {sec.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>{f.label}</Label>
                <div className="flex gap-2">
                  <Input
                    id={f.key}
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    placeholder={f.placeholder}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                  {f.key === 'TRACKING_GOOGLE_ADS_INGEST_SECRET' && (
                    <Button type="button" variant="outline" onClick={genSecret} title="Gerar chave"><Wand2 className="h-4 w-4" /></Button>
                  )}
                </div>
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
            {sec.title === 'Meta Ads' && (
              <div className="flex items-center gap-2 md:col-span-2">
                <Switch
                  checked={String(values.TRACKING_META_CAPI_ENABLED) === 'true'}
                  onCheckedChange={(v: boolean) => set('TRACKING_META_CAPI_ENABLED', v ? 'true' : 'false')}
                />
                <span className="text-sm">Enviar conversões ao Meta (CAPI): conversa, agendamento, contrato e pagamento</span>
              </div>
            )}
            {sec.title === 'Google Ads' && (
              <div className="md:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Script para colar no Google Ads</Label>
                  <Button type="button" size="sm" variant="ghost" onClick={() => copy(script)}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
                </div>
                <Textarea readOnly value={script} className="font-mono text-xs h-48" />
                {isMasked(values.TRACKING_GOOGLE_ADS_INGEST_SECRET) && (
                  <p className="text-xs text-muted-foreground">A chave salva fica oculta. Para ver no script, gere outra, salve e copie.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etapas do funil</CardTitle>
          <p className="text-sm text-muted-foreground">Quando um card entra numa destas etapas, o contato conta como reunião, contrato ou pagamento. Asaas e DocuSeal também marcam pelo conector.</p>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          {STAGE_KINDS.map((k) => (
            <div key={k.key} className="space-y-1">
              <Label>{k.label}</Label>
              <div className="max-h-48 overflow-auto rounded border p-2 space-y-1">
                {stages.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={selected(k.key).includes(s.id)} onChange={() => toggleStage(k.key, s.id)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerador de links de WhatsApp</CardTitle>
          <p className="text-sm text-muted-foreground">
            A frase termina com o código de origem: sem prefixo = anúncio Meta, G = Google, S = site, P = Postiz, O = OpenReply, IG = Instagram. Não apague o código.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Canal</Label>
              <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={link.channel} onChange={(e) => setLink({ ...link, channel: e.target.value })}>
                {Object.entries(LINK_CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <Label>Área</Label>
              <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" disabled={link.channel === 'instagram'} value={link.area} onChange={(e) => setLink({ ...link, area: e.target.value })}>
                {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <Label>Variação</Label>
              <Input type="number" min={1} max={999} value={link.variant} onChange={(e) => setLink({ ...link, variant: Number(e.target.value) || 1 })} />
            </div>
            <div className="flex items-end"><Button type="button" onClick={generate} className="w-full">Gerar</Button></div>
          </div>
          <div>
            <Label>Frase (opcional)</Label>
            <Input placeholder="Vazio = frase padrão do canal" value={link.text} onChange={(e) => setLink({ ...link, text: e.target.value })} />
          </div>
          {generated && (
            <div className="rounded border p-3 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Código:</span> <b>{generated.code}</b></div>
              <div><span className="text-muted-foreground">Mensagem:</span> {generated.text}</div>
              <div className="flex gap-2 items-center">
                <Input readOnly value={generated.url} className="text-xs" />
                <Button type="button" variant="outline" onClick={() => copy(generated.url)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
