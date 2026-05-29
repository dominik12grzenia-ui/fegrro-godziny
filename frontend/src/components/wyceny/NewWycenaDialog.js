// iter95aw: NewWycenaDialog wyciągnięty z Wyceny.js (refaktor)
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const NewWycenaDialog = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [clients, setClients] = useState([]);
  const [clientName, setClientName] = useState('');
  const [clientNip, setClientNip] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const [gusLoading, setGusLoading] = useState(false);

  useEffect(() => {
    api.get('/wyceny/clients')
      .then((r) => setClients(r.data?.rows || []))
      .catch(() => {});
  }, []);

  const onPickClient = (val) => {
    setClientName(val);
    const found = clients.find((c) => c.name.toLowerCase() === val.toLowerCase());
    if (found) {
      setClientNip(found.nip || '');
      setClientAddress(found.address || '');
    }
  };

  // iter95av: auto-pobieranie z Białej Listy MF po NIP
  const fetchFromGus = async () => {
    const clean = (clientNip || '').replace(/\D/g, '');
    if (clean.length !== 10) { toast.error('NIP musi zawierać 10 cyfr'); return; }
    setGusLoading(true);
    try {
      const r = await api.get(`/gus/${clean}`);
      if (r.data?.found) {
        if (r.data.name) setClientName(r.data.name);
        if (r.data.address) setClientAddress(r.data.address);
        toast.success(`Pobrano dane: ${r.data.name || '—'}`);
      } else {
        toast.error(r.data?.message || 'Nie znaleziono firmy o tym NIP');
      }
    } catch (e) {
      toast.error('Błąd GUS: ' + (e.response?.data?.detail || e.message));
    } finally { setGusLoading(false); }
  };

  const submit = async () => {
    const nm = name.trim();
    if (!nm) { toast.error('Podaj nazwę wyceny'); return; }
    setCreating(true);
    try {
      const r = await api.post('/wyceny', {
        name: nm,
        client_name: clientName.trim() || undefined,
        client_nip: clientNip.trim() || undefined,
        client_address: clientAddress.trim() || undefined,
      });
      toast.success('Utworzono wycenę');
      onCreated(r.data.id);
      onClose();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setCreating(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-xl"
                     data-testid="new-wycena-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37] flex items-center gap-2">
            <Plus className="h-5 w-5" /> Nowa wycena
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase text-[#94A3B8]">Nazwa wyceny / projektu *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="np. Dom jednorodzinny — Warszawa, ul. Przykładowa"
              className="bg-[#0B1120] border-[#2A3B59]"
              data-testid="new-wycena-name" autoFocus />
          </div>
          <div className="border border-[#5F7552]/40 bg-[#3F5235]/15 rounded p-3 space-y-2">
            <div className="text-[10px] uppercase text-[#9DBC85] font-semibold">
              👤 Dane zamawiającego (opcjonalnie)
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">Klient / firma</label>
              <Input value={clientName} onChange={(e) => onPickClient(e.target.value)}
                list="wyceny-clients-datalist"
                placeholder="zacznij wpisywać aby zobaczyć podpowiedzi z poprzednich wycen"
                className="bg-[#0B1120] border-[#2A3B59]"
                data-testid="new-wycena-client-name" />
              <datalist id="wyceny-clients-datalist">
                {clients.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.nip ? `NIP ${c.nip}` : ''}
                  </option>
                ))}
              </datalist>
              {clients.length > 0 && (
                <div className="text-[10px] text-[#94A3B8] mt-0.5">
                  📋 Wybierz z {clients.length} {clients.length === 1 ? 'klienta' : 'klientów'} — NIP i adres uzupełnią się automatycznie
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">NIP</label>
              <div className="flex items-center gap-2">
                <Input value={clientNip} onChange={(e) => setClientNip(e.target.value)}
                  placeholder="1234567890"
                  className="bg-[#0B1120] border-[#2A3B59] flex-1"
                  data-testid="new-wycena-client-nip" />
                <button
                  type="button"
                  onClick={fetchFromGus}
                  disabled={gusLoading}
                  title="Pobierz dane firmy z Białej Listy MF (po NIP)"
                  className="text-[11px] font-bold px-2 py-1.5 rounded border border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10 hover:bg-[#D4AF37]/25 transition whitespace-nowrap disabled:opacity-50"
                  data-testid="new-wycena-gus-btn"
                >
                  {gusLoading ? '⏳ Pobieram…' : '🏛 Pobierz z GUS'}
                </button>
              </div>
              <div className="text-[10px] text-[#94A3B8] mt-0.5">
                Wpisz NIP i kliknij <b className="text-[#D4AF37]">Pobierz z GUS</b> — nazwa i adres uzupełnią się z Białej Listy MF
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">Adres</label>
              <textarea value={clientAddress} onChange={(e) => setClientAddress(e.target.value)}
                placeholder="ul. Przykładowa 12/5&#10;00-001 Warszawa"
                rows={2}
                className="w-full bg-[#0B1120] border border-[#2A3B59] rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#9DBC85] resize-y"
                data-testid="new-wycena-client-address" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
            data-testid="new-wycena-cancel">Anuluj</Button>
          <Button onClick={submit} disabled={creating || !name.trim()}
            className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
            data-testid="new-wycena-submit">
            <Plus className="h-4 w-4 mr-1" /> {creating ? 'Tworzę…' : 'Utwórz wycenę'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
