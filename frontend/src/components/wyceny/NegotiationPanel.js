// iter95aw: NegotiationPanel wyciągnięty z Wyceny.js (refaktor)
// Props-driven, używa state właściciela (WycenaEditor).
import React from 'react';
import { Button } from '../ui/button';
import { fmtPLN } from './_shared';

export const NegotiationPanel = ({
  data,
  neg,
  setNeg,
  setNegotiationOn,
  negHasChanges,
  grandTotal,
  grandTotalOriginal,
  wskazniki,
  applyNegotiation,
  saveMinMargin,  // iter95bn: callback do persist progu marzy
}) => (
  <div className="border-2 border-[#F59E0B]/60 bg-[#F59E0B]/5 rounded-lg p-4 space-y-3 sticky top-0 z-20 backdrop-blur"
       data-testid="negotiation-panel">
    <div className="flex items-center gap-2 flex-wrap">
      <div className="text-sm font-bold text-[#F59E0B] uppercase tracking-wide flex items-center gap-1">
        🤝 Tryb negocjacji — symulacja na żywo
      </div>
      <div className="text-[10px] text-[#CBD5E1] flex-1">
        Zmiany NIE są zapisywane — pełna wycena nietknięta. Kliknij <b className="text-[#F59E0B]">Przyjmij na stałe</b> aby zaakceptować po negocjacji z klientem.
      </div>
      {/* iter95bn: prog krytycznej marzy do dynamicznej zmiany */}
      <div className="flex items-center gap-1 text-[11px]" data-testid="min-margin-config">
        <span className="text-[#CBD5E1]">Próg krytycznej marży:</span>
        <input
          type="number" step="0.5" min="0" max="100"
          defaultValue={data?.wycena?.min_margin_pct ?? 10}
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && saveMinMargin) saveMinMargin(v);
          }}
          className="bg-[#1E2A44] border border-[#3D5378] rounded h-7 w-14 text-xs text-right tabular-nums text-white px-1 outline-none focus:border-[#F59E0B]"
          data-testid="min-margin-input"
        />
        <span className="text-[#CBD5E1]">%</span>
      </div>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      {[
        { key: 'labor', label: '👷 Robocizna', cls: 'border-[#5F4E20]' },
        { key: 'materials', label: '🧱 Materiały', cls: 'border-[#5F7552]' },
        { key: 'equipment', label: '🚜 Sprzęt', cls: 'border-[#2D4D5C]' },
      ].map((it) => (
        <div key={it.key} className={`border ${it.cls} bg-[#152033]/60 rounded p-2`}>
          <div className="text-[10px] uppercase text-[#CBD5E1] mb-1">{it.label}</div>
          <div className="flex items-center gap-1">
            <input
              type="number" step="0.5"
              value={neg[it.key]}
              onChange={(e) => setNeg({ ...neg, [it.key]: e.target.value })}
              className="bg-[#1E2A44] border border-[#3D5378] rounded h-8 w-20 text-sm text-right tabular-nums text-white px-2 outline-none focus:border-[#F59E0B]"
              data-testid={`neg-${it.key}-input`}
            />
            <span className="text-sm text-[#CBD5E1]">%</span>
          </div>
          <div className="text-[9px] text-[#94A3B8] mt-0.5">
            {parseFloat(neg[it.key]) > 0 ? '↑ podwyżka' : parseFloat(neg[it.key]) < 0 ? '↓ obniżka' : 'bez zmian'}
          </div>
        </div>
      ))}
      <div className="border border-[#D4AF37]/40 bg-[#152033]/60 rounded p-2">
        <div className="text-[10px] uppercase text-[#CBD5E1] mb-1">Narzut materiał</div>
        <div className="flex items-center gap-1">
          <input
            type="number" step="0.5"
            value={neg.narzutOverride}
            onChange={(e) => setNeg({ ...neg, narzutOverride: e.target.value })}
            placeholder={`${data?.wycena?.default_narzut_pct ?? 0}`}
            className="bg-[#1E2A44] border border-[#3D5378] rounded h-8 w-20 text-sm text-right tabular-nums text-white px-2 outline-none focus:border-[#F59E0B]"
            data-testid="neg-narzut-input"
          />
          <span className="text-sm text-[#CBD5E1]">%</span>
        </div>
        <div className="text-[9px] text-[#94A3B8] mt-0.5">orig: {data?.wycena?.default_narzut_pct ?? 0}%</div>
      </div>
      <div className="border border-[#D4AF37]/40 bg-[#152033]/60 rounded p-2">
        <div className="text-[10px] uppercase text-[#CBD5E1] mb-1">Marża materiał</div>
        <div className="flex items-center gap-1">
          <input
            type="number" step="0.5"
            value={neg.marzaOverride}
            onChange={(e) => setNeg({ ...neg, marzaOverride: e.target.value })}
            placeholder={`${data?.wycena?.default_marza_pct ?? 0}`}
            className="bg-[#1E2A44] border border-[#3D5378] rounded h-8 w-20 text-sm text-right tabular-nums text-white px-2 outline-none focus:border-[#F59E0B]"
            data-testid="neg-marza-input"
          />
          <span className="text-sm text-[#CBD5E1]">%</span>
        </div>
        <div className="text-[9px] text-[#94A3B8] mt-0.5">orig: {data?.wycena?.default_marza_pct ?? 0}%</div>
      </div>
    </div>

    {grandTotalOriginal && (() => {
      // iter95bn: kalkulacja marzy % (zysk+DW / budzet)
      const origMargin = grandTotalOriginal.budzet > 0
        ? (grandTotalOriginal.zyskPlusDw / grandTotalOriginal.budzet) * 100
        : 0;
      const currMargin = grandTotal.budzet > 0
        ? (grandTotal.zyskPlusDw / grandTotal.budzet) * 100
        : 0;
      const minMarginThreshold = data?.wycena?.min_margin_pct ?? 10;
      const marginCritical = currMargin < minMarginThreshold;
      const marginDelta = currMargin - origMargin;
      return (
        <>
          {/* iter95bn: pasek ostrzegawczy marzy gdy ponizej progu (domyslnie 10%) */}
          {marginCritical && (
            <div className="border-2 border-red-500 bg-red-500/15 rounded-lg p-2.5 flex items-center gap-3 animate-pulse"
                 data-testid="negotiation-margin-warning">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <div className="font-bold text-red-300 text-sm">
                  KRYTYCZNA MARŻA: {currMargin.toFixed(2)}% (próg: {minMarginThreshold}%)
                </div>
                <div className="text-[11px] text-red-200">
                  Zysk po negocjacji {fmtPLN(grandTotal.zyskPlusDw)} z {fmtPLN(grandTotal.budzet)} budżetu.
                  Dalsze obniżki spowodują zerowy lub ujemny zysk.
                </div>
              </div>
              <div className="text-3xl font-mono font-bold text-red-300">
                {currMargin.toFixed(1)}%
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs" data-testid="negotiation-preview">
            {[
              { lbl: 'Budżet (cena dla klienta)', orig: grandTotalOriginal.budzet, curr: grandTotal.budzet },
              { lbl: 'Twój zysk + DW', orig: grandTotalOriginal.zyskPlusDw, curr: grandTotal.zyskPlusDw },
              {
                lbl: 'zł/m² PC',
                orig: wskazniki.pc_m2 > 0 ? grandTotalOriginal.budzet / wskazniki.pc_m2 : null,
                curr: wskazniki.pcRatio,
              },
              {
                lbl: 'zł/m² PUM',
                orig: wskazniki.pum_m2 > 0 ? grandTotalOriginal.budzet / wskazniki.pum_m2 : null,
                curr: wskazniki.pumRatio,
              },
            ].map((cmp, i) => {
              if (cmp.orig == null && cmp.curr == null) return null;
              const delta = (cmp.curr || 0) - (cmp.orig || 0);
              const pct = cmp.orig ? (delta / cmp.orig) * 100 : 0;
              const isProfit = cmp.lbl.includes('zysk');
              const goodDelta = isProfit ? delta >= 0 : delta <= 0;
              return (
                <div key={i} className="border border-[#3D5378] bg-[#1E2A44] rounded p-2">
                  <div className="text-[10px] uppercase text-[#CBD5E1]">{cmp.lbl}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#94A3B8] line-through tabular-nums text-[11px]">{fmtPLN(cmp.orig)}</span>
                    <span className="text-[#F59E0B]">→</span>
                    <span className="font-bold tabular-nums">{fmtPLN(cmp.curr)}</span>
                  </div>
                  <div className={`text-[10px] tabular-nums ${goodDelta ? 'text-[#22C55E]' : 'text-[#FCA5A5]'}`}>
                    {delta >= 0 ? '+' : ''}{fmtPLN(delta)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
            {/* iter95bn: 5-ta karta - marza % */}
            <div
              className={`border-2 rounded p-2 ${
                marginCritical
                  ? 'border-red-500 bg-red-500/15'
                  : currMargin < minMarginThreshold + 5
                    ? 'border-orange-400 bg-orange-500/10'
                    : 'border-emerald-500/60 bg-emerald-500/10'
              }`}
              data-testid="negotiation-margin-card"
            >
              <div className="text-[10px] uppercase text-[#CBD5E1] flex items-center gap-1">
                💰 Marża
                <span
                  className="text-[#94A3B8] text-[9px] cursor-help"
                  title={`Próg ostrzegawczy: ${minMarginThreshold}%. Próg "blisko progu": ${minMarginThreshold + 5}%`}
                >
                  ⓘ
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#94A3B8] line-through tabular-nums text-[11px]">
                  {origMargin.toFixed(1)}%
                </span>
                <span className="text-[#F59E0B]">→</span>
                <span
                  className={`font-bold tabular-nums text-base ${
                    marginCritical ? 'text-red-300' : currMargin < minMarginThreshold + 5 ? 'text-orange-300' : 'text-emerald-300'
                  }`}
                >
                  {currMargin.toFixed(2)}%
                </span>
              </div>
              <div className={`text-[10px] tabular-nums ${marginDelta >= 0 ? 'text-[#22C55E]' : 'text-[#FCA5A5]'}`}>
                {marginDelta >= 0 ? '+' : ''}{marginDelta.toFixed(2)} pp
                <span className="text-[#94A3B8] ml-1">(min: {minMarginThreshold}%)</span>
              </div>
            </div>
          </div>
        </>
      );
    })()}

    <div className="flex gap-2 justify-end pt-1 border-t border-[#F59E0B]/20">
      <Button onClick={() => setNeg({ labor: 0, materials: 0, equipment: 0, narzutOverride: '', marzaOverride: '' })}
        variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
        data-testid="neg-reset">
        Wyzeruj
      </Button>
      <Button onClick={() => setNegotiationOn(false)} variant="outline"
        className="border-[#3D5378] text-[#F1F5F9]"
        data-testid="neg-cancel">
        Anuluj (powrót do oryginału)
      </Button>
      <Button onClick={applyNegotiation} disabled={!negHasChanges}
        className="bg-[#F59E0B] hover:bg-[#D97706] text-[#152033] font-semibold disabled:opacity-40"
        data-testid="neg-apply">
        ✓ Przyjmij na stałe (zapisze wersję)
      </Button>
    </div>
  </div>
);
