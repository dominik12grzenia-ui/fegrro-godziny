// iter95aw: ConvertToBudgetDialog wyciągnięty z Wyceny.js (refaktor)
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const ConvertToBudgetDialog = ({ wycenaId, wycenaName, clientName, clientNip, onClose }) => {
  const [budowaName, setBudowaName] = useState(wycenaName || '');
  const [code, setCode] = useState('');
  const [zamawiajacy, setZamawiajacy] = useState(
    clientName ? (clientNip ? `${clientName} NIP: ${clientNip}` : clientName) : ''
  );
  const [umowaNr, setUmowaNr] = useState('');
  const [umowaData, setUmowaData] = useState('');
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!budowaName.trim()) { toast.error('Podaj nazwę budowy'); return; }
    setConverting(true);
    try {
      const r = await api.post(`/wyceny/${wycenaId}/convert-to-budget`, {
        budowa_name: budowaName.trim(),
        code: code.trim() || undefined,
        zamawiajacy: zamawiajacy.trim() || undefined,
        umowa_nr: umowaNr.trim() || undefined,
        umowa_data: umowaData.trim() || undefined,
      });
      setResult(r.data);
      toast.success('Budowa utworzona — wycena zaciągnięta do budżetu');
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setConverting(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-xl"
                     data-testid="convert-budget-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#9DBC85] flex items-center gap-2">
            <FileText className="h-5 w-5" /> Zaciągnij wycenę do budżetu
          </DialogTitle>
          <div className="text-xs text-[#94A3B8]">
            Tworzy <b className="text-white">nową budowę</b> w module Finanse/Budżet ze skopiowaną strukturą wyceny.
            Etapy, pozycje główne i podpozycje (materiały / robocizna / sprzęt) zostaną przeniesione 1:1.
          </div>
        </DialogHeader>
        {result ? (
          <div className="border border-[#9DBC85]/60 bg-[#3F5235]/20 rounded p-4 space-y-2">
            <div className="text-[#9DBC85] font-semibold text-sm">✓ Budowa utworzona pomyślnie</div>
            <div className="text-xs text-[#CBD5E1]">
              <b>{result.budowa_name}</b><br />
              Etapy: {result.stats.stages} · Pozycje: {result.stats.positions} · Linie: {result.stats.lines}
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-2">
              Przejdź do modułu <b className="text-[#9DBC85]">Finanse → Budżet</b> aby kontynuować pracę z budową.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">Nazwa budowy *</label>
              <Input value={budowaName} onChange={(e) => setBudowaName(e.target.value)}
                placeholder="np. Dom Kowalskich — Warszawa"
                className="bg-[#0B1120] border-[#2A3B59]"
                data-testid="convert-budowa-name" autoFocus />
              <div className="text-[10px] text-[#94A3B8] mt-0.5">
                Domyślnie nazwa wyceny. Musi być unikalna.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-[#94A3B8]">Kod budowy (opc.)</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder="np. B/2026/01"
                  className="bg-[#0B1120] border-[#2A3B59]"
                  data-testid="convert-code" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-[#94A3B8]">Nr umowy (opc.)</label>
                <Input value={umowaNr} onChange={(e) => setUmowaNr(e.target.value)}
                  placeholder="U/2026/001"
                  className="bg-[#0B1120] border-[#2A3B59]"
                  data-testid="convert-umowa-nr" />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">Data umowy (opc.)</label>
              <Input value={umowaData} onChange={(e) => setUmowaData(e.target.value)}
                placeholder="15.09.2026 lub 2026-09-15"
                className="bg-[#0B1120] border-[#2A3B59]"
                data-testid="convert-umowa-data" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-[#94A3B8]">Zamawiający</label>
              <Input value={zamawiajacy} onChange={(e) => setZamawiajacy(e.target.value)}
                placeholder="ACME Sp. z o.o. NIP: 1234567890"
                className="bg-[#0B1120] border-[#2A3B59]"
                data-testid="convert-zamawiajacy" />
              <div className="text-[10px] text-[#94A3B8] mt-0.5">
                {clientName ? '✓ Pre-fillowane z danych klienta wyceny — możesz nadpisać' : 'Wycena nie ma danych klienta — uzupełnij ręcznie'}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose} className="bg-[#9DBC85] hover:bg-[#8AA773] text-[#0B1120]"
              data-testid="convert-close">Zamknij</Button>
          ) : (
            <>
              <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
                data-testid="convert-cancel">Anuluj</Button>
              <Button onClick={submit} disabled={converting || !budowaName.trim()}
                className="bg-[#9DBC85] hover:bg-[#8AA773] text-[#0B1120] font-semibold"
                data-testid="convert-submit">
                <FileText className="h-4 w-4 mr-1" /> {converting ? 'Zaciągam…' : 'Zaciągnij do budżetu'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
