import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACH_BYTES,
  bridgeOriginFor,
  buildAppContext,
  parseBridgeOrigins,
  safeFilename,
  validateAttach,
  validSearchTerm,
  validRequestId,
  contactSummary,
} from './dashboardAppBridge';

const b64 = (s: string) => btoa(s);

describe('dashboardAppBridge', () => {
  it('ignora placeholder e origens inválidas', () => {
    expect(parseBridgeOrigins('VITE_DASHBOARD_APP_BRIDGE_ORIGINS_PLACEHOLDER')).toEqual([]);
    expect(parseBridgeOrigins(undefined)).toEqual([]);
    expect(parseBridgeOrigins('https://docs.example.com, http://x.com, https://a.b/c, javascript:alert(1)')).toEqual(['https://docs.example.com']);
    expect(parseBridgeOrigins('https://docs.example.com/')).toEqual(['https://docs.example.com']);
  });

  it('libera só a origem exata', () => {
    const allowed = ['https://docs.example.com'];
    expect(bridgeOriginFor('https://docs.example.com/app?x=1', allowed)).toBe('https://docs.example.com');
    expect(bridgeOriginFor('https://docs.example.com.evil.com/', allowed)).toBeNull();
    expect(bridgeOriginFor('http://docs.example.com/', allowed)).toBeNull();
    expect(bridgeOriginFor('não é url', allowed)).toBeNull();
  });

  it('limpa nomes de arquivo', () => {
    expect(safeFilename('Procuracao_JOÃO D\'ÁVILA_2026-11-04.rtf')).toBe('Procuracao_JOÃO D_ÁVILA_2026-11-04.rtf');
    expect(safeFilename('../../etc/passwd')).toBeNull();
    expect(safeFilename('.rtf')).toBeNull();
    expect(safeFilename('semextensao')).toBeNull();
    expect(safeFilename('a'.repeat(300) + '.rtf')?.length).toBeLessThanOrEqual(120);
    expect(safeFilename(42)).toBeNull();
  });

  it('valida pedido de anexo', () => {
    const ok = validateAttach({ requestId: 'abc12345', filename: 'Doc.rtf', mime: 'application/rtf', base64: b64('{\\rtf1}'), note: 'n' });
    expect('error' in ok).toBe(false);
    expect(validateAttach({ requestId: 'x', filename: 'Doc.rtf', mime: 'application/rtf', base64: b64('a') })).toEqual({ error: 'requestId inválido' });
    expect(validateAttach({ requestId: 'abc12345', filename: 'Doc.exe', mime: 'application/x-msdownload', base64: b64('a') })).toMatchObject({ error: 'tipo de arquivo não permitido' });
    expect(validateAttach({ requestId: 'abc12345', filename: 'Doc.rtf', mime: 'application/rtf', base64: '%%%' })).toMatchObject({ error: 'conteúdo inválido' });
    expect(validateAttach({ requestId: 'abc12345', filename: 'Doc.rtf', mime: 'application/rtf', base64: 'A'.repeat(Math.ceil((MAX_ATTACH_BYTES * 4) / 3) + 100) })).toMatchObject({ error: 'conteúdo inválido' });
    expect(validateAttach(null)).toEqual({ error: 'requestId inválido' });
  });

  it('contexto só com campos necessários', () => {
    const ctx = buildAppContext(
      { id: 'c1', display_id: 7, inbox_id: 'i1', status: 'open', contact: { secret: 1 } } as never,
      { id: 'k1', name: 'Fulano', email: 'f@x.com', phone_number: '+5571', custom_attributes: { cpf_cnpj: '1' }, additional_attributes: { token: 'x' } } as never,
      { id: 'u1', name: 'Ana', email: 'a@x.com', access_token: 'x' } as never,
    );
    expect(ctx).toEqual({
      mode: 'conversation',
      conversation: { id: 'c1', display_id: 7, inbox_id: 'i1', status: 'open' },
      contact: { id: 'k1', name: 'Fulano', email: 'f@x.com', phone_number: '+5571', custom_attributes: { cpf_cnpj: '1' } },
      currentAgent: { id: 'u1', name: 'Ana', email: 'a@x.com' },
    });
    expect(buildAppContext(null, null, null, 'sidebar')).toEqual({ mode: 'sidebar', conversation: null, contact: null, currentAgent: null });
  });

  it('busca: termo, requestId e resumo do contato', () => {
    expect(validSearchTerm(' jo ')).toBe('jo');
    expect(validSearchTerm('j')).toBeNull();
    expect(validSearchTerm('x'.repeat(81))).toBeNull();
    expect(validSearchTerm(5)).toBeNull();
    expect(validRequestId('abc123')).toBe('abc123');
    expect(validRequestId('a b')).toBeNull();
    expect(contactSummary({ id: 1, name: 'Zé', phone_number: '+55', custom_attributes: { nome_completo: 'José', cpf_cnpj: '1', rg_ie: 'x' } }))
      .toEqual({ id: '1', name: 'José', phone_number: '+55', email: null, doc: '1' });
  });
});
