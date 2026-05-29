import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Input } from './ui/input';
import { Package, Plus, Trash2, Edit, X, Boxes, History, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const UNITS = ['szt.', 'op.', 'm', 'm2', 'm3', 'kg', 't', 'l', 'paleta'];

const PendingItemRow = ({ row, onIssue, onRemove }) => {
  const [qty, setQty] = useState(String(row.quantity));
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-[#243049]/40 transition-colors"
      data-testid={`warehouse-pending-row-${row.order_id}-${row.material_id}`}>
      <div className="flex-1 min-w-[180px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#F1F5F9] font-medium">{row.material_name}</span>
          <span className="text-[#CBD5E1] text-xs">zam. {row.quantity} {row.unit}</span>
          {(row.stock_at_order ?? 0) < row.quantity && (
            <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1.5 py-0.5 rounded">
              w mag. {row.stock_at_order}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-[#94A3B8] mt-0.5">
          {row.site_name && <span>· {row.site_name}</span>}
          <span>{new Date(row.created_at).toLocaleDateString('pl-PL')}</span>
          {row.note && <span className="italic">"{row.note}"</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Input type="number" step="0.5" value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-8 w-20 text-center text-xs bg-[#152033] border-[#3D5378] text-[#F1F5F9]"
          data-testid={`warehouse-issue-qty-${row.material_id}`} />
        <span className="text-[10px] text-[#CBD5E1]">{row.unit}</span>
        <Button size="sm" onClick={() => onIssue(qty)}
          className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-8 text-[11px]"
          data-testid={`warehouse-issue-btn-${row.material_id}`}>
          <Check className="h-3 w-3 mr-1" /> Wydaj
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}
          className="text-[#DC4A3A] h-8 px-2"
          title="Usuń pozycję"
          data-testid={`warehouse-remove-item-${row.material_id}`}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export const WarehouseAdmin = () => {
  const [subtab, setSubtab] = useState('orders');
  const [materials, setMaterials] = useState([]);
  const [orders, setOrders] = useState([]);
  const [foremen, setForemen] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showItem, setShowItem] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', unit: 'szt.', current_stock: '0', note: '', photo: null });

  const [stockAdjust, setStockAdjust] = useState(null); // materiał object
  const [adjustVal, setAdjustVal] = useState('');
  const [adjustReason, setAdjustReason] = useState('przyjęcie');

  const [historyForeman, setHistoryForeman] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, o, f] = await Promise.all([
        api.get('/warehouse/materials?include_inactive=true'),
        api.get('/warehouse/orders'),
        api.get('/foremen'),
      ]);
      setMaterials(m.data);
      setOrders(o.data);
      setForemen(f.data || []);
    } catch (_e) {
      toast.error('Błąd pobierania');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (historyForeman) params.set('foreman_id', historyForeman);
      const r = await api.get(`/warehouse/history?${params}`);
      setHistory(r.data);
    } catch (_e) { /* ignore */ }
  }, [historyForeman]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (subtab === 'history') fetchHistory(); }, [subtab, fetchHistory]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', unit: 'szt.', current_stock: '0', note: '', photo: null });
    setShowItem(true);
  };
  const openEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      unit: m.unit || 'szt.',
      current_stock: String(m.current_stock ?? 0),
      note: m.note || '',
      photo: m.photo || null,
    });
    setShowItem(true);
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Max 3MB'); return; }
    const b64 = await fileToBase64(file);
    setForm((f) => ({ ...f, photo: b64 }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwe'); return; }
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        current_stock: parseFloat(form.current_stock || '0') || 0,
        note: form.note.trim() || null,
        photo: form.photo,
      };
      if (editing) {
        await api.put(`/warehouse/materials/${editing.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/warehouse/materials', payload);
        toast.success('Dodano');
      }
      setShowItem(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Usunac "${m.name}"?`)) return;
    try {
      await api.delete(`/warehouse/materials/${m.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const submitAdjust = async () => {
    const delta = parseFloat(adjustVal);
    if (isNaN(delta) || delta === 0) { toast.error('Podaj zmiane'); return; }
    try {
      await api.post(`/warehouse/materials/${stockAdjust.id}/stock`, {
        delta,
        reason: adjustReason,
      });
      toast.success('Stan zaktualizowany');
      setStockAdjust(null);
      setAdjustVal('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const issueItem = async (orderId, item, qty) => {
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) { toast.error('Podaj ilość > 0'); return; }
    try {
      await api.post(`/warehouse/orders/${orderId}/items/${item.material_id}/issue`, { quantity: q });
      toast.success(`Wydano ${item.material_name}`);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const removeItem = async (orderId, item) => {
    if (!window.confirm(`Usunac pozycje "${item.material_name}" z zamowienia?`)) return;
    try {
      await api.delete(`/warehouse/orders/${orderId}/items/${item.material_id}`);
      toast.success('Usunieto pozycje');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const issueOrder = async (order) => {
    if (!window.confirm(`Oznaczyc zamowienie jako WYDANE?\nStan magazynu zostanie pomniejszony o zamowione ilości.`)) return;
    try {
      await api.put(`/warehouse/orders/${order.id}/status`, { status: 'issued' });
      toast.success('Wydano - stan zaktualizowany');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const rejectOrder = async (order) => {
    const reason = window.prompt('Powod odrzucenia (opcjonalnie):') || null;
    try {
      await api.put(`/warehouse/orders/${order.id}/status`, { status: 'rejected', admin_note: reason });
      toast.success('Odrzucono');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const removeOrder = async (order) => {
    if (!window.confirm('Usunac zamowienie z historii?')) return;
    try {
      await api.delete(`/warehouse/orders/${order.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  // Pending items: ze wszystkich orders, tylko items bez issued_quantity, zgrupowane per foreman
  const pendingByForeman = useMemo(() => {
    const by = {};
    orders.forEach((o) => {
      if (o.status === 'rejected') return;
      const pendingItems = (o.items || []).filter((it) => it.issued_quantity === null || it.issued_quantity === undefined);
      if (!pendingItems.length) return;
      if (historyForeman && o.foreman_id !== historyForeman) return;
      if (!by[o.foreman_id]) {
        by[o.foreman_id] = { foreman_id: o.foreman_id, foreman_name: o.foreman_name, rows: [] };
      }
      pendingItems.forEach((it) => by[o.foreman_id].rows.push({
        ...it,
        order_id: o.id,
        site_name: o.site_name,
        note: o.note,
        created_at: o.created_at,
      }));
    });
    return Object.values(by).sort((a, b) => (a.foreman_name || '').localeCompare(b.foreman_name || '', 'pl'));
  }, [orders, historyForeman]);

  const pendingOrders = useMemo(() => orders.filter((o) =>
    (o.items || []).some((it) => it.issued_quantity === null || it.issued_quantity === undefined) && o.status !== 'rejected'
  ), [orders]);
  const filteredOrders = useMemo(
    () => (historyForeman ? orders.filter((o) => o.foreman_id === historyForeman) : orders),
    [orders, historyForeman],
  );

  if (loading) return <p className="text-[#CBD5E1] p-4">Ładowanie...</p>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setSubtab('materials')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'materials' ? 'bg-[#4F6343] text-white' : 'bg-[#243049] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
          data-testid="warehouse-subtab-materials"
        >
          Materiały ({materials.length})
        </button>
        <button
          type="button"
          onClick={() => setSubtab('orders')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'orders' ? 'bg-[#4F6343] text-white' : 'bg-[#243049] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
          data-testid="warehouse-subtab-orders"
        >
          Zamówienia
          {pendingOrders.length > 0 && (
            <span className="ml-2 bg-[#D4AF37] text-[#1E2A44] px-2 py-0.5 rounded text-[11px]">
              {pendingOrders.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSubtab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'history' ? 'bg-[#4F6343] text-white' : 'bg-[#243049] text-[#CBD5E1] hover:bg-[#3D5378]'}`}
          data-testid="warehouse-subtab-history"
        >
          Historia
        </button>
      </div>

      {/* MATERIALS */}
      {subtab === 'materials' && (
        <Card className="bg-[#243049] border-[#3D5378]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
                <Boxes className="h-5 w-5 text-[#4F6343]" /> Materiały
              </CardTitle>
              <Button size="sm" onClick={openCreate}
                className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-8"
                data-testid="warehouse-add-material-btn">
                <Plus className="h-3.5 w-3.5 mr-1" /> Dodaj materiał
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <p className="text-[#CBD5E1]">Brak materiałów. Dodaj pierwszy (np. Cement, Pustak, Stal zbrojeniowa).</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {materials.map((m) => {
                  const isLow = (m.current_stock || 0) < 1;
                  return (
                    <div key={m.id}
                      className="bg-[#1E2A44] rounded-lg border border-[#3D5378] p-3 flex gap-3"
                      data-testid={`warehouse-material-${m.id}`}>
                      {m.photo ? (
                        <img src={m.photo} alt={m.name} className="h-20 w-20 object-cover rounded shrink-0" />
                      ) : (
                        <div className="h-20 w-20 bg-[#152033] rounded flex items-center justify-center shrink-0">
                          <Package className="h-8 w-8 text-[#3D5378]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[#F1F5F9] font-semibold truncate">{m.name}</p>
                        <p className={`text-sm font-bold mt-1 ${isLow ? 'text-[#DC4A3A]' : 'text-[#5F7552]'}`}>
                          Stan: {m.current_stock} {m.unit}
                          {isLow && <AlertCircle className="h-3 w-3 inline-block ml-1" />}
                        </p>
                        {m.note && <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">{m.note}</p>}
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="ghost"
                            onClick={() => { setStockAdjust(m); setAdjustVal(''); setAdjustReason('przyjęcie'); }}
                            className="text-[#5F7552] h-7 px-2 text-[11px]"
                            data-testid={`warehouse-adjust-stock-${m.id}`}>
                            +/− stan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(m)}
                            className="text-[#CBD5E1] h-7 px-2">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(m)}
                            className="text-[#DC4A3A] h-7 px-2">
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

      {/* ORDERS - grupowane per brygadzista, tylko pozycje DO WYDANIA */}
      {subtab === 'orders' && (
        <Card className="bg-[#243049] border-[#3D5378]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
                <Package className="h-5 w-5 text-[#4F6343]" /> Do wydania ({pendingByForeman.length} brygadzist{pendingByForeman.length === 1 ? 'a' : 'ów'})
              </CardTitle>
              <select
                value={historyForeman}
                onChange={(e) => setHistoryForeman(e.target.value)}
                className="bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded-md h-8 px-2 text-sm"
                data-testid="warehouse-orders-foreman-filter">
                <option value="">Wszyscy brygadziści</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>{f.full_name}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {pendingByForeman.length === 0 ? (
              <p className="text-[#CBD5E1]">Brak pozycji do wydania.</p>
            ) : (
              <div className="space-y-4">
                {pendingByForeman.map((group) => (
                  <div key={group.foreman_id}
                    className="bg-[#1E2A44] rounded-lg border border-[#3D5378]"
                    data-testid={`warehouse-pending-foreman-${group.foreman_id}`}>
                    <div className="bg-[#243049] px-4 py-2 rounded-t-lg border-b border-[#3D5378]">
                      <span className="text-[#F1F5F9] font-bold text-base">{group.foreman_name}</span>
                      <span className="ml-2 text-[11px] bg-[#4F6343]/30 text-[#5F7552] px-2 py-0.5 rounded">
                        {group.rows.length} {group.rows.length === 1 ? 'pozycja' : 'pozycji'}
                      </span>
                    </div>
                    <div className="divide-y divide-[#3D5378]">
                      {group.rows.map((row) => (
                        <PendingItemRow
                          key={`${row.order_id}-${row.material_id}`}
                          row={row}
                          onIssue={(q) => issueItem(row.order_id, row, q)}
                          onRemove={() => removeItem(row.order_id, row)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Wydane / odrzucone - skrocona historia */}
            {filteredOrders.some((o) => o.status === 'issued' || o.status === 'rejected') && (
              <details className="mt-4">
                <summary className="cursor-pointer text-[#CBD5E1] text-sm hover:text-[#F1F5F9]">
                  Pokaż wcześniejsze zamówienia ({filteredOrders.filter((o) => o.status === 'issued' || o.status === 'rejected').length})
                </summary>
                <div className="mt-2 space-y-2">
                  {filteredOrders.filter((o) => o.status === 'issued' || o.status === 'rejected').slice(0, 30).map((o) => (
                    <div key={o.id} className="bg-[#1E2A44] rounded p-2 text-xs"
                      data-testid={`warehouse-archived-order-${o.id}`}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-[#F1F5F9] font-semibold">{o.foreman_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${o.status === 'issued' ? 'bg-[#4F6343]/30 text-[#5F7552]' : 'bg-[#DC4A3A]/20 text-[#DC4A3A]'}`}>
                          {o.status === 'issued' ? 'Wydane' : 'Odrzucone'}
                        </span>
                        <span className="text-[#94A3B8]">{new Date(o.issued_at || o.created_at).toLocaleDateString('pl-PL')}</span>
                      </div>
                      <div className="mt-1 text-[#CBD5E1]">
                        {(o.items || []).map((it) => `${it.material_name} (${it.issued_quantity ?? it.quantity} ${it.unit})`).join(' · ')}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeOrder(o)}
                        className="text-[#CBD5E1] h-6 px-2 text-[10px] mt-1">
                        <Trash2 className="h-3 w-3 mr-1" /> Usuń z historii
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* HISTORY */}
      {subtab === 'history' && (
        <Card className="bg-[#243049] border-[#3D5378]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[#F1F5F9] flex items-center gap-2">
                <History className="h-5 w-5 text-[#4F6343]" /> Historia ruchów magazynowych
              </CardTitle>
              <select
                value={historyForeman}
                onChange={(e) => setHistoryForeman(e.target.value)}
                className="bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded-md h-8 px-2 text-sm"
                data-testid="warehouse-history-foreman-filter">
                <option value="">Wszystkie zdarzenia</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>Tylko: {f.full_name}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-[#CBD5E1]">Brak historii.</p>
            ) : (
              <div className="space-y-1">
                {history.map((h) => (
                  <div key={h.id}
                    className="flex flex-wrap items-center gap-2 bg-[#1E2A44] rounded p-2 text-sm"
                    data-testid={`warehouse-history-${h.id}`}>
                    <span className="text-[#94A3B8] text-[11px] min-w-[110px]">
                      {new Date(h.at).toLocaleString('pl-PL')}
                    </span>
                    <span className={`font-bold ${h.delta < 0 ? 'text-[#DC4A3A]' : 'text-[#5F7552]'} min-w-[70px]`}>
                      {h.delta > 0 ? '+' : ''}{h.delta} {h.unit || ''}
                    </span>
                    <span className="text-[#F1F5F9] flex-1">{h.material_name}</span>
                    {h.foreman_name && (
                      <span className="text-[11px] bg-[#4F6343]/30 text-[#5F7552] px-2 py-0.5 rounded">
                        {h.foreman_name}
                      </span>
                    )}
                    {h.reason && <span className="text-[11px] text-[#CBD5E1]">{h.reason}</span>}
                    <span className="text-[11px] text-[#94A3B8]">→ {h.stock_after}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Materiał modal */}
      {showItem && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowItem(false)}>
          <Card className="bg-[#243049] border-[#3D5378] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#F1F5F9]">
                  {editing ? 'Edytuj materiał' : 'Nowy materiał'}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowItem(false)} className="text-[#CBD5E1]">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#CBD5E1]">Nazwa</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="np. Cement portlandzki 25kg"
                  className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
                  data-testid="warehouse-form-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[#CBD5E1]">Jednostka</label>
                  <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className="w-full bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded-md h-10 px-3 text-sm"
                    data-testid="warehouse-form-unit">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#CBD5E1]">Aktualny stan</label>
                  <Input type="number" step="0.01" value={form.current_stock}
                    onChange={(e) => setForm((f) => ({ ...f, current_stock: e.target.value }))}
                    className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
                    data-testid="warehouse-form-stock" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#CBD5E1]">Notatka (opc.)</label>
                <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="np. polka A3"
                  className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]" />
              </div>
              <div>
                <label className="text-xs text-[#CBD5E1]">Zdjecie (opc.)</label>
                <Input type="file" accept="image/*" onChange={onPhoto}
                  className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]" />
                {form.photo && <img src={form.photo} alt="podglad" className="h-20 mt-2 rounded" />}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowItem(false)} className="text-[#CBD5E1]">Anuluj</Button>
                <ActionButton onAction={save} className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="warehouse-form-save">Zapisz</ActionButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stock adjust modal */}
      {stockAdjust && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setStockAdjust(null)}>
          <Card className="bg-[#243049] border-[#3D5378] w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-[#F1F5F9] text-base">{stockAdjust.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[#CBD5E1]">
                Aktualny stan: <b className="text-[#F1F5F9]">{stockAdjust.current_stock} {stockAdjust.unit}</b>
              </p>
              <div>
                <label className="text-xs text-[#CBD5E1]">Zmiana (+ przyjęcie, − wydanie/strata)</label>
                <Input type="number" step="0.01" value={adjustVal}
                  onChange={(e) => setAdjustVal(e.target.value)}
                  placeholder={`np. 50 lub -10 (${stockAdjust.unit})`}
                  className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9]"
                  data-testid="warehouse-adjust-input" />
              </div>
              <div>
                <label className="text-xs text-[#CBD5E1]">Powód</label>
                <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded-md h-10 px-3 text-sm">
                  <option value="przyjęcie">Przyjęcie</option>
                  <option value="korekta">Korekta</option>
                  <option value="strata">Strata/zniszczenie</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setStockAdjust(null)} className="text-[#CBD5E1]">Anuluj</Button>
                <ActionButton onAction={submitAdjust} className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="warehouse-adjust-save">Zapisz</ActionButton>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
