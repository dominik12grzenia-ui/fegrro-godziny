// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase, AlertCircle, AlertTriangle, RefreshCw, Loader2, Download, Save, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { fmtNum } from './_shared';

export const DiscrepancyDetailsModal = ({ year, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancel = false;
    api.get(`/finance/discrepancy-details?year=${year}`)
      .then((r) => { if (!cancel) setData(r.data); })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [year]);

  const items = data?.items || [];
  const itemsCost = items.filter(i => !i.is_income);
  const itemsInc = items.filter(i => i.is_income);

  const reasonColor = (kind) => {
    if (kind === 'missing_app') return 'text-[#FCA5A5]';
    if (kind === 'missing_fak') return 'text-[#D4AF37]';
    if (kind === 'fak_paid_app_unpaid') return 'text-[#5F7552]';
    if (kind === 'app_paid_fak_unpaid') return 'text-[#CBD5E1]';
    return 'text-[#F1F5F9]';
  };

  const renderRow = (it, i) => (
    <tr key={it.number + i} className="border-b border-[#3D5378]/40 hover:bg-[#152033]" data-testid={`disc-row-${it.number}`}>
      <td className="p-2 text-white whitespace-nowrap">
        {it.url ? (
          <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] hover:underline">{it.number}</a>
        ) : it.number}
      </td>
      <td className="p-2 text-[#F1F5F9] text-xs">{it.buyer_name?.substring(0, 50) || '—'}</td>
      <td className="p-2 text-[#CBD5E1] text-xs">{it.sell_date || '—'}</td>
      <td className="p-2 text-right text-[#F1F5F9] tabular-nums">{fmtNum(it.fak_remaining_netto)} zł</td>
      <td className="p-2 text-right text-[#F1F5F9] tabular-nums">{fmtNum(it.app_remaining_netto)} zł</td>
      <td className={`p-2 text-right tabular-nums font-bold ${it.diff_netto > 0 ? 'text-[#FCA5A5]' : 'text-[#5F7552]'}`}>{it.diff_netto > 0 ? '+' : ''}{fmtNum(it.diff_netto)} zł</td>
      <td className={`p-2 text-xs ${reasonColor(it.kind)}`}>{it.reason}</td>
    </tr>
  );

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-6xl max-h-[90vh] overflow-y-auto" data-testid="disc-details-modal">
        <DialogHeader>
          <DialogTitle>Szczegóły rozbieżności z Fakturownia — rok {year}</DialogTitle>
          <p className="text-xs text-[#CBD5E1] mt-1">
            Lista faktur z różnicami między tym, co widzi App vs Fakturownia. Kliknij numer faktury, aby otworzyć ją w Fakturowni.
          </p>
        </DialogHeader>
        {loading ? (
          <div className="text-[#CBD5E1] py-6 text-center">Ładuję dane z Fakturowni...</div>
        ) : items.length === 0 ? (
          <div className="text-[#5F7552] py-6 text-center">✓ Brak rozbieżności — wszystko zgodne.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#152033] border border-[#D4AF37]/30 rounded p-2">
                <div className="text-[#CBD5E1] mb-1">Suma rozbieżności KOSZTÓW (netto)</div>
                <div className={`text-lg font-bold tabular-nums ${data.total_diff_netto > 0 ? 'text-[#FCA5A5]' : 'text-[#5F7552]'}`}>
                  {data.total_diff_netto > 0 ? '+' : ''}{fmtNum(data.total_diff_netto)} zł
                </div>
                <div className="text-[10px] text-[#CBD5E1] mt-1">{itemsCost.length} faktur</div>
              </div>
              <div className="bg-[#152033] border border-[#5F7552]/30 rounded p-2">
                <div className="text-[#CBD5E1] mb-1">Suma rozbieżności PRZYCHODÓW (netto)</div>
                <div className={`text-lg font-bold tabular-nums ${data.total_diff_netto_income > 0 ? 'text-[#FCA5A5]' : 'text-[#5F7552]'}`}>
                  {data.total_diff_netto_income > 0 ? '+' : ''}{fmtNum(data.total_diff_netto_income)} zł
                </div>
                <div className="text-[10px] text-[#CBD5E1] mt-1">{itemsInc.length} faktur</div>
              </div>
            </div>
            <div className="bg-[#152033]/60 border border-[#3D5378] rounded p-2 text-[10px] text-[#CBD5E1]">
              <strong className="text-white">Legenda:</strong>{' '}
              <span className="text-[#FCA5A5]">● Brak w App</span> (najczęstsze — wystarczy „Synchronizuj teraz")
              {' • '}
              <span className="text-[#D4AF37]">● Brak w Fakturownia</span> (faktura wpisana lokalnie, nie ma w Fakturowni)
              {' • '}
              <span className="text-[#5F7552]">● Zapłacone w Fakturownia, w App nie</span> (sync nie złapał płatności)
              {' • '}
              <span className="text-[#CBD5E1]">● Zapłacone w App, w Fakturownia nie</span> (lokalna płatność)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="disc-table">
                <thead className="text-[#CBD5E1] bg-[#152033] sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Numer faktury</th>
                    <th className="p-2 text-left">Kontrahent</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-right">Pozostało Fakturownia</th>
                    <th className="p-2 text-right">Pozostało App</th>
                    <th className="p-2 text-right">Różnica</th>
                    <th className="p-2 text-left">Przyczyna</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsCost.length > 0 && (
                    <tr className="bg-[#D4AF37]/10"><td colSpan={7} className="p-2 font-bold text-[#D4AF37]">KOSZTY ({itemsCost.length})</td></tr>
                  )}
                  {itemsCost.map(renderRow)}
                  {itemsInc.length > 0 && (
                    <tr className="bg-[#5F7552]/10"><td colSpan={7} className="p-2 font-bold text-[#5F7552]">PRZYCHODY ({itemsInc.length})</td></tr>
                  )}
                  {itemsInc.map(renderRow)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#3D5378] text-[#CBD5E1]" data-testid="disc-close-btn">Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

