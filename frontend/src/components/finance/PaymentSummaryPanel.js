// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, fmtNum } from './_shared';
import { DiscrepancyDetailsModal } from './DiscrepancyDetailsModal';

export const PaymentSummaryPanel = ({ onTileClick, year }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showDiscDetails, setShowDiscDetails] = useState(false);
  // Domyslnie netto - tak jak Fakturownia raporty wydatkow/przychodow
  const [amountMode, setAmountMode] = useState(() => localStorage.getItem('fin_amount_mode') || 'netto');

  const setMode = (m) => {
    setAmountMode(m);
    try { localStorage.setItem('fin_amount_mode', m); } catch { /* ignore */ }
  };

  const fetchData = useCallback(() => {
    const qs = year ? `?year=${year}` : '';
    api.get(`/finance/payment-summary${qs}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    api.get(`/finance/payment-discrepancy${qs}`)
      .then((r) => setDiscrepancy(r.data))
      .catch(() => setDiscrepancy(null));
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const syncUnpaid = async () => {
    setSyncing(true);
    try {
      const r = await api.post('/finance/sync-fakturownia-unpaid');
      const c = r.data.invoices_created;
      const u = r.data.invoices_updated;
      const mp = r.data.marked_paid || 0;
      toast.success(`Sync OK: ${c} nowych, ${u} zaktualizowanych${mp > 0 ? `, ${mp} oznaczonych jako zapłacone` : ''}`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd sync');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const r = data.receivables;
  const p = data.payables;
  // Wybor netto vs brutto
  const valKey = amountMode === 'brutto' ? '_brutto' : '_netto';
  const rTotal = r[`total${valKey}`];
  const pTotal = p[`total${valKey}`];
  const pOverdue = p[`overdue${valKey}`];
  const overdueAny = p.overdue_count;
  const diffP = discrepancy?.diff?.[`payables${valKey}`] || 0;
  const diffR = discrepancy?.diff?.[`receivables${valKey}`] || 0;
  const hasDiscP = Math.abs(diffP) > 1.0;
  const hasDiscR = Math.abs(diffR) > 1.0;

  const Tile = ({ filter, testId, borderColor, label, valueColor, value, sub, extra }) => (
    <button
      type="button"
      onClick={() => onTileClick && onTileClick(filter)}
      className={`text-left rounded-lg p-4 border-2 ${borderColor} bg-[#1E2A44] hover:ring-2 hover:ring-[#D4AF37]/40 transition-all cursor-pointer`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#CBD5E1] text-xs uppercase tracking-wide">{label}</span>
        {extra}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{fmtNum(value)}<span className="text-xs ml-1">zł {amountMode === 'brutto' ? 'brutto' : 'netto'}</span></div>
      <div className="text-xs text-[#CBD5E1] mt-1">{sub}</div>
    </button>
  );

  const DiscBadge = ({ diff, count }) => (
    <span
      title={`Rozbieżność z Fakturownia: ${diff > 0 ? '+' : ''}${fmtNum(diff)} zł (${count > 0 ? '+' : ''}${count} faktur). Kliknij banner aby zsynchronizować.`}
      className="flex items-center gap-1"
      data-testid="discrepancy-badge"
    >
      <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
    </span>
  );

  return (
    <div className="space-y-2 mb-4">
      {/* Toggle Netto / Brutto */}
      <div className="flex items-center justify-end gap-2 text-xs text-[#CBD5E1]">
        <span>Pokaż kwoty:</span>
        <div className="inline-flex rounded-md overflow-hidden border border-[#3D5378]" data-testid="payment-amount-mode-toggle">
          <button onClick={() => setMode('netto')}
            className={`px-3 py-1 text-xs font-medium ${amountMode === 'netto' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
            data-testid="amount-mode-netto">
            Netto
          </button>
          <button onClick={() => setMode('brutto')}
            className={`px-3 py-1 text-xs font-medium border-l border-[#3D5378] ${amountMode === 'brutto' ? 'bg-[#4F6343] text-white' : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
            data-testid="amount-mode-brutto">
            Brutto
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="payment-summary-panel">
        <Tile
          filter="receivables"
          testId="receivables-tile"
          borderColor="border-[#4F6343]/40"
          label="Kontrahenci mi do zapłaty"
          valueColor="text-[#5F7552]"
          value={rTotal}
          sub={`${r.count} faktur`}
          extra={hasDiscR ? <DiscBadge diff={diffR} count={discrepancy.diff.receivables_count} /> : null}
        />
        <Tile
          filter="due"
          testId="payables-tile"
          borderColor="border-[#D4AF37]/40"
          label="Do zapłaty"
          valueColor="text-[#D4AF37]"
          value={pTotal}
          sub={`${p.count} faktur`}
          extra={hasDiscP ? <DiscBadge diff={diffP} count={discrepancy.diff.payables_count} /> : null}
        />
        <Tile
          filter="overdue"
          testId="overdue-tile"
          borderColor={overdueAny > 0 ? 'border-[#9B2C2C]/60' : 'border-[#3D5378]'}
          label="Przeterminowane (koszty)"
          valueColor={overdueAny > 0 ? 'text-[#FCA5A5]' : 'text-[#F1F5F9]'}
          value={pOverdue}
          sub={overdueAny > 0
            ? `${p.overdue_count} ${p.overdue_count === 1 ? 'faktura kosztowa' : 'faktur kosztowych'}`
            : 'Brak przeterminowanych kosztów'}
          extra={overdueAny > 0 ? <AlertTriangle className="h-4 w-4 text-[#FCA5A5]" /> : null}
        />
      </div>
      {(hasDiscP || hasDiscR) && (
        <div className="flex items-center justify-between bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded p-2 text-xs text-[#D4AF37]" data-testid="discrepancy-banner">
          <span>
            ⚠ Rozbieżność z Fakturownia ({amountMode}):
            {hasDiscP && ` koszty ${diffP > 0 ? '+' : ''}${fmtNum(diffP)} zł`}
            {hasDiscP && hasDiscR && ' • '}
            {hasDiscR && ` przychody ${diffR > 0 ? '+' : ''}${fmtNum(diffR)} zł`}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDiscDetails(true)}
              className="bg-transparent border-[#D4AF37]/60 text-[#D4AF37] hover:bg-[#D4AF37]/20 h-7 text-xs"
              data-testid="discrepancy-details-btn">
              Pokaż szczegóły
            </Button>
            <ActionButton size="sm" onAction={syncUnpaid} disabled={syncing}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-semibold h-7 text-xs"
              data-testid="discrepancy-sync-btn">{syncing ? 'Synchronizuję...' : 'Synchronizuj teraz'}</ActionButton>
          </div>
        </div>
      )}
      {showDiscDetails && (
        <DiscrepancyDetailsModal year={year} onClose={() => setShowDiscDetails(false)} />
      )}
    </div>
  );
};

