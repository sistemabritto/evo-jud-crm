import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatService } from '@/services/chat';
import { contactsService } from '@/services/contacts';
import { useAuth } from '@/contexts/AuthContext';
import {
  ATTACH_EVENT,
  ATTACH_RESULT,
  FETCH_INFO,
  GET_CONTACT_EVENT,
  GET_CONTACT_RESULT,
  SEARCH_EVENT,
  SEARCH_RESULT,
  bridgeOriginFor,
  buildAppContext,
  contactSummary,
  validRequestId,
  validSearchTerm,
  validateAttach,
} from '@/utils/dashboardAppBridge';

type Props = {
  url: string;
  title: string;
  /** 'sidebar': página própria do app, sem conversa; o app escolhe o cliente pela busca. */
  mode?: 'conversation' | 'sidebar';
  className?: string;
  conversation: { id?: string; display_id?: string | number | null; inbox_id?: string | null; status?: string | null } | null;
  contact: { id?: string; name?: string | null; email?: string | null; phone_number?: string | null; custom_attributes?: Record<string, unknown> | null } | null;
};

// Pedidos de anexo já processados (evita nota duplicada em clique duplo / reenvio).
const handled = new Map<string, { at: number; result: Record<string, unknown> }>();

/** Iframe de Dashboard App com a ponte Cramer (contexto + anexar nota privada). */
export default function DashboardAppFrame({ url, title, conversation, contact, mode = 'conversation', className }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { user } = useAuth();
  const origin = useMemo(() => bridgeOriginFor(url), [url]);
  // A conversa traz o contato resumido; busca o completo (custom_attributes atualizados) só com a ponte ligada.
  const [fullContact, setFullContact] = useState<Props['contact']>(null);
  useEffect(() => {
    setFullContact(null);
    if (!origin || !contact?.id) return;
    let active = true;
    contactsService
      .getContact(String(contact.id), false)
      .then(c => { if (active) setFullContact(c as Props['contact']); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [origin, contact?.id]);
  const agent = user ? { id: String((user as { id?: unknown }).id ?? ''), name: (user as { name?: string | null }).name, email: (user as { email?: string | null }).email } : null;
  const effectiveContact = fullContact && fullContact.id === contact?.id ? fullContact : contact;
  const context = useMemo(
    () => buildAppContext(conversation, effectiveContact, agent, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversation?.id, conversation?.status, effectiveContact, agent?.id, mode],
  );

  const post = useCallback(
    (message: unknown) => {
      if (origin) ref.current?.contentWindow?.postMessage(message, origin);
    },
    [origin],
  );
  const sendContext = useCallback(() => post({ event: 'appContext', data: context }), [post, context]);

  // Reenvia o contexto quando a conversa/contato muda com o app aberto.
  useEffect(() => {
    sendContext();
  }, [sendContext]);

  useEffect(() => {
    if (!origin) return;
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== ref.current?.contentWindow) return;
      if (event.data === FETCH_INFO) return sendContext();
      const data = event.data as { event?: string; requestId?: unknown; q?: unknown; id?: unknown } | null;
      if (!data || typeof data !== 'object') return;
      if (data.event === SEARCH_EVENT) {
        const requestId = validRequestId(data.requestId);
        const q = validSearchTerm(data.q);
        if (!requestId) return;
        if (!q) return post({ event: SEARCH_RESULT, requestId, ok: false, error: 'digite ao menos 2 letras' });
        try {
          const res = await contactsService.searchContacts({ q, per_page: 20 });
          const items = (Array.isArray(res?.data) ? res.data : []).slice(0, 20).map(c => contactSummary(c as never));
          return post({ event: SEARCH_RESULT, requestId, ok: true, items });
        } catch {
          return post({ event: SEARCH_RESULT, requestId, ok: false, error: 'falha na busca' });
        }
      }
      if (data.event === GET_CONTACT_EVENT) {
        const requestId = validRequestId(data.requestId);
        const id = typeof data.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.id) ? data.id : null;
        if (!requestId || !id) return;
        try {
          const c = await contactsService.getContact(id, false);
          return post({ event: GET_CONTACT_RESULT, requestId, ok: true, contact: buildAppContext(null, c as never, null).contact });
        } catch {
          return post({ event: GET_CONTACT_RESULT, requestId, ok: false, error: 'contato não encontrado' });
        }
      }
      if (data.event !== ATTACH_EVENT) return;

      const parsed = validateAttach(data);
      if ('error' in parsed) return post({ event: ATTACH_RESULT, requestId: parsed.requestId, ok: false, error: parsed.error });
      const now = Date.now();
      for (const [k, v] of handled) if (now - v.at > 60_000) handled.delete(k);
      const previous = handled.get(parsed.requestId);
      if (previous) return post(previous.result);
      const conversationId = conversation?.id;
      if (!conversationId) {
        return post({ event: ATTACH_RESULT, requestId: parsed.requestId, ok: false, error: 'nenhuma conversa aberta' });
      }
      handled.set(parsed.requestId, { at: now, result: { event: ATTACH_RESULT, requestId: parsed.requestId, ok: false, error: 'em andamento' } });
      try {
        const file = new File([parsed.bytes], parsed.filename, { type: parsed.mime });
        const message = await chatService.sendMessageWithAttachments(String(conversationId), parsed.note, [file], true);
        const result = { event: ATTACH_RESULT, requestId: parsed.requestId, ok: true, messageId: (message as { id?: unknown })?.id };
        handled.set(parsed.requestId, { at: Date.now(), result });
        post(result);
      } catch (error) {
        handled.delete(parsed.requestId);
        const status = (error as { response?: { status?: number } })?.response?.status;
        post({ event: ATTACH_RESULT, requestId: parsed.requestId, ok: false, error: status === 403 ? 'sem permissão' : 'falha ao gravar no CRM' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, conversation?.id, post, sendContext]);

  return (
    <iframe
      ref={ref}
      src={url}
      className={className ?? 'w-full h-full border-0'}
      title={title}
      onLoad={sendContext}
      sandbox={`allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox${origin ? ' allow-downloads allow-modals' : ''}`}
    />
  );
}
