import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { useCachedApi, invalidateCachePrefix } from '../context/apiCache';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Input } from './ui/input';
import { Package, Plus, Minus, ShoppingCart, History, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

export const WarehouseForeman = () => {
  const { t } = useLanguage();
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
      toast.error(t('wh.fetch_error'));
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
      toast.success(t('wh.order_sent_admin'));
      setCart({});
      setNote('');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd wysylki');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-[#CBD5E1] p-4">{t('wh.loading_dots')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('catalog')}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'catalog' ? 'bg-[#4F6343] text-white' : 'bg-[#243049] text-[#CBD5E1]'}`}
          data-testid="foreman-warehouse-catalog">
          Katalog
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'history' ? 'bg-[#4F6343] text-white' : 'bg-[#243049] text-[#CBD5E1]'}`}
          data-testid="foreman-warehouse-history">
          Moje zamówienia ({orders.length})
        </button>
      </div>

      {view === 'catalog' && (
        <>
          <Card className="bg-[#243049] border-[#3D5378]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-[#4F6343]" /> Materiały dostępne do zamówienia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <p className="text-[#CBD5E1] text-sm">{t('wh.empty_admin_add')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {materials.map((m) => {
                    const inCart = cart[m.id];
                    const stockLow = (m.current_stock || 0) <= 0;
                    return (
                      <div key={m.id}
                        className="bg-[#1E2A44] rounded-lg border border-[#3D5378] p-2 flex gap-2"
                        data-testid={`foreman-mat-${m.id}`}>
                        {m.photo ? (
                          <img src={m.photo} alt={m.name} className="h-14 w-14 object-cover rounded shrink-0" />
                        ) : (
                          <div className="h-14 w-14 bg-[#152033] rounded flex items-center justify-center shrink-0">
                            <Package className="h-6 w-6 text-[#3D5378]" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[#F1F5F9] text-sm font-semibold truncate">{m.name}</p>
                          <p className={`text-[11px] ${stockLow ? 'text-[#D4AF37]' : 'text-[#5F7552]'}`}>
                            Stan: {m.current_stock} {m.unit}
                            {stockLow && <span className="ml-1">(zamów dostawę)</span>}
                          </p>
                          {inCart ? (
                            <div className="flex items-center gap-1 mt-1">
                              <Button size="sm" variant="ghost"
                                onClick={() => setQty(m, (cart[m.id] || 0) - 1)}
                                className="h-6 w-6 p-0 text-[#F1F5F9]">
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input type="number" step="0.5" value={inCart}
                                onChange={(e) => setQty(m, e.target.value)}
                                className="h-6 w-16 text-center text-xs bg-[#152033] border-[#3D5378] text-[#F1F5F9]"
                                data-testid={`foreman-mat-qty-${m.id}`} />
                              <span className="text-[10px] text-[#CBD5E1]">{m.unit}</span>
                              <Button size="sm" variant="ghost"
                                onClick={() => setQty(m, (cart[m.id] || 0) + 1)}
                                className="h-6 w-6 p-0 text-[#F1F5F9]">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => addToCart(m)}
                              className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-6 text-[11px] mt-1"
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
            <Card className="bg-[#243049] border-[#4F6343]" data-testid="foreman-cart">
              <CardHeader className="pb-2">
                <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4 text-[#4F6343]" /> Koszyk ({cartItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cartItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between bg-[#1E2A44] rounded p-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-[#F1F5F9] font-medium">{it.name}</span>
                      <span className="text-[#CBD5E1] ml-2">x {it.qty} {it.unit}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeFromCart(it)}
                      className="text-[#DC4A3A] h-6 px-2 text-xs">×</Button>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <select value={siteId} onChange={(e) => setSiteId(e.target.value)}
                    className="w-full bg-[#1E2A44] border border-[#3D5378] text-[#F1F5F9] rounded-md h-9 px-3 text-sm"
                    data-testid="foreman-cart-site">
                    <option value="">(opcjonalnie - na która budowę)</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <Input value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Notatka (opc.) - kiedy potrzebne, dla kogo..."
                    className="bg-[#1E2A44] border-[#3D5378] text-[#F1F5F9] h-9"
                    data-testid="foreman-cart-note" />
                </div>
                <ActionButton onAction={submitOrder} disabled={submitting}
                  className="w-full bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="foreman-submit-order"><Send className="h-4 w-4 mr-2" />
                  {submitting ? 'Wysyłam...' : 'Wyślij zamówienie do admina'}</ActionButton>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === 'history' && (
        <Card className="bg-[#243049] border-[#3D5378]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-[#4F6343]" /> Moje zamówienia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-[#CBD5E1] text-sm">{t('wh.no_orders_yet2')}</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => {
                  const statusColor = o.status === 'pending' ? 'bg-[#D4AF37]/20 text-[#D4AF37]' :
                    o.status === 'issued' ? 'bg-[#4F6343]/30 text-[#5F7552]' :
                    'bg-[#DC4A3A]/20 text-[#DC4A3A]';
                  const statusLabel = { pending: 'Czeka', issued: 'Wydane', rejected: 'Odrzucone' }[o.status];
                  return (
                    <div key={o.id} className="bg-[#1E2A44] rounded p-2 text-sm"
                      data-testid={`foreman-order-${o.id}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <span className={`text-[11px] px-2 py-0.5 rounded ${statusColor}`}>{statusLabel}</span>
                        <span className="text-[11px] text-[#94A3B8]">
                          {new Date(o.created_at).toLocaleString('pl-PL')}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {o.items.map((it) => (
                          <div key={it.material_id} className="text-[#F1F5F9] text-xs">
                            • {it.material_name} <span className="text-[#CBD5E1]">x {it.quantity} {it.unit}</span>
                            {it.issued_quantity !== null && it.issued_quantity !== undefined && (
                              <span className="ml-2 text-[10px] text-[#5F7552]">(wydano {it.issued_quantity})</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {o.admin_note && (
                        <p className="text-[11px] text-[#D4AF37] italic mt-1 flex items-center gap-1">
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
