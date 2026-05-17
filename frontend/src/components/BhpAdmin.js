import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { HardHat, Plus, Trash2, Edit, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { BhpEmployees } from './BhpEmployees';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export const BhpAdmin = () => {
  const [subtab, setSubtab] = useState('items');
  const [items, setItems] = useState([]);
  const [issuances, setIssuances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  // Item form state
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({ name: '', photo: null });

  // Issue form state
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({
    employee_id: '',
    bhp_item_id: '',
    quantity: '1',
    serial_number: '',
    note: '',
  });

  const fetchAll = useCallback(async () => {
    try {
      const [iRes, isRes, eRes] = await Promise.all([
        api.get('/bhp/items'),
        api.get('/bhp/issuances'),
        api.get('/employees'),
      ]);
      setItems(iRes.data);
      setIssuances(isRes.data);
      setEmployees(eRes.data);
    } catch (_e) {
      toast.error('Błąd pobierania danych BHP');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Item handlers
  const openCreateItem = () => {
    setEditingItem(null);
    setItemForm({ name: '', photo: null });
    setShowAddItem(true);
  };
  const openEditItem = (it) => {
    setEditingItem(it);
    setItemForm({ name: it.name, photo: it.photo || null });
    setShowAddItem(true);
  };

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Max 3MB'); return; }
    const b64 = await fileToBase64(file);
    setItemForm((f) => ({ ...f, photo: b64 }));
  };

  const saveItem = async () => {
    if (!itemForm.name.trim()) { toast.error('Podaj nazwe'); return; }
    try {
      const payload = { name: itemForm.name.trim(), photo: itemForm.photo };
      if (editingItem) {
        await api.put(`/bhp/items/${editingItem.id}`, payload);
        toast.success('Zaktualizowano');
      } else {
        await api.post('/bhp/items', payload);
        toast.success('Dodano');
      }
      setShowAddItem(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const deleteItem = async (it) => {
    if (!window.confirm(`Usunac "${it.name}"? Wszystkie wydania tej pozycji będą tez usuniete.`)) return;
    try {
      await api.delete(`/bhp/items/${it.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  // Issuance handlers
  const openIssueForm = (itemId = '') => {
    setIssueForm({ employee_id: '', bhp_item_id: itemId, quantity: '1', serial_number: '', note: '' });
    setShowIssue(true);
  };

  const saveIssuance = async () => {
    if (!issueForm.employee_id) { toast.error('Wybierz pracownika'); return; }
    if (!issueForm.bhp_item_id) { toast.error('Wybierz rzecz BHP'); return; }
    const q = parseInt(issueForm.quantity || '1', 10);
    if (!q || q < 1) { toast.error('Podaj ilość'); return; }
    try {
      await api.post('/bhp/issuances', {
        employee_id: issueForm.employee_id,
        bhp_item_id: issueForm.bhp_item_id,
        quantity: q,
        serial_number: issueForm.serial_number.trim() || null,
        note: issueForm.note.trim() || null,
      });
      toast.success('Wydano');
      setShowIssue(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const deleteIssuance = async (iss) => {
    if (!window.confirm(`Cofnac wydanie "${iss.bhp_item_name}" dla ${iss.employee_name}?`)) return;
    try {
      await api.delete(`/bhp/issuances/${iss.id}`);
      toast.success('Usunieto');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  // Group issuances by employee
  const issuancesByEmployee = useMemo(() => {
    const by = {};
    issuances.forEach((iss) => {
      if (!by[iss.employee_id]) {
        by[iss.employee_id] = { employee_id: iss.employee_id, employee_name: iss.employee_name, issuances: [] };
      }
      by[iss.employee_id].issuances.push(iss);
    });
    return Object.values(by).sort((a, b) =>
      (a.employee_name || '').localeCompare(b.employee_name || '', 'pl')
    );
  }, [issuances]);

  if (loading) return <p className="text-[#94A3B8] p-4">Ładowanie...</p>;

  const activeItems = items.filter((i) => i.is_active !== false);

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setSubtab('items')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'items' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="bhp-subtab-items"
        >
          Rzeczy BHP
        </button>
        <button
          type="button"
          onClick={() => setSubtab('issuances')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'issuances' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="bhp-subtab-issuances"
        >
          Wydania pracownikom ({issuances.length})
        </button>
        <button
          type="button"
          onClick={() => setSubtab('employees')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${subtab === 'employees' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
          data-testid="bhp-subtab-employees"
        >
          Pracownicy - dokumenty
        </button>
      </div>

      {subtab === 'employees' && <BhpEmployees />}

      {/* ITEMS sub-tab */}
      {subtab === 'items' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <HardHat className="h-5 w-5 text-[#5F7151]" /> Rzeczy BHP
              </CardTitle>
              <Button
                size="sm"
                onClick={openCreateItem}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-8"
                data-testid="bhp-add-item-btn"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Dodaj rzecz
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-[#94A3B8]">Brak pozycji. Dodaj pierwszą (np. Szelki, Kask, Rękawice).</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((it) => {
                  const issuedCount = issuances.filter((x) => x.bhp_item_id === it.id).length;
                  const totalQty = issuances
                    .filter((x) => x.bhp_item_id === it.id)
                    .reduce((s, x) => s + (parseInt(x.quantity, 10) || 0), 0);
                  return (
                    <div
                      key={it.id}
                      className="bg-[#1E293B] rounded-lg border border-[#334155] p-3 flex gap-3"
                      data-testid={`bhp-item-${it.id}`}
                    >
                      {it.photo ? (
                        <img
                          src={it.photo}
                          alt={it.name}
                          className="h-20 w-20 object-cover rounded cursor-zoom-in shrink-0"
                          onClick={() => setLightbox(it.photo)}
                        />
                      ) : (
                        <div className="h-20 w-20 bg-[#0F172A] rounded flex items-center justify-center shrink-0">
                          <HardHat className="h-8 w-8 text-[#475569]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[#CBD5E1] font-semibold truncate">{it.name}</p>
                        <p className="text-[11px] text-[#94A3B8] mt-1">
                          Wydano: <b className="text-[#6B8E4E]">{totalQty} szt.</b> ({issuedCount} wydań)
                        </p>
                        <div className="flex gap-1 mt-2">
                          <Button
                            size="sm"
                            onClick={() => openIssueForm(it.id)}
                            className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-7"
                            data-testid={`bhp-issue-btn-${it.id}`}
                          >
                            <UserPlus className="h-3 w-3 mr-1" /> Wydaj
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditItem(it)}
                            className="text-[#94A3B8] h-7 px-2"
                            data-testid={`bhp-edit-btn-${it.id}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteItem(it)}
                            className="text-[#E8836A] h-7 px-2"
                            data-testid={`bhp-del-btn-${it.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ISSUANCES sub-tab */}
      {subtab === 'issuances' && (
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <HardHat className="h-5 w-5 text-[#5F7151]" /> Wydane pracownikom
              </CardTitle>
              <Button
                size="sm"
                onClick={() => openIssueForm()}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs h-8"
                data-testid="bhp-issue-new-btn"
                disabled={activeItems.length === 0 || employees.length === 0}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" /> Wydaj nowy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {issuancesByEmployee.length === 0 ? (
              <p className="text-[#94A3B8]">Brak wydań.</p>
            ) : (
              <div className="space-y-3">
                {issuancesByEmployee.map((row) => (
                  <div
                    key={row.employee_id}
                    className="bg-[#1E293B] rounded-lg border border-[#334155] p-3"
                    data-testid={`bhp-emp-row-${row.employee_id}`}
                  >
                    <p className="text-[#CBD5E1] font-bold text-base border-b border-[#334155] pb-2 mb-2">
                      {row.employee_name}
                    </p>
                    <div className="space-y-1">
                      {row.issuances.map((iss) => (
                        <div
                          key={iss.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[#2A384C]"
                          data-testid={`bhp-issuance-${iss.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-[#E8B76A] font-semibold">{iss.bhp_item_name}</span>
                            <span className="text-[#94A3B8] ml-2">x {iss.quantity}</span>
                            {iss.serial_number && (
                              <span className="ml-2 text-[11px] bg-[#0F172A] text-[#CBD5E1] px-2 py-0.5 rounded">
                                SN: {iss.serial_number}
                              </span>
                            )}
                            <p className="text-[11px] text-[#64748B] mt-0.5">
                              {new Date(iss.issued_at).toLocaleString('pl-PL')}
                              {iss.note && ` · ${iss.note}`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteIssuance(iss)}
                            className="text-[#E8836A] h-7 px-2"
                            data-testid={`bhp-del-issuance-${iss.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Item Modal */}
      {showAddItem && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddItem(false)}
        >
          <Card
            className="bg-[#2A384C] border-[#334155] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#CBD5E1]">
                  {editingItem ? 'Edytuj rzecz BHP' : 'Nowa rzecz BHP'}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowAddItem(false)} className="text-[#94A3B8]">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8]">Nazwa</label>
                <Input
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="np. Szelki BHP"
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="bhp-item-name-input"
                />
              </div>
              <div>
                <label className="text-xs text-[#94A3B8]">Zdjęcie (opcjonalnie)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="bhp-item-photo-input"
                />
                {itemForm.photo && (
                  <img src={itemForm.photo} alt="Podglad" className="h-24 mt-2 rounded" />
                )}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowAddItem(false)} className="text-[#94A3B8]">
                  Anuluj
                </Button>
                <Button
                  onClick={saveItem}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="bhp-item-save-btn"
                >
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Issue Modal */}
      {showIssue && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowIssue(false)}
        >
          <Card
            className="bg-[#2A384C] border-[#334155] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#CBD5E1]">Wydaj rzecz BHP</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowIssue(false)} className="text-[#94A3B8]">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8]">Pracownik</label>
                <select
                  value={issueForm.employee_id}
                  onChange={(e) => setIssueForm((f) => ({ ...f, employee_id: e.target.value }))}
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded-md h-10 px-3 text-sm"
                  data-testid="bhp-issue-employee-select"
                >
                  <option value="">-- wybierz --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8]">Rzecz BHP</label>
                <select
                  value={issueForm.bhp_item_id}
                  onChange={(e) => setIssueForm((f) => ({ ...f, bhp_item_id: e.target.value }))}
                  className="w-full bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded-md h-10 px-3 text-sm"
                  data-testid="bhp-issue-item-select"
                >
                  <option value="">-- wybierz --</option>
                  {activeItems.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[#94A3B8]">Ilość</label>
                  <Input
                    type="number"
                    min="1"
                    value={issueForm.quantity}
                    onChange={(e) => setIssueForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                    data-testid="bhp-issue-qty-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8]">Nr seryjny (opc.)</label>
                  <Input
                    value={issueForm.serial_number}
                    onChange={(e) => setIssueForm((f) => ({ ...f, serial_number: e.target.value }))}
                    className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                    data-testid="bhp-issue-sn-input"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8]">Notatka (opc.)</label>
                <Input
                  value={issueForm.note}
                  onChange={(e) => setIssueForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="np. zuzyte, przekazane na budowe X"
                  className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]"
                  data-testid="bhp-issue-note-input"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowIssue(false)} className="text-[#94A3B8]">
                  Anuluj
                </Button>
                <Button
                  onClick={saveIssuance}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="bhp-issue-save-btn"
                >
                  Wydaj
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Podglad" className="max-w-[95vw] max-h-[95vh] object-contain rounded" />
        </div>
      )}
    </div>
  );
};
