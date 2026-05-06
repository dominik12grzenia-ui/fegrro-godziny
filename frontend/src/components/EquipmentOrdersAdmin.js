import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ShoppingCart, Check, X, Clock, Package } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_BADGE = {
  pending: { label: 'Oczekujace', cls: 'bg-[#E8B76A]/20 text-[#E8B76A] border-[#E8B76A]' },
  partial: { label: 'Czesciowo', cls: 'bg-[#3B82F6]/20 text-[#3B82F6] border-[#3B82F6]' },
  issued: { label: 'Wydane', cls: 'bg-[#5F7151]/30 text-[#86EFAC] border-[#5F7151]' },
  rejected: { label: 'Odrzucone', cls: 'bg-[#7F2D2D]/30 text-[#FCA5A5] border-[#7F2D2D]' },
};

/**
 * Admin panel showing equipment orders from foremen — for a specific category.
 * Admin can issue (fully/partially) or reject.
 */
export const EquipmentOrdersAdmin = ({ category }) => {
  const [orders, setOrders] = useState([]);
  const [issueQty, setIssueQty] = useState({}); // {order_id: string}

  const fetchAll = useCallback(async () => {
    try {
      const r = await api.get('/equipment/orders');
      setOrders((r.data || []).filter((o) => o.category === category));
    } catch {
      // silent
    }
  }, [category]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleIssue = async (order) => {
    const maxRemaining = order.quantity_requested - (order.quantity_issued || 0);
    const raw = issueQty[order.id] ?? String(maxRemaining);
    const qty = parseInt(raw, 10);
    if (!qty || qty <= 0) {
      toast.error('Podaj prawidlowa ilosc do wydania');
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
      toast.error(e.response?.data?.detail || 'Blad');
      fetchAll(); // tylko gdy blad - synchronizujemy z backendem
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
      toast.error(e.response?.data?.detail || 'Blad');
      fetchAll();
    }
  };

  const active = orders.filter((o) => o.status === 'pending' || o.status === 'partial');
  const recent = orders.filter((o) => o.status === 'issued' || o.status === 'rejected').slice(0, 10);

  if (active.length === 0 && recent.length === 0) return null;

  return (
    <Card className="bg-[#2A384C] border-[#E8B76A]" data-testid="equipment-orders-admin">
      <CardHeader>
        <CardTitle className="text-[#E8B76A] flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Zamówienia brygadzistów {active.length > 0 && <span className="text-sm text-white">({active.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {active.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const remaining = o.quantity_requested - (o.quantity_issued || 0);
            return (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-3 p-3 bg-[#1E293B] rounded border border-[#334155]"
                data-testid={`equipment-order-${o.id}`}
              >
                {o.equipment_photo ? (
                  <img src={o.equipment_photo} alt="" className="h-14 w-14 rounded object-cover border border-[#334155] shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded bg-[#334155] flex items-center justify-center shrink-0">
                    <Package className="h-6 w-6 text-[#94A3B8]" />
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[#CBD5E1] font-semibold">
                    {o.foreman_name}
                    <span className="text-[#94A3B8]"> - </span>
                    <span className="text-[#5F7151]">{o.equipment_name}</span>
                    {o.variant && <span className="text-[#E8B76A]"> ({o.variant})</span>}
                  </div>
                  <div className="text-xs text-[#94A3B8]">
                    Zamówiono: <b className="text-white">{o.quantity_requested}</b>
                    {o.quantity_issued > 0 && <span>, wydano: <b className="text-[#86EFAC]">{o.quantity_issued}</b>, zostaje: <b className="text-[#E8B76A]">{remaining}</b></span>}
                    <span className="ml-2 text-[#64748B]">
                      <Clock className="h-3 w-3 inline" /> {new Date(o.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>
                  {o.notes && <div className="text-xs text-[#CBD5E1] italic mt-1">"{o.notes}"</div>}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border shrink-0 ${badge.cls}`}>{badge.label}</span>
                <Input
                  type="number"
                  min="1"
                  max={remaining}
                  placeholder={String(remaining)}
                  value={issueQty[o.id] || ''}
                  onChange={(e) => setIssueQty((m) => ({ ...m, [o.id]: e.target.value }))}
                  className="w-20 bg-[#0F172A] border-[#334155] text-white text-center shrink-0"
                  data-testid={`issue-qty-${o.id}`}
                />
                <Button
                  size="sm"
                  onClick={() => handleIssue(o)}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white shrink-0"
                  data-testid={`issue-order-${o.id}`}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Wydaj
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReject(o.id)}
                  className="text-[#FCA5A5] hover:bg-[#7F2D2D]/20 shrink-0 h-8 w-8 p-0"
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
                className="flex items-center gap-3 p-2 bg-[#0F172A] rounded border border-[#334155]/50 opacity-60"
              >
                <div className="flex-1 min-w-0 text-xs text-[#94A3B8]">
                  {o.foreman_name} - {o.equipment_name}
                  {o.variant && <span> ({o.variant})</span>}
                  <span> x{o.quantity_issued || o.quantity_requested}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border ${badge.cls}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default EquipmentOrdersAdmin;
