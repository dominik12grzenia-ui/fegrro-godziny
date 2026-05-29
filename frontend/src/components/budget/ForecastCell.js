// iter95bk: ForecastCell - wycieczony z Budget.js (uzywany tylko w BudgetExcelTemplateView)
// Inline-edit komorka "Koszt prognozowany" (L) z obsluga formul (=ilosc*cena*0.3 itp)
import React, { useState, useRef } from 'react';
import { toast } from 'sonner';

export const ForecastCell = ({ line, computedL, isParent, computedQty, computedCena, computedG, onSave, num }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [noteValue, setNoteValue] = useState(line?.forecast_note || '');
  const [editingNote, setEditingNote] = useState(false);
  const inputRef = useRef(null);

  const stored = line?.forecast_cost;
  const displayValue = isParent && computedL != null ? computedL : (stored != null ? Number(stored) : null);
  const tooltip = line?.forecast_note || '';

  const evaluateExpression = (raw) => {
    if (!raw) return null;
    let expr = String(raw).trim();
    if (expr.startsWith('=')) expr = expr.slice(1);
    expr = expr.replace(/,/g, '.');
    expr = expr.replace(/\bilosc\b/gi, computedQty || 0);
    expr = expr.replace(/\bilość\b/gi, computedQty || 0);
    expr = expr.replace(/\bqty\b/gi, computedQty || 0);
    expr = expr.replace(/\bcena\b/gi, computedCena || 0);
    expr = expr.replace(/\bprice\b/gi, computedCena || 0);
    expr = expr.replace(/\bbudzet\b/gi, computedG || 0);
    expr = expr.replace(/\bbudżet\b/gi, computedG || 0);
    expr = expr.replace(/\bg\b/gi, computedG || 0);
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    if (!/^[\d+\-*/().\s]+$/.test(expr)) {
      throw new Error('Nieprawidłowe wyrażenie. Dostępne: liczby, +, -, *, /, ( ), %, ilosc, cena, budzet');
    }
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Wynik nie jest liczbą');
    return Math.round(result * 100) / 100;
  };

  const startEdit = () => {
    if (isParent) return;
    setValue(stored != null ? String(stored) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => { setEditing(false); setValue(''); };

  const save = async () => {
    try {
      const raw = value.trim();
      const numeric = raw === '' ? null : evaluateExpression(raw);
      await onSave(line.id, { forecast_cost: numeric });
      setEditing(false);
    } catch (e) {
      toast.error(e.message || 'Błąd zapisu');
    }
  };

  const saveNote = async () => {
    try {
      await onSave(line.id, { forecast_note: noteValue });
      setEditingNote(false);
    } catch (e) {
      toast.error(e.message || 'Błąd zapisu notatki');
    }
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          placeholder="liczba lub =ilosc*cena*0.3"
          className="w-32 bg-[#152033] border border-[#D4AF37] text-white text-right text-[10px] px-1 py-0.5 rounded"
          data-testid={`forecast-input-${line.id}`}
        />
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1 group" title={tooltip || (isParent ? 'Suma kosztu prognozowanego ze składowych' : 'Kliknij, aby wprowadzić koszt prognozowany. Możesz użyć wzoru np. =ilosc*cena*0.3')}>
      {displayValue != null ? (
        <button type="button" onClick={startEdit} disabled={isParent}
          className={`tabular-nums text-right ${isParent ? 'cursor-default text-white font-semibold' : 'cursor-pointer hover:text-[#D4AF37]'}`}
          data-testid={`forecast-display-${line.id}`}>
          {num(displayValue)}
        </button>
      ) : (
        !isParent && (
          <button type="button" onClick={startEdit} className="text-[#94A3B8] italic hover:text-[#D4AF37]"
            data-testid={`forecast-empty-${line.id}`}>
            wpisz
          </button>
        )
      )}
      {!isParent && (
        <button type="button"
          onClick={() => setEditingNote(!editingNote)}
          className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-[#D4AF37] transition"
          title={tooltip ? `Notatka: ${tooltip}` : 'Dodaj notatkę (widoczna po najechaniu)'}
          data-testid={`forecast-note-btn-${line.id}`}>
          <span className="text-[8px]">📝</span>
        </button>
      )}
      {editingNote && (
        <div className="absolute z-50 mt-6 right-0 bg-[#152033] border border-[#D4AF37] rounded p-2 shadow-2xl w-56">
          <textarea value={noteValue} onChange={(e) => setNoteValue(e.target.value)}
            placeholder="np. cena z oferty firmy XYZ"
            className="w-full bg-[#1E2A44] text-white text-[10px] p-1 rounded border border-[#3D5378] min-h-[60px]"
            data-testid={`forecast-note-input-${line.id}`} />
          <div className="flex gap-1 justify-end mt-1">
            <button onClick={() => setEditingNote(false)} className="text-[10px] text-[#CBD5E1] hover:text-white">Anuluj</button>
            <button onClick={saveNote} className="text-[10px] bg-[#D4AF37] text-[#152033] px-2 py-0.5 rounded font-bold" data-testid={`forecast-note-save-${line.id}`}>Zapisz</button>
          </div>
        </div>
      )}
    </div>
  );
};
