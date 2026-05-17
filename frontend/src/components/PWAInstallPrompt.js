import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';
import { Button } from './ui/button';

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    if (localStorage.getItem('pwa-prompt-dismissed')) {
      setDismissed(true);
      return;
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Android/Chrome install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroidPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isInStandaloneMode = window.navigator.standalone === true;
    if (isIOS && !isInStandaloneMode) {
      setTimeout(() => setShowIOSPrompt(true), 2000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowAndroidPrompt(false);
  };

  const handleDismiss = () => {
    setShowIOSPrompt(false);
    setShowAndroidPrompt(false);
    setDismissed(true);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (dismissed) return null;

  // Android prompt
  if (showAndroidPrompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up" data-testid="pwa-android-prompt">
        <div className="max-w-md mx-auto bg-[#2A384C] border border-[#5F7151] rounded-xl shadow-2xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <img src="/icon-192x192.png" alt="FeGrro" className="w-12 h-12 rounded-xl" />
              <div>
                <h3 className="text-[#CBD5E1] font-bold text-sm">Zainstaluj FeGrro Godziny</h3>
                <p className="text-[#94A3B8] text-xs">Dodaj na pulpit dla szybkiego dostępu</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-[#64748B] hover:text-[#CBD5E1]">
              <X className="h-5 w-5" />
            </button>
          </div>
          <Button
            onClick={handleInstall}
            className="w-full bg-[#5F7151] hover:bg-[#4A5A41] text-white font-semibold"
            data-testid="pwa-install-btn"
          >
            <Download className="h-4 w-4 mr-2" />
            Zainstaluj aplikacje
          </Button>
        </div>
      </div>
    );
  }

  // iOS prompt
  if (showIOSPrompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 animate-slide-up" data-testid="pwa-ios-prompt">
        <div className="max-w-md mx-auto bg-[#2A384C] border border-[#5F7151] rounded-xl shadow-2xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <img src="/icon-192x192.png" alt="FeGrro" className="w-12 h-12 rounded-xl" />
              <div>
                <h3 className="text-[#CBD5E1] font-bold text-sm">Dodaj na ekran główny</h3>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-[#64748B] hover:text-[#CBD5E1]">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-2 text-[#94A3B8] text-xs">
            <div className="flex items-center gap-2 bg-[#1E293B] p-2 rounded-lg">
              <span className="bg-[#334155] p-1.5 rounded"><Share className="h-4 w-4 text-[#CBD5E1]" /></span>
              <span>1. Kliknij <strong className="text-[#CBD5E1]">Udostepnij</strong> (ikona na dole ekranu)</span>
            </div>
            <div className="flex items-center gap-2 bg-[#1E293B] p-2 rounded-lg">
              <span className="bg-[#334155] p-1.5 rounded"><PlusSquare className="h-4 w-4 text-[#CBD5E1]" /></span>
              <span>2. Wybierz <strong className="text-[#CBD5E1]">Dodaj do ekranu poczatkowego</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
