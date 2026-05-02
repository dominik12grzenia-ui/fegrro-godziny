import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Shirt, Check, User } from 'lucide-react';
import { toast } from 'sonner';
import { BODY_TYPES } from './BodySilhouettes';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MONTH_NAMES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];

export const ClothingOrderPublic = ({ token }) => {
  const [types, setTypes] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [profile, setProfile] = useState({ shoe_size: '', height: '', body_type: '' });
  const [profileDirty, setProfileDirty] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [qty, setQty] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [tRes, oRes, pRes] = await Promise.all([
        axios.get(`${API}/public/clothing/${token}/types`),
        axios.get(`${API}/public/clothing/${token}/orders`),
        axios.get(`${API}/public/clothing/${token}/profile`),
      ]);
      setTypes(tRes.data);
      setMyOrders(oRes.data);
      setProfile({
        shoe_size: pRes.data.shoe_size || '',
        height: pRes.data.height || '',
        body_type: pRes.data.body_type || '',
      });
      setProfileDirty(false);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await axios.put(`${API}/public/clothing/${token}/profile`, {
        shoe_size: profile.shoe_size || null,
        height: profile.height || null,
        body_type: profile.body_type || null,
      });
      toast.success('Wymiary zapisane');
      setProfileDirty(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleOrder = async (ct) => {
    const q = parseInt(qty[ct.id] || '1', 10);
    if (!q || q < 1) { toast.error('Podaj ilosc'); return; }
    if (q > ct.remaining_this_year) { toast.error(`Max ${ct.remaining_this_year} szt.`); return; }
    try {
      await axios.post(`${API}/public/clothing/${token}/order`, {
        clothing_type_id: ct.id,
        quantity: q,
      });
      toast.success('Zamowienie wyslane');
      setQty((prev) => ({ ...prev, [ct.id]: '' }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad');
    }
  };

  if (loading) return null;
  if (types.length === 0) return null;

  const profileComplete = !!(profile.shoe_size && profile.height && profile.body_type);

  return (
    <>
      <Card className="mt-4 bg-[#2A384C] border-[#334155]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
            <Shirt className="h-4 w-4 text-[#5F7151]" />
            Ubrania robocze
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Profile section (saved once per worker) */}
          <div className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-[#5F7151]" />
              <span className="text-[#CBD5E1] font-semibold text-sm">Moje wymiary</span>
              {!profileComplete && (
                <span className="text-[10px] bg-[#4A2020] text-[#E8B76A] px-2 py-0.5 rounded font-semibold uppercase">Uzupełnij</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-[#94A3B8]">Rozmiar buta</label>
                <Input
                  value={profile.shoe_size}
                  onChange={(e) => { setProfile((p) => ({ ...p, shoe_size: e.target.value })); setProfileDirty(true); }}
                  placeholder="np. 42"
                  className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                  data-testid="profile-shoe"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#94A3B8]">Wzrost (cm)</label>
                <Input
                  value={profile.height}
                  onChange={(e) => { setProfile((p) => ({ ...p, height: e.target.value })); setProfileDirty(true); }}
                  placeholder="np. 178"
                  className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                  data-testid="profile-height"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#94A3B8] block mb-1">Sylwetka</label>
              <div className="grid grid-cols-3 gap-2">
                {BODY_TYPES.map((bt) => {
                  const selected = profile.body_type === bt.value;
                  const Icon = bt.Icon;
                  return (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => { setProfile((p) => ({ ...p, body_type: bt.value })); setProfileDirty(true); }}
                      title={bt.label}
                      aria-label={bt.label}
                      className={`flex items-center justify-center p-2 rounded border transition-colors ${selected ? 'bg-[#5F7151]/20 border-[#5F7151]' : 'bg-[#0F172A] border-[#334155] hover:border-[#5F7151]/50'}`}
                      data-testid={`profile-body-${bt.value}`}
                    >
                      <Icon className={`h-10 w-auto ${selected ? 'text-[#5F7151]' : 'text-[#475569]'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
            {profileDirty && (
              <Button
                onClick={saveProfile}
                disabled={savingProfile}
                size="sm"
                className="mt-3 w-full bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                data-testid="save-profile-btn"
              >
                {savingProfile ? 'Zapisywanie...' : 'Zapisz wymiary'}
              </Button>
            )}
          </div>

          {/* Clothing types */}
          {types.map((ct) => {
            const needsProfile = (
              (ct.requires_shoe_size && !profile.shoe_size) ||
              (ct.requires_height && !profile.height) ||
              (ct.requires_body_type && !profile.body_type)
            );
            return (
              <div key={ct.id} className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
                <div className="flex items-start gap-3">
                  {ct.photo ? (
                    <img
                      src={ct.photo}
                      alt={ct.name}
                      className="w-20 h-20 object-contain rounded border border-[#334155] bg-[#0F172A] cursor-zoom-in shrink-0"
                      onClick={() => setLightbox(ct.photo)}
                      data-testid={`clothing-photo-${ct.id}`}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded bg-[#0F172A] border border-[#334155] flex items-center justify-center shrink-0">
                      <Shirt className="h-8 w-8 text-[#475569]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[#CBD5E1] font-semibold">{ct.name}</span>
                      <span className="text-xs text-[#94A3B8]">
                        Zostało: <span className="text-[#6B8E4E] font-bold">{ct.remaining_this_year}</span>/{ct.yearly_limit}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-1">
                      Okno zamówień: {MONTH_NAMES[ct.start_month - 1]} → {MONTH_NAMES[ct.end_month - 1]}
                      {ct.usage_period_months > 0 && ` · Okres: ${ct.usage_period_months} mies.`}
                    </p>

                    {!ct.can_order_now ? (
                      <p className="text-xs text-[#E8B76A] bg-[#3D2E2E] p-2 rounded mt-2">{ct.reason}</p>
                    ) : needsProfile ? (
                      <p className="text-xs text-[#E8B76A] bg-[#3D2E2E] p-2 rounded mt-2">
                        Najpierw uzupełnij swoje wymiary powyżej.
                      </p>
                    ) : (
                      <div className="flex gap-2 items-end mt-2">
                        <div className="flex-1 max-w-[100px]">
                          <label className="text-[10px] text-[#94A3B8]">Ilość</label>
                          <Input
                            type="number" min="1"
                            max={ct.usage_period_months > 0 ? 1 : ct.remaining_this_year}
                            value={qty[ct.id] || ''}
                            onChange={(e) => setQty((prev) => ({ ...prev, [ct.id]: e.target.value }))}
                            placeholder={ct.usage_period_months > 0 ? 'max 1' : `max ${ct.remaining_this_year}`}
                            className="bg-[#0F172A] border-[#334155] text-[#CBD5E1] h-9 text-sm"
                            data-testid={`clothing-qty-${ct.id}`}
                          />
                        </div>
                        <Button
                          onClick={() => handleOrder(ct)}
                          size="sm"
                          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                          data-testid={`clothing-order-btn-${ct.id}`}
                        >
                          <Check className="h-3 w-3 mr-1" /> Zamów
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {myOrders.length > 0 && (() => {
            const pending = myOrders.filter((o) => o.status !== 'issued');
            const issued = myOrders.filter((o) => o.status === 'issued');
            return (
              <div className="mt-3 pt-3 border-t border-[#334155] space-y-3">
                {pending.length > 0 && (
                  <div>
                    <p className="text-[#E8B76A] text-xs font-semibold mb-1">Zamówione (czekają na realizację)</p>
                    <div className="space-y-1">
                      {pending.map((o) => (
                        <div key={o.id} className="text-xs bg-[#1E293B] p-2 rounded flex justify-between flex-wrap gap-2" data-testid={`my-clothing-${o.id}`}>
                          <span>
                            <span className="text-[#CBD5E1] font-semibold">{o.clothing_type_name}</span>
                            <span className="text-[#94A3B8]"> x {o.quantity}</span>
                          </span>
                          <span className="text-[#E8B76A]">{new Date(o.created_at).toLocaleDateString('pl-PL')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {issued.length > 0 && (
                  <div>
                    <p className="text-[#6B8E4E] text-xs font-semibold mb-1">Dostarczone</p>
                    <div className="space-y-1">
                      {issued.slice(0, 15).map((o) => (
                        <div key={o.id} className="text-xs bg-[#1E293B]/60 p-2 rounded flex justify-between flex-wrap gap-2 opacity-70" data-testid={`my-clothing-${o.id}`}>
                          <span>
                            <span className="text-[#CBD5E1] font-semibold">{o.clothing_type_name}</span>
                            <span className="text-[#94A3B8]"> x {o.quantity}</span>
                          </span>
                          <span className="text-[#6B8E4E]">Odebrane · {o.issued_at ? new Date(o.issued_at).toLocaleDateString('pl-PL') : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
          data-testid="clothing-lightbox"
        >
          <img src={lightbox} alt="Podglad" className="max-w-[95vw] max-h-[95vh] object-contain rounded" />
        </div>
      )}
    </>
  );
};
