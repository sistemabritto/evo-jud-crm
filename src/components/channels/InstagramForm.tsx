import { useEffect, useState } from 'react';
import { Button, Input } from '@evoapi/design-system';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { useGlobalConfig } from '@/contexts/GlobalConfigContext';
import instagramService from '@/services/channels/instagramService';
import { Instagram, AlertTriangle, Facebook, CheckCircle2, Info } from 'lucide-react';
import InboxesService from '@/services/channels/inboxesService';
import type { Inbox } from '@/types/channels/inbox';
import HubConnectButton from '@/components/inbox/HubConnectButton';
import { FormActionBar } from '@/components/channels/shared/FormActionBar';

interface InstagramFormProps {
  onCancel?: () => void;
  /** Leva ao fluxo do Facebook (página + Instagram vinculado), usado no login unificado. */
  onUseFacebook?: () => void;
}

export default function InstagramForm({ onCancel, onUseFacebook }: InstagramFormProps) {
  const { t } = useLanguage('instagram');
  const config = useGlobalConfig();
  const hubEnabled = config.evolutionHubEnabled === true;

  const [isConnecting, setIsConnecting] = useState(false);
  const [inboxName, setInboxName] = useState('');

  // Check if Instagram is properly configured
  const isInstagramConfigured = !!config.instagramAppId;
  // Apps novos da Meta (login unificado) não têm ID de app do Instagram: o Instagram
  // profissional entra pela caixa da página do Facebook a que está vinculado.
  const unifiedLogin = !hubEnabled && !isInstagramConfigured && !!config.fbAppId;
  const [pageInboxes, setPageInboxes] = useState<Inbox[] | null>(null);

  useEffect(() => {
    if (!unifiedLogin) return;
    let active = true;
    InboxesService.list()
      .then(response => {
        if (!active) return;
        const list = Array.isArray(response?.data) ? response.data : [];
        setPageInboxes(list.filter(inbox => inbox.channel_type === 'Channel::FacebookPage'));
      })
      .catch(() => active && setPageInboxes([]));
    return () => {
      active = false;
    };
  }, [unifiedLogin]);

  if (hubEnabled) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('channelName') || 'Channel Name'}
          </label>
          <Input
            placeholder={t('channelNamePlaceholder') || 'Instagram Channel'}
            value={inboxName}
            onChange={(e) => setInboxName(e.target.value)}
          />
        </div>
        <HubConnectButton channelType="instagram" name={inboxName} />
        {onCancel && (
          <FormActionBar>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onCancel} className="min-w-24">
                {t('cancel') || 'Cancel'}
              </Button>
            </div>
          </FormActionBar>
        )}
      </div>
    );
  }

  if (unifiedLogin) {
    return (
      <div className="space-y-6" data-tour="instagram-connect">
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">{t('unified.title')}</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">{t('unified.description')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">{t('unified.existingTitle')}</h4>
          {pageInboxes === null ? (
            <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          ) : pageInboxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('unified.none')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {pageInboxes.map(inbox => (
                <li key={inbox.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-foreground truncate">
                    <Facebook className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    {inbox.name}
                  </span>
                  {inbox.instagram_id ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-pink-700 dark:text-pink-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('unified.linked')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('unified.notLinked')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t('unified.hint')}</p>
        </div>

        <FormActionBar>
          <div className="flex justify-end gap-3">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} className="min-w-24">
                {t('cancel')}
              </Button>
            )}
            {onUseFacebook && (
              <Button
                onClick={onUseFacebook}
                className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:from-purple-600 hover:via-pink-600 hover:to-orange-600 text-white min-w-[200px]"
              >
                <Instagram className="w-4 h-4 mr-2" />
                {t('unified.connectButton')}
              </Button>
            )}
          </div>
        </FormActionBar>
      </div>
    );
  }

  const handleInstagramConnect = async () => {
    if (!isInstagramConfigured) {
      toast.error(t('errors.notConfigured'));
      return;
    }

    setIsConnecting(true);

    try {
      // Generate authorization URL
      const response = await instagramService.generateAuthorization();

      // Redirect to Instagram OAuth (no popup)
      window.location.href = response.url;
    } catch (error: unknown) {
      console.error('Instagram: Error generating authorization URL:', error);
      const errorMessage =
        (error as { response?: { data?: { error?: { message?: string } } }; message?: string })
          ?.response?.data?.error?.message ||
        (error as { message?: string })?.message ||
        t('errors.authorizationFailed');
      toast.error(errorMessage);
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6" data-tour="instagram-connect">
      {/* Configuration Check */}
      {!isInstagramConfigured && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
              {t('warnings.notConfigured')}
            </h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              {t('warnings.notConfiguredDescription')}
            </p>
          </div>
        </div>
      )}

      {/* Connection Info */}
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center">
          <div className="p-4 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500">
            <Instagram className="w-12 h-12 text-white" />
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-foreground">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mt-2">{t('description')}</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center space-y-2 pt-4 border-t">
        <p className="text-sm text-muted-foreground">{t('instructions.redirect')}</p>
        <p className="text-xs text-muted-foreground">{t('instructions.businessAccount')}</p>
      </div>

      {/* Standardized footer band — the OAuth redirect action lives here. */}
      <FormActionBar>
        <div className="flex justify-end gap-3">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isConnecting} className="min-w-24">
              {t('cancel')}
            </Button>
          )}
          <Button
            onClick={handleInstagramConnect}
            disabled={!isInstagramConfigured || isConnecting}
            className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:from-purple-600 hover:via-pink-600 hover:to-orange-600 text-white min-w-[200px] disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400"
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                {t('connecting')}
              </>
            ) : (
              <>
                <Instagram className="w-4 h-4 mr-2" />
                {t('connectButton')}
              </>
            )}
          </Button>
        </div>
      </FormActionBar>
    </div>
  );
}
