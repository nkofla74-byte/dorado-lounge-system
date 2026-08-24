'use client';

import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { iniciarSesion } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TurnstileWidget } from '@/components/ui/turnstile-widget';
import { Loader2, Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const mensajeDeError = useCallback(
    (code: string): string => {
      switch (code) {
        case 'RATE_LIMITED':
          return t('errors.tooManyAttempts');
        case 'TURNSTILE_REQUERIDO':
          return t('errors.turnstileRequired');
        case 'TURNSTILE_INVALIDO':
          return t('errors.turnstileFailed');
        case 'SESION_SIN_CLAIMS':
          return t('errors.missingRoleOrTenant');
        default:
          return t('errors.invalidCredentials');
      }
    },
    [t],
  );

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const siteKeyConfigured = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (siteKeyConfigured && !turnstileToken) {
      setError(t('errors.turnstileRequired'));
      setLoading(false);
      return;
    }

    // El login entero ocurre en el servidor: verificación anti-bot, rate limit y
    // autenticación en el mismo paso. Antes eran dos llamadas desacopladas desde
    // el navegador, así que la segunda se podía invocar sin la primera (F-012).
    const result = await iniciarSesion({
      email,
      password,
      turnstileToken: turnstileToken ?? undefined,
      next: searchParams.get('next'),
    });

    if (!result.ok) {
      setError(mensajeDeError(result.error.code));
      setTurnstileToken(null);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(result.value.destino);
  };

  return (
    <div className="w-full max-w-sm space-y-8">
      {/* Branding */}
      <div className="text-center space-y-3">
        <div className="marca inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-display font-semibold shadow-lg shadow-primary/20">
          DL
        </div>
        <div>
          <h1 className="marca text-display font-semibold">Dorado Lounge</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <TurnstileWidget
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              className="flex justify-center"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-caption text-muted-foreground">{t('footer')}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
