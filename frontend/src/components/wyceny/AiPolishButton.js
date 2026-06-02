// iter95cu: maly przycisk "✨ AI: popraw" wywolujacy POST /api/wyceny/ai/polish.
// Wywoluje endpoint, podmienia tekst w polu (przez callback onApply) i pokazuje toast.
import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

/**
 * Props:
 *  - text: aktualna wartosc pola
 *  - kind: 'name' | 'description' | 'notes' (kontekst dla AI)
 *  - onApply: (polished:string) => void  — wywolywane po sukcesie z poprawiona wersja
 *  - disabled?: boolean
 *  - title?: string — custom tooltip
 *  - testId?: string
 */
export const AiPolishButton = ({ text, kind = 'name', onApply, disabled, title, testId }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const t = (text || '').trim();
    if (!t) {
      toast.error('Pole jest puste — nie ma czego poprawiać');
      return;
    }
    if (t.length < 2) return;
    setLoading(true);
    try {
      const { data } = await api.post('/wyceny/ai/polish', { text: t, kind });
      const polished = (data?.polished || '').trim();
      if (!polished || polished === t) {
        toast.info('AI: tekst już wygląda dobrze — bez zmian');
        return;
      }
      onApply?.(polished);
      toast.success('AI: poprawiono pisownię i terminologię');
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Błąd AI';
      toast.error(`AI: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [text, kind, onApply]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      title={title || 'AI: popraw pisownię i terminologię (Claude Haiku)'}
      data-testid={testId || 'ai-polish-btn'}
      className={`inline-flex items-center justify-center h-5 w-5 rounded text-[#9DBC85] hover:text-[#D4AF37] hover:bg-[#152033]/60 transition-colors ${loading ? 'opacity-60 cursor-wait' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
    </button>
  );
};

export default AiPolishButton;
