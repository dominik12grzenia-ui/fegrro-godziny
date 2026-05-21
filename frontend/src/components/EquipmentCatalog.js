import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { useCachedApi, invalidateCachePrefix } from '../context/apiCache';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Package, ShoppingCart, Trash2, X, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_TITLES = {
  electronics: 'Katalog elektronarzedzi',
  accessories: 'Katalog akcesoriow',
  formwork: 'Katalog szalunkow',
};

const STATUS_BADGE = {
  pending: { label: 'Oczekujace', cls: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]' },
  partial: { label: 'Czesciowo', cls: 'bg-[#3B82F6]/20 text-[#3B82F6] border-[#3B82F6]' },
  issued: { label: 'Wydane', cls: 'bg-[#4F6343]/30 text-[#86EFAC] border-[#4F6343]' },
  rejected: { label: 'Odrzucone', cls: 'bg-[#9B2C2C]/30 text-[#FCA5A5] border-[#9B2C2C]' },
};

const CATEGORY_BTN = {
  electronics: 'Zamów elektronarzędzia',
  accessories: 'Zamów akcesoria',
  formwork: 'Zamów szalunki',
};

/**
 * Equipment catalog + ordering UI for foreman.
 * Shows all equipment in a category + "Zamow" button.
 * Items with `variants` force the foreman to choose one (e.g. drill size).
 */
