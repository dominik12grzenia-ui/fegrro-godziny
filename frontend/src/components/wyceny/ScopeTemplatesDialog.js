// iter95x: Manager szablonów zakresu oferty (Oferta obejmuje / nie obejmuje)
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Plus, Trash2, BookmarkPlus, Star, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

/**
 * Trzy tryby:
 *  - manage (default): edytuj szablony
 *  - apply: pokaz przyciski "Zastosuj do wyceny" — wymagane onApply
 *
 * Props:
 *  - onClose: () => void
 *  - mode?: 'manage' | 'apply'
 *  - onApply?: (template) => void   (przy mode='apply')
 */
export const ScopeTemplatesDialog = ({ onClose, mode = 'manage', onApply }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/wyceny/scope-templates')
      .then((r) => setTemplates(r.data?.templates || []))
      .catch(() => toast.error('Nie udało się pobrać szablonów'))
      .finally(() => setLoading(false));
  }, []);

  const addTemplate = () => {
    setTemplates((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: 'Nowy szablon',
        scope_includes: '',
        scope_excludes: '',
        is_default: prev.length === 0,
      },
    ]);
  };

  const updateTemplate = (idx, patch) => {
    setTemplates((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeTemplate = (idx) => {
    setTemplates((prev) => prev.filter((_, i) => i !== idx));
  };

  const setDefault = (idx) => {
    setTemplates((prev) => prev.map((t, i) => ({ ...t, is_default: i === idx })));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/wyceny/scope-templates', { templates });
      setTemplates(r.data?.templates || []);
      toast.success('Szablony zapisane');
    } catch (e) {
      toast.error('Błąd zapisu: ' + (e.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="bg-[#1E2A44] border-[#3D5378] text-white max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="scope-templates-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37] flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5" />
            {mode === 'apply' ? 'Wczytaj szablon zakresu' : 'Szablony zakresu oferty'}
          </DialogTitle>
          <p className="text-xs text-[#CBD5E1]">
            {mode === 'apply'
              ? 'Wybierz szablon — jego treść wypełni pola „Oferta obejmuje / nie obejmuje" w tej wycenie.'
              : 'Zdefiniuj typowe pakiety zakresu (np. „Dom jednorodzinny", „Komercja") — będziesz je mógł szybko wczytać przy tworzeniu wyceny.'}
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-3 px-1">
          {loading ? (
            <div className="text-center text-[#CBD5E1] p-8">Ładuję...</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-[#CBD5E1] p-8">
              Brak szablonów. {mode === 'manage' && 'Kliknij „Dodaj szablon" aby stworzyć pierwszy.'}
            </div>
          ) : (
            templates.map((t, idx) => (
              <div
                key={t.id}
                className="border border-[#3D5378] rounded-lg bg-[#152033] p-3 space-y-2"
                data-testid={`scope-template-${idx}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={t.name}
                    onChange={(e) => updateTemplate(idx, { name: e.target.value })}
                    placeholder="Nazwa szablonu (np. Dom jednorodzinny)"
                    className="flex-1 bg-[#243049] border-[#3D5378] text-[#F1F5F9] font-semibold"
                    disabled={mode === 'apply'}
                    data-testid={`scope-template-name-${idx}`}
                  />
                  {mode === 'manage' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDefault(idx)}
                        className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 ${
                          t.is_default
                            ? 'bg-[#D4AF37] text-[#152033] font-bold'
                            : 'border border-[#D4AF37]/60 text-[#D4AF37] hover:bg-[#D4AF37]/10'
                        }`}
                        title="Ustaw jako domyślny przy tworzeniu nowej wyceny"
                        data-testid={`scope-template-default-${idx}`}
                      >
                        <Star className="h-3 w-3" />
                        {t.is_default ? 'Domyślny' : 'Zrób domyślnym'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTemplate(idx)}
                        className="px-2 py-1.5 rounded text-xs border border-[#9B2C2C]/60 text-[#FCA5A5] hover:bg-[#9B2C2C]/20"
                        data-testid={`scope-template-remove-${idx}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  {mode === 'apply' && (
                    <Button
                      size="sm"
                      onClick={() => { onApply && onApply(t); onClose(); }}
                      className="bg-[#5F7552] hover:bg-[#4F6343] text-white"
                      data-testid={`scope-template-apply-${idx}`}
                    >
                      <Check className="h-3 w-3 mr-1" /> Zastosuj
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-[#9DBC85] font-semibold">✓ Oferta obejmuje</label>
                    <textarea
                      value={t.scope_includes || ''}
                      onChange={(e) => updateTemplate(idx, { scope_includes: e.target.value })}
                      rows={6}
                      placeholder="Jedna pozycja na linię..."
                      className="w-full bg-[#243049] border border-[#5F7552]/60 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#9DBC85] resize-y"
                      disabled={mode === 'apply'}
                      data-testid={`scope-template-includes-${idx}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-[#FCA5A5] font-semibold">✗ Oferta nie obejmuje</label>
                    <textarea
                      value={t.scope_excludes || ''}
                      onChange={(e) => updateTemplate(idx, { scope_excludes: e.target.value })}
                      rows={6}
                      placeholder="Jedna pozycja na linię..."
                      className="w-full bg-[#243049] border border-[#9B2C2C]/60 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[#FCA5A5] resize-y"
                      disabled={mode === 'apply'}
                      data-testid={`scope-template-excludes-${idx}`}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2">
          {mode === 'manage' && (
            <Button onClick={addTemplate} variant="outline"
              className="border-[#5F7552] text-[#9DBC85]"
              data-testid="scope-template-add">
              <Plus className="h-4 w-4 mr-1" /> Dodaj szablon
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
            data-testid="scope-template-close">
            {mode === 'apply' ? 'Anuluj' : 'Zamknij'}
          </Button>
          {mode === 'manage' && (
            <Button onClick={save} disabled={saving}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] font-bold"
              data-testid="scope-template-save">
              {saving ? 'Zapisuję...' : 'Zapisz szablony'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScopeTemplatesDialog;
