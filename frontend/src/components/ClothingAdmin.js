import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Shirt, Plus, Trash2, Check, Edit, X } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];

export const ClothingAdmin = () => {
  const [subtab, setSubtab] = useState('types');
  const [types, setTypes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddType, setShowAddType] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [form, setForm] = useState({
    name: '',
    yearly_limit: '2',
    start_month: '1',
    end_month: '12',
    usage_period_months: '6',
    requires_shoe_size: false,
    requires_height: true,
    requires_body_type: true,
  });

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, oRes, sRes] = await Promise.all([
        api.get('/clothing/types'),
        api.get('/clothing/orders'),
        api.get('/clothing/employees-summary'),
      ]);
      setTypes(tRes.data);
      setOrders(oRes.data);
      setSummary(sRes.data);
    } catch (e) {
      toast.error('Blad pobierania danych ubran');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingType(null);
    setForm({
      name: '', yearly_limit: '2', start_month: '1', end_month: '12',
      usage_period_months: '6', requires_shoe_size: false, requires_height: true, requires_body_type: true,
    });
    setShowAddType(true);
  };
  const openEdit = (t) => {
    setEditingType(t);
    setForm({
      name: t.name,
      yearly_limit: String(t.yearly_limit),
      start_month: String(t.start_month),
      end_month: String(t.end_month),
      usage_period_months: String(t.usage_period_months || 0),
      requires_shoe_size: !!t.requires_shoe_size,
      requires_height: !!t.requires_height,
      requires_body_type: !!t.requires_body_type,
    });
    setShowAddType(true);
  };

  const submitForm = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwe'); return; }
    const body = {
      name: form.name.trim(),
      yearly_limit: parseInt(form.yearly_limit, 10),
      start_month: parseInt(form.start_month, 10),
      end_month: parseInt(form.end_month, 10),
      usage_period_months: parseInt(form.usage_period_months, 10) || 0,
      requires_shoe_size: form.requires_shoe_size,
      requires_height: form.requires_height,
      requires_body_type: form.requires_body_type,
    };
    try {
      if (editingType) {
        await api.put(`/clothing/types/${editingType.id}`, body);
        toast.success('Zaktualizowano pozycje');
      } else {
        await api.post('/clothing/types', body);
        toast.success('Dodano pozycje');
      }
      setShowAddType(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const toggleActive = async (t) => {
    try {
      await api.put(`/clothing/types/${t.id}`, { is_active: !t.is_active });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const deleteType = async (t) => {
    if (!window.confirm(`Usunac "${t.name}"? Historia zamowien zostanie zachowana.`)) return;
    try {
      await api.delete(`/clothing/types/${t.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const markIssued = async (order) => {
    try {
      await api.post(`/clothing/orders/${order.id}/issue`);
      toast.success('Oznaczono jako wydane');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  const deleteOrder = async (order) => {
    if (!window.confirm(`Usunac zamowienie ${order.employee_name} - ${order.clothing_type_name}?`)) return;
    try {
      await api.delete(`/clothing/orders/${order.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  if (loading) return <p className="text-[#94A3B8] p-4">Ladowanie...</p>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSubtab('types')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'types' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="clothing-subtab-types"
        >
          Przydział
        </button>
        <button
          onClick={() => setSubtab('orders')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'orders' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="clothing-subtab-orders"
        >
          Zamówione ({orders.filter(o => o.status !== 'issued').length})
        </button>
        <button
          onClick={() => setSubtab('summary')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'summary' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="clothing-subtab-summary"
        >
          Pracownicy
        </button>
      </div>

      {/* TYPES sub-tab */}
      {subtab === 'types' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <Shirt className="h-5 w-5 text-[#5F7151]" /> Przydział - pozycje
            </CardTitle>
            <Button onClick={openCreate} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="add-clothing-type-btn">
              <Plus className="h-4 w-4 mr-1" /> Dodaj
            </Button>
          </CardHeader>
          <CardContent>
            {types.length === 0 ? (
              <p className="text-[#94A3B8]">Brak zdefiniowanych pozycji. Kliknij "Dodaj" aby stworzyc pierwsza.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1E293B]">
                    <tr>
                      <th className="border border-[#334155] p-2 text-left text-[#CBD5E1]">Nazwa</th>
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Limit/rok</th>
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Okno zamówień</th>
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Okres użytkowania</th>
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Wymagane</th>
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1]">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((t, idx) => (
                      <tr key={t.id} className={idx % 2 === 0 ? 'bg-[#1E293B]/40' : 'bg-[#2A384C]'} data-testid={`clothing-type-row-${t.id}`}>
                        <td className="border border-[#334155] p-2 text-[#CBD5E1] font-semibold">
                          {t.name}
                          {!t.is_active && <span className="ml-2 text-[10px] bg-[#475569] text-white px-1.5 py-0.5 rounded uppercase">Nieaktywna</span>}
                        </td>
                        <td className="border border-[#334155] p-2 text-center text-[#6B8E4E] font-bold">{t.yearly_limit}</td>
                        <td className="border border-[#334155] p-2 text-center text-[#94A3B8]">{MONTHS[t.start_month - 1]} → {MONTHS[t.end_month - 1]}</td>
                        <td className="border border-[#334155] p-2 text-center text-[#94A3B8]">{t.usage_period_months || 0} mies.</td>
                        <td className="border border-[#334155] p-2 text-center text-[11px] text-[#94A3B8]">
                          {[t.requires_shoe_size && 'rozm.but', t.requires_height && 'wzrost', t.requires_body_type && 'sylwetka'].filter(Boolean).join(', ') || '-'}
                        </td>
                        <td className="border border-[#334155] p-2">
                          <div className="flex gap-1 flex-wrap justify-center">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="text-[#CBD5E1] h-7 px-2" data-testid={`edit-type-${t.id}`}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} className="text-[#94A3B8] h-7 px-2 text-xs">
                              {t.is_active ? 'Wył.' : 'Wł.'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteType(t)} className="text-[#E8836A] h-7 px-2" data-testid={`del-type-${t.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ORDERS sub-tab */}
      {subtab === 'orders' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <Shirt className="h-5 w-5 text-[#5F7151]" /> Zamówione ubrania
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-[#94A3B8]">Brak zamówień.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => {
                  const issued = o.status === 'issued';
                  return (
                    <div
                      key={o.id}
                      className={`p-3 rounded border ${issued ? 'bg-[#1E293B]/50 border-[#5F7151]/40 opacity-80' : 'bg-[#1E293B] border-[#334155]'}`}
                      data-testid={`order-${o.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[#CBD5E1] font-semibold">{o.employee_name}</span>
                            <span className="text-[#94A3B8]">→</span>
                            <span className={`font-semibold ${issued ? 'text-[#6B8E4E]' : 'text-[#E8B76A]'}`}>{o.clothing_type_name}</span>
                            <span className="text-[#94A3B8]">x {o.quantity}</span>
                            {issued && <span className="text-[10px] bg-[#5F7151]/30 text-[#6B8E4E] px-2 py-0.5 rounded font-semibold uppercase">Wydane</span>}
                          </div>
                          <div className="text-xs text-[#94A3B8] mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {o.shoe_size && <span>Rozm: <span className="text-[#CBD5E1]">{o.shoe_size}</span></span>}
                            {o.height && <span>Wzrost: <span className="text-[#CBD5E1]">{o.height}</span></span>}
                            {o.body_type && <span>Sylwetka: <span className="text-[#CBD5E1]">{o.body_type}</span></span>}
                          </div>
                          <p className="text-[11px] text-[#64748B] mt-1">
                            Zamówione: {new Date(o.created_at).toLocaleString('pl-PL')}
                            {issued && o.issued_at && ` · Wydane: ${new Date(o.issued_at).toLocaleString('pl-PL')}`}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {!issued && (
                            <Button size="sm" onClick={() => markIssued(o)} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-7" data-testid={`issue-order-${o.id}`}>
                              <Check className="h-3 w-3 mr-1" /> Wydane
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteOrder(o)} className="text-[#E8836A] h-7 px-2" data-testid={`del-order-${o.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SUMMARY sub-tab */}
      {subtab === 'summary' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <Shirt className="h-5 w-5 text-[#5F7151]" /> Pracownicy - wydania i limity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.length === 0 || types.length === 0 ? (
              <p className="text-[#94A3B8]">Brak danych.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1E293B] sticky top-0 z-20">
                    <tr>
                      <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] sticky left-0 bg-[#1E293B] z-30">Pracownik</th>
                      {types.filter(t => t.is_active).map(t => (
                        <th key={t.id} className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[120px]">{t.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, idx) => (
                      <tr key={row.employee_id} className={idx % 2 === 0 ? 'bg-[#1E293B]/40' : 'bg-[#2A384C]'}>
                        <td className="border border-[#334155] p-2 text-[#CBD5E1] font-semibold sticky left-0 bg-[#1E293B] z-10">{row.employee_name}</td>
                        {types.filter(t => t.is_active).map(t => {
                          const item = row.items.find(i => i.clothing_type_id === t.id);
                          if (!item) return <td key={t.id} className="border border-[#334155] p-2 text-center text-[#94A3B8]">-</td>;
                          return (
                            <td key={t.id} className="border border-[#334155] p-2 text-center text-xs">
                              <div className="text-[#CBD5E1]">Wydane: <span className="font-bold text-[#6B8E4E]">{item.issued_count_total}</span></div>
                              <div className="text-[#94A3B8]">Zostalo w tym roku: <span className="font-bold text-[#E8B76A]">{item.remaining_this_year}</span>/{item.yearly_limit}</div>
                              {item.next_available_at && (
                                <div className="text-[10px] text-[#64748B] mt-1">Do {item.next_available_at.slice(0, 10)}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit type modal */}
      {showAddType && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1]">{editingType ? 'Edytuj pozycję' : 'Dodaj pozycję'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAddType(false)} data-testid="close-clothing-modal">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8]">Nazwa pozycji</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  placeholder="np. Buty robocze letnie"
                  data-testid="clothing-name-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#94A3B8]">Limit na rok (szt.)</label>
                  <Input
                    type="number" min="1"
                    value={form.yearly_limit}
                    onChange={(e) => setForm((f) => ({ ...f, yearly_limit: e.target.value }))}
                    className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                    data-testid="clothing-limit-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8]">Okres użytkowania (miesiące)</label>
                  <Input
                    type="number" min="0"
                    value={form.usage_period_months}
                    onChange={(e) => setForm((f) => ({ ...f, usage_period_months: e.target.value }))}
                    className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                    data-testid="clothing-usage-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#94A3B8]">Od miesiąca</label>
                  <select
                    value={form.start_month}
                    onChange={(e) => setForm((f) => ({ ...f, start_month: e.target.value }))}
                    className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-2 py-2 text-sm"
                    data-testid="clothing-start-select"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8]">Do miesiąca (włącznie)</label>
                  <select
                    value={form.end_month}
                    onChange={(e) => setForm((f) => ({ ...f, end_month: e.target.value }))}
                    className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-2 py-2 text-sm"
                    data-testid="clothing-end-select"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-2 space-y-1">
                <p className="text-xs text-[#94A3B8]">Wymagane pola od pracownika:</p>
                <label className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={form.requires_shoe_size}
                    onChange={(e) => setForm((f) => ({ ...f, requires_shoe_size: e.target.checked }))}
                    data-testid="req-shoe"
                  /> Rozmiar buta
                </label>
                <label className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={form.requires_height}
                    onChange={(e) => setForm((f) => ({ ...f, requires_height: e.target.checked }))}
                    data-testid="req-height"
                  /> Wzrost
                </label>
                <label className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={form.requires_body_type}
                    onChange={(e) => setForm((f) => ({ ...f, requires_body_type: e.target.checked }))}
                    data-testid="req-body"
                  /> Sylwetka
                </label>
              </div>
              <div className="flex gap-2 pt-3">
                <Button onClick={submitForm} className="flex-1 bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="save-clothing-type-btn">
                  {editingType ? 'Zapisz' : 'Dodaj'}
                </Button>
                <Button onClick={() => setShowAddType(false)} variant="outline" className="border-[#334155] text-[#CBD5E1]">Anuluj</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
