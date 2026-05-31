// iter95bc: wydzielony z Finance.js (refaktor split)
// iter95z: dodano list rozwijana zapisanych kontrahentow
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ChevronDown, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const NipLookup = ({ onResult, compact = false }) => {
  const [nip, setNip] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [kontrahenci, setKontrahenci] = useState([]);
  const dropdownRef = useRef(null);

  const fetchGus = async () => {
    const cleaned = nip.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }
    setBusy(true);
    try {
      const r = await api.get(`/finance/gus-lookup/${cleaned}`);
      onResult(r.data.formatted);
      toast.success(`Załadowano: ${r.data.name}`);
      setNip('');
    } catch (e) {
      toast.error('GUS: ' + (e.response?.data?.detail || e.message));
    } finally {
      setBusy(false);
    }
  };

  // iter95z: pobierz zapisanych kontrahentow przy otwieraniu listy
  useEffect(() => {
    if (!open || kontrahenci.length > 0) return;
    api.get('/finance/kontrahenci')
      .then((r) => setKontrahenci(r.data?.rows || []))
      .catch(() => {});
  }, [open, kontrahenci.length]);

  // Zamykanie po klik poza
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return kontrahenci;
    return kontrahenci.filter((k) =>
      (k.name || '').toLowerCase().includes(f) ||
      (k.nip || '').includes(f) ||
      (k.text || '').toLowerCase().includes(f),
    );
  }, [filter, kontrahenci]);

  const pickKontrahent = (k) => {
    onResult(k.text);
    setOpen(false);
    setFilter('');
    toast.success(`Wybrano: ${k.name}`);
  };

  return (
    <div className={`relative ${compact ? 'mb-1' : 'mb-1.5'}`} ref={dropdownRef}>
      <div className="flex gap-1">
        <Input
          value={nip} onChange={(e) => setNip(e.target.value)}
          placeholder="NIP (10 cyfr)" maxLength={13}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchGus(); } }}
          className="h-7 text-xs bg-[#1E2A44] border-[#3D5378] text-white no-spinner"
          data-testid="nip-lookup-input"
        />
        <Button type="button" size="sm" onClick={fetchGus} disabled={busy}
          className="h-7 px-2 text-xs bg-[#4F6343] hover:bg-[#3F5235] text-white whitespace-nowrap"
          data-testid="nip-lookup-btn">
          {busy ? 'Pobieram...' : 'Pobierz z GUS'}
        </Button>
        <Button type="button" size="sm" onClick={() => setOpen((v) => !v)}
          className="h-7 px-2 text-xs bg-[#D4AF37]/20 hover:bg-[#D4AF37]/40 text-[#D4AF37] border border-[#D4AF37]/60 whitespace-nowrap"
          title="Wybierz z zapisanych kontrahentów"
          data-testid="nip-lookup-saved-btn">
          Zapisani <ChevronDown className="h-3 w-3 ml-0.5" />
        </Button>
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-[#152033] border border-[#D4AF37]/60 rounded-md shadow-xl max-h-64 overflow-y-auto"
          data-testid="nip-lookup-saved-dropdown"
        >
          <div className="sticky top-0 bg-[#152033] p-1.5 border-b border-[#3D5378]">
            <div className="relative">
              <Search className="h-3 w-3 absolute left-1.5 top-1.5 text-[#94A3B8]" />
              <input
                type="text"
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Szukaj po nazwie lub NIP..."
                className="w-full bg-[#1E2A44] border border-[#3D5378] text-white text-xs rounded pl-6 pr-2 py-1 outline-none focus:border-[#D4AF37]"
                data-testid="nip-lookup-saved-filter"
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-[#94A3B8] text-center">
              {kontrahenci.length === 0
                ? 'Brak zapisanych kontrahentów. Pobierz pierwszego z GUS aby się zapisał.'
                : 'Brak wyników dla filtra.'}
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((k, idx) => (
                <button
                  key={`${k.kind}-${idx}-${k.nip || k.name}`}
                  type="button"
                  onClick={() => pickKontrahent(k)}
                  className="w-full text-left px-2 py-1.5 hover:bg-[#3D5378]/50 transition-colors group"
                  data-testid={`nip-lookup-saved-item-${idx}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#F1F5F9] font-semibold truncate">{k.name}</div>
                      <div className="text-[10px] text-[#CBD5E1] flex items-center gap-1.5 flex-wrap">
                        {k.nip && <span className="font-mono bg-[#3D5378]/60 px-1 rounded">NIP: {k.nip}</span>}
                        <span className={`px-1 rounded text-[9px] uppercase ${
                          k.kind === 'zamawiajacy' ? 'bg-[#3F5235]/60 text-[#9DBC85]' : 'bg-[#5F4A3B]/60 text-[#D4AF37]'
                        }`}>{k.kind}</span>
                      </div>
                    </div>
                    <Check className="h-3 w-3 text-[#5F7552] opacity-0 group-hover:opacity-100 shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
