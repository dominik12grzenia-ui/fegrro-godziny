// iter95bc: wydzielony z Wyceny.js (refaktor split)
// iter95bp: kategorie jak w materialach + mozliwosc dodawania custom kategorii
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { LaborRow } from './LaborRow';
import { LABOR_SUB_CATS } from './_shared';

export const LaborPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // iter95bp: rozwijane sekcje per kategoria
  const [collapsed, setCollapsed] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [customCats, setCustomCats] = useState([]);  // user-defined kategorie

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'labor' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => {
        setRows(r.data?.rows || []);
        // wykryj dodatkowe (custom) kategorie z bazy ktore nie sa w LABOR_SUB_CATS
        const builtinSet = new Set(LABOR_SUB_CATS);
        const extras = new Set();
        (r.data?.rows || []).forEach((x) => {
          const sc = (x.sub_category || '').trim();
          if (sc && !builtinSet.has(sc)) extras.add(sc);
        });
        setCustomCats(Array.from(extras));
      })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

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

  // iter95bp: dodaj nowa custom kategorie (do listy lokalnie - persystuje sie gdy ma >0 pozycji)
  const addCustomCategory = () => {
    const v = newCatName.trim();
    if (!v) return;
    if (LABOR_SUB_CATS.includes(v) || customCats.includes(v)) {
      toast.info('Kategoria już istnieje');
      setNewCatName('');
      return;
    }
    setCustomCats((prev) => [...prev, v]);
    setNewCatName('');
    toast.success(`Dodano kategorię „${v}". Dodaj do niej pozycję by ją utrwalić.`);
  };

  // wszystkie kategorie w stalej kolejnosci
  const allCats = useMemo(() => [...LABOR_SUB_CATS, ...customCats], [customCats]);

  // grupuj
  const grouped = useMemo(() => {
    const g = {};
    allCats.forEach((c) => { g[c] = []; });
    g['—'] = [];  // dla pozycji bez kategorii
    rows.forEach((r) => {
      const sc = (r.sub_category || '').trim();
      if (sc && g[sc] !== undefined) g[sc].push(r);
      else if (sc) {
        if (!g[sc]) g[sc] = [];
        g[sc].push(r);
      } else {
        g['—'].push(r);
      }
    });
    return g;
  }, [rows, allCats]);

  return (
    <div className="space-y-2" data-testid="labor-pricebook">
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy robocizny..."
          className="bg-[#152033] border-[#3D5378] max-w-sm" data-testid="labor-search" />
        <div className="text-xs text-[#CBD5E1]">{rows.length} pozycji</div>
        <div className="flex-1" />
        {/* iter95bp: dodaj custom kategorie */}
        <div className="flex items-center gap-1 border-l border-[#3D5378] pl-2">
          <Input value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustomCategory(); }}
            placeholder="nowa kategoria..."
            className="bg-[#152033] border-[#3D5378] h-9 w-44 text-xs"
            data-testid="labor-new-cat-input" />
          <Button onClick={addCustomCategory} variant="outline"
            className="border-[#5F7552] text-[#9DBC85] h-9"
            data-testid="labor-add-cat-btn">
            <Plus className="h-3 w-3 mr-1" /> Kategoria
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-[#CBD5E1]">Ładuję...</div>
      ) : (
        <div className="space-y-1">
          {[...allCats, '—'].map((sc) => {
            const list = grouped[sc] || [];
            if (sc === '—' && list.length === 0) return null;
            const isCollapsed = !!collapsed[sc];
            return (
              <div key={sc} className="border border-[#3D5378] rounded overflow-hidden">
                <button onClick={() => setCollapsed((c) => ({ ...c, [sc]: !isCollapsed }))}
                  className="w-full flex items-center justify-between bg-[#152033] hover:bg-[#1E2A44]
                    px-3 py-2 text-sm border-b border-[#3D5378] text-left transition"
                  data-testid={`labor-cat-toggle-${sc}`}>
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-[#9DBC85]" /> :
                      <ChevronDown className="h-4 w-4 text-[#9DBC85]" />}
                    <span className="font-semibold capitalize text-[#F1F5F9]">{sc === '—' ? 'Bez kategorii' : sc}</span>
                    <span className="text-[10px] text-[#94A3B8]">({list.length})</span>
                    {customCats.includes(sc) && <span className="text-[9px] uppercase bg-[#9DBC85]/20 text-[#9DBC85] px-1 rounded">custom</span>}
                  </div>
                  {sc !== '—' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); addRow(sc); }}
                      className="text-xs text-[#D4AF37] hover:text-[#FCD34D] px-2 py-0.5 border border-[#D4AF37]/50 rounded hover:bg-[#D4AF37]/10"
                      data-testid={`labor-add-row-${sc}`}>
                      + dodaj pozycję
                    </button>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid={`labor-table-${sc}`}>
                      <thead className="bg-[#1E2A44] text-[#CBD5E1]">
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
                          <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[240px]">
                            Historia zmian
                          </th>
                          <th className="p-2 border-b border-[#3D5378] w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="text-[#CBD5E1] text-xs py-3 text-center italic">
                              Brak pozycji w tej kategorii — kliknij „+ dodaj pozycję" powyżej.
                            </td>
                          </tr>
                        ) : (
                          list.map((it) => (
                            <LaborRow key={it.id} item={it}
                              customCategories={customCats}
                              onLocalUpdate={updateLocal}
                              onPriceChange={refetchOne}
                              onCategoryChange={fetchRows}
                              onDel={() => remove(it.id)} />
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
