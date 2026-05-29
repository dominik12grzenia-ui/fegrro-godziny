// iter95bc: wydzielony z Wyceny.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, Package, Send, Mail, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { PriceBookRow } from './PriceBookRow';
import { PriceBookAddModal } from './PriceBookAddModal';
import {
  fmtPLN, TYPE_LABEL, TYPE_COLOR, SUB_TYPE_LABEL, SUB_TYPE_COLOR,
  UNITS, evalFormula, computeSubRow, computePosRow, Th, PctInput,
} from './_shared';

export const PriceBook = ({ category }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [category, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję cennika?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-3" data-testid={`pricebook-${category}`}>
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="pricebook-search" />
        <Button onClick={() => setAdding(true)} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="pricebook-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div>
        : rows.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center">Brak pozycji w cenniku.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Nazwa</th>
                <th className="text-left p-2">J.m.</th>
                <th className="text-right p-2">Cena netto (zł)</th>
                <th className="text-left p-2">Notatki</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <PriceBookRow key={it.id} item={it} onChange={fetchRows} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        )}
      {adding && (
        <PriceBookAddModal category={category} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); fetchRows(); }} />
      )}
    </div>
  );
};

