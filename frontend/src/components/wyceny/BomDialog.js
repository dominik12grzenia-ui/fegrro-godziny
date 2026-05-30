// iter95aw: BomDialog wyciągnięty z Wyceny.js (refaktor)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Package, FileDown, FileSpreadsheet, Send, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const BomDialog = ({ wycenaId, onClose }) => {
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupBranze, setNewSupBranze] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedCats, setSelectedCats] = useState(new Set());
  const [savingTemplate, setSavingTemplate] = useState(false);

  const reloadHistory = useCallback(() => {
    api.get(`/wyceny/${wycenaId}/bom/history`)
      .then((r) => setHistory(r.data?.rows || []))
      .catch(() => {});
  }, [wycenaId]);

  useEffect(() => {
    Promise.all([
      api.get(`/wyceny/${wycenaId}/bom`),
      api.get(`/wyceny/${wycenaId}/template`),
    ])
      .then(([rBom, rW]) => {
        setBom(rBom.data);
        const wName = rBom.data?.wycena_name || '';
        const wyc = rW.data?.wycena || {};
        setSubject(wyc.bom_email_subject || `Zapytanie ofertowe — ${wName}`);
        setBody(wyc.bom_email_body || (
          `Dzień dobry,\n\n` +
          `W załączeniu przesyłam zestawienie materiałów do wyceny: „${wName || '—'}".\n` +
          `Proszę o przygotowanie oferty cenowej (cena netto za opakowanie).\n\n` +
          `Termin oferty: 7 dni.\n\n` +
          `Pozdrawiam,\nFeGrro`
        ));
        const allCats = new Set();
        (rBom.data?.rows || []).forEach((r) => {
          allCats.add(r.sub_category || '__brak__');
        });
        setSelectedCats(allCats);
      })
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
    api.get('/wyceny/suppliers')
      .then((r) => setSuppliers(r.data?.rows || []))
      .catch(() => {});
    reloadHistory();
  }, [wycenaId, reloadHistory]);

  const reloadSuppliers = () => api.get('/wyceny/suppliers').then((r) => setSuppliers(r.data?.rows || []));

  const onPickSupplier = (sid) => {
    setSupplierId(sid);
    const s = suppliers.find((x) => x.id === sid);
    if (s) setToEmail(s.email);
  };

  const addSupplier = async () => {
    if (!newSupName.trim() || !newSupEmail.trim()) {
      toast.error('Podaj nazwę i email'); return;
    }
    try {
      const r = await api.post('/wyceny/suppliers', {
        name: newSupName.trim(), email: newSupEmail.trim(),
        branze: newSupBranze.trim() || null,
      });
      await reloadSuppliers();
      setSupplierId(r.data.id);
      setToEmail(newSupEmail.trim());
      setNewSupName(''); setNewSupEmail(''); setNewSupBranze('');
      toast.success('Hurtownia dodana');
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  const availableCats = useMemo(() => {
    const m = new Map();
    (bom?.rows || []).forEach((r) => {
      const c = r.sub_category || '__brak__';
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries());
  }, [bom]);

  const toggleCat = (c) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const allCatsSelected = availableCats.length > 0 && availableCats.every(([c]) => selectedCats.has(c));

  const subcatsForFilter = () => {
    if (allCatsSelected) return null;
    const arr = Array.from(selectedCats).filter((c) => c !== '__brak__');
    return arr.length ? arr : null;
  };

  const filteredRowsCount = useMemo(() => {
    if (allCatsSelected) return bom?.rows?.length || 0;
    return (bom?.rows || []).filter((r) => selectedCats.has(r.sub_category || '__brak__')).length;
  }, [bom, selectedCats, allCatsSelected]);

  const saveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await api.patch(`/wyceny/${wycenaId}`, {
        bom_email_subject: subject,
        bom_email_body: body,
      });
      toast.success('Szablon zapisany dla tej wyceny');
    } catch (e) {
      toast.error('Błąd zapisu: ' + (e.response?.data?.detail || e.message));
    } finally { setSavingTemplate(false); }
  };

  const sendEmail = async () => {
    if (!toEmail.trim()) { toast.error('Podaj email odbiorcy'); return; }
    if (filteredRowsCount === 0) { toast.error('Brak materiałów po filtrze kategorii'); return; }
    setSending(true);
    try {
      const r = await api.post(`/wyceny/${wycenaId}/bom/send`, {
        to_email: toEmail.trim(),
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        supplier_id: supplierId || undefined,
        subcategories: subcatsForFilter(),
      });
      toast.success(`Wysłano! (ID: ${r.data.message_id?.slice(0, 8) || 'ok'}…)`);
      setShowSendForm(false);
      reloadHistory();
    } catch (e) {
      toast.error('Błąd wysyłki: ' + (e.response?.data?.detail || e.message));
    } finally { setSending(false); }
  };

  const download = async (format) => {
    setDownloading(true);
    try {
      const subs = subcatsForFilter();
      const apiUrl = subs
        ? `/wyceny/${wycenaId}/bom.${format}?subcategories=${encodeURIComponent(subs.join(','))}`
        : `/wyceny/${wycenaId}/bom.${format}`;
      const r = await api.get(apiUrl, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'xlsx' ? 'xlsx' : 'pdf';
      const safeName = (bom?.wycena_name || 'wycena').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      a.download = `BOM_${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Pobrano ${ext.toUpperCase()}`);
    } catch (e) {
      toast.error('Błąd pobierania: ' + (e.response?.data?.detail || e.message));
    } finally { setDownloading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-5xl wyceny-no-spin"
        data-testid="bom-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <Package className="h-5 w-5" /> Zapytanie ofertowe — Zestawienie materiałów
          </DialogTitle>
          <div className="text-xs text-[#CBD5E1]">
            Zagregowane materiały z całej wyceny. Liczba opakowań <b className="text-[#D4AF37]">zaokrąglona w górę</b> do pełnych palet / wiaderek / rolek.
          </div>
        </DialogHeader>

        {availableCats.length > 1 && (
          <div className="border border-[#5F7552]/40 bg-[#3F5235]/15 rounded p-2 space-y-1.5"
               data-testid="bom-cat-filter">
            <div className="text-[10px] uppercase text-[#9DBC85] font-semibold flex items-center gap-2">
              📦 Kategorie materiałów (zaznacz co wysłać)
              <span className="text-[10px] text-[#CBD5E1] font-normal ml-auto">
                Filtr aktywny: <b className="text-[#D4AF37]">{filteredRowsCount}/{bom?.rows?.length || 0}</b> pozycji
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableCats.map(([cat, count]) => {
                const on = selectedCats.has(cat);
                const label = cat === '__brak__' ? '— bez kategorii —' : cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded border transition ${
                      on
                        ? 'bg-[#9DBC85] text-[#152033] border-[#9DBC85]'
                        : 'border-[#5F7552]/60 text-[#CBD5E1] hover:text-[#9DBC85] hover:border-[#9DBC85]/60'
                    }`}
                    data-testid={`bom-cat-${cat.replace(/[^a-zA-Z0-9]/g, '_')}`}
                  >
                    {label} <span className="opacity-70 font-normal">({count})</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedCats(new Set(availableCats.map(([c]) => c)))}
                className="text-[10px] border border-[#3D5378] text-[#F1F5F9] px-2 py-1 rounded hover:bg-[#3D5378]"
                data-testid="bom-cat-all"
              >Wszystkie</button>
              <button
                type="button"
                onClick={() => setSelectedCats(new Set())}
                className="text-[10px] border border-[#3D5378] text-[#F1F5F9] px-2 py-1 rounded hover:bg-[#3D5378]"
                data-testid="bom-cat-none"
              >Żadna</button>
            </div>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto border border-[#3D5378] rounded">
          {loading ? (
            <div className="text-[#CBD5E1] p-4 text-center text-sm">Ładowanie...</div>
          ) : !bom?.rows || bom.rows.length === 0 ? (
            <div className="text-[#CBD5E1] p-4 text-center text-sm">
              Brak materiałów w tej wycenie. Dodaj podpozycje typu „Materiał".
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#152033] sticky top-0">
                <tr className="text-[#CBD5E1] uppercase text-[10px]">
                  <th className="text-center px-2 py-1.5 w-10">L.p.</th>
                  <th className="text-left px-2 py-1.5">Nazwa materiału</th>
                  <th className="text-right px-2 py-1.5 w-24">Ilość zużycia</th>
                  <th className="text-center px-2 py-1.5 w-16">Jedn.</th>
                  <th className="text-center px-2 py-1.5 w-24">Opakowanie</th>
                  <th className="text-center px-2 py-1.5 w-24">Wielkość opak.</th>
                  <th className="text-center px-2 py-1.5 w-24">Liczba opak. <span className="text-[#D4AF37]">▲</span></th>
                </tr>
              </thead>
              <tbody>
                {bom.rows.map((row, idx) => {
                  const showPkgQty = row.qty_in_pkg_unit != null;
                  const qty = showPkgQty ? row.qty_in_pkg_unit : row.quantity;
                  const unit = showPkgQty ? (row.pkg_unit || '') : row.unit;
                  return (
                    <tr key={idx} className="border-t border-[#3D5378]" data-testid={`bom-row-${idx}`}>
                      <td className="px-2 py-1.5 text-center text-[#CBD5E1]">{idx + 1}</td>
                      <td className="px-2 py-1.5 text-white">
                        {row.name}
                        {row.occurrences > 1 && (
                          <span className="ml-2 text-[10px] text-[#CBD5E1]">({row.occurrences} pozycje)</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#9DBC85] font-semibold tabular-nums">
                        {qty.toLocaleString('pl-PL', { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-2 py-1.5 text-center text-[#F1F5F9]">{unit || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-[#F1F5F9]">{row.opakowanie || '—'}</td>
                      <td className="px-2 py-1.5 text-center text-[#CBD5E1]">
                        {row.pkg_qty ? `${row.pkg_qty} ${row.pkg_unit || ''}` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold tabular-nums">
                        {row.num_packages != null ? (
                          <span className="text-[#D4AF37] text-sm">{row.num_packages}</span>
                        ) : (
                          <span className="text-[#FCA5A5] text-[10px] italic" title="Brak danych w cenniku — uzupełnij ilość w opakowaniu i normę">brak danych</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {showHistory && (
          <div className="mt-3 p-3 bg-[#152033] border border-[#3D5378] rounded space-y-2"
               data-testid="bom-history-panel">
            <div className="text-[11px] text-[#9DBC85] font-semibold uppercase flex items-center gap-2">
              <Send className="h-4 w-4" /> Historia wysłanych zapytań ofertowych
              <span className="text-[10px] text-[#CBD5E1] font-normal ml-auto">{history.length} {history.length === 1 ? 'wysyłka' : 'wysyłek'}</span>
            </div>
            {history.length === 0 ? (
              <div className="text-[11px] text-[#CBD5E1] italic">Brak wysłanych zapytań dla tej wyceny.</div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-[#3D5378] rounded">
                <table className="w-full text-xs">
                  <thead className="bg-[#1E2A44] sticky top-0">
                    <tr className="text-[#CBD5E1] uppercase text-[10px]">
                      <th className="text-left px-2 py-1.5">Data</th>
                      <th className="text-left px-2 py-1.5">Email odbiorcy</th>
                      <th className="text-left px-2 py-1.5">Temat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const d = h.sent_at ? new Date(h.sent_at) : null;
                      const dateStr = d ? d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                      const supplier = suppliers.find((s) => s.id === h.supplier_id);
                      return (
                        <tr key={h.id || i} className="border-t border-[#3D5378]"
                            data-testid={`bom-history-row-${i}`}>
                          <td className="px-2 py-1.5 text-[#F1F5F9] tabular-nums whitespace-nowrap">{dateStr}</td>
                          <td className="px-2 py-1.5 text-[#9DBC85]">
                            {h.to_email}
                            {supplier && <span className="ml-1 text-[10px] text-[#CBD5E1]">({supplier.name})</span>}
                          </td>
                          <td className="px-2 py-1.5 text-[#CBD5E1] truncate max-w-md" title={h.subject}>{h.subject || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showSendForm && (
          <div className="mt-3 p-3 bg-[#152033] border border-[#5F7552]/60 rounded space-y-2">
            <div className="text-[11px] text-[#9DBC85] font-semibold uppercase flex items-center gap-2">
              <Mail className="h-4 w-4" /> Wyślij do hurtowni
              <span className="text-[10px] text-[#CBD5E1] font-normal ml-auto">Nadawca: biuro@fegrro.pl</span>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="text-[10px] text-[#CBD5E1] uppercase">Hurtownia (z bazy)</label>
                <select value={supplierId} onChange={(e) => onPickSupplier(e.target.value)}
                  className="w-full bg-[#1E2A44] border border-[#3D5378] rounded h-8 text-xs text-[#F1F5F9] px-2 outline-none focus:border-[#D4AF37]"
                  data-testid="bom-supplier-select">
                  <option value="">— wybierz lub wpisz nowy email poniżej —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.name} (${s.email})${s.phone ? ` · ☎ ${s.phone}` : ''}${s.branze ? ` · ${s.branze}` : ''}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-6">
                <label className="text-[10px] text-[#CBD5E1] uppercase">Email odbiorcy</label>
                <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)}
                  placeholder="email@hurtownia.pl"
                  className="bg-[#1E2A44] border-[#3D5378] h-8 text-xs"
                  data-testid="bom-to-email" />
              </div>
              <div className="col-span-12">
                <label className="text-[10px] text-[#CBD5E1] uppercase">Temat</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="bg-[#1E2A44] border-[#3D5378] h-8 text-xs"
                  data-testid="bom-subject" />
              </div>
              <div className="col-span-12">
                <label className="text-[10px] text-[#CBD5E1] uppercase">Wiadomość</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                  className="w-full bg-[#1E2A44] border border-[#3D5378] rounded p-2 text-xs text-[#F1F5F9] outline-none focus:border-[#D4AF37] resize-y"
                  data-testid="bom-body" />
              </div>
            </div>
            <div className="border-t border-[#3D5378] pt-2 mt-2">
              <div className="text-[10px] text-[#CBD5E1] uppercase mb-1">Lub dodaj nową hurtownię do bazy</div>
              <div className="grid grid-cols-12 gap-2">
                <Input value={newSupName} onChange={(e) => setNewSupName(e.target.value)} placeholder="Nazwa"
                  className="col-span-4 bg-[#1E2A44] border-[#3D5378] h-7 text-xs" data-testid="bom-new-sup-name" />
                <Input value={newSupEmail} onChange={(e) => setNewSupEmail(e.target.value)} placeholder="email@hurtownia.pl"
                  className="col-span-4 bg-[#1E2A44] border-[#3D5378] h-7 text-xs" data-testid="bom-new-sup-email" />
                <Input value={newSupBranze} onChange={(e) => setNewSupBranze(e.target.value)} placeholder="branże (opcjonalnie)"
                  className="col-span-3 bg-[#1E2A44] border-[#3D5378] h-7 text-xs" data-testid="bom-new-sup-branze" />
                <button onClick={addSupplier}
                  className="col-span-1 bg-[#5F7552] hover:bg-[#3F5235] text-white text-[10px] rounded"
                  data-testid="bom-add-sup">+ dodaj</button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
            data-testid="bom-close">Zamknij</Button>
          <Button onClick={() => setShowHistory((v) => !v)} variant="outline"
            className={`border-[#3D5378] ${showHistory ? 'text-[#D4AF37] border-[#D4AF37]/60' : 'text-[#F1F5F9]'}`}
            data-testid="bom-history-toggle">
            <Send className="h-4 w-4 mr-1" /> Historia{history.length > 0 ? ` (${history.length})` : ''}
          </Button>
          <Button onClick={() => download('pdf')} disabled={downloading || !bom?.rows?.length}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="bom-pdf-btn">
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => download('xlsx')} disabled={downloading || !bom?.rows?.length}
            variant="outline" className="border-[#5F7552] text-[#9DBC85]"
            data-testid="bom-xlsx-btn">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          {!showSendForm ? (
            <Button onClick={() => setShowSendForm(true)} disabled={!bom?.rows?.length}
              className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#152033] font-semibold"
              data-testid="bom-send-form-btn">
              <Mail className="h-4 w-4 mr-1" /> Wyślij do hurtowni
            </Button>
          ) : (
            <>
              <Button onClick={saveTemplate} disabled={savingTemplate}
                variant="outline" className="border-[#5F7552]/60 text-[#9DBC85] hover:bg-[#5F7552]/10"
                title="Zapisz aktualny temat i treść jako szablon emaila dla tej wyceny"
                data-testid="bom-save-template-btn">
                {savingTemplate ? 'Zapisuję…' : '💾 Zapisz szablon'}
              </Button>
              <Button onClick={sendEmail} disabled={sending || !toEmail || filteredRowsCount === 0}
                className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#152033] font-semibold"
                data-testid="bom-send-btn">
                <Send className="h-4 w-4 mr-1" /> {sending ? 'Wysyłam...' : `Wyślij teraz (${filteredRowsCount} poz.)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
