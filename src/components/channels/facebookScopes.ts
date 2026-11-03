// Permissões pedidas no login do Facebook (página + Instagram vinculado à página).
// Fork Cramer: apps novos da Meta (login unificado) não oferecem pages_manage_posts,
// pages_read_user_content nem pages_manage_engagement nos casos de uso de mensagens, e a
// Meta recusa o login inteiro com "Invalid Scopes". As de Instagram permitem receber e
// responder Direct pela mesma caixa da página.
export const FACEBOOK_PAGE_SCOPES = [
  'pages_manage_metadata',
  'business_management',
  'pages_messaging',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
].join(',');
