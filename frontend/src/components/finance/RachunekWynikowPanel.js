// iter95bc: wydzielony z Finance.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { AlertCircle, AlertTriangle, ArrowLeft, BookOpen, Briefcase, Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Edit2, FileBarChart, FileDown, FilePlus, FileSpreadsheet, FileText, Loader2, Mail, Pencil, Plus, Receipt, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, PL_MONTHS_SHORT, fmtNum } from './_shared';
import { PaymentSummaryPanel } from './PaymentSummaryPanel';

export const RachunekWynikowPanel = ({ year, onTileClick }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({ kp: false, kbb: false, ksb: false, ksp: false });
  const [showAddKod, setShowAddKod] = useState(false);
  const [newKod, setNewKod] = useState({ name: '', category: 'KBB', order: 100 });
  const [editingKod, setEditingKod] = useState(null); // { kod_id, name }
  const [allKody, setAllKody] = useState([]);

  const fetchAllKody = () => {
    api.get('/finance/kody').then(r => setAllKody(r.data.rows || []));
  };

  const renameKod = async (kodId) => {
    const name = (editingKod?.name || '').trim();
    if (!name) { setEditingKod(null); return; }
    try {
      await api.put(`/finance/kody/${kodId}`, { name });
      toast.success('Nazwa zaktualizowana');
      setEditingKod(null);
      fetchRW(true);
      fetchAllKody();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  const deleteKod = async (kodId, name) => {
    if (!window.confirm(`Usunac kod "${name}"?\n\nMozliwe tylko gdy nie ma zapisow z tym kodem.`)) return;
    try {
      await api.delete(`/finance/kody/${kodId}`);
      toast.success('Kod usuniety');
      fetchRW(true);
      fetchAllKody();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Nie można usunac');
    }
  };

  const fetchRW = (silent = false) => {
    if (!silent) setLoading(true);
    api.get(`/finance/rachunek-wynikow?year=${year}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Błąd pobierania rachunku'))
      .finally(() => setLoading(false));
  };

  const submitNewKod = async () => {
    const name = newKod.name.trim();
    if (!name) { toast.error('Wpisz nazwe'); return; }
    // Auto-generuj ID: CATEGORY_NAZWA (np. KBB_TELEFONY)
    const slug = name.toUpperCase()
      .replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (c) => ({Ą:'A',Ć:'C',Ę:'E',Ł:'L',Ń:'N',Ó:'O',Ś:'S',Ź:'Z',Ż:'Z'}[c] || c))
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const id = `${newKod.category}_${slug}`;
    try {
      await api.post('/finance/kody', {
        id, name, category: newKod.category, order: newKod.order || 100,
      });
      toast.success('Dodano kod');
      setShowAddKod(false);
      setNewKod({ name: '', category: 'KBB', order: 100 });
      fetchRW(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  useEffect(() => {
    fetchRW();
    fetchAllKody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  if (loading && !data) return <Card className="bg-[#243049] border-[#3D5378]"><CardContent className="p-6 text-[#CBD5E1]">Ładowanie...</CardContent></Card>;
  if (!data) return null;

  const { summary, ratios, groups } = data;
  const monthsHeader = PL_MONTHS_SHORT;
  // Renderujemy panel platnosci nad tabela (kontrachenci do zaplaty / my do zaplaty / przeterminowane)

  const renderRow = (label, monthly, total, opts = {}) => (
    <tr className={`border-t-2 border-[#3D5378] ${opts.bg || ''}`} data-testid={opts.testid}>
      <td className={`p-2 border-r-2 border-[#3D5378] ${opts.labelClass || 'text-white'} sticky left-0 ${opts.bg || 'bg-[#243049]'} z-10`}>
        {opts.indent && <span className="ml-4" />}
        {label}
      </td>
      {monthly.map((v, i) => (
        <td key={i} className={`p-1 text-right text-xs border-r border-[#3D5378] ${opts.valClass || 'text-[#F1F5F9]'}`}>{(opts.numFmt || fmtNum)(v)}</td>
      ))}
      <td className={`p-2 text-right font-bold border-l-2 border-[#3D5378] ${opts.totalClass || 'text-white'} bg-[#1E2A44]`}>{total === '-' ? '-' : (opts.numFmt || fmtNum)(total)}</td>
    </tr>
  );

  const toggle = (k) => setExpanded(s => ({ ...s, [k]: !s[k] }));

  return (
    <>
      {/* Podsumowanie platnosci - tylko w Rachunek wynikow */}
      <PaymentSummaryPanel onTileClick={onTileClick} year={year} />
      <Card className="bg-[#243049] border-[#3D5378]">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-white">Rachunek wyników {year}</CardTitle>
          <Button onClick={() => setShowAddKod(true)}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="rw-add-kod-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj pozycje kosztowa
          </Button>
        </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm finance-grid-table" data-testid="finance-rw-table">
          <thead className="bg-[#1E2A44] text-[#CBD5E1] sticky top-0">
            <tr>
              <th className="p-2 text-left border-r-2 border-[#3D5378] sticky left-0 bg-[#1E2A44] z-20">Pozycja</th>
              {monthsHeader.map((m, i) => <th key={i} className="p-1 text-right text-xs min-w-[60px] border-r border-[#3D5378]">{m}</th>)}
              <th className="p-2 text-right border-l-2 border-[#3D5378]">SUMA</th>
            </tr>
          </thead>
          <tbody>
            {renderRow('PRZYCHODY NETTO', summary.przychody_netto.monthly, summary.przychody_netto.total,
              { bg: 'bg-[#4F6343]/15', labelClass: 'text-[#4F6343] font-bold', totalClass: 'text-[#4F6343]', testid: 'rw-przychody' })}
            {renderRow('SUMA KOSZTOW', summary.suma_kosztow.monthly, summary.suma_kosztow.total,
              { bg: 'bg-[#DC4A3A]/10', labelClass: 'text-[#DC4A3A] font-bold', totalClass: 'text-[#DC4A3A]', testid: 'rw-koszty' })}
            {renderRow('PODATEK', summary.podatek.monthly, summary.podatek.total,
              { labelClass: 'text-[#F1F5F9]', testid: 'rw-podatek' })}
            {renderRow('KAUCJA GIR', summary.kaucja_gir.monthly, summary.kaucja_gir.total,
              { labelClass: 'text-[#CBD5E1]' })}
            {renderRow('KAUCJA DW', summary.kaucja_dw.monthly, summary.kaucja_dw.total,
              { labelClass: 'text-[#CBD5E1]' })}
            {renderRow('WYNIK NETTO', summary.wynik_netto.monthly, summary.wynik_netto.total,
              { bg: 'bg-[#D4AF37]/15', labelClass: 'text-[#D4AF37] font-bold', totalClass: 'text-[#D4AF37]', testid: 'rw-wynik' })}
            {renderRow('ILOSC GODZIN', summary.godziny.monthly, summary.godziny.total,
              { labelClass: 'text-[#CBD5E1]' })}

            {/* Wskaźniki */}
            <tr><td colSpan={14} className="p-1 bg-[#1E2A44] text-[#CBD5E1] text-xs uppercase border-y-2 border-[#3D5378]">Wskaźniki / R-G</td></tr>
            {renderRow('Koszt R-G (firma + pracownik)', ratios.koszt_rg_firma_pracownik, '-', { labelClass: 'text-[#CBD5E1] italic', valClass: 'text-[#F1F5F9] text-xs italic' })}
            {renderRow('Przychody / R-G', ratios.przychody_rg, '-', { labelClass: 'text-[#CBD5E1] italic', valClass: 'text-[#F1F5F9] text-xs italic' })}
            {renderRow('Koszty / R-G', ratios.koszty_rg, '-', { labelClass: 'text-[#CBD5E1] italic', valClass: 'text-[#F1F5F9] text-xs italic' })}
            {renderRow('Koszty budowy / R-G', ratios.koszty_budowy_rg, '-', { labelClass: 'text-[#CBD5E1] italic', valClass: 'text-[#F1F5F9] text-xs italic' })}
            {renderRow('Koszty ogolne / R-G', ratios.koszty_ogolne_rg, '-', { labelClass: 'text-[#CBD5E1] italic', valClass: 'text-[#F1F5F9] text-xs italic' })}

            {/* Groups */}
            {['kp','kbb','ksb','ksp'].map(g => (
              <React.Fragment key={g}>
                <tr className="border-t-4 border-[#4F6343] hover:bg-[#1E2A44]/50 cursor-pointer" onClick={() => toggle(g)} data-testid={`rw-group-toggle-${g}`}>
                  <td className="p-2 text-white font-semibold border-r-2 border-[#3D5378] sticky left-0 bg-[#243049] z-10">
                    {expanded[g] ? <ChevronDown className="inline h-4 w-4 mr-1" /> : <ChevronRight className="inline h-4 w-4 mr-1" />}
                    {groups[g].label}
                  </td>
                  {groups[g].monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#F1F5F9] border-r border-[#3D5378]">{fmtNum(v)}</td>)}
                  <td className="p-2 text-right font-bold text-white bg-[#1E2A44] border-l-2 border-[#3D5378]">{fmtNum(groups[g].total)}</td>
                </tr>
                {expanded[g] && groups[g].rows.map((r) => {
                  const isEditing = editingKod?.kod_id === r.kod_id;
                  const kodMeta = allKody.find(k => k.id === r.kod_id);
                  const isCustom = !!kodMeta?.is_custom;
                  return (
                  <tr key={r.kod_id} className="border-t border-[#3D5378] bg-[#1E2A44]/30" data-testid={`rw-detail-${r.kod_id}`}>
                    <td className="p-2 pl-8 text-[#CBD5E1] text-xs border-r-2 border-[#3D5378] sticky left-0 bg-[#243049] z-10">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editingKod.name}
                            onChange={(e) => setEditingKod({ ...editingKod, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') renameKod(r.kod_id); if (e.key === 'Escape') setEditingKod(null); }}
                            onBlur={() => renameKod(r.kod_id)}
                            className="bg-[#1E2A44] border border-[#4F6343] text-white rounded px-1 py-0.5 text-xs flex-1"
                            data-testid={`rw-kod-edit-input-${r.kod_id}`} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className="cursor-pointer hover:text-white flex-1" onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            data-testid={`rw-kod-label-${r.kod_id}`}>
                            {r.name}
                          </span>
                          <button onClick={() => setEditingKod({ kod_id: r.kod_id, name: r.name })}
                            className="text-[#4F6343] hover:text-white opacity-50 hover:opacity-100"
                            title="Edytuj nazwe"
                            data-testid={`rw-kod-edit-btn-${r.kod_id}`}>
                            <Edit2 className="h-3 w-3" />
                          </button>
                          {isCustom && (
                            <button onClick={() => deleteKod(r.kod_id, r.name)}
                              className="text-[#9B2C2C] hover:text-white opacity-80 hover:opacity-100"
                              title="Usuń kod (tylko gdy nieuzywany)"
                              data-testid={`rw-kod-del-btn-${r.kod_id}`}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    {r.monthly.map((v, i) => <td key={i} className="p-1 text-right text-xs text-[#CBD5E1] border-r border-[#3D5378]">{fmtNum(v)}</td>)}
                    <td className="p-2 text-right text-xs text-[#F1F5F9] bg-[#1E2A44] border-l-2 border-[#3D5378]">{fmtNum(r.total)}</td>
                  </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </CardContent>

      {/* Modal: dodaj kod kosztu */}
      <Dialog open={showAddKod} onOpenChange={setShowAddKod}>
        <DialogContent className="bg-[#243049] border-[#3D5378] text-white">
          <DialogHeader>
            <DialogTitle>Dodaj pozycje kosztowa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Nazwa kodu</label>
              <Input value={newKod.name} onChange={(e) => setNewKod({...newKod, name: e.target.value})}
                placeholder="np. Telefony, Internet, Paliwo..." className="bg-[#1E2A44] border-[#3D5378] text-white"
                data-testid="rw-add-kod-name" />
            </div>
            <div>
              <label className="text-sm text-[#CBD5E1] block mb-1">Kategoria (do ktorej grupy)</label>
              <select value={newKod.category} onChange={(e) => setNewKod({...newKod, category: e.target.value})}
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white rounded px-2 py-2 text-sm"
                data-testid="rw-add-kod-category">
                <option value="KBB">KBB - Koszty budowy bezpośrednie</option>
                <option value="KSB">KSB - Koszty stałe budowy</option>
                <option value="KSP">KSP - Koszty stałe przedsiebiorstwa</option>
                <option value="KP">KP - Koszty pracy</option>
              </select>
            </div>
            <div className="text-[10px] text-[#94A3B8]">
              Po dodaniu kod będzie dostępny w dropdownie "Kod kosztu" w Zapisach (faktury i recznych). Można usunac kod tylko jesli nie jest używany w zadnym zapisie.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddKod(false)}
              className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378] hover:text-white">Anuluj</Button>
            <ActionButton onAction={submitNewKod} className="bg-[#4F6343] hover:bg-[#3F5235] text-white" data-testid="rw-add-kod-submit">Dodaj</ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Card>
    </>
  );
};

