import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Shirt, Check } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BODY_TYPES = [
  { value: 'chudy', label: 'Szczupły' },
  { value: 'sredni', label: 'Średni' },
  { value: 'gruby', label: 'Silny' },
];

const MONTH_NAMES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];

export const ClothingOrderPublic = ({ token }) => {
  const [types, setTypes] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderForm, setOrderForm] = useState({});

  const fetchData = async () => {
    try {
      const [tRes, oRes] = await Promise.all([
        axios.get(`${API}/public/clothing/${token}/types`),
        axios.get(`${API}/public/clothing/${token}/orders`),
      ]);
      setTypes(tRes.data);
      setMyOrders(oRes.data);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  const handleOrder = async (ct) => {
    const form = orderForm[ct.id] || {};
    const qty = parseInt(form.quantity || '1', 10);
    if (!qty || qty < 1) { toast.error('Podaj ilosc'); return; }
    if (qty > ct.remaining_this_year) { toast.error(`Max ${ct.remaining_this_year} szt.`); return; }
    if (ct.requires_shoe_size && !form.shoe_size) { toast.error('Podaj rozmiar buta'); return; }
    if (ct.requires_height && !form.height) { toast.error('Podaj wzrost'); return; }
    if (ct.requires_body_type && !form.body_type) { toast.error('Wybierz sylwetke'); return; }
    try {
      await axios.post(`${API}/public/clothing/${token}/order`, {
        clothing_type_id: ct.id,
        quantity: qty,
        shoe_size: form.shoe_size || null,
        height: form.height || null,
        body_type: form.body_type || null,
      });
      toast.success('Zamowienie wyslane');
      setOrderForm((prev) => ({ ...prev, [ct.id]: {} }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  if (loading) return null;
  if (types.length === 0) return null;

  return (
    <Card className="mt-4 bg-[#2A384C] border-[#334155]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
          <Shirt className="h-4 w-4 text-[#5F7151]" />
          Ubrania robocze
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.map((ct) => {
          const f = orderForm[ct.id] || {};
          const setF = (patch) => setOrderForm((prev) => ({ ...prev, [ct.id]: { ...(prev[ct.id] || {}), ...patch } }));
          return (
            <div key={ct.id} className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-[#CBD5E1] font-semibold">{ct.name}</span>
                <span className="text-xs text-[#94A3B8]">
                  Zostało: <span className="text-[#6B8E4E] font-bold">{ct.remaining_this_year}</span>/{ct.yearly_limit} w tym roku
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] mb-2">
                Okno zamówień: {MONTH_NAMES[ct.start_month - 1]} → {MONTH_NAMES[ct.end_month - 1]}
                {ct.usage_period_months > 0 && ` · Okres użytkowania: ${ct.usage_period_months} mies.`}
              </p>

              {!ct.can_order_now ? (
                <p className="text-xs text-[#E8B76A] bg-[#3D2E2E] p-2 rounded">{ct.reason}</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-[#94A3B8]">Ilość</label>
                      <Input
                        type="number" min="1" max={ct.remaining_this_year}
                        value={f.quantity || ''}
                        onChange={(e) => setF({ quantity: e.target.value })}
                        placeholder={`max ${ct.remaining_this_year}`}
                        className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                        data-testid={`clothing-qty-${ct.id}`}
                      />
                    </div>
                    {ct.requires_shoe_size && (
                      <div>
                        <label className="text-[10px] text-[#94A3B8]">Rozmiar buta</label>
                        <Input
                          value={f.shoe_size || ''}
                          onChange={(e) => setF({ shoe_size: e.target.value })}
                          placeholder="np. 42"
                          className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                          data-testid={`clothing-shoe-${ct.id}`}
                        />
                      </div>
                    )}
                    {ct.requires_height && (
                      <div>
                        <label className="text-[10px] text-[#94A3B8]">Wzrost (cm)</label>
                        <Input
                          value={f.height || ''}
                          onChange={(e) => setF({ height: e.target.value })}
                          placeholder="np. 178"
                          className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                          data-testid={`clothing-height-${ct.id}`}
                        />
                      </div>
                    )}
                  </div>
                  {ct.requires_body_type && (
                    <div>
                      <label className="text-[10px] text-[#94A3B8] block mb-1">Sylwetka</label>
                      <div className="flex gap-2 flex-wrap">
                        {BODY_TYPES.map((bt) => (
                          <button
                            key={bt.value}
                            type="button"
                            onClick={() => setF({ body_type: bt.value })}
                            className={`px-3 py-1.5 rounded border text-xs ${f.body_type === bt.value ? 'bg-[#5F7151] border-[#5F7151] text-white' : 'bg-[#0F172A] border-[#334155] text-[#CBD5E1] hover:border-[#5F7151]'}`}
                            data-testid={`clothing-body-${ct.id}-${bt.value}`}
                          >
                            {bt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    onClick={() => handleOrder(ct)}
                    size="sm"
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white w-full sm:w-auto"
                    data-testid={`clothing-order-btn-${ct.id}`}
                  >
                    <Check className="h-3 w-3 mr-1" /> Zamów
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {myOrders.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#334155]">
            <p className="text-[#94A3B8] text-xs font-semibold mb-2">Moje zamówienia</p>
            <div className="space-y-1">
              {myOrders.slice(0, 10).map((o) => (
                <div key={o.id} className="text-xs bg-[#1E293B] p-2 rounded flex justify-between flex-wrap gap-2" data-testid={`my-clothing-${o.id}`}>
                  <span>
                    <span className="text-[#CBD5E1] font-semibold">{o.clothing_type_name}</span>
                    <span className="text-[#94A3B8]"> x {o.quantity}</span>
                  </span>
                  <span>
                    {o.status === 'issued' ? (
                      <span className="text-[#6B8E4E] font-semibold">Wydane · {o.issued_at ? new Date(o.issued_at).toLocaleDateString('pl-PL') : ''}</span>
                    ) : (
                      <span className="text-[#E8B76A]">Zamówione · {new Date(o.created_at).toLocaleDateString('pl-PL')}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
