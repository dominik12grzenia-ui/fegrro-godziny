// iter95x: Color picker dla budowy z duża paletą + highlight uzywanych kolorow
import React, { useState } from 'react';
import { Check } from 'lucide-react';

// 30 kolorow dobrze rozroznialnych (ciemne tla aplikacji), pogrupowane
export const SITE_COLOR_PALETTE = [
  // Zielenie
  '#3F5235', '#5F7552', '#6E8A4D', '#4F6343', '#2D5016',
  // Niebieskie
  '#3B4F5C', '#1E40AF', '#2563EB', '#1E3A8A', '#374D7C',
  // Brazowe / pomaranczowe
  '#5F4A3B', '#92400E', '#B45309', '#7C2D12', '#A16207',
  // Fioletowe
  '#5A4F6C', '#581C87', '#6B21A8', '#7E22CE', '#4C1D95',
  // Czerwone
  '#9B2C2C', '#B91C1C', '#7F1D1D', '#991B1B', '#C2410C',
  // Cyjany / tealowe
  '#4F6C5A', '#0F766E', '#155E75', '#0E7490', '#134E4A',
];

/**
 * Color picker z paletą kolorów + highlight kolorów już używanych przez inne budowy.
 *
 * @param value - aktualnie wybrany kolor (hex) lub null
 * @param onChange - (hex|null) => void
 * @param usedColors - Set<string> kolorów już używanych (do podświetlenia)
 * @param label - opcjonalny label
 */
export const ColorPicker = ({ value, onChange, usedColors = new Set(), label, testId = 'color-picker' }) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customHex, setCustomHex] = useState('');

  return (
    <div className="space-y-2" data-testid={testId}>
      {label && (
        <div className="text-[10px] uppercase text-[#CBD5E1] font-semibold">{label}</div>
      )}
      <div className="grid grid-cols-10 gap-1.5">
        {SITE_COLOR_PALETTE.map((color) => {
          const isUsed = usedColors.has(color);
          const isSelected = value === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={`relative h-7 w-7 rounded-md border-2 transition-all hover:scale-110 ${
                isSelected ? 'border-white ring-2 ring-[#D4AF37]' : 'border-[#3D5378]'
              }`}
              style={{ backgroundColor: color }}
              title={isUsed ? `${color} (już używany)` : color}
              data-testid={`${testId}-color-${color.replace('#', '')}`}
            >
              {isSelected && (
                <Check className="h-4 w-4 text-white absolute inset-0 m-auto drop-shadow" />
              )}
              {isUsed && !isSelected && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#D4AF37] border border-[#152033]" title="Używany" />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[#CBD5E1]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#D4AF37]" /> Już używany
        </span>
        <span className="inline-flex items-center gap-1 ml-2">
          <Check className="h-3 w-3 text-white" /> Wybrany
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto px-2 py-0.5 rounded text-[10px] bg-[#3D5378] hover:bg-[#4F5F78] text-[#F1F5F9]"
          data-testid={`${testId}-clear`}
        >
          Wyczyść
        </button>
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="px-2 py-0.5 rounded text-[10px] bg-[#D4AF37]/20 hover:bg-[#D4AF37]/40 text-[#D4AF37]"
          data-testid={`${testId}-custom-toggle`}
        >
          {showCustom ? 'Schowaj custom' : '+ Własny kolor'}
        </button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={customHex || value || '#3F5235'}
            onChange={(e) => setCustomHex(e.target.value)}
            className="h-7 w-12 rounded border border-[#3D5378] bg-transparent cursor-pointer"
            data-testid={`${testId}-custom-input`}
          />
          <input
            type="text"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            placeholder="#3F5235"
            className="flex-1 bg-[#152033] border border-[#3D5378] text-[#F1F5F9] text-xs rounded px-2 py-1 font-mono"
            maxLength={7}
          />
          <button
            type="button"
            onClick={() => {
              const v = customHex.trim();
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                onChange(v);
                setShowCustom(false);
              }
            }}
            className="px-3 py-1 rounded text-xs bg-[#5F7552] hover:bg-[#4F6343] text-white"
          >
            Zastosuj
          </button>
        </div>
      )}
      {value && (
        <div className="flex items-center gap-2 text-xs text-[#CBD5E1]">
          <span>Wybrany:</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-4 w-8 rounded border border-[#3D5378]" style={{ backgroundColor: value }} />
            <span className="font-mono">{value}</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
