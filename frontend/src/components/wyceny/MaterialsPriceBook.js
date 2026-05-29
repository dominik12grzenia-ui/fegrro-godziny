// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { MaterialRow } from './MaterialRow';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './_shared';

export const MaterialsPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // iter95ah: zwijanie kategorii + ukrywanie pustych
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [hideEmpty, setHideEmpty] = useState(true);

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'materials' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja wiersza bez fetchRows (zachowuje focus + brak migotania)
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async (subCategory) => {
    try {
      await api.post('/wyceny/cennik', {
        category: 'materials', sub_category: subCategory, name: '',
        unit_price_netto: 0,
      });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Grupuj po sub_category - zachowaj zdefiniowana kolejnosc
  const grouped = useMemo(() => {
    const g = {};
    MATERIAL_SUB_CATS.forEach((c) => { g[c] = []; });
    rows.forEach((r) => {
      const sc = (r.sub_category || 'pozostałe').toLowerCase();
      const key = MATERIAL_SUB_CATS.includes(sc) ? sc : 'pozostałe';
      g[key].push(r);
    });
    return g;
  }, [rows]);

  return (
    <div className="space-y-2" data-testid="materials-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj produktu..."
          className="bg-[#152033] border-[#3D5378] max-w-sm" data-testid="materials-search" />
        <label className="text-[10px] text-[#CBD5E1] flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)}
            data-testid="materials-hide-empty" />
          Ukryj puste kategorie
        </label>
        <div className="text-xs text-[#CBD5E1]">
          {rows.length} pozycji
        </div>
      </div>
      {loading ? <div className="text-[#CBD5E1]">Ładuję...</div> : (
        <div className="overflow-x-auto border border-[#3D5378] rounded">
          <table className="w-full text-xs" data-testid="materials-table">
            <thead className="bg-[#152033] text-[#CBD5E1] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[100px]">kategoria</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[160px]">nazwa produktu</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[100px]">cena oferty</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[120px]">oferent</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[100px]">opakowanie</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[70px]">ilość</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[60px]">jd</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[110px]">zapotrzebowanie</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[90px]">jd. do jd.</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[90px]">warstw</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[110px]" title="Koszty dodatkowe doliczane do każdej jednostki (np. transport)">koszty inne do jd</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[120px]" title="Cena materiału przeliczona na 1 jednostkę wyrobu (np. zł/m² ściany). Wymaga uzupełnienia: ilość w opakowaniu, zapotrzebowanie, jd. do jd.">cena/jd. wyrobu</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[140px]">uwagi</th>
                <th className="p-2 border-b border-[#3D5378] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_SUB_CATS.map((sc) => {
                const items = grouped[sc] || [];
                if (hideEmpty && items.length === 0) return null;
                const isCollapsed = collapsed.has(sc);
                const toggle = () => {
                  setCollapsed((prev) => {
                    const n = new Set(prev);
                    if (n.has(sc)) n.delete(sc); else n.add(sc);
                    return n;
                  });
                };
                return (
                  <React.Fragment key={sc}>
                    <tr className="bg-[#1E2A44]">
                      <td colSpan="13" className="p-1.5 border-b border-[#3D5378]">
                        <button onClick={toggle}
                          className="flex items-center gap-2 text-[#D4AF37] font-semibold text-[11px] uppercase hover:text-[#FCD34D]"
                          data-testid={`mat-cat-toggle-${sc}`}>
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronDown className="h-3.5 w-3.5" />}
                          📁 {sc}
                          <span className="text-[10px] text-[#CBD5E1] font-normal normal-case">
                            ({items.length} {items.length === 1 ? 'pozycja' : items.length < 5 ? 'pozycje' : 'pozycji'})
                          </span>
                        </button>
                      </td>
                      <td className="p-1 border-b border-[#3D5378] text-right">
                        <button onClick={() => addRow(sc)} className="text-[#9DBC85] hover:text-[#C8E4B5] text-[11px]"
                          title="Dodaj pozycję w kategorii" data-testid={`mat-add-${sc}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && (items.length === 0 ? (
                      <tr><td colSpan="14" className="p-2 text-[#94A3B8] text-center text-[10px]">— brak pozycji —</td></tr>
                    ) : (
                      items.map((it) => (
                        <MaterialRow key={it.id} item={it} onLocalUpdate={updateLocal} onCategoryChange={fetchRows} onDel={() => remove(it.id)} />
                      ))
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

