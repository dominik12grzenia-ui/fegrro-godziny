import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { useCachedApi, invalidateCachePrefix } from '../context/apiCache';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Package, Plus, Minus, ShoppingCart, History, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const WarehouseForeman = () => {
  const [view, setView] = useState('catalog'); // catalog | history
  const [materials, setMaterials] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState({}); // material_id -> quantity
  const [note, setNote] = useState('');
  const [siteId, setSiteId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stale-while-revalidate caches for instant tab re-mount (60s TTL)
  const cMaterials = useCachedApi('/warehouse/materials', 60000);
  const cOrders = useCachedApi('/warehouse/orders', 60000);
  const cSites = useCachedApi('/sites', 60000);

  useEffect(() => { if (cMaterials) { setMaterials(cMaterials); setLoading(false); } }, [cMaterials]);
  useEffect(() => { if (cOrders) setOrders(cOrders); }, [cOrders]);
  useEffect(() => { if (cSites) setSites(cSites); }, [cSites]);

  const fetchAll = useCallback(async () => {
    invalidateCachePrefix('/warehouse/');
    invalidateCachePrefix('/sites');
    try {
      const [m, o, s] = await Promise.all([
        api.get('/warehouse/materials'),
        api.get('/warehouse/orders'),
        api.get('/sites'),
      ]);
      setMaterials(m.data);
      setOrders(o.data);
      setSites(s.data || []);
    } catch (_e) {
      toast.error('Błąd pobierania');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch fresh data if no cache present (instant render otherwise)
    if (!cMaterials) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToCart = (m) => {
    setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
  };
  const setQty = (m, q) => {
    const n = Math.max(0, parseFloat(q) || 0);
    setCart((c) => {
      const next = { ...c };
      if (n === 0) delete next[m.id];
      else next[m.id] = n;
      return next;
    });
  };
  const removeFromCart = (m) => {
    setCart((c) => {
      const next = { ...c };
      delete next[m.id];
      return next;
    });
  };

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const m = materials.find((x) => x.id === id);
        return m ? { ...m, qty } : null;
      })
      .filter(Boolean);
  }, [cart, materials]);

  const submitOrder = async () => {
    if (cartItems.length === 0) { toast.error('Koszyk jest pusty'); return; }
    setSubmitting(true);
    try {
      await api.post('/warehouse/orders', {
        items: cartItems.map((it) => ({ material_id: it.id, quantity: it.qty })),
        note: note.trim() || null,
        site_id: siteId || null,
      });
      toast.success('Zamówienie wysłane do administratora');
      setCart({});
      setNote('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd wysylki');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-[#94A3B8] p-4">Ładowanie magazynu...</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('catalog')}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'catalog' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8]'}`}
          data-testid="foreman-warehouse-catalog">
          Katalog
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'history' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8]'}`}
          data-testid="foreman-warehouse-history">
          Moje zamówienia ({orders.length})
        </button>
      </div>

      {view === 'catalog' && (
        <>
          <Card className="bg-[#2A384C] border-[#334155]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-[#5F7151]" /> Materiały dostępne do zamówienia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <p className="text-[#94A3B8] text-sm">Magazyn jest pusty - poproś admina o dodanie materiałów.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {materials.map((m) => {
                    const inCart = cart[m.id];
                    const stockLow = (m.current_stock || 0) <= 0;
                    return (
                      <div key={m.id}
                        className="bg-[#1E293B] rounded-lg border border-[#334155] p-2 flex gap-2"
                        data-testid={`foreman-mat-${m.id}`}>
                        {m.photo ? (
                          <img src={m.photo} alt={m.name} className="h-14 w-14 object-cover rounded shrink-0" />
                        ) : (
                          <div className="h-14 w-14 bg-[#0F172A] rounded flex items-center justify-center shrink-0">
                            <Package className="h-6 w-6 text-[#475569]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[#CBD5E1] text-sm font-semibold truncate">{m.name}</p>
                          <p className={`text-[11px] ${stockLow ? 'text-[#E8B76A]' : 'text-[#6B8E4E]'}`}>
                            Stan: {m.current_stock} {m.unit}
                            {stockLow && <span className="ml-1">(zamów dostawę)</span>}
                          </p>
                          {inCart ? (
                            <div className="flex items-center gap-1 mt-1">
                              <Button size="sm" variant="ghost"
                                onClick={() => setQty(m, (cart[m.id] || 0) - 1)}
                                className="h-6 w-6 p-0 text-[#CBD5E1]">
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input type="number" step="0.5" value={inCart}
                                onChange={(e) => setQty(m, e.target.value)}
                                className="h-6 w-16 text-center text-xs bg-[#0F172A] border-[#334155] text-[#CBD5E1]"
                                data-testid={`foreman-mat-qty-${m.id}`} />
                              <span className="text-[10px] text-[#94A3B8]">{m.unit}</span>
                              <Button size="sm" variant="ghost"
                                onClick={() => setQty(m, (cart[m.id] || 0) + 1)}
                                className="h-6 w-6 p-0 text-[#CBD5E1]">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => addToCart(m)}
                              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white h-6 text-[11px] mt-1"
                              data-testid={`foreman-add-${m.id}`}>
                              <Plus className="h-3 w-3 mr-1" /> Dodaj
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cart */}
          {cartItems.length > 0 && (
            <Card className="bg-[#2A384C] border-[#5F7151]" data-testid="foreman-cart">
              <CardHeader className="pb-2">
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4 text-[#5F7151]" /> Koszyk ({cartItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cartItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between bg-[#1E293B] rounded p-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-[#CBD5E1] font-medium">{it.name}</span>
                      <span className="text-[#94A3B8] ml-2">x {it.qty} {it.unit}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeFromCart(it)}
                      className="text-[#E8836A] h-6 px-2 text-xs">×</Button>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
                    className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded-md h-9 px-3 text-sm"
                    data-testid="foreman-cart-site">
                    <option value="">(opcjonalnie - na która budowę)</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <Input value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Notatka (opc.) - kiedy potrzebne, dla kogo..."
                    className="bg-[#1E293B] border-[#334155] text-[#CBD5E1] h-9"
                    data-testid="foreman-cart-note" />
                </div>
                <Button onClick={submitOrder} disabled={submitting}
                  className="w-full bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="foreman-submit-order">
                  <Send className="h-4 w-4 mr-2" />
                  {submitting ? 'Wysyłam...' : 'Wyślij zamówienie do admina'}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === 'history' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-[#5F7151]" /> Moje zamówienia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-[#94A3B8] text-sm">Jeszcze nic nie zamówiłeś.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => {
                  const statusColor = o.status === 'pending' ? 'bg-[#E8B76A]/20 text-[#E8B76A]' :
                    o.status === 'issued' ? 'bg-[#5F7151]/30 text-[#6B8E4E]' :
                    'bg-[#E8836A]/20 text-[#E8836A]';
                  const statusLabel = { pending: 'Czeka', issued: 'Wydane', rejected: 'Odrzucone' }[o.status];
                  return (
                    <div key={o.id} className="bg-[#1E293B] rounded p-2 text-sm"
                      data-testid={`foreman-order-${o.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <span className={`text-[11px] px-2 py-0.5 rounded ${statusColor}`}>{statusLabel}</span>
                        <span className="text-[11px] text-[#64748B]">
                          {new Date(o.created_at).toLocaleString('pl-PL')}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {o.items.map((it) => (
                          <div key={it.material_id} className="text-[#CBD5E1] text-xs">
                            • {it.material_name} <span className="text-[#94A3B8]">x {it.quantity} {it.unit}</span>
                            {it.issued_quantity !== null && it.issued_quantity !== undefined && (
                              <span className="ml-2 text-[10px] text-[#6B8E4E]">(wydano {it.issued_quantity})</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {o.admin_note && (
                        <p className="text-[11px] text-[#E8B76A] italic mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {o.admin_note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
