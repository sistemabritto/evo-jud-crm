// Ponte entre o CRM e Dashboard Apps (iframes) — fork Cramer.
// - Contexto: compatível com o padrão do Chatwoot. O app envia a string
//   'chatwoot-dashboard-app:fetch-info' e recebe { event: 'appContext', data }.
// - Extensão Cramer: { event: 'cramer:attach-file', requestId, filename, mime, base64, note }
//   grava uma nota PRIVADA com o anexo na conversa aberta, com a sessão do usuário.
// Só vale para apps cuja origem esteja em VITE_DASHBOARD_APP_BRIDGE_ORIGINS (injetada em runtime).

export const FETCH_INFO = 'chatwoot-dashboard-app:fetch-info';
export const ATTACH_EVENT = 'cramer:attach-file';
export const ATTACH_RESULT = 'cramer:attach-file:result';
export const ATTACH_MIMES = [
  'application/rtf',
  'text/rtf',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

export function parseBridgeOrigins(raw: string | undefined | null): string[] {
  if (!raw || raw.includes('PLACEHOLDER')) return [];
  return raw
    .split(/[\s,]+/)
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(s => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

export function bridgeOrigins(): string[] {
  return parseBridgeOrigins(import.meta.env.VITE_DASHBOARD_APP_BRIDGE_ORIGINS as string | undefined);
}

/** Origem do app se a ponte estiver liberada para ela; senão null. */
export function bridgeOriginFor(url: string, allowed: string[] = bridgeOrigins()): string | null {
  try {
    const origin = new URL(url).origin;
    return allowed.includes(origin) ? origin : null;
  } catch {
    return null;
  }
}

export function safeFilename(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const ext = cleaned.match(/\.[A-Za-z0-9]{2,5}$/)?.[0];
  if (!ext || cleaned.startsWith('.') || cleaned.length === ext.length) return null;
  // Corta o nome preservando a extensão (máx. 120 caracteres no total).
  return cleaned.slice(0, cleaned.length - ext.length).slice(0, 120 - ext.length).trim() + ext;
}

export function decodeBase64(b64: unknown): Uint8Array | null {
  if (typeof b64 !== 'string' || !b64 || b64.length > Math.ceil((MAX_ATTACH_BYTES * 4) / 3) + 8) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type AttachRequest = { requestId: string; filename: string; mime: string; bytes: Uint8Array; note: string };

/** Valida o pedido de anexo. Devolve o pedido normalizado ou a mensagem de erro. */
export function validateAttach(data: unknown): AttachRequest | { error: string; requestId?: string } {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const requestId = typeof d.requestId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(d.requestId) ? d.requestId : undefined;
  if (!requestId) return { error: 'requestId inválido' };
  const filename = safeFilename(d.filename);
  if (!filename) return { error: 'nome de arquivo inválido', requestId };
  const mime = typeof d.mime === 'string' ? d.mime : '';
  if (!ATTACH_MIMES.includes(mime)) return { error: 'tipo de arquivo não permitido', requestId };
  const bytes = decodeBase64(d.base64);
  if (!bytes || bytes.length === 0) return { error: 'conteúdo inválido', requestId };
  if (bytes.length > MAX_ATTACH_BYTES) return { error: 'arquivo maior que 10 MB', requestId };
  const note = typeof d.note === 'string' ? d.note.slice(0, 2000) : '';
  return { requestId, filename, mime, bytes, note };
}

type Maybe<T> = T | null | undefined;
type ConversationLike = { id?: string; display_id?: string | number | null; inbox_id?: string | null; status?: string | null; contact?: unknown };
type ContactLike = { id?: string; name?: string | null; email?: string | null; phone_number?: string | null; custom_attributes?: Record<string, unknown> | null };
type AgentLike = { id?: string; name?: string | null; email?: string | null };

/** Só os campos que o app precisa (nada de tokens, notas ou histórico). */
export function buildAppContext(conversation: Maybe<ConversationLike>, contact: Maybe<ContactLike>, agent: Maybe<AgentLike>) {
  return {
    conversation: conversation
      ? { id: conversation.id, display_id: conversation.display_id, inbox_id: conversation.inbox_id, status: conversation.status }
      : null,
    contact: contact
      ? { id: contact.id, name: contact.name, email: contact.email, phone_number: contact.phone_number, custom_attributes: contact.custom_attributes ?? {} }
      : null,
    currentAgent: agent ? { id: agent.id, name: agent.name, email: agent.email } : null,
  };
}
