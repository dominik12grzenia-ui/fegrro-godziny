// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ActionButton, BUDGET_TYPES, fmtNum } from './_shared';

export const BudgetLineModal = ({ budowaId, editLine, parentLine, categories, stages, budowaInfo, onCategoriesChanged, onClose, onSaved }) => {
  // Defaulty Kaucja z Finansów (effective_kaucja_*) gdy nowa pozycja
  const defaultGir = budowaInfo?.kaucja_gir_pct ?? 0;
  const defaultDw = budowaInfo?.kaucja_dw_pct ?? 0;
  const isChildMode = !editLine && !!parentLine; // tryb "dodaj skladowa"
  const [form, setForm] = useState({
    category: editLine?.category || parentLine?.category || (categories[0]?.name || ''),
    stage_id: editLine?.stage_id || parentLine?.stage_id || '',
    type: editLine?.type || parentLine?.type || 'materials',
    name: editLine?.name || '',
    unit: editLine?.unit || '',
    quantity: editLine?.quantity ?? 0,
    unit_price_netto: editLine?.unit_price_netto ?? 0,
    plan_netto_override: editLine?.plan_netto != null ? String(editLine.plan_netto) : '',  // pusty = auto
    // Override kaucji: pusty = uzyj defaultu z Finansow
    kaucja_gir_pct: editLine?.kaucja_gir_pct != null ? String(editLine.kaucja_gir_pct) : '',
    kaucja_dw_pct: editLine?.kaucja_dw_pct != null ? String(editLine.kaucja_dw_pct) : '',
    is_income: editLine?.is_income || parentLine?.is_income || false,
    notes: editLine?.notes || '',
  });
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [saving, setSaving] = useState(false);

  // Live auto-calc plan netto = ilosc x cena (chyba ze override)
  const autoPlan = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price_netto) || 0);
  const finalPlan = form.plan_netto_override !== ''
    ? (parseFloat(form.plan_netto_override) || 0)
    : autoPlan;

  // Efektywne kaucje (do podgladu kwot)
  const effGir = form.kaucja_gir_pct !== '' ? (parseFloat(form.kaucja_gir_pct) || 0) : defaultGir;
  const effDw = form.kaucja_dw_pct !== '' ? (parseFloat(form.kaucja_dw_pct) || 0) : defaultDw;

  const addCategory = async () => {
    if (!newCatName.trim()) { toast.error('Podaj nazwę'); return; }
    try {
      const r = await api.post('/budget/categories', { budowa_id: budowaId, name: newCatName.trim() });
      toast.success('Dodano kategorię');
      setForm({ ...form, category: r.data.name });
      setNewCatName(''); setNewCatMode(false);
      onCategoriesChanged && onCategoriesChanged();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const save = async () => {
    if (!form.category.trim()) { toast.error('Wybierz kategorię'); return; }
    if (!form.name.trim()) { toast.error('Podaj nazwę pozycji'); return; }
    setSaving(true);
    try {
      const payload = {
        budowa_id: budowaId,
        category: form.category,
        stage_id: form.stage_id || null,
        type: form.type || 'materials',
        name: form.name,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0,
        plan_netto: form.plan_netto_override === '' ? null : parseFloat(form.plan_netto_override),
        kaucja_gir_pct: form.kaucja_gir_pct === '' ? null : parseFloat(form.kaucja_gir_pct),
        kaucja_dw_pct: form.kaucja_dw_pct === '' ? null : parseFloat(form.kaucja_dw_pct),
        is_income: form.is_income,
        notes: form.notes,
      };
      if (isChildMode) {
        payload.parent_id = parentLine.id;
      }
      if (editLine) {
        delete payload.budowa_id;
        await api.patch(`/budget/lines/${editLine.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/budget/lines', payload);
        toast.success(isChildMode ? 'Dodano składową' : 'Dodano pozycję');
      }
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editLine ? 'Edytuj pozycję' : (isChildMode ? `Dodaj składową do: ${parentLine.name}` : 'Nowa pozycja budżetu')}
          </DialogTitle>
          {isChildMode && (
            <p className="text-xs text-[#94A3B8] mt-1">
              Składowa dziedziczy typ <b style={{ color: BUDGET_TYPES[parentLine.type || 'materials']?.color }}>{BUDGET_TYPES[parentLine.type || 'materials']?.label}</b> z pozycji nadrzędnej.
              Wartości pozycji głównej będą automatycznie sumą składowych.
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_income} onChange={(e) => setForm({ ...form, is_income: e.target.checked })} data-testid="budget-line-is-income" />
            <span className="text-[#5F7552]">Pozycja przychodowa</span>
          </label>

          {/* Kategoria + Etap dropdowny */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Kategoria *</label>
              {!newCatMode ? (
                <div className="flex gap-1">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="flex-1 bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
                    data-testid="budget-line-category-select">
                    <option value="">— wybierz —</option>
                    {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <button onClick={() => setNewCatMode(true)} className="text-[#D4AF37] hover:text-[#B8941F] px-2"
                    title="Dodaj nową kategorię" data-testid="budget-line-new-cat-btn">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nowa kategoria" className="bg-[#0B1120] border-[#2A3B59] text-sm h-8"
                    data-testid="budget-line-new-cat-name" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }} />
                  <button onClick={addCategory} className="text-[#5F7552] hover:text-[#7CA169] px-2" data-testid="budget-line-new-cat-save">✓</button>
                  <button onClick={() => { setNewCatMode(false); setNewCatName(''); }} className="text-[#94A3B8] hover:text-white px-2">✕</button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Etap budowy</label>
              <select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
                className="w-full bg-[#0B1120] border border-[#2A3B59] text-white px-2 py-1.5 rounded text-sm"
                data-testid="budget-line-stage-select">
                <option value="">— bez etapu —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Typ budżetu - radio buttons */}
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">Typ budżetu *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(BUDGET_TYPES).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, type: key })}
                  className={`px-3 py-2 rounded text-xs font-semibold border transition flex items-center justify-center gap-2 ${
                    form.type === key
                      ? 'border-2'
                      : 'border-[#2A3B59] text-[#94A3B8] hover:text-white'
                  }`}
                  style={form.type === key ? { borderColor: cfg.color, backgroundColor: `${cfg.color}20`, color: cfg.color } : {}}
                  data-testid={`budget-line-type-${key}`}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: cfg.bg, color: cfg.textOnBg }}>
                    {cfg.short}
                  </div>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#94A3B8]">Nazwa pozycji *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="np. Beton C8/10 chudziaki" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-name" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">Ilość</label>
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-quantity" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Jednostka</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="m3, t, mb" className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-unit" />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">Cena j. netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto} onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-price" />
            </div>
          </div>

          {/* Auto-calc Plan netto */}
          <div className="bg-[#0B1120] rounded p-2 border border-[#2A3B59]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#94A3B8]">Plan netto = Ilość × Cena =</span>
              <span className="text-[#D4AF37] font-bold tabular-nums text-sm" data-testid="budget-line-plan-auto">
                {fmtNum(autoPlan)} zł
              </span>
            </div>
            <details className="mt-1">
              <summary className="text-xs text-[#94A3B8] cursor-pointer hover:text-white">Nadpisz wartość ręcznie</summary>
              <Input type="number" step="0.01" value={form.plan_netto_override}
                onChange={(e) => setForm({ ...form, plan_netto_override: e.target.value })}
                placeholder="puste = auto" className="bg-[#131C2F] border-[#2A3B59] mt-1 h-8 text-xs"
                data-testid="budget-line-plan-override" />
            </details>
          </div>

          {/* Kaucje z defaultem z Finansów */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#94A3B8]">
                Kaucja GIR (%) <span className="text-[#5F7552]">domyślnie {defaultGir}%</span>
              </label>
              <Input type="number" step="0.1" value={form.kaucja_gir_pct}
                onChange={(e) => setForm({ ...form, kaucja_gir_pct: e.target.value })}
                placeholder={`${defaultGir}`} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-gir" />
              <div className="text-[10px] text-[#94A3B8] mt-0.5 tabular-nums">
                = {fmtNum(finalPlan * effGir / 100)} zł
              </div>
            </div>
            <div>
              <label className="text-xs text-[#94A3B8]">
                Kaucja DW (%) <span className="text-[#5F7552]">domyślnie {defaultDw}%</span>
              </label>
              <Input type="number" step="0.1" value={form.kaucja_dw_pct}
                onChange={(e) => setForm({ ...form, kaucja_dw_pct: e.target.value })}
                placeholder={`${defaultDw}`} className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-dw" />
              <div className="text-[10px] text-[#94A3B8] mt-0.5 tabular-nums">
                = {fmtNum(finalPlan * effDw / 100)} zł
              </div>
            </div>
          </div>

          {/* Info: dane umowy/zamawiajacy (z Finansow) */}
          {budowaInfo && (
            <div className="bg-[#0B1120]/60 border border-[#2A3B59] rounded p-2 text-[10px] text-[#94A3B8]">
              <div><span className="text-[#5F7552]">Umowa:</span> {budowaInfo.umowa_nr || <em className="text-[#FCA5A5]">brak — uzupełnij przed protokołem</em>}</div>
              <div><span className="text-[#5F7552]">Zamawiający:</span> {budowaInfo.zamawiajacy ? budowaInfo.zamawiajacy.substring(0, 80) + (budowaInfo.zamawiajacy.length > 80 ? '...' : '') : <em className="text-[#FCA5A5]">brak — uzupełnij przed protokołem</em>}</div>
            </div>
          )}

          <div>
            <label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="budget-line-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <ActionButton onAction={save} disabled={saving} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="budget-line-save">{saving ? 'Zapisuję...' : 'Zapisz'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

