import React from 'react';

/**
 * ErrorBoundary - zamiast czarnego ekranu pokazuje czytelny komunikat
 * pozwalajacy uzytkownikowi: 1) zobaczyc co sie stalo, 2) sprobowac
 * przeladowac strone, 3) wylogowac sie i sprobowac ponownie.
 *
 * Wymagany dla aplikacji produkcyjnej - pojedynczy bug w jednym
 * komponencie nie moze zostawic uzytkownika z bialym/czarnym ekranem.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleLogoutReset = async () => {
    try {
      // Odrejestruj service worker zeby usunac stara wersje PWA cache'owana lokalnie
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // Wyczysc Cache API
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (_e) { /* ignore */ }
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message || String(this.state.error) || 'Wystąpił nieoczekiwany błąd';
    const stack = this.state.error?.stack || '';

    return (
      <div className="min-h-screen bg-[#152033] flex items-center justify-center p-4" data-testid="error-boundary">
        <div className="max-w-md w-full bg-[#1E2A44] border border-[#9B2C2C]/50 rounded-lg p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#9B2C2C]/20 flex items-center justify-center">
            <svg className="h-8 w-8 text-[#FCA5A5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Coś poszło nie tak</h1>
          <p className="text-sm text-[#CBD5E1] mb-4">
            Aplikacja napotkała błąd. Najpierw spróbuj odświeżyć stronę. Jeśli problem się powtarza, wyloguj się i zaloguj ponownie.
          </p>
          <p className="text-xs text-[#FCA5A5] bg-[#9B2C2C]/15 rounded p-2 mb-4 break-words" data-testid="error-message">
            {message}
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-[#4F6343] hover:bg-[#3F5235] text-white rounded text-sm font-semibold"
              data-testid="error-reload">
              Odśwież stronę
            </button>
            <button
              onClick={this.handleLogoutReset}
              className="px-4 py-2 bg-[#243049] hover:bg-[#3D5378] text-[#F1F5F9] rounded text-sm border border-[#3D5378]"
              data-testid="error-logout">
              Wyloguj i wróć do logowania
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && stack && (
            <pre className="text-[10px] text-[#CBD5E1] mt-4 text-left overflow-auto max-h-40 bg-[#152033] p-2 rounded">
              {stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
