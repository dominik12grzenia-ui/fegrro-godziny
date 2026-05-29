// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { LaborRow } from './LaborRow';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './_shared';

export const LaborPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'labor' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows (zachowuje focus)
  const updateLocal = useCallback((id, patch, fullDoc = null) => {
    setRows((prev) => prev.map((r) => r.id === id ? (fullDoc || { ...r, ...patch }) : r));
  }, []);

  // iter95p: po zmianie ceny refetch tylko TEGO wiersza (zeby zaktualizowac price_history)
  const refetchOne = useCallback(async (id) => {
    try {
      const r = await api.get('/wyceny/cennik', { params: { category: 'labor' } });
      const fresh = (r.data?.rows || []).find((x) => x.id === id);
      if (fresh) updateLocal(id, {}, fresh);
    } catch (_e) { /* ignore */ }
  }, [updateLocal]);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'labor', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="labor-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy robocizny..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="labor-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="labor-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#94A3B8]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="labor-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="labor-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[260px]">nazwa robocizny</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m²</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m³</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[280px]">
                  Wartości historyczne po zmianach (historia)
                </th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <LaborRow key={it.id} item={it} onLocalUpdate={updateLocal} onPriceChange={refetchOne} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

