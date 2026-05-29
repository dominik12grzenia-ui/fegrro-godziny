// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const FakturowniaSyncWarning = () => {
  const [s, setS] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const fetchStatus = async () => {
      try {
        const r = await api.get('/finance/settings');
        if (!stopped) setS(r.data);
      } catch (_e) { /* ignore */ }
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 60000);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  if (!s || dismissed) return null;
  if (s.last_fakturownia_sync_status !== 'error') return null;
  const err = s.last_fakturownia_sync_error || 'Nieznany błąd';
  const when = s.last_fakturownia_sync_at
    ? new Date(s.last_fakturownia_sync_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  return (
    <div
      data-testid="fakturownia-sync-warning"
      className="flex items-start gap-3 rounded-md border border-[#9B2C2C]/40 bg-[#9B2C2C]/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-5 w-5 text-[#9B2C2C] flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#FCA5A5]">
          Ostatni auto-sync z Fakturowni nieudany{when && ` (${when})`}
        </div>
        <div className="text-[#FCA5A5]/80 mt-1 break-words">{err}</div>
        <div className="text-[#FCA5A5]/60 text-xs mt-1">
          Sprawdź klucz API i subdomene w Narzędzia &rarr; Fakturownia. Auto-sync probuje co 30 min.
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-[#FCA5A5] hover:text-white text-xs underline"
        data-testid="fakturownia-warning-dismiss"
      >
        Ukryj
      </button>
    </div>
  );
};

