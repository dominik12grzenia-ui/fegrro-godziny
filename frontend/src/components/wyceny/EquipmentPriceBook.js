// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { EquipmentRow } from './EquipmentRow';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './_shared';

export const EquipmentPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'equipment' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'equipment', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="equipment-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy sprzętu..."
          className="bg-[#152033] border-[#3D5378] max-w-sm" data-testid="equipment-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033]"
          data-testid="equipment-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#CBD5E1]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#CBD5E1]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#CBD5E1] text-sm py-6 text-center" data-testid="equipment-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#3D5378] rounded">
          <table className="w-full text-xs" data-testid="equipment-table">
            <thead className="bg-[#152033] text-[#CBD5E1] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[200px]">nazwa sprzętu</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[110px]">koszt za godzinę</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[110px]">koszt za dzień</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[110px]">koszt za miesiąc</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[160px]">wynajmujący</th>
                <th className="text-right p-2 border-b border-r border-[#3D5378] min-w-[100px]">koszty poboczne</th>
                <th className="text-left p-2 border-b border-r border-[#3D5378] min-w-[200px]">opis kosztów pobocznych</th>
                <th className="p-2 border-b border-[#3D5378] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <EquipmentRow key={it.id} item={it} onLocalUpdate={updateLocal} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
          <div className="bg-[#152033]/50 text-[10px] text-[#94A3B8] p-2 border-t border-[#3D5378]">
            ℹ Koszty poboczne są doliczane do każdej jednostki rozliczeniowej (godzina/dzień/miesiąc). Opis pozwala wyjaśnić co wchodzi w skład tej dopłaty (np. transport, paliwo, operator).
          </div>
        </div>
      )}
    </div>
  );
};

