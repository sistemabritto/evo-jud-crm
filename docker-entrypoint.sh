#!/bin/sh
set -e

# =============================================================================
# Runtime environment variable injection for Vite-built apps
# =============================================================================
# Replaces placeholder values in the built JS files with actual environment
# variables at container startup, enabling runtime configuration without
# rebuilding the image.
# =============================================================================

HTML_DIR="/usr/share/nginx/html"

# Replace VITE_* variables in all JS files
# The build uses empty strings or defaults — we replace them at runtime
# Fork Cramer: pula montagens externas (ex.: site institucional em cramer-institucional, somente
# leitura) e qualquer arquivo sem escrita; senão o sed -i derruba o container na subida.
for file in $(find "$HTML_DIR" -path "$HTML_DIR/cramer-institucional" -prune -o -name '*.js' -type f -print); do
  [ -w "$file" ] || continue
  # Replace each VITE_* env var if set
  [ -n "$VITE_API_URL" ] && sed -i "s|VITE_API_URL_PLACEHOLDER|${VITE_API_URL}|g" "$file"
  [ -n "$VITE_AUTH_API_URL" ] && sed -i "s|VITE_AUTH_API_URL_PLACEHOLDER|${VITE_AUTH_API_URL}|g" "$file"
  [ -n "$VITE_WS_URL" ] && sed -i "s|VITE_WS_URL_PLACEHOLDER|${VITE_WS_URL}|g" "$file"
  [ -n "$VITE_EVOAI_API_URL" ] && sed -i "s|VITE_EVOAI_API_URL_PLACEHOLDER|${VITE_EVOAI_API_URL}|g" "$file"
  [ -n "$VITE_AGENT_PROCESSOR_URL" ] && sed -i "s|VITE_AGENT_PROCESSOR_URL_PLACEHOLDER|${VITE_AGENT_PROCESSOR_URL}|g" "$file"
  [ -n "$VITE_EVOFLOW_API_URL" ] && sed -i "s|VITE_EVOFLOW_API_URL_PLACEHOLDER|${VITE_EVOFLOW_API_URL}|g" "$file"
  # Fork Cramer: origens de Dashboard Apps com a ponte (contexto + anexar nota privada).
  sed -i "s|VITE_DASHBOARD_APP_BRIDGE_ORIGINS_PLACEHOLDER|${VITE_DASHBOARD_APP_BRIDGE_ORIGINS:-}|g" "$file"
done

# Configure nginx CSP based on environment (default: development)
# The CSP shipped in nginx.conf is the production default: img-src/media-src
# allow 'https:' (external buckets) but no plain-http origin. Chat media served
# by the backend (ActiveStorage local disk) comes from the API origin, which is
# plain http in development and in self-hosted deploys without TLS — without
# the adjustments below the browser blocks images/audio in the chat (EVO-1961).
# All substitutions are anchored on the trailing ';' or guarded so a container
# restart does not append the same source twice.
APP_ENV="${VITE_APP_ENV:-development}"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

if [ "$APP_ENV" = "development" ]; then
  # Development: allow localhost (any port) for API calls and for media served
  # by the backend, and permissive frame-ancestors for the widget.
  sed -i \
    -e "s|connect-src 'self' blob: https: wss: ws:;|connect-src 'self' blob: https: wss: ws: http://localhost:*;|" \
    -e "s|img-src 'self' data: blob: https:;|img-src 'self' data: blob: https: http://localhost:*;|" \
    -e "s|media-src 'self' blob: https:;|media-src 'self' blob: https: http://localhost:*;|" \
    -e "s|frame-ancestors 'self';|frame-ancestors *;|" \
    "$NGINX_CONF"
fi

# Self-hosted over plain http (no TLS): media and API calls come from the API
# origin and 'https:' does not cover http origins, so allow it explicitly.
case "$VITE_API_URL" in
  http://*)
    API_ORIGIN="$(printf '%s' "$VITE_API_URL" | sed "s|^\(http://[^/]*\).*|\1|")"
    if ! grep -q "img-src[^;]* $API_ORIGIN" "$NGINX_CONF"; then
      sed -i \
        -e "s|\(img-src [^;]*\);|\1 ${API_ORIGIN};|" \
        -e "s|\(media-src [^;]*\);|\1 ${API_ORIGIN};|" \
        -e "s|\(connect-src [^;]*\);|\1 ${API_ORIGIN};|" \
        "$NGINX_CONF"
    fi
    ;;
esac

# Fork Cramer: libera no frame-src só as origens dos Dashboard Apps com ponte.
# Aceita apenas https://host[:porta]; idempotente (não duplica em restart).
for origin in $(printf '%s' "${VITE_DASHBOARD_APP_BRIDGE_ORIGINS:-}" | tr ',' ' '); do
  case "$origin" in
    https://*) ;;
    *) continue ;;
  esac
  if printf '%s' "$origin" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$' && ! grep -q "frame-src[^;]* ${origin%/}" "$NGINX_CONF"; then
    sed -i "s|frame-src 'self'|frame-src 'self' ${origin%/}|" "$NGINX_CONF"
  fi
done

exec "$@"
