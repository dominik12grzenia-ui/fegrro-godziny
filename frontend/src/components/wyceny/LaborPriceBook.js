// iter95bp/95bq: layout 1:1 jak MaterialsPriceBook + CRUD custom kategorii (persyst w app_settings)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, ChevronDown, ChevronRight, Settings, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { LaborRow } from './LaborRow';
import { LABOR_SUB_CATS } from './_shared';

export const LaborPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [hideEmpty, setHideEmpty] = useState(true);
  // iter95bq: custom kategorie z bazy
  const [customCats, setCustomCats] = useState([]);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'labor' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  const fetchCustomCats = useCallback(() => {
    api.get('/wyceny/labor-categories')
      .then((r) => setCustomCats(r.data?.custom || []))
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { fetchCustomCats(); }, [fetchCustomCats]);

  const updateLocal = useCallback((id, patch, fullDoc = null) => {
    setRows((prev) => prev.map((r) => r.id === id ? (fullDoc || { ...r, ...patch }) : r));
  }, []);

  const refetchOne = useCallback(async (id) => {
    try {
      const r = await api.get('/wyceny/cennik', { params: { category: 'labor' } });
      const fresh = (r.data?.rows || []).find((x) => x.id === id);
      if (fresh) updateLocal(id, {}, fresh);
    } catch (_e) { /* ignore */ }
  }, [updateLocal]);

  const addRow = async (subCategory) => {
    try {
      await api.post('/wyceny/cennik', { category: 'labor', sub_category: subCategory, name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // iter95bq: zarzadzanie kategoriami
  const addCustomCategory = async () => {
    const v = newCatName.trim();
    if (!v) return;
    try {
      await api.post('/wyceny/labor-categories', { name: v });
      setNewCatName('');
      fetchCustomCats();
      toast.success(`Dodano kategorię „${v}"`);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const deleteCustomCategory = async (name) => {
    if (!window.confirm(`Usunąć kategorię „${name}"?\n\nUwaga: jeśli ma pozycje, najpierw przenieś je do innej kategorii.`)) return;
    try {
      await api.delete(`/wyceny/labor-categories/${encodeURIComponent(name)}`);
      fetchCustomCats();
      toast.success(`Usunięto kategorię „${name}"`);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // wszystkie kategorie razem (default + custom), w kolejnosci
  const allCats = useMemo(() => [...LABOR_SUB_CATS, ...customCats], [customCats]);

  // Grupuj po sub_category
  const grouped = useMemo(() => {
    const g = {};
    allCats.forEach((c) => { g[c] = []; });
    rows.forEach((r) => {
      const sc = (r.sub_category || 'pozostałe').toLowerCase();
      const key = allCats.includes(sc) ? sc : (allCats.includes(r.sub_category) ? r.sub_category : 'pozostałe');
      if (!g[key]) g[key] = [];
      g[key].push(r);
    });
    return g;
  }, [rows, allCats]);

  return (
    <div className="space-y-2" data-testid="labor-pricebook">
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy robocizny..."
          className="bg-[#152033] border-[#3D5378] max-w-sm" data-testid="labor-search" />
        <label className="text-[10px] text-[#CBD5E1] flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)}
            data-testid="labor-hide-empty" />
          Ukryj puste kategorie
        </label>
        <div className="text-xs text-[#CBD5E1]">{rows.length} pozycji</div>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setCatMgrOpen(true)}
          className="border-[#5F7552] text-[#9DBC85] h-9"
          data-testid="labor-cat-mgr-btn">
          <Settings className="h-3.5 w-3.5 mr-1" /> Zarządzaj kategoriami
        </Button>
      </div>
      {loading ? <div className="text-[#CBD5E1]">Ładuję...</div> : (
        <div className="overflow-x-auto border border-[#3D5378] rounded">
          <table className="w-full text-xs" data-testid="labor-table">
            <thead className="bg-[#152033] text-[#CBD5E1] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[120px]">kategoria</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[260px]">nazwa robocizny</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[100px]">cena za m²</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[100px]">cena za m³</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[180px]"
                    title="Dowolna jednostka: mb, szt, kpl, godz, dzień, kg, t">
                  <span className="text-[#9DBC85]">cena za inną jedn.</span>
                </th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[90px]"
                    title="Cena minimalna - blokuje obniżenie w trybie negocjacji">
                  <span className="text-[#FCA5A5]">cena min</span>
                </th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[90px]"
                    title="Cena maksymalna (informacja)">
                  <span className="text-[#FCD34D]">cena max</span>
                </th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[240px]">Historia zmian</th>
                <th className="p-2 border-b border-[#3D5378] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {allCats.map((sc) => {
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
                const isCustom = customCats.includes(sc);
                return (
                  <React.Fragment key={sc}>
                    <tr className="bg-[#1E2A44]">
                      <td colSpan="8" className="p-1.5 border-b border-[#3D5378]">
                        <button onClick={toggle}
                          className="flex items-center gap-2 text-[#D4AF37] font-semibold text-[11px] uppercase hover:text-[#FCD34D]"
                          data-testid={`labor-cat-toggle-${sc}`}>
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          📁 {sc}
                          <span className="text-[10px] text-[#CBD5E1] font-normal normal-case">
                            ({items.length} {items.length === 1 ? 'pozycja' : items.length < 5 ? 'pozycje' : 'pozycji'})
                          </span>
                          {isCustom && <span className="text-[9px] uppercase bg-[#9DBC85]/20 text-[#9DBC85] px-1 rounded">custom</span>}
                        </button>
                      </td>
                      <td className="p-1 border-b border-[#3D5378] text-right">
                        <button onClick={() => addRow(sc)} className="text-[#9DBC85] hover:text-[#C8E4B5] text-[11px]"
                          title="Dodaj pozycję w kategorii" data-testid={`labor-add-${sc}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && (items.length === 0 ? (
                      <tr><td colSpan="9" className="p-2 text-[#94A3B8] text-center text-[10px]">— brak pozycji —</td></tr>
                    ) : (
                      items.map((it) => (
                        <LaborRow key={it.id} item={it}
                          customCategories={customCats}
                          onLocalUpdate={updateLocal}
                          onPriceChange={refetchOne}
                          onCategoryChange={fetchRows}
                          onDel={() => remove(it.id)} />
                      ))
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* iter95bq: Dialog zarzadzania kategoriami custom */}
      <Dialog open={catMgrOpen} onOpenChange={setCatMgrOpen}>
        <DialogContent className="bg-[#152033] border-[#3D5378] text-[#F1F5F9] max-w-md"
          data-testid="labor-cat-mgr-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#D4AF37]">Zarządzaj kategoriami robocizny</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase text-[#9DBC85] mb-1">Wbudowane (nieusuwalne)</div>
              <div className="flex flex-wrap gap-1">
                {LABOR_SUB_CATS.map((c) => (
                  <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-[#1E2A44] border border-[#3D5378] text-[#CBD5E1]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#9DBC85] mb-1">Twoje kategorie</div>
              {customCats.length === 0 ? (
                <div className="text-xs text-[#94A3B8] italic py-2">Brak własnych kategorii. Dodaj poniżej.</div>
              ) : (
                <div className="space-y-1">
                  {customCats.map((c) => (
                    <div key={c} className="flex items-center justify-between bg-[#1E2A44] border border-[#3D5378] rounded px-2 py-1"
                         data-testid={`labor-cat-row-${c}`}>
                      <span className="text-sm font-semibold text-[#9DBC85]">📁 {c}</span>
                      <button onClick={() => deleteCustomCategory(c)}
                        className="text-[#FCA5A5] hover:text-[#FECACA] p-1"
                        title="Usuń kategorię"
                        data-testid={`labor-cat-del-${c}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-[#3D5378] pt-3">
              <div className="text-[10px] uppercase text-[#9DBC85] mb-1">Dodaj nową</div>
              <div className="flex gap-2">
                <Input value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomCategory(); }}
                  placeholder="np. malarskie, kotłowe, alpinistyczne..."
                  className="bg-[#0F1828] border-[#3D5378] flex-1"
                  data-testid="labor-cat-new-input" />
                <Button onClick={addCustomCategory}
                  className="bg-[#9DBC85] hover:bg-[#C8E4B5] text-[#152033]"
                  data-testid="labor-cat-new-btn">
                  <Plus className="h-4 w-4 mr-1" /> Dodaj
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatMgrOpen(false)}
              className="border-[#3D5378] text-[#CBD5E1]"
              data-testid="labor-cat-mgr-close">
              <X className="h-4 w-4 mr-1" /> Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
