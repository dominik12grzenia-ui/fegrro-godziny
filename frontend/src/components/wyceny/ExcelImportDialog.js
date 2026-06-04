// iter95v: Import wyceny z Excela
import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Upload, FileSpreadsheet, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

const ROLE_COLORS = {
  stage: '#D4AF37',      // Złoty - etap
  position: '#5F7552',   // Zielony - pozycja
  skip: '#3D5378',       // Szary - pomiń
};

const ROLE_LABELS = {
  stage: 'Etap',
  position: 'Pozycja',
  skip: 'Pomiń',
};

// Helper: file -> base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const colLetter = (i) => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

const guessRole = (rowCells, nameCol, quantityCol, unitCol) => {
  // Heurystyka: jezeli nazwa istnieje + brak ilosci + brak jednostki -> etap
  // jezeli nazwa + ilosc lub jednostka -> pozycja
  // jezeli nazwa pusta -> skip
  const name = (rowCells[nameCol] || '').trim();
  if (!name) return 'skip';
  const hasQty = quantityCol != null && (rowCells[quantityCol] || '').trim() !== '';
  const hasUnit = unitCol != null && (rowCells[unitCol] || '').trim() !== '';
  // Naglowki: nazwy zaczynajace sie wielkimi literami bez ilosci -> etap
  if (!hasQty && !hasUnit) return 'stage';
  return 'position';
};

const guessColumn = (rows, keyword) => {
  // Sprawdz pierwsze 5 wierszy, czy jakas komorka zawiera keyword
  const kws = keyword.toLowerCase().split('|');
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = (rows[r][c] || '').toLowerCase();
      if (kws.some(k => cell.includes(k))) return c;
    }
  }
  return null;
};

