import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ShoppingCart, Check, X, Clock, Package, History } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_BADGE = {
  pending: { label: 'Oczekujace', cls: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]' },
  partial: { label: 'Czesciowo', cls: 'bg-[#3B82F6]/20 text-[#3B82F6] border-[#3B82F6]' },
  issued: { label: 'Wydane', cls: 'bg-[#4F6343]/30 text-[#86EFAC] border-[#4F6343]' },
  rejected: { label: 'Odrzucone', cls: 'bg-[#9B2C2C]/30 text-[#FCA5A5] border-[#9B2C2C]' },
};

/**
 * Admin panel showing equipment orders from foremen — for a specific category.
 * Admin can issue (fully/partially) or reject.
 */
export const EquipmentOrdersAdmin = ({ category }) => {
  const [orders, setOrders] = useState([]);
  const [issueQty, setIssueQty] = useState({}); // {order_id: string}
  const [showHistory, setShowHistory] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const r = await api.get(`/equipment/orders${showHistory ? '?include_history=true' : ''}`);
      setOrders((r.data || []).filter((o) => o.category === category));
    } catch {
      // silent
    }
  }, [category, showHistory]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleIssue = async (order) => {
    const maxRemaining = order.quantity_requested - (order.quantity_issued || 0);
    const raw = issueQty[order.id] ?? String(maxRemaining);
    const qty = parseInt(raw, 10);
    if (!qty || qty <= 0) {
      toast.error('Podaj prawidlowa ilość do wydania');
      return;
    }
    if (qty > maxRemaining) {
      toast.error(`Maks: ${maxRemaining}`);
      return;
    }
    try {
      const res = await api.post(`/equipment/orders/${order.id}/issue`, { quantity_issued: qty });
      const newIssued = res.data?.quantity_issued ?? (order.quantity_issued || 0) + qty;
      const newStatus = res.data?.status ?? (newIssued >= order.quantity_requested ? 'issued' : 'partial');
      // Optymistyczna aktualizacja - tylko ten zamowienie sie zmienia,
      // reszta listy zostaje (nie ma flickera/reloadu).
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, quantity_issued: newIssued, status: newStatus, issued_at: new Date().toISOString() }
            : o
        )
      );
      setIssueQty((m) => { const n = { ...m }; delete n[order.id]; return n; });
      toast.success(`Wydano ${qty} szt.`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
      fetchAll(); // tylko gdy błąd - synchronizujemy z backendem
    }
  };

  const handleReject = async (orderId) => {
    if (!window.confirm('Odrzucic to zamowienie?')) return;
    try {
      await api.post(`/equipment/orders/${orderId}/reject`);
      // Optymistyczna aktualizacja
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'rejected' } : o))
      );
      toast.success('Odrzucono');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
      fetchAll();
    }
  };

  const active = orders.filter((o) => o.status === 'pending' || o.status === 'partial');
  const recent = orders.filter((o) => o.status === 'issued' || o.status === 'rejected').slice(0, showHistory ? 100 : 10);

  if (active.length === 0 && recent.length === 0 && !showHistory) return null;

  return (
    <Card className="bg-[#243049] border-[#D4AF37]" data-testid="equipment-orders-admin">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-[#D4AF37] flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Zamówienia brygadzistów {active.length > 0 && <span className="text-sm text-white">({active.length})</span>}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowHistory((v) => !v)}
          className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#3D5378] hover:text-[#D4AF37]"
          data-testid="equipment-orders-toggle-history">
          <History className="h-3.5 w-3.5 mr-1" />
          {showHistory ? 'Ukryj historię' : 'Pokaż historię'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {active.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const remaining = o.quantity_requested - (o.quantity_issued || 0);
            return (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-3 p-3 bg-[#1E2A44] rounded border border-[#3D5378]"
                data-testid={`equipment-order-${o.id}`}
              >
                {o.equipment_photo ? (
                  <img src={o.equipment_photo} alt="" className="h-14 w-14 rounded object-cover border border-[#3D5378] shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded bg-[#3D5378] flex items-center justify-center shrink-0">
                    <Package className="h-6 w-6 text-[#CBD5E1]" />
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[#F1F5F9] font-semibold">
                    {o.foreman_name}
                    <span className="text-[#CBD5E1]"> - </span>
                    <span className="text-[#4F6343]">{o.equipment_name}</span>
                    {o.variant && <span className="text-[#D4AF37]"> ({o.variant})</span>}
                  </div>
                  <div className="text-xs text-[#CBD5E1]">
                    Zamówiono: <b className="text-white">{o.quantity_requested}</b>
                    {o.quantity_issued > 0 && <span>, wydano: <b className="text-[#86EFAC]">{o.quantity_issued}</b>, zostaje: <b className="text-[#D4AF37]">{remaining}</b></span>}
                    <span className="ml-2 text-[#94A3B8]">
                      <Clock className="h-3 w-3 inline" /> {new Date(o.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  {o.notes && <div className="text-xs text-[#F1F5F9] italic mt-1">"{o.notes}"</div>}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border shrink-0 ${badge.cls}`}>{badge.label}</span>
                <Input
                  type="number"
                  min="1"
                  max={remaining}
                  placeholder={String(remaining)}
                  value={issueQty[o.id] || ''}
                  onChange={(e) => setIssueQty((m) => ({ ...m, [o.id]: e.target.value }))}
                  className="w-20 bg-[#152033] border-[#3D5378] text-white text-center shrink-0"
                  data-testid={`issue-qty-${o.id}`}
                />
                <Button
                  size="sm"
                  onClick={() => handleIssue(o)}
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                  data-testid={`issue-order-${o.id}`}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Wydaj
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReject(o.id)}
                  className="text-[#FCA5A5] hover:bg-[#9B2C2C]/20 shrink-0 h-8 w-8 p-0"
                  data-testid={`reject-order-${o.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {recent.map((o) => {
            const badge = STATUS_BADGE[o.status];
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 p-2 bg-[#152033] rounded border border-[#3D5378]/50 opacity-60"
              >
                <div className="flex-1 min-w-0 text-xs text-[#CBD5E1]">
                  {o.foreman_name} - {o.equipment_name}
                  {o.variant && <span> ({o.variant})</span>}
                  <span> x{o.quantity_issued || o.quantity_requested}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border ${badge.cls}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
        {!showHistory && (
          <div className="mt-3 text-xs text-[#CBD5E1] italic">
            Zamówienia wydane / odrzucone starsze niż 7 dni są ukryte. Kliknij <strong>Pokaż historię</strong>, aby zobaczyć wszystkie.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EquipmentOrdersAdmin;