export const EquipmentCatalog = ({ category = 'electronics' }) => {
  const cachedCatalog = useCachedApi(`/equipment/catalog?category=${encodeURIComponent(category)}`, 60000);
  const cachedOrders = useCachedApi('/equipment/orders', 60000);
  const [orders, setOrders] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [orderQty, setOrderQty] = useState('1');
  const [orderVariant, setOrderVariant] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync state from cache (handles initial render from cache + background refresh)
  useEffect(() => {
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      setLoading(false);
    }
  }, [cachedCatalog]);

  useEffect(() => {
    if (cachedOrders) {
      setOrders(cachedOrders.filter((x) => x.category === category));
    }
  }, [cachedOrders, category]);

  const fetchAll = useCallback(async () => {
    invalidateCachePrefix('/equipment/catalog');
    invalidateCachePrefix('/equipment/orders');
    try {
      const [c, o] = await Promise.all([
        api.get(`/equipment/catalog?category=${encodeURIComponent(category)}`),
        api.get('/equipment/orders'),
      ]);
      setCatalog(c.data || []);
      setOrders((o.data || []).filter((x) => x.category === category));
    } finally {
      setLoading(false);
    }
  }, [category]);

  // Initial load fallback (when cache empty)
  useEffect(() => {
    if (!cachedCatalog) {
      fetchAll().catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openOrder = (item) => {
    setModalItem(item);
    setOrderQty('1');
    setOrderVariant(item.variants && item.variants.length > 0 ? item.variants[0] : '');
    setOrderNotes('');
  };

  const submitOrder = async () => {
    if (!modalItem) return;
    const qty = parseInt(orderQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Podaj prawidlowa ilość');
      return;
    }
    if (modalItem.variants && modalItem.variants.length > 0 && !orderVariant) {
      toast.error('Wybierz wariant');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/equipment/orders', {
        equipment_id: modalItem.id,
        quantity: qty,
        variant: orderVariant || null,
        notes: orderNotes || null,
      });
      toast.success('Zamowienie wyslane do admina');
      setModalItem(null);
      // Invalidate cache so next visit gets fresh stock counts
      invalidateCachePrefix('/equipment/catalog');
      invalidateCachePrefix('/equipment/orders');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Anulowac to zamowienie?')) return;
    try {
      await api.delete(`/equipment/orders/${orderId}`);
      toast.success('Anulowano');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd');
    }
  };

  if (loading) {
    return (
      <div className="py-6 text-center text-[#94A3B8] text-sm">Ładowanie katalogu...</div>
    );
  }

  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'partial');
  const recentOrders = orders.filter((o) => o.status === 'issued' || o.status === 'rejected').slice(0, 5);

  const q = search.trim().toLowerCase();
  const visibleCatalog = !q
    ? catalog
    : catalog.filter(
        (it) =>
          (it.name || '').toLowerCase().includes(q) ||
          (it.brand || '').toLowerCase().includes(q)
      );

  return (
    <>
      {/* Single action button - opens catalog modal on demand */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button
          onClick={() => setCatalogOpen(true)}
          className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
          data-testid="open-catalog-btn"
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {CATEGORY_BTN[category] || 'Zamów'}
        </Button>
        {activeOrders.length > 0 && (
          <span className="text-xs text-[#D4AF37]">
            ⏳ Oczekujace zamowienia: <b>{activeOrders.length}</b>
          </span>
        )}
      </div>

      {/* Catalog modal (opens only when user clicks "Zamów ...") */}
      {catalogOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="catalog-modal"
          onClick={(e) => { if (e.target === e.currentTarget) setCatalogOpen(false); }}
        >
          <div className="bg-[#19243C] border-2 border-[#4F6343] rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#2A3B59] flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-[#4F6343]" />
                {CATEGORY_TITLES[category] || 'Katalog'}
              </h3>
              <Input
                placeholder="Szukaj po nazwie / marce..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#131C2F] border-[#2A3B59] text-white w-full sm:w-auto sm:min-w-[240px]"
                data-testid="catalog-search"
              />
              <button
                onClick={() => setCatalogOpen(false)}
                className="text-[#94A3B8] hover:text-white"
                data-testid="catalog-close-btn"
                aria-label="Zamknij"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {visibleCatalog.length === 0 ? (
                <div className="text-center py-6 text-sm text-[#94A3B8]">
                  {catalog.length === 0
                    ? 'Katalog jest pusty - admin jeszcze nie dodal sprzętu.'
                    : 'Brak wyników dla "' + search + '"'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibleCatalog.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2 bg-[#131C2F] rounded border border-[#2A3B59]"
                      data-testid={`catalog-item-${item.id}`}
                    >
                      {item.photo ? (
                        <img src={item.photo} alt={item.name} className="h-12 w-12 rounded object-cover border border-[#2A3B59] shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-[#2A3B59] flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-[#94A3B8]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[#CBD5E1] text-sm font-semibold truncate">{item.name}</div>
                        {item.brand && <div className="text-xs text-[#94A3B8] truncate">{item.brand}</div>}
                        <div className="text-xs text-[#94A3B8] mt-0.5">
                          Dostępne: <span className={item.available_quantity > 0 ? 'text-[#86EFAC] font-bold' : 'text-[#FCA5A5]'}>{item.available_quantity}</span>
                          <span className="text-[#64748B]"> / {item.total_quantity}</span>
                          {item.variants && item.variants.length > 0 && (
                            <span className="ml-2 text-[#D4AF37]">({item.variants.length} war.)</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openOrder(item)}
                        className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                        data-testid={`catalog-order-btn-${item.id}`}
                      >
                        <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                        Zamów
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* My orders */}
      {(activeOrders.length > 0 || recentOrders.length > 0) && (
        <Card className="bg-[#19243C] border-[#2A3B59] mb-4" data-testid="my-equipment-orders">
          <CardHeader>
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-[#D4AF37]" />
              Moje zamówienia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeOrders.map((o) => {
                const badge = STATUS_BADGE[o.status];
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 p-2 bg-[#131C2F] rounded border border-[#2A3B59]"
                    data-testid={`my-order-${o.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[#CBD5E1] text-sm font-semibold truncate">
                        {o.equipment_name}
                        {o.variant && <span className="text-[#D4AF37]"> - {o.variant}</span>}
                      </div>
                      <div className="text-xs text-[#94A3B8]">
                        Zamówiono: <b className="text-white">{o.quantity_requested}</b> szt.
                        {o.quantity_issued > 0 && <span>, wydano: <b className="text-[#86EFAC]">{o.quantity_issued}</b></span>}
                        <span className="ml-2 text-[#64748B]">
                          <Clock className="h-3 w-3 inline mr-0.5" />
                          {new Date(o.created_at).toLocaleDateString('pl-PL')}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs border ${badge.cls}`}>{badge.label}</span>
                    {o.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelOrder(o.id)}
                        className="text-[#94A3B8] hover:text-[#FCA5A5] hover:bg-[#9B2C2C]/20 shrink-0 h-8 w-8 p-0"
                        data-testid={`cancel-order-${o.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {recentOrders.map((o) => {
                const badge = STATUS_BADGE[o.status];
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 p-2 bg-[#0B1120] rounded border border-[#2A3B59]/50 opacity-70"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[#94A3B8] text-sm truncate">
                        {o.equipment_name}
                        {o.variant && <span> - {o.variant}</span>}
                        <span className="ml-2 text-[#64748B]">x{o.quantity_issued || o.quantity_requested}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs border ${badge.cls}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order modal */}
      {modalItem && (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="order-modal"
        >
          <div className="bg-[#19243C] border-2 border-[#4F6343] rounded-lg shadow-2xl max-w-md w-full">
            <div className="px-5 py-4 border-b border-[#2A3B59] flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Zamów sprzęt</h3>
              <button onClick={() => setModalItem(null)} className="text-[#94A3B8] hover:text-white" data-testid="order-close-btn">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3 p-2 bg-[#131C2F] rounded">
                {modalItem.photo ? (
                  <img src={modalItem.photo} alt={modalItem.name} className="h-14 w-14 rounded object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded bg-[#2A3B59] flex items-center justify-center">
                    <Package className="h-6 w-6 text-[#94A3B8]" />
                  </div>
                )}
                <div>
                  <div className="text-[#CBD5E1] font-semibold">{modalItem.name}</div>
                  {modalItem.brand && <div className="text-xs text-[#94A3B8]">{modalItem.brand}</div>}
                  <div className="text-xs text-[#94A3B8]">Dostępne: {modalItem.available_quantity} szt.</div>
                </div>
              </div>

              {modalItem.variants && modalItem.variants.length > 0 && (
                <div>
                  <label className="text-sm text-[#CBD5E1] block mb-1">
                    Wariant / rozmiar <span className="text-[#FCA5A5]">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {modalItem.variants.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setOrderVariant(v)}
                        className={`px-3 py-1.5 rounded border text-sm font-bold transition-colors ${
                          orderVariant === v
                            ? 'bg-[#4F6343]/30 border-[#4F6343] text-white'
                            : 'bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1] hover:border-[#4F6343]/50'
                        }`}
                        data-testid={`variant-btn-${v}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Ilość</label>
                <Input
                  type="number"
                  min="1"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  className="bg-[#131C2F] border-[#2A3B59] text-white"
                  data-testid="order-qty-input"
                />
              </div>

              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Uwagi (opcjonalnie)</label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows="2"
                  placeholder="np. pilne, na budowe X..."
                  className="w-full bg-[#131C2F] border border-[#2A3B59] text-white rounded px-3 py-2 text-sm"
                  data-testid="order-notes-input"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[#2A3B59] flex justify-end gap-2">
              <Button onClick={() => setModalItem(null)} variant="ghost" className="text-[#94A3B8]" data-testid="order-cancel-btn">
                Anuluj
              </Button>
              <ActionButton
                onAction={submitOrder}
                disabled={submitting}
                className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                data-testid="order-submit-btn"
              ><Check className="h-4 w-4 mr-1" />
                {submitting ? 'Wysylanie...' : 'Złóż zamówienie'}</ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EquipmentCatalog;
