// iter95aw: SuppliersManagerDialog wyciągnięty z Wyceny.js (refaktor)
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Plus, Trash2, Pencil, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';

export const SuppliersManagerDialog = ({ onClose }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', branze: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.get('/wyceny/suppliers')
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name || '', email: s.email || '',
      phone: s.phone || '', branze: s.branze || '', notes: s.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', email: '', phone: '', branze: '', notes: '' });
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nazwa i email są wymagane'); return;
    }
    setSaving(true);
    try {
      if (editingId === 'new') {
        await api.post('/wyceny/suppliers', form);
        toast.success('Dodano hurtownię');
      } else {
        await api.patch(`/wyceny/suppliers/${editingId}`, form);
        toast.success('Zaktualizowano');
      }
      cancelEdit();
      reload();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setSaving(false); }
  };

  const remove = async (s) => {
    if (!window.confirm(`Usunąć hurtownię „${s.name}"?`)) return;
    try {
      await api.delete(`/wyceny/suppliers/${s.id}`);
      toast.success('Usunięto');
      reload();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  const inputCls = "bg-[#131C2F] border-[#2A3B59] h-8 text-xs text-white";

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-4xl"
                     data-testid="suppliers-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#D4AF37]">
            <BookOpen className="h-5 w-5" /> Hurtownie / Dostawcy
          </DialogTitle>
          <div className="text-xs text-[#94A3B8]">Zarządzaj listą hurtowni: dodawaj, edytuj, usuwaj. Numer telefonu jest opcjonalny.</div>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto border border-[#2A3B59] rounded">
          {loading ? (
            <div className="p-4 text-center text-xs text-[#94A3B8]">Ładowanie…</div>
          ) : rows.length === 0 && editingId !== 'new' ? (
            <div className="p-4 text-center text-xs text-[#94A3B8] italic">Brak hurtowni — dodaj pierwszą przyciskiem poniżej.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#0B1120] sticky top-0">
                <tr className="text-[#94A3B8] uppercase text-[10px]">
                  <th className="text-left px-2 py-1.5">Nazwa</th>
                  <th className="text-left px-2 py-1.5">Email</th>
                  <th className="text-left px-2 py-1.5">Telefon</th>
                  <th className="text-left px-2 py-1.5">Branże</th>
                  <th className="text-right px-2 py-1.5 w-24">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && (
                  <tr className="border-t border-[#2A3B59] bg-[#3F5235]/20" data-testid="supplier-row-new">
                    <td className="px-2 py-1.5">
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Nazwa" className={inputCls} data-testid="supplier-form-name" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="email@hurtownia.pl" type="email" className={inputCls} data-testid="supplier-form-email" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+48 123 456 789" className={inputCls} data-testid="supplier-form-phone" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.branze} onChange={(e) => setForm({ ...form, branze: e.target.value })}
                        placeholder="np. betony, stal" className={inputCls} data-testid="supplier-form-branze" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={save} disabled={saving}
                          className="text-[10px] bg-[#5F7552] hover:bg-[#3F5235] text-white px-2 py-1 rounded disabled:opacity-50"
                          data-testid="supplier-save-btn">{saving ? '...' : 'Zapisz'}</button>
                        <button onClick={cancelEdit}
                          className="text-[10px] border border-[#2A3B59] text-[#CBD5E1] px-2 py-1 rounded hover:bg-[#2A3B59]"
                          data-testid="supplier-cancel-btn">Anuluj</button>
                      </div>
                    </td>
                  </tr>
                )}
                {rows.map((s) => editingId === s.id ? (
                  <tr key={s.id} className="border-t border-[#2A3B59] bg-[#3F5235]/20" data-testid={`supplier-row-${s.id}`}>
                    <td className="px-2 py-1.5">
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputCls} data-testid="supplier-form-name" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                        type="email" className={inputCls} data-testid="supplier-form-email" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+48 123 456 789" className={inputCls} data-testid="supplier-form-phone" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={form.branze} onChange={(e) => setForm({ ...form, branze: e.target.value })}
                        className={inputCls} data-testid="supplier-form-branze" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={save} disabled={saving}
                          className="text-[10px] bg-[#5F7552] hover:bg-[#3F5235] text-white px-2 py-1 rounded disabled:opacity-50"
                          data-testid="supplier-save-btn">{saving ? '...' : 'Zapisz'}</button>
                        <button onClick={cancelEdit}
                          className="text-[10px] border border-[#2A3B59] text-[#CBD5E1] px-2 py-1 rounded hover:bg-[#2A3B59]"
                          data-testid="supplier-cancel-btn">Anuluj</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-t border-[#2A3B59] hover:bg-[#0B1120]/40"
                      data-testid={`supplier-row-${s.id}`}>
                    <td className="px-2 py-1.5 text-white font-medium">{s.name}</td>
                    <td className="px-2 py-1.5 text-[#9DBC85]">{s.email}</td>
                    <td className="px-2 py-1.5 text-[#CBD5E1] tabular-nums">{s.phone || <span className="text-[#64748B] italic">—</span>}</td>
                    <td className="px-2 py-1.5 text-[#94A3B8]">{s.branze || <span className="text-[#64748B] italic">—</span>}</td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(s)} disabled={editingId !== null}
                          className="text-[#D4AF37] hover:bg-[#D4AF37]/10 p-1 rounded disabled:opacity-40"
                          title="Edytuj" data-testid={`supplier-edit-${s.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(s)} disabled={editingId !== null}
                          className="text-[#FCA5A5] hover:bg-[#FCA5A5]/10 p-1 rounded disabled:opacity-40"
                          title="Usuń" data-testid={`supplier-del-${s.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={onClose} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]"
            data-testid="suppliers-close">Zamknij</Button>
          <Button
            onClick={() => { setEditingId('new'); setForm({ name: '', email: '', phone: '', branze: '', notes: '' }); }}
            disabled={editingId !== null}
            className="bg-[#D4AF37] hover:bg-[#FCD34D] text-[#0B1120] font-semibold disabled:opacity-40"
            data-testid="supplier-add-new-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj hurtownię
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
