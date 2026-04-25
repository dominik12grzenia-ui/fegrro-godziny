import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from './ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger
} from './ui/dialog';
import {
  Wrench, Plus, Pencil, Trash2, User, Building2, Search, AlertTriangle, CheckCircle, ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { value: 'sprawny', label: 'Sprawny', color: 'bg-[#3F5635] text-[#D9F1C5]' },
  { value: 'uszkodzony', label: 'Uszkodzony', color: 'bg-[#7F2D2D] text-[#FCA5A5]' },
  { value: 'w_serwisie', label: 'W serwisie', color: 'bg-[#7F5C2D] text-[#FCD9A5]' },
  { value: 'wycofany', label: 'Wycofany', color: 'bg-[#475569] text-[#CBD5E1]' },
];

const EMPTY_FORM = {
  name: '',
  category: '',
  serial_number: '',
  status: 'sprawny',
  assigned_to_employee_id: '',
  assigned_to_site_id: '',
  notes: '',
  image_data: '',
};

export const EquipmentManager = ({ employees = [], sites = [] }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchEquipment = async () => {
    try {
      setLoading(true);
      const res = await api.get('/equipment');
      setEquipment(res.data);
    } catch (e) {
      toast.error('Nie udało się pobrać sprzętu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  const employeeMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e.full_name; });
    return m;
  }, [employees]);

  const siteMap = useMemo(() => {
    const m = {};
    sites.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [sites]);

  const filtered = useMemo(() => {
    return equipment.filter(eq => {
      if (statusFilter !== 'all' && eq.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [
          eq.name, eq.category, eq.serial_number,
          employeeMap[eq.assigned_to_employee_id], siteMap[eq.assigned_to_site_id]
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [equipment, search, statusFilter, employeeMap, siteMap]);

  const stats = useMemo(() => {
    const total = equipment.length;
    const broken = equipment.filter(e => e.status === 'uszkodzony').length;
    const inService = equipment.filter(e => e.status === 'w_serwisie').length;
    const assigned = equipment.filter(e => e.assigned_to_employee_id).length;
    return { total, broken, inService, assigned };
  }, [equipment]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (eq) => {
    setEditingId(eq.id);
    setForm({
      name: eq.name || '',
      category: eq.category || '',
      serial_number: eq.serial_number || '',
      status: eq.status || 'sprawny',
      assigned_to_employee_id: eq.assigned_to_employee_id || '',
      assigned_to_site_id: eq.assigned_to_site_id || '',
      notes: eq.notes || '',
      image_data: eq.image_data || '',
    });
    setDialogOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Zdjęcie max 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, image_data: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Podaj nazwę sprzętu');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        assigned_to_employee_id: form.assigned_to_employee_id || null,
        assigned_to_site_id: form.assigned_to_site_id || null,
        category: form.category || null,
        serial_number: form.serial_number || null,
        notes: form.notes || null,
        image_data: form.image_data || null,
      };
      if (editingId) {
        await api.put(`/equipment/${editingId}`, payload);
        toast.success('Sprzęt zaktualizowany');
      } else {
        await api.post('/equipment', payload);
        toast.success('Sprzęt dodany');
      }
      setDialogOpen(false);
      fetchEquipment();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Błąd zapisu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (eq) => {
    if (!window.confirm(`Usunąć sprzęt "${eq.name}"?`)) return;
    try {
      await api.delete(`/equipment/${eq.id}`);
      toast.success('Sprzęt usunięty');
      fetchEquipment();
    } catch (e) {
      toast.error('Nie udało się usunąć');
    }
  };

  const statusBadge = (status) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  return (
    <div className="space-y-4 bg-[#1E293B]" data-testid="equipment-tab-content">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#94A3B8]">Wszystkie</p>
                <p className="text-2xl font-bold text-[#CBD5E1]" data-testid="equipment-stat-total">{stats.total}</p>
              </div>
              <Wrench className="h-8 w-8 text-[#5F7151] opacity-30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#94A3B8]">Wydane</p>
                <p className="text-2xl font-bold text-[#6B8E4E]" data-testid="equipment-stat-assigned">{stats.assigned}</p>
              </div>
              <User className="h-8 w-8 text-[#6B8E4E] opacity-30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#94A3B8]">Uszkodzone</p>
                <p className="text-2xl font-bold text-[#FCA5A5]" data-testid="equipment-stat-broken">{stats.broken}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-[#FCA5A5] opacity-30" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#94A3B8]">W serwisie</p>
                <p className="text-2xl font-bold text-[#FCD9A5]" data-testid="equipment-stat-service">{stats.inService}</p>
              </div>
              <Wrench className="h-8 w-8 text-[#FCD9A5] opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
              <Wrench className="h-5 w-5 text-[#5F7151]" />
              Ewidencja sprzętu
            </CardTitle>
            <Button
              onClick={openCreate}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid="equipment-add-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Dodaj sprzęt
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj po nazwie, kategorii, numerze, pracowniku..."
                className="pl-9 bg-[#1E293B] border-[#334155] text-[#CBD5E1] placeholder:text-[#64748B]"
                data-testid="equipment-search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 bg-[#1E293B] border-[#334155] text-[#CBD5E1]" data-testid="equipment-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]">
                <SelectItem value="all">Wszystkie statusy</SelectItem>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8 text-[#94A3B8]">Wczytywanie...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-[#94A3B8]">
              {equipment.length === 0
                ? 'Brak sprzętu w ewidencji. Kliknij "Dodaj sprzęt", aby zacząć.'
                : 'Brak wyników dla wybranych filtrów.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(eq => (
                <div
                  key={eq.id}
                  className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 flex flex-col gap-2"
                  data-testid={`equipment-card-${eq.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-[#CBD5E1] truncate">{eq.name}</h4>
                        {statusBadge(eq.status)}
                      </div>
                      {eq.category && (
                        <p className="text-xs text-[#94A3B8] mt-1">{eq.category}</p>
                      )}
                      {eq.serial_number && (
                        <p className="text-xs text-[#64748B] mt-1">SN: {eq.serial_number}</p>
                      )}
                    </div>
                    {eq.image_data && (
                      <img
                        src={eq.image_data}
                        alt={eq.name}
                        className="h-14 w-14 rounded object-cover border border-[#334155] shrink-0"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1 mt-1 text-sm">
                    {eq.assigned_to_employee_id && employeeMap[eq.assigned_to_employee_id] && (
                      <div className="flex items-center gap-2 text-[#CBD5E1]">
                        <User className="h-3.5 w-3.5 text-[#6B8E4E]" />
                        {employeeMap[eq.assigned_to_employee_id]}
                      </div>
                    )}
                    {eq.assigned_to_site_id && siteMap[eq.assigned_to_site_id] && (
                      <div className="flex items-center gap-2 text-[#CBD5E1]">
                        <Building2 className="h-3.5 w-3.5 text-[#6B8E4E]" />
                        {siteMap[eq.assigned_to_site_id]}
                      </div>
                    )}
                    {!eq.assigned_to_employee_id && !eq.assigned_to_site_id && (
                      <div className="flex items-center gap-2 text-[#64748B] italic">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Na magazynie
                      </div>
                    )}
                    {eq.notes && (
                      <p className="text-xs text-[#94A3B8] mt-1 line-clamp-2">{eq.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2 pt-2 border-t border-[#334155]">
                    <Button
                      onClick={() => openEdit(eq)}
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-[#CBD5E1] hover:bg-[#334155]"
                      data-testid={`equipment-edit-${eq.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edytuj
                    </Button>
                    <Button
                      onClick={() => handleDelete(eq)}
                      variant="ghost"
                      size="sm"
                      className="text-[#FCA5A5] hover:bg-[#7F2D2D]/30"
                      data-testid={`equipment-delete-${eq.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#1E293B] border-[#334155] text-[#CBD5E1] max-w-lg max-h-[90vh] overflow-y-auto" data-testid="equipment-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#CBD5E1]">
              {editingId ? 'Edytuj sprzęt' : 'Dodaj sprzęt'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[#94A3B8]">Nazwa *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="np. Wiertarka Bosch GBH 240"
                className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]"
                data-testid="equipment-form-name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[#94A3B8]">Kategoria</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="np. Elektronarzędzia"
                  className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]"
                  data-testid="equipment-form-category"
                />
              </div>
              <div>
                <Label className="text-[#94A3B8]">Numer seryjny</Label>
                <Input
                  value={form.serial_number}
                  onChange={(e) => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  placeholder="SN..."
                  className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]"
                  data-testid="equipment-form-serial"
                />
              </div>
            </div>

            <div>
              <Label className="text-[#94A3B8]">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]" data-testid="equipment-form-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-[#334155] text-[#CBD5E1]">
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#94A3B8]">Przypisz do pracownika</Label>
              <Select
                value={form.assigned_to_employee_id || 'none'}
                onValueChange={(v) => setForm(f => ({ ...f, assigned_to_employee_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]" data-testid="equipment-form-employee">
                  <SelectValue placeholder="Brak (na magazynie)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-[#334155] text-[#CBD5E1] max-h-64">
                  <SelectItem value="none">— Na magazynie —</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#94A3B8]">Przypisz do budowy</Label>
              <Select
                value={form.assigned_to_site_id || 'none'}
                onValueChange={(v) => setForm(f => ({ ...f, assigned_to_site_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]" data-testid="equipment-form-site">
                  <SelectValue placeholder="Brak budowy" />
                </SelectTrigger>
                <SelectContent className="bg-[#1E293B] border-[#334155] text-[#CBD5E1] max-h-64">
                  <SelectItem value="none">— Brak budowy —</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#94A3B8]">Notatka</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="np. Wydane 12.04.2026, akumulator po wymianie"
                className="bg-[#0F172A] border-[#334155] text-[#CBD5E1]"
                data-testid="equipment-form-notes"
              />
            </div>

            <div>
              <Label className="text-[#94A3B8] flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Zdjęcie (opcjonalnie, max 2 MB)
              </Label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-[#CBD5E1] mt-1 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[#5F7151] file:text-white file:cursor-pointer hover:file:bg-[#4A5A41]"
                data-testid="equipment-form-image"
              />
              {form.image_data && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={form.image_data} alt="preview" className="h-16 w-16 rounded object-cover border border-[#334155]" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[#FCA5A5] hover:bg-[#7F2D2D]/30"
                    onClick={() => setForm(f => ({ ...f, image_data: '' }))}
                    data-testid="equipment-form-image-remove"
                  >
                    Usuń zdjęcie
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-[#CBD5E1] hover:bg-[#334155]"
              data-testid="equipment-form-cancel"
            >
              Anuluj
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              data-testid="equipment-form-submit"
            >
              {submitting ? 'Zapisywanie...' : (editingId ? 'Zapisz zmiany' : 'Dodaj sprzęt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EquipmentManager;
