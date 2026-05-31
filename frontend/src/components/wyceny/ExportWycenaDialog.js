// iter95aw: ExportWycenaDialog wyciągnięty z Wyceny.js (refaktor)
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { FileText, FileSpreadsheet, FileDown, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const ExportWycenaDialog = ({ wycenaId, wycenaName, clientName, onClose }) => {
  const [detail, setDetail] = useState('positions');
  const [downloading, setDownloading] = useState(false);
  const [includeSurface, setIncludeSurface] = useState(true);
  const [includeWskazniki, setIncludeWskazniki] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const hasClient = !!(clientName && clientName.trim());  // iter95bj: dla ostrzezenia braku adresata

  const buildQuery = (extra = {}) => {
    const params = new URLSearchParams({ detail });
    if (detail === 'client') {
      params.set('include_surface', includeSurface ? 'true' : 'false');
      params.set('include_wskazniki', includeWskazniki ? 'true' : 'false');
      params.set('include_notes', includeNotes ? 'true' : 'false');
    }
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  };

  const download = async (format) => {
    setDownloading(true);
    try {
      // iter95bp: timeout 90s dla eksportu (duze wyceny moga przekroczyc globalne 15s)
      const r = await api.get(`/wyceny/${wycenaId}/export.${format}?${buildQuery()}`, {
        responseType: 'blob',
        timeout: 90000,
      });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const safe = (wycenaName || 'wycena').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      const suffix = detail === 'client' ? 'oferta_klient' : (detail === 'full' ? 'pelna' : 'pozycje');
      a.download = `${detail === 'client' ? 'Oferta' : 'Wycena'}_${safe}_${suffix}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Pobrano ${format.toUpperCase()}`);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setDownloading(false); }
  };

  const preview = async () => {
    setDownloading(true);
    try {
      // iter95bp: timeout 90s dla eksportu (duze wyceny moga przekroczyc globalne 15s)
      const r = await api.get(`/wyceny/${wycenaId}/export.pdf?${buildQuery({ inline: 'true' })}`, {
        responseType: 'blob',
        timeout: 90000,
      });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        toast.error('Wyłącz blokowanie wyskakujących okienek lub kliknij PDF aby pobrać');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error('Błąd podglądu: ' + (e.response?.data?.detail || e.message));
    } finally { setDownloading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md wyceny-no-spin"
        data-testid="export-wycena-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <FileText className="h-5 w-5" /> Eksportuj wycenę
          </DialogTitle>
          <div className="text-xs text-[#CBD5E1]">Wybierz zakres szczegółowości eksportu.</div>
        </DialogHeader>
        <div className="space-y-2 my-3">
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'positions' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#3D5378] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="positions"
              checked={detail === 'positions'} onChange={() => setDetail('positions')}
              className="mt-0.5" data-testid="export-radio-positions" />
            <div>
              <div className="text-sm font-semibold text-white">Same pozycje główne</div>
              <div className="text-[10px] text-[#CBD5E1]">
                1 wiersz na pozycję, w „Uwagi" lista zawartych podpozycji (Materiały, Robocizna, Sprzęt) — bez ilości i cen.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'full' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#3D5378] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="full"
              checked={detail === 'full'} onChange={() => setDetail('full')}
              className="mt-0.5" data-testid="export-radio-full" />
            <div>
              <div className="text-sm font-semibold text-white">Pozycje główne + podpozycje</div>
              <div className="text-[10px] text-[#CBD5E1]">
                Każda podpozycja w osobnym wierszu z ilością, ceną, narzutem, marżą, kaucjami proporcjonalnymi i budżetem.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${detail === 'client' ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[#3D5378] hover:border-[#5F7552]'}`}>
            <input type="radio" name="detail" value="client"
              checked={detail === 'client'} onChange={() => setDetail('client')}
              className="mt-0.5" data-testid="export-radio-client" />
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                Wersja dla klienta
                <span className="text-[9px] bg-[#5F7552] text-white px-1.5 py-0.5 rounded uppercase">PDF · Excel</span>
              </div>
              <div className="text-[10px] text-[#CBD5E1]">
                Schludny dokument z logo: nazwa pozycji, ilość, cena netto, wartość netto. <b className="text-[#9DBC85]">Bez</b> marży, narzutu, kaucji i zysku. Excel z <b className="text-[#9DBC85]">aktywnymi formułami</b> (=ilość×cena, =SUM) — inwestor może podmienić wartości i wszystko się przeliczy.
              </div>
            </div>
          </label>
        </div>

        {detail === 'client' && (
          <div className="border border-[#5F7552]/40 bg-[#3F5235]/15 rounded p-3 -mt-1 space-y-2.5"
               data-testid="export-client-opts">
            {/* iter95bj: ostrzezenie gdy brak danych klienta */}
            {!hasClient && (
              <div className="flex items-start gap-2 p-2 rounded bg-[#7A2E0C]/40 border border-[#F59E0B]"
                   data-testid="export-no-client-warning">
                <span className="text-[#F59E0B] text-base leading-none">⚠</span>
                <div className="text-[11px] text-[#FCD34D] flex-1">
                  <b>Brak danych klienta</b> — PDF nie będzie zawierał bloku adresata.
                  Zamknij ten dialog i uzupełnij sekcję <b className="text-white">„Dane klienta"</b> nad listą etapów,
                  by oferta wyglądała profesjonalnie.
                </div>
              </div>
            )}
            <div className="text-[10px] uppercase text-[#9DBC85] font-semibold mb-1">
              Co załączyć w ofercie:
            </div>
            <label className="flex items-center gap-2 text-xs text-[#F1F5F9] cursor-pointer hover:text-white">
              <input type="checkbox" checked={includeSurface}
                onChange={(e) => setIncludeSurface(e.target.checked)}
                className="accent-[#9DBC85]" data-testid="export-opt-surface" />
              <span><b className="text-[#9DBC85]">Powierzchnie</b> (PC, PC↓ podziemie, PC↑ nadziemie, PUM)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#F1F5F9] cursor-pointer hover:text-white">
              <input type="checkbox" checked={includeWskazniki}
                onChange={(e) => setIncludeWskazniki(e.target.checked)}
                className="accent-[#9DBC85]" data-testid="export-opt-wskazniki" />
              <span><b className="text-[#9DBC85]">Wskaźniki kosztowe</b> (zł/m² dla PC / PC↓ / PC↑ / PUM)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#F1F5F9] cursor-pointer hover:text-white">
              <input type="checkbox" checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="accent-[#9DBC85]" data-testid="export-opt-notes" />
              <span><b className="text-[#9DBC85]">Uwagi</b> (notatka oferty lub domyślna klauzula 30 dni)</span>
            </label>

            {/* iter95bk: usunieto wybor szablonu — zostawiony tylko szablon Premium
                (granat + zielony akcent FeGrro). Excel zawsze klasyczny z aktywnymi formulami. */}
            <div className="pt-2 border-t border-[#5F7552]/30 text-[10px] text-[#94A3B8] italic">
              Szablon PDF: <b className="text-[#9DBC85] not-italic">Premium</b> (granat + zielony akcent).
              Excel zawsze klasyczny, z aktywnymi formułami.
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
            data-testid="export-close">Anuluj</Button>
          <Button onClick={preview} disabled={downloading}
            variant="outline" className="border-[#D4AF37]/60 text-[#D4AF37]"
            data-testid="export-preview-btn"
            title="Otwórz PDF w nowej karcie zamiast pobierać">
            <Eye className="h-4 w-4 mr-1" /> Podgląd
          </Button>
          <Button onClick={() => download('pdf')} disabled={downloading}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="export-pdf-btn">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => download('xlsx')} disabled={downloading}
            className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#152033] font-semibold"
            data-testid="export-xlsx-btn">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