export const ExcelImportDialog = ({ wycenaId, onClose, onImported }) => {
  const [step, setStep] = useState(1); // 1=upload, 2=mapping, 3=done
  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [rowMap, setRowMap] = useState({});   // row_index -> 'stage'|'position'|'skip'
  const [nameCol, setNameCol] = useState(null);
  const [unitCol, setUnitCol] = useState(null);
  const [quantityCol, setQuantityCol] = useState(null);
  const [notesCol, setNotesCol] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const sheet = sheets[sheetIdx];
  const rows = sheet?.rows || [];
  const cols = sheet?.cols || 0;

  const onPickFile = async (f) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xlsm)$/i)) {
      toast.error('Wybierz plik .xlsx lub .xlsm');
      return;
    }
    setFile(f);
    setLoading(true);
    try {
      const b64 = await fileToBase64(f);
      setFileBase64(b64);
      const r = await api.post('/wyceny/import/preview', { file_base64: b64 });
      const sh = r.data?.sheets || [];
      if (!sh.length) {
        toast.error('Plik nie zawiera arkuszy z danymi');
        setLoading(false);
        return;
      }
      setSheets(sh);
      setSheetIdx(0);
      // Auto-detekcja kolumn dla pierwszego arkusza
      const firstSheet = sh[0];
      const nm = guessColumn(firstSheet.rows, 'nazwa|nazwa pozycji|opis|description');
      const qty = guessColumn(firstSheet.rows, 'ilosc|ilość|qty|quantity|liczba');
      const un = guessColumn(firstSheet.rows, 'jednostka|j.m.|jm|unit');
      const nt = guessColumn(firstSheet.rows, 'uwagi|notatka|notes|comments');
      setNameCol(nm ?? 1);
      setQuantityCol(qty);
      setUnitCol(un);
      setNotesCol(nt);
      // Auto klasyfikacja rzedow
      const map = {};
      firstSheet.rows.forEach((r2, idx) => {
        map[idx] = guessRole(r2, nm ?? 1, qty, un);
      });
      // Pomijaj pierwszy wiersz jezeli wyglada na header
      if (firstSheet.rows[0] && firstSheet.rows[0].some(c => /nazwa|jednostka|ilosc|ilość|uwagi|lp/i.test(c || ''))) {
        map[0] = 'skip';
      }
      setRowMap(map);
      setStep(2);
      toast.success(`Zaladowano ${sh.length} arkusz${sh.length > 1 ? 'y' : ''}`);
    } catch (e) {
      toast.error('Blad wczytywania pliku: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const onChangeSheet = (idx) => {
    setSheetIdx(idx);
    const sh = sheets[idx];
    if (!sh) return;
    const nm = guessColumn(sh.rows, 'nazwa|opis');
    const qty = guessColumn(sh.rows, 'ilosc|ilość|qty');
    const un = guessColumn(sh.rows, 'jednostka|j.m.|jm');
    const nt = guessColumn(sh.rows, 'uwagi|notatka');
    setNameCol(nm ?? 1);
    setQuantityCol(qty);
    setUnitCol(un);
    setNotesCol(nt);
    const map = {};
    sh.rows.forEach((r2, idx2) => {
      map[idx2] = guessRole(r2, nm ?? 1, qty, un);
    });
    if (sh.rows[0] && sh.rows[0].some(c => /nazwa|jednostka|ilosc|ilość|uwagi|lp/i.test(c || ''))) {
      map[0] = 'skip';
    }
    setRowMap(map);
  };

  const setRowRole = (idx, role) => {
    setRowMap((prev) => ({ ...prev, [idx]: role }));
  };

  const bulkSet = (role) => {
    const map = {};
    rows.forEach((_, i) => { map[i] = role; });
    setRowMap(map);
  };

  const submit = async () => {
    if (nameCol == null) { toast.error('Wybierz kolumnę z nazwami'); return; }
    const mapped = Object.entries(rowMap)
      .filter(([, v]) => v && v !== 'skip')
      .map(([k, v]) => ({ row_index: parseInt(k, 10), role: v }));
    if (!mapped.some(m => m.role === 'position')) {
      toast.error('Zaznacz przynajmniej jedną pozycję');
      return;
    }
    setLoading(true);
    try {
      const body = {
        file_base64: fileBase64,
        sheet_name: sheet.name,
        name_col: nameCol,
        unit_col: unitCol,
        quantity_col: quantityCol,
        notes_col: notesCol,
        rows: Object.entries(rowMap)
          .map(([k, v]) => ({ row_index: parseInt(k, 10), role: v })),
      };
      const r = await api.post(`/wyceny/${wycenaId}/import/apply`, body, { timeout: 120000 });
      const d = r.data || {};
      toast.success(`Zaimportowano: ${d.stages_created} etapów, ${d.positions_created} pozycji`);
      setStep(3);
      if (onImported) onImported();
    } catch (e) {
      toast.error('Blad importu: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const countByRole = (role) => Object.values(rowMap).filter((v) => v === role).length;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="bg-[#1E2A44] border-[#3D5378] text-white max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="excel-import-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37] flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import z Excela
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div className="py-6 px-2 text-center space-y-4">
            <Upload className="h-16 w-16 text-[#5F7552] mx-auto" />
            <div className="text-[#F1F5F9] text-lg">Wybierz plik .xlsx z pozycjami</div>
            <div className="text-[#CBD5E1] text-sm">
              Aplikacja wczyta arkusz i pozwoli Ci oznaczyć które wiersze to <b className="text-[#D4AF37]">etap</b>,
              a które <b className="text-[#5F7552]">pozycja</b>, oraz wskazać kolumny z jednostką, ilością i uwagami.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              className="hidden"
              data-testid="excel-import-file-input"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-bold"
              data-testid="excel-import-pick-file"
            >
              <Upload className="h-4 w-4 mr-1" /> {loading ? 'Wczytuje...' : 'Wybierz plik Excel'}
            </Button>
          </div>
        )}

        {/* STEP 2: Mapowanie */}
        {step === 2 && sheet && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
            {/* Sheet picker + column mapping */}
            <div className="space-y-2 px-1">
              {sheets.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase text-[#CBD5E1]">Arkusz:</span>
                  {sheets.map((s, i) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => onChangeSheet(i)}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        i === sheetIdx ? 'bg-[#D4AF37] text-[#152033]' : 'bg-[#243049] text-[#CBD5E1] hover:bg-[#3D5378]'
                      }`}
                      data-testid={`excel-import-sheet-${i}`}
                    >{s.name}</button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Nazwa *', val: nameCol, set: setNameCol, key: 'name' },
                  { label: 'Jednostka', val: unitCol, set: setUnitCol, key: 'unit' },
                  { label: 'Ilość', val: quantityCol, set: setQuantityCol, key: 'quantity' },
                  { label: 'Uwagi', val: notesCol, set: setNotesCol, key: 'notes' },
                ].map((c) => (
                  <div key={c.key}>
                    <label className="text-[10px] uppercase text-[#CBD5E1]">{c.label}</label>
                    <select
                      value={c.val ?? ''}
                      onChange={(e) => c.set(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                      className="w-full bg-[#152033] border border-[#3D5378] rounded px-2 py-1 text-sm text-white"
                      data-testid={`excel-import-col-${c.key}`}
                    >
                      <option value="">— brak —</option>
                      {Array.from({ length: cols }).map((_, i) => (
                        <option key={i} value={i}>{colLetter(i)} (kol. {i + 1})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-[#CBD5E1]">Szybkie oznaczenia:</span>
                <button type="button" onClick={() => bulkSet('skip')} className="px-2 py-1 rounded bg-[#3D5378] text-[#CBD5E1] hover:bg-[#4F5F78]">Wszystko: pomiń</button>
                <button type="button" onClick={() => bulkSet('position')} className="px-2 py-1 rounded bg-[#3F5235] text-[#9DBC85] hover:bg-[#5F7552]">Wszystko: pozycja</button>
                <span className="ml-auto text-[#CBD5E1]">
                  <b className="text-[#D4AF37]">Etapy: {countByRole('stage')}</b> | <b className="text-[#5F7552]">Pozycje: {countByRole('position')}</b> | <span className="text-[#94A3B8]">Pominięto: {countByRole('skip')}</span>
                </span>
              </div>
            </div>

            {/* Preview table */}
            <div className="flex-1 min-h-0 overflow-auto border border-[#3D5378] rounded">
              <table className="w-full text-xs border-collapse" data-testid="excel-import-preview-table">
                <thead className="sticky top-0 bg-[#152033] z-10">
                  <tr>
                    <th className="border border-[#3D5378] p-1.5 text-[#CBD5E1] min-w-[36px]">#</th>
                    <th className="border border-[#3D5378] p-1.5 text-[#CBD5E1] min-w-[110px]">Rola</th>
                    {Array.from({ length: cols }).map((_, i) => {
                      const isMapped = [nameCol, unitCol, quantityCol, notesCol].includes(i);
                      const label = i === nameCol ? 'NAZWA' : i === unitCol ? 'JEDN.' : i === quantityCol ? 'ILOŚĆ' : i === notesCol ? 'UWAGI' : '';
                      return (
                        <th
                          key={i}
                          className="border border-[#3D5378] p-1.5 min-w-[80px]"
                          style={isMapped ? { backgroundColor: '#3F5235', color: '#9DBC85' } : { color: '#94A3B8' }}
                        >
                          {colLetter(i)}{label && <div className="text-[9px] font-bold">{label}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const role = rowMap[idx] || 'skip';
                    const bg = role === 'stage' ? '#D4AF3720' : role === 'position' ? '#5F755220' : 'transparent';
                    return (
                      <tr
                        key={idx}
                        style={{ backgroundColor: bg }}
                        data-testid={`excel-import-row-${idx}`}
                      >
                        <td className="border border-[#3D5378] p-1 text-center text-[#94A3B8] font-mono">{idx + 1}</td>
                        <td className="border border-[#3D5378] p-1">
                          <div className="flex gap-1 justify-center">
                            {['stage', 'position', 'skip'].map((r2) => (
                              <button
                                key={r2}
                                type="button"
                                onClick={() => setRowRole(idx, r2)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={
                                  role === r2
                                    ? { backgroundColor: ROLE_COLORS[r2], color: r2 === 'stage' ? '#152033' : '#fff' }
                                    : { backgroundColor: '#243049', color: '#94A3B8' }
                                }
                                data-testid={`excel-import-role-${idx}-${r2}`}
                                title={ROLE_LABELS[r2]}
                              >{ROLE_LABELS[r2]}</button>
                            ))}
                          </div>
                        </td>
                        {Array.from({ length: cols }).map((_, c) => {
                          const isMapped = [nameCol, unitCol, quantityCol, notesCol].includes(c);
                          return (
                            <td
                              key={c}
                              className="border border-[#3D5378] p-1 text-[#F1F5F9] truncate max-w-[160px]"
                              style={isMapped ? { backgroundColor: '#3F523510' } : {}}
                              title={r[c]}
                            >{r[c]}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 3 && (
          <div className="py-12 text-center space-y-3">
            <Check className="h-16 w-16 text-[#5F7552] mx-auto" />
            <div className="text-[#F1F5F9] text-lg">Import zakończony</div>
            <div className="text-[#CBD5E1] text-sm">
              Etapy i pozycje zostały dodane do wyceny. Możesz teraz uzupełnić ceny i ilości.
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step === 1 && (
            <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
              data-testid="excel-import-cancel">Anuluj</Button>
          )}
          {step === 2 && (
            <>
              <Button onClick={() => setStep(1)} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
                data-testid="excel-import-back">
                <ArrowLeft className="h-4 w-4 mr-1" /> Wstecz
              </Button>
              <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
                data-testid="excel-import-cancel-2">Anuluj</Button>
              <Button onClick={submit} disabled={loading || nameCol == null}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-bold"
                data-testid="excel-import-submit">
                <Check className="h-4 w-4 mr-1" /> {loading ? 'Importuje...' : 'Zaimportuj'}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button onClick={onClose}
              className="bg-[#5F7552] hover:bg-[#4F6343] text-white"
              data-testid="excel-import-close">Zamknij</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelImportDialog;
