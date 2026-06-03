// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { AlertCircle, AlertTriangle, Archive, ArchiveRestore, ArrowLeft, BookOpen, Briefcase, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Edit2, FileBarChart, FileDown, FilePlus, FileSpreadsheet, FileText, Loader2, Mail, Pencil, Plus, Receipt, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, fmt } from './_shared';
import { NipLookup } from './NipLookup';
import { ColorPicker } from '../ui/ColorPicker';

const EMPTY_FORM = { name: '', code: '', show_in_hours: true, has_budget: true, is_gir: false, kaucja_gir_pct: 2.0, is_dw: false, kaucja_dw_pct: 2.0, koszt_budowy_pct: 0.0, zamawiajacy: '', umowa_nr: '', umowa_data: '', wykonawca: '', color: null };

export const BudowyPanel = () => {
  const [rows, setRows] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);  // budowa or null
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);

  // iter95y: zestaw kolorow uzywanych przez inne budowy (do highlight w pickerze)
  const usedColors = useMemo(() => {
    const s = new Set();
    rows.forEach((b) => {
      if (b.color && (!editing || b.id !== editing.id)) s.add(b.color);
    });
    return s;
  }, [rows, editing]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/finance/budowy?include_archived=${includeArchived}`);
      setRows(res.data.rows);
    } catch {
      toast.error('Błąd pobierania budow');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwe'); return; }
    try {
      if (editing) {
        await api.put(`/finance/budowy/${editing.id}`, form);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/finance/budowy', form);
        toast.success('Dodano');
      }
      setShowAdd(false); setEditing(null);
      setForm(EMPTY_FORM);
      fetchData(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name, code: b.code || '',
      show_in_hours: !!b.show_in_hours,
      has_budget: b.has_budget !== false,  // default true gdy brak flagi
      is_gir: !!b.is_gir,
      kaucja_gir_pct: b.kaucja_gir_pct != null ? b.kaucja_gir_pct : 2.0,
      is_dw: !!b.is_dw,
      kaucja_dw_pct: b.kaucja_dw_pct != null ? b.kaucja_dw_pct : 2.0,
      koszt_budowy_pct: b.koszt_budowy_pct != null ? b.koszt_budowy_pct : 0.0,
      zamawiajacy: b.zamawiajacy || '',
      umowa_nr: b.umowa_nr || '',
      umowa_data: b.umowa_data || '',
      wykonawca: b.wykonawca || '',
      color: b.color || null,
    });
    setShowAdd(true);
  };

  const archive = async (b) => {
    if (!window.confirm(`Zarchiwizowac "${b.name}"?\n\nDane zapisow zostana w bazie, ale budowa zniknie z listy godzin.`)) return;
    try { await api.post(`/finance/budowy/${b.id}/archive`); toast.success('Zarchiwizowano'); fetchData(true); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };
  const unarchive = async (b) => {
    try { await api.post(`/finance/budowy/${b.id}/unarchive`); toast.success('Przywrocono'); fetchData(true); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };
  const remove = async (b) => {
    if (!window.confirm(`TRWALE usunac "${b.name}"?\n\nMozliwe tylko gdy brak zapisow finansowych.`)) return;
    try { await api.delete(`/finance/budowy/${b.id}`); toast.success('Usunieto'); fetchData(true); }
    catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378] shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-white font-display text-lg tracking-tight">Budowy ({rows.length})</CardTitle>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer mr-2">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-[#4F6343] h-4 w-4" data-testid="finance-show-archived" />
            Pokaż archiwalne
          </label>
          {/* iter95ci: jednoklik sync budow z W godzinach do panelu Brygadzisty */}
          <Button
            onClick={async () => {
              if (!window.confirm('Zsynchronizować budowy z modułu Finanse z panelem Brygadzisty?\n\n• Utworzy brakujące budowy\n• Zaktualizuje is_active wg "W godzinach"\n• Usunie nieistniejące/archiwalne budowy z listy brygadzistów')) return;
              try {
                const r = await api.post('/finance/sync-to-sites');
                toast.success(`Sync OK: utworzono ${r.data.created}, zaktualizowano ${r.data.updated}, usunięto ${r.data.removed}`);
              } catch (e) {
                toast.error(e.response?.data?.detail || 'Błąd synchronizacji');
              }
            }}
            variant="outline"
            className="border-[#5F7552] text-[#9DBC85] hover:bg-[#5F7552]/10"
            title="Pełna synchronizacja: tworzy brakujące, aktualizuje status, USUWA nieistniejące/archiwalne budowy z panelu Brygadzisty"
            data-testid="finance-sync-to-sites-btn"
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Sync z panelem Brygadzisty
          </Button>
          <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowAdd(true); }}
            className="bg-[#4F6343] hover:bg-[#5F7552] text-white transition-colors shadow-sm" data-testid="finance-add-budowa">
            <Plus className="h-4 w-4 mr-1" /> Dodaj budowe
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && rows.length === 0 ? <div className="p-6 text-[#CBD5E1]">Ładowanie...</div> :
        rows.length === 0 ? <div className="p-6 text-[#CBD5E1]">Brak budow. Dodaj pierwsza.</div> :
        /* iter95bl: responsywny wrapper - na mobile tabela przewija sie poziomo */
        <div className="overflow-x-auto -mx-px">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-4 text-left border-b border-[#3D5378]">Nazwa</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]">W godzinach</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]" title="Czy budowa ma być widoczna w module Budżet">W budżecie</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]">GIR %</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]">DW %</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]" title="Koszt budowy - % do kolumny J w kosztorysie">Koszt budowy %</th>
              <th className="py-3 px-4 text-center border-b border-[#3D5378]">Status</th>
              <th className="py-3 px-4 text-right border-b border-[#3D5378]">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-[#3D5378] hover:bg-[#1E2A44]/50 transition-colors" data-testid={`finance-budowa-row-${b.id}`}>
                <td className="py-3 px-4 text-white font-medium">{b.name}</td>
                <td className="py-3 px-4 text-center">{b.show_in_hours ? <span className="text-[#5F7552]">TAK</span> : <span className="text-[#3D5378]">-</span>}</td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={async () => {
                      const newVal = !(b.has_budget !== false);
                      try {
                        await api.put(`/finance/budowy/${b.id}`, { has_budget: newVal });
                        toast.success(newVal ? 'Budowa dodana do modułu Budżet' : 'Budowa ukryta z modułu Budżet');
                        fetchData(true);
                      } catch (e) { toast.error(e.response?.data?.detail || 'Błąd'); }
                    }}
                    className="text-xs px-2 py-1 rounded transition-colors hover:opacity-80"
                    title="Kliknij aby przełączyć widoczność w module Budżet"
                    data-testid={`finance-budowa-has-budget-${b.id}`}
                  >
                    {b.has_budget !== false
                      ? <span className="text-[#5F7552] bg-[#4F6343]/20 px-2 py-1 rounded">TAK</span>
                      : <span className="text-[#CBD5E1] bg-[#1E2A44] px-2 py-1 rounded">NIE</span>}
                  </button>
                </td>
                <td className="py-3 px-4 text-center">{b.is_gir ? <span className="text-[#D4AF37] font-mono tabular-nums">{fmt(b.kaucja_gir_pct ?? 2)}%</span> : <span className="text-[#3D5378]">-</span>}</td>
                <td className="py-3 px-4 text-center">{b.is_dw ? <span className="text-[#D4AF37] font-mono tabular-nums">{fmt(b.kaucja_dw_pct ?? 2)}%</span> : <span className="text-[#3D5378]">-</span>}</td>
                <td className="py-3 px-4 text-center" data-testid={`finance-budowa-koszt-cell-${b.id}`}>{(b.koszt_budowy_pct ?? 0) > 0 ? <span className="text-[#D4AF37] font-mono tabular-nums">{fmt(b.koszt_budowy_pct)}%</span> : <span className="text-[#3D5378]">-</span>}</td>
                <td className="py-3 px-4 text-center">
                  {b.is_archived ? <span className="text-[#CBD5E1] text-xs px-2 py-1 bg-[#1E2A44] rounded">Archiwum</span> : <span className="text-[#5F7552] text-xs px-2 py-1 bg-[#4F6343]/20 rounded">Aktywna</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-[#3D5378] rounded transition-colors" title="Edytuj" data-testid={`finance-budowa-edit-${b.id}`}>
                      <Edit2 className="h-4 w-4 text-[#CBD5E1]" />
                    </button>
                    {b.is_archived
                      ? <button onClick={() => unarchive(b)} className="p-1.5 hover:bg-[#3D5378] rounded transition-colors" title="Przywroc" data-testid={`finance-budowa-unarchive-${b.id}`}><ArchiveRestore className="h-4 w-4 text-[#4F6343]" /></button>
                      : <button onClick={() => archive(b)} className="p-1.5 hover:bg-[#3D5378] rounded transition-colors" title="Archiwizuj" data-testid={`finance-budowa-archive-${b.id}`}><Archive className="h-4 w-4 text-[#CBD5E1]" /></button>
                    }
                    <button onClick={() => remove(b)} className="p-1.5 hover:bg-[#9B2C2C]/20 rounded transition-colors" title="Usuń trwale" data-testid={`finance-budowa-delete-${b.id}`}><Trash2 className="h-4 w-4 text-[#FCA5A5]" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="bg-[#243049] border-[#3D5378] text-[#F1F5F9] max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="finance-budowa-modal">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? 'Edytuj budowe' : 'Dodaj budowe'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Nazwa</label>
              <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="np. LEBA, SASINO" className="bg-[#1E2A44] border-[#3D5378] text-white" autoFocus
                data-testid="finance-budowa-name" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E2A44] rounded">
              <input type="checkbox" checked={form.show_in_hours} onChange={(e) => setForm({...form, show_in_hours: e.target.checked})}
                className="accent-[#4F6343]" data-testid="finance-budowa-show-in-hours" />
              <span>Pokaż w liscie godzin (przypisywanie pracownikow)</span>
            </label>
            {/* iter95cj: ostrzezenie gdy show_in_hours wylaczone */}
            {!form.show_in_hours && (
              <div className="text-[11px] text-[#FCA5A5] bg-[#9B2C2C]/15 border border-[#9B2C2C]/40 rounded px-3 py-2 -mt-1 mb-1 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <b>Uwaga:</b> bez tej opcji <b>brygadziści NIE zobaczą tej budowy</b> w panelu i nie będzie można im jej przypisać.
                  Włącz jeśli chcesz aby ekipa pracowała na tej budowie.
                </span>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-[#1E2A44] rounded">
              <input type="checkbox" checked={form.has_budget} onChange={(e) => setForm({...form, has_budget: e.target.checked})}
                className="accent-[#D4AF37]" data-testid="finance-budowa-has-budget-modal" />
              <span>Widoczna w module <b>Budżet</b> (kosztorys/protokoly)</span>
            </label>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#1E2A44] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_gir} onChange={(e) => setForm({...form, is_gir: e.target.checked})}
                  className="accent-[#D4AF37]" data-testid="finance-budowa-is-gir" />
                <span>Budowa GIR — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({...form, kaucja_gir_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_gir}
                className="w-20 no-spinner bg-[#1E2A44] border-[#3D5378] text-white text-right"
                data-testid="finance-budowa-gir-pct" />
              <span className="text-[#CBD5E1]">% z przychodu</span>
            </div>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#1E2A44] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={form.is_dw} onChange={(e) => setForm({...form, is_dw: e.target.checked})}
                  className="accent-[#D4AF37]" data-testid="finance-budowa-is-dw" />
                <span>Budowa DW — Kaucja</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({...form, kaucja_dw_pct: parseFloat(e.target.value) || 0})}
                disabled={!form.is_dw}
                className="w-20 no-spinner bg-[#1E2A44] border-[#3D5378] text-white text-right"
                data-testid="finance-budowa-dw-pct" />
              <span className="text-[#CBD5E1]">% z przychodu</span>
            </div>
            <div className="flex items-center gap-2 text-sm p-2 hover:bg-[#1E2A44] rounded">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <span className="text-[#D4AF37]">●</span>
                <span>Koszt budowy (kolumna J w kosztorysie)</span>
              </label>
              <Input type="number" step="0.1" min="0" max="100" value={form.koszt_budowy_pct}
                onChange={(e) => setForm({...form, koszt_budowy_pct: parseFloat(e.target.value) || 0})}
                className="w-20 no-spinner bg-[#1E2A44] border-[#3D5378] text-white text-right"
                data-testid="finance-budowa-koszt-pct" />
              <span className="text-[#CBD5E1]">% z przychodu</span>
            </div>
            <div className="text-[10px] text-[#94A3B8] px-2">
              Koszt budowy = % od przychodu pozycji (Przychód × % = Koszt budowy). Liczony tak samo jak kaucje. Odejmowany od Budżetu Zwolnionego (kolumna K = G − H − I − J).
            </div>
            {/* iter95y: kolor budowy - widoczny w tabeli godzin */}
            <div className="p-3 rounded-md border border-[#3D5378] bg-[#1E2A44] mt-2" data-testid="finance-budowa-color-block">
              <ColorPicker
                value={form.color || null}
                onChange={(c) => setForm({ ...form, color: c })}
                usedColors={usedColors}
                label="Kolor budowy (opcjonalnie) — widoczny w tabeli godzin"
                testId="finance-budowa-color"
              />
            </div>
          </div>
          {/* Dane do generowania protokolu miesiecznego */}
          <div className="space-y-2 pt-3 border-t border-[#3D5378]">
            <div className="text-xs text-[#D4AF37] font-semibold uppercase tracking-wide">Dane do protokołu miesięcznego</div>
            <div>
              <label className="text-xs text-[#CBD5E1] block mb-1">Zamawiający (nazwa, adres, NIP)</label>
              <NipLookup onResult={(text) => setForm({...form, zamawiajacy: text})} />
              <textarea value={form.zamawiajacy} onChange={(e) => setForm({...form, zamawiajacy: e.target.value})}
                rows={2}
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-1.5 text-sm"
                data-testid="finance-budowa-zamawiajacy" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-[#CBD5E1] block mb-1">Nr umowy</label>
                <Input value={form.umowa_nr} onChange={(e) => setForm({...form, umowa_nr: e.target.value})}
                  className="bg-[#1E2A44] border-[#3D5378] text-white" data-testid="finance-budowa-umowa-nr" />
              </div>
              <div>
                <label className="text-xs text-[#CBD5E1] block mb-1">Data umowy</label>
                <Input value={form.umowa_data} onChange={(e) => setForm({...form, umowa_data: e.target.value})}
                  placeholder="np. 15.09.2025 + ANEKS 1"
                  className="bg-[#1E2A44] border-[#3D5378] text-white" data-testid="finance-budowa-umowa-data" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#CBD5E1] block mb-1">Wykonawca (nazwa, adres, NIP)</label>
              <NipLookup onResult={(text) => setForm({...form, wykonawca: text})} />
              <textarea value={form.wykonawca} onChange={(e) => setForm({...form, wykonawca: e.target.value})}
                rows={2}
                placeholder="FEGRRO SP. Z O.O., NA RÓWNIKU 1, 83-314 SŁAWKI, NIP: 5892066174"
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-1.5 text-sm"
                data-testid="finance-budowa-wykonawca" />
              <div className="text-[10px] text-[#CBD5E1] mt-0.5">
                Puste = domyślnie FEGRRO SP. Z O.O. (NIP: 589-206-61-74). Pobierz z GUS dla innego wykonawcy.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditing(null); }}
              className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white">Anuluj</Button>
            <ActionButton onAction={submit} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="finance-budowa-submit">{editing ? 'Zapisz' : 'Dodaj'}</ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

