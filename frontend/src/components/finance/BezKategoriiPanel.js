// iter96: Faktury bez kategorii (kod_id) - nie trafiaja do Rachunku Wynikow
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Wand2, ArrowDownToLine, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { emitFinanceRefresh, fmtPLN } from './_shared';

const KOD_CATS = ['PZS', 'PZSV', 'PPE', 'PV', 'G', 'KP', 'KBB', 'KSB', 'KSP'];

export const BezKategoriiPanel = ({ year }) => {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [kody, setKody] = useState([]);
  const [budowy, setBudowy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nRes, kRes, bRes] = await Promise.all([
        api.get(`/finance/invoices-no-kod?year=${year}`),
        api.get('/finance/kody'),
        api.get('/finance/budowy?include_archived=true'),
      ]);
      setRows(nRes.data.rows);
      setTotals(nRes.data.totals);
      setKody(kRes.data.rows);
      setBudowy(bRes.data.rows);
    } catch {
      toast.error('Błąd pobierania faktur bez kategorii');
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.kontrahent || '').toLowerCase().includes(q) ||
      (r.nr_faktury || '').toLowerCase().includes(q));
  }, [rows, search]);

  const backfillFromPositions = async () => {
    setBusy(true);
    try {
      const r = await api.post('/finance/backfill-invoice-kod-from-positions', null, { timeout: 120000 });
      toast.success(`Przeniesiono kategorie z pozycji: ${r.data.invoices_updated} faktur (sprawdzono ${r.data.invoices_scanned})`);
      await fetchData(true);
      emitFinanceRefresh('bezkat:backfill');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd backfillu');
    } finally { setBusy(false); }
  };

  const applyAllSuggestions = async () => {
    const withSug = rows.filter(r => r.suggested_kod_id);
    if (!withSug.length) { toast.info('Brak faktur z sugestią'); return; }
    if (!window.confirm(`Przypisać sugerowane kategorie do ${withSug.length} faktur?`)) return;
    setBusy(true);
    try {
      const r = await api.post('/finance/invoices/batch-kod', {
        assignments: withSug.map(x => ({ invoice_id: x.id, kod_id: x.suggested_kod_id })),
      }, { timeout: 300000 });
      toast.success(`Przypisano kategorie: ${r.data.updated} faktur`);
      await fetchData(true);
      emitFinanceRefresh('bezkat:batch');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd masowego przypisania');
    } finally { setBusy(false); }
  };

  const assignKod = async (row, kodId) => {
    if (!kodId) return;
    try {
      await api.put(`/finance/invoices/${row.id}`, { kod_id: kodId });
      setRows(prev => prev.filter(r => r.id !== row.id));
      setTotals(prev => prev ? { ...prev, count: prev.count - 1, netto_sum: Math.round((prev.netto_sum - row.netto) * 100) / 100 } : prev);
      toast.success(`Przypisano: ${row.kontrahent || row.nr_faktury}`);
      emitFinanceRefresh('bezkat:assign');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd przypisania');
    }
  };

  const assignBudowa = async (row, bid) => {
    try {
      const payload = bid ? { budowa_id: bid } : { clear_budowa: true };
      await api.put(`/finance/invoices/${row.id}`, payload);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, budowa_id: bid || null } : r));
      emitFinanceRefresh('bezkat:budowa');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd przypisania budowy');
    }
  };

  const renderKodSelect = (row) => (
    <select value="" onChange={(e) => assignKod(row, e.target.value)}
      className="w-full bg-[#1E2A44] border border-[#D4AF37]/60 text-[#D4AF37] rounded px-1 py-1 text-xs"
      data-testid={`bezkat-kod-select-${row.id}`}>
      <option value="">— przypisz kod —</option>
      {KOD_CATS.map(cat => {
        const ck = kody.filter(k => k.category === cat);
        if (!ck.length) return null;
        return <optgroup key={cat} label={cat}>
          {ck.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </optgroup>;
      })}
    </select>
  );

  if (loading) return <Card className="bg-[#243049] border-[#3D5378]"><CardContent className="p-6 text-[#CBD5E1]">Ładowanie...</CardContent></Card>;

  return (
    <Card className="bg-[#243049] border-[#3D5378]" data-testid="bezkat-panel">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white">
          Faktury bez kategorii {year}
          {totals && (
            <span className="ml-2 text-sm font-normal text-[#D4AF37]" data-testid="bezkat-totals">
              {totals.count} szt. · {fmtPLN(totals.netto_sum)}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={backfillFromPositions} disabled={busy}
            className="bg-[#3D5378] hover:bg-[#4A6491] text-white"
            title="Dla faktur z pozycjami mającymi kategorię — przenosi kod z pozycji na nagłówek"
            data-testid="bezkat-backfill-btn">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
            Przenieś kody z pozycji
          </Button>
          <Button size="sm" onClick={applyAllSuggestions} disabled={busy || !totals?.with_suggestion}
            className="bg-[#4F6343] hover:bg-[#5E7650] text-white"
            data-testid="bezkat-apply-suggestions-btn">
            <Wand2 className="h-4 w-4 mr-1" />
            Zastosuj sugestie ({totals?.with_suggestion || 0})
          </Button>
        </div>
      </CardHeader>
      <div className="px-4 pb-3">
        <div className="text-[11px] text-[#94A3B8] mb-2">
          Te faktury <span className="text-[#FCA5A5] font-semibold">NIE są wliczane</span> do Rachunku Wyników, Sprzedaży ani Dashboardu.
          Przypisz kategorię, aby je uwzględnić. Sugestie oparte są na pozycjach faktury lub historii kontrahenta.
        </div>
        <div className="relative max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-[#94A3B8]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj: kontrahent / nr faktury"
            className="pl-7 h-8 bg-[#1E2A44] border-[#3D5378] text-white text-xs"
            data-testid="bezkat-search-input" />
        </div>
      </div>
      <CardContent className="p-0 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-[#9DBC85] flex items-center justify-center gap-2" data-testid="bezkat-empty">
            <CheckCircle2 className="h-5 w-5" />
            {rows.length === 0 ? 'Wszystkie faktury mają przypisaną kategorię 🎉' : 'Brak wyników dla filtra'}
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="bezkat-table">
            <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs">
              <tr>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Kontrahent</th>
                <th className="p-2 text-left">Nr faktury</th>
                <th className="p-2 text-right">Netto</th>
                <th className="p-2 text-left">Sugestia</th>
                <th className="p-2 text-left w-48">Kod (przypisz)</th>
                <th className="p-2 text-left w-40">Budowa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-[#3D5378]/40 hover:bg-[#1E2A44]/50" data-testid={`bezkat-row-${r.id}`}>
                  <td className="p-2 text-[#CBD5E1] whitespace-nowrap">{r.date || '-'}</td>
                  <td className="p-2 text-white max-w-[240px] truncate" title={r.kontrahent}>{r.kontrahent || '-'}</td>
                  <td className="p-2 text-[#CBD5E1] whitespace-nowrap">{r.nr_faktury || '-'}</td>
                  <td className="p-2 text-right text-[#FCA5A5] tabular-nums whitespace-nowrap">{fmtPLN(r.netto)}</td>
                  <td className="p-2">
                    {r.suggested_kod_id ? (
                      <button onClick={() => assignKod(r, r.suggested_kod_id)}
                        className="text-[10px] px-2 py-1 rounded bg-[#4F6343]/30 border border-[#4F6343] text-[#9DBC85] hover:bg-[#4F6343]/60 transition-colors"
                        title={`Źródło: ${r.suggestion_source === 'pozycje' ? 'pozycje faktury' : 'historia kontrahenta'} — kliknij aby przypisać`}
                        data-testid={`bezkat-suggestion-${r.id}`}>
                        {r.suggested_kod_name || r.suggested_kod_id}
                      </button>
                    ) : <span className="text-[#475569] text-[10px] italic">brak</span>}
                  </td>
                  <td className="p-2">{renderKodSelect(r)}</td>
                  <td className="p-2">
                    <select value={r.budowa_id || ''} onChange={(e) => assignBudowa(r, e.target.value)}
                      className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-1 py-1 text-xs"
                      data-testid={`bezkat-budowa-select-${r.id}`}>
                      <option value="">— bez budowy —</option>
                      {budowy.filter(b => !b.is_archived).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};
