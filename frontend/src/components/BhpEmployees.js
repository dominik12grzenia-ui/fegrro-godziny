import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Users, Upload, Download, Trash2, Edit, X, FileText,
  Archive, ArchiveRestore, CheckSquare, Square, Calendar, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

export const DOC_CATEGORIES = [
  { value: 'bhp_szkolenie', label: 'Szkolenie BHP' },
  { value: 'badania_lekarskie', label: 'Badania lekarskie' },
  { value: 'uprawnienia_hakowy', label: 'Uprawnienia hakowy' },
  { value: 'uprawnienia_sygnalista', label: 'Uprawnienia sygnalista' },
  { value: 'badanie_wysokosciowe', label: 'Badanie wysokościowe' },
  { value: 'inne', label: 'Inne' },
];

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const daysBetween = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d - new Date()) / (1000 * 60 * 60 * 24));
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('pl-PL') : '-');

const ValidityBadge = ({ date, label }) => {
  const days = daysBetween(date);
  if (days === null) return <span className="text-[#64748B] text-xs">{label}: -</span>;
  let color = 'text-[#5F7552]';
  if (days < 0) color = 'text-[#DC4A3A]';
  else if (days < 30) color = 'text-[#D4AF37]';
  return (
    <span className={`text-xs ${color}`}>
      {label}: <b>{formatDate(date)}</b>
      {days < 0 && ' (przeterminowane)'}
      {days >= 0 && days < 30 && ` (${days} dni)`}
    </span>
  );
};

export const BhpEmployees = () => {
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('active'); // active | archived | all
  const [siteFilter, setSiteFilter] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState(new Set());
  const [showDownload, setShowDownload] = useState(false);
  const [downloadCats, setDownloadCats] = useState(
    new Set(DOC_CATEGORIES.map((c) => c.value))
  );
  const [downloadFormat, setDownloadFormat] = useState('zip');
  const [downloading, setDownloading] = useState(false);

  const [editing, setEditing] = useState(null); // employee object
  const [editForm, setEditForm] = useState({
    job_title: '', registered_at: '', bhp_valid_until: '',
    height_work_certified: false, height_valid_until: '',
    pesel: '', permit_type: '', permit_valid_until: '',
    legal_stay_until: '', company_name: '', employment_fraction: '',
  });
  const [docs, setDocs] = useState([]);
  const [uploadCat, setUploadCat] = useState('bhp_szkolenie');
  const [uploadValidUntil, setUploadValidUntil] = useState('');
  const [uploadIsHeight, setUploadIsHeight] = useState(false);
  // Alerts widget
  const [alerts, setAlerts] = useState({ employees: [], documents: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter === 'archived') params.set('only_archived', 'true');
      else if (statusFilter === 'all') params.set('include_archived', 'true');
      if (siteFilter) params.set('site_id', siteFilter);
      const [empRes, sitesRes, alertsRes] = await Promise.all([
        api.get(`/bhp/employees?${params}`),
        api.get('/sites'),
        api.get('/bhp/alerts?days=30'),
      ]);
      setEmployees(empRes.data);
      setSites(sitesRes.data || []);
      setAlerts(alertsRes.data || { employees: [], documents: [] });
    } catch (_e) {
      toast.error('Błąd pobierania danych');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, siteFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => (e.full_name || '').toLowerCase().includes(s));
  }, [employees, search]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelected(new Set(filtered.map((e) => e.id)));
  };
  const clearSelection = () => setSelected(new Set());

  const openEdit = async (emp) => {
    setEditing(emp);
    setEditForm({
      job_title: emp.job_title || '',
      registered_at: (emp.registered_at || '').slice(0, 10),
      bhp_valid_until: (emp.bhp_valid_until || '').slice(0, 10),
      height_work_certified: !!emp.height_work_certified,
      height_valid_until: (emp.height_valid_until || '').slice(0, 10),
      pesel: emp.pesel || '',
      permit_type: emp.permit_type || '',
      permit_valid_until: (emp.permit_valid_until || '').slice(0, 10),
      legal_stay_until: (emp.legal_stay_until || '').slice(0, 10),
      company_name: emp.company_name || '',
      employment_fraction: emp.employment_fraction || '',
    });
    setDocs([]);
    setUploadValidUntil('');
    setUploadIsHeight(false);
    try {
      const r = await api.get(`/employees/${emp.id}/documents`);
      setDocs(r.data);
    } catch (_e) { /* silent */ }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.put(`/employees/${editing.id}/bhp-info`, {
        job_title: editForm.job_title || null,
        registered_at: editForm.registered_at || null,
        bhp_valid_until: editForm.bhp_valid_until || null,
        height_work_certified: editForm.height_work_certified,
        height_valid_until: editForm.height_valid_until || null,
        pesel: editForm.pesel || null,
        permit_type: editForm.permit_type || null,
        permit_valid_until: editForm.permit_valid_until || null,
        legal_stay_until: editForm.legal_stay_until || null,
        company_name: editForm.company_name || null,
        employment_fraction: editForm.employment_fraction || null,
      });
      toast.success('Zapisano');
      await fetchData();
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const uploadDoc = async (e) => {
    if (!editing) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
    try {
      const b64 = await fileToBase64(file);
      await api.post(`/employees/${editing.id}/documents`, {
        category: uploadCat,
        file_name: file.name,
        file_data: b64,
        valid_until: uploadValidUntil || null,
        is_height_related: uploadIsHeight,
      });
      toast.success('Dodano dokument');
      const r = await api.get(`/employees/${editing.id}/documents`);
      setDocs(r.data);
      setUploadValidUntil('');
      setUploadIsHeight(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd uploadu');
    }
  };

  const deleteDoc = async (d) => {
    if (!window.confirm(`Usunac "${d.file_name}"?`)) return;
    try {
      await api.delete(`/employees/${editing.id}/documents/${d.id}`);
      setDocs(docs.filter((x) => x.id !== d.id));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const downloadDoc = async (d) => {
    try {
      const r = await api.get(`/employees/${editing.id}/documents/${d.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url; a.download = d.file_name || 'document.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const archive = async (emp) => {
    if (!window.confirm(`Zarchiwizowac ${emp.full_name}? Pracownik zniknie z listy godzin.`)) return;
    try {
      await api.post(`/employees/${emp.id}/archive`);
      toast.success('Zarchiwizowano');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };
  const restore = async (emp) => {
    try {
      await api.post(`/employees/${emp.id}/restore`);
      toast.success('Przywrocono');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const hardDelete = async (emp) => {
    const confirm1 = window.confirm(
      `Trwale usunac ${emp.full_name}?\n\nTo usunie pracownika oraz WSZYSTKIE jego dokumenty, wydania BHP i zamowienia odziezy. Operacja NIEODWRACALNA.`,
    );
    if (!confirm1) return;
    const typed = window.prompt(`Aby potwierdzić, wpisz: ${emp.full_name}`);
    if (typed !== emp.full_name) {
      toast.error('Nazwa nie pasuje - anulowano');
      return;
    }
    try {
      await api.delete(`/employees/${emp.id}/hard`);
      toast.success('Usunieto trwale');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd');
    }
  };

  const toggleDownloadCat = (c) => {
    setDownloadCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const doBulkDownload = async () => {
    if (selected.size === 0) { toast.error('Zaznacz pracownikow'); return; }
    if (downloadCats.size === 0) { toast.error('Wybierz co najmniej 1 kategorie'); return; }
    setDownloading(true);
    try {
      const r = await api.post('/bhp/documents/bulk-download', {
        employee_ids: [...selected],
        categories: [...downloadCats],
        format: downloadFormat,
      }, { responseType: 'blob' });
      const mime = downloadFormat === 'zip' ? 'application/zip' : 'application/pdf';
      const ext = downloadFormat === 'zip' ? 'zip' : 'pdf';
      const url = window.URL.createObjectURL(new Blob([r.data], { type: mime }));
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      a.href = url;
      a.download = `dokumenty_bhp_${ts}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      setShowDownload(false);
      toast.success('Pobrano');
    } catch (err) {
      let msg = 'Błąd';
      if (err.response?.data) {
        try {
          const txt = await err.response.data.text?.();
          if (txt) {
            try { msg = JSON.parse(txt).detail || msg; } catch (_e) { msg = txt; }
          }
        } catch (_e) { /* ignore */ }
      }
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <p className="text-[#94A3B8] p-4">Ładowanie...</p>;

  return (
    <Card className="bg-[#19243C] border-[#2A3B59]">
      <CardHeader>
        <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
          <Users className="h-5 w-5 text-[#4F6343]" /> Pracownicy - dokumenty i BHP
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Alerts widget */}
        {(alerts.employees.length > 0 || alerts.documents.length > 0) && (
          <div className="bg-[#3D2E2E]/40 border border-[#D4AF37]/30 rounded-lg p-3" data-testid="bhp-alerts-widget">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
              <span className="text-[#D4AF37] font-semibold text-sm">
                Wkrótce wygasają / przeterminowane (30 dni):
                {' '}
                {alerts.employees.length} osób
                {alerts.documents.length > 0 && `, ${alerts.documents.length} dokumentów`}
              </span>
            </div>
            <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
              {alerts.employees.map((row) => (
                <div key={row.employee_id} className="flex flex-wrap gap-2 items-center" data-testid={`alert-emp-${row.employee_id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find((e) => e.id === row.employee_id);
                      if (emp) openEdit(emp);
                    }}
                    className="text-[#CBD5E1] font-semibold hover:text-[#5F7552] underline-offset-2 hover:underline"
                  >
                    {row.employee_name}
                  </button>
                  {row.alerts.map((a, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded text-[11px] ${a.expired ? 'bg-[#DC4A3A]/30 text-[#DC4A3A]' : 'bg-[#D4AF37]/30 text-[#D4AF37]'}`}>
                      {a.label}: {formatDate(a.valid_until)} {a.expired ? '(przeterm.)' : ''}
                    </span>
                  ))}
                </div>
              ))}
              {alerts.documents.length > 0 && (
                <div className="border-t border-[#2A3B59] pt-1 mt-2">
                  <p className="text-[#94A3B8] text-[10px] uppercase mb-1">Dokumenty</p>
                  {alerts.documents.slice(0, 20).map((d) => (
                    <div key={d.document_id} className="flex flex-wrap gap-2 items-center">
                      <span className="text-[#CBD5E1]">{d.employee_name}</span>
                      <span className="text-[#94A3B8]">- {d.category_label}</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] ${d.expired ? 'bg-[#DC4A3A]/30 text-[#DC4A3A]' : 'bg-[#D4AF37]/30 text-[#D4AF37]'}`}>
                        {formatDate(d.valid_until)} {d.expired ? '(przeterm.)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-[#94A3B8]">Szukaj</label>
            <Input
              placeholder="Imię i nazwisko..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1] h-9"
              data-testid="bhp-emp-search"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded-md h-9 px-2 text-sm"
              data-testid="bhp-emp-status-filter"
            >
              <option value="active">Aktywni</option>
              <option value="archived">Archiwum</option>
              <option value="all">Wszyscy</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8]">Budowa</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded-md h-9 px-2 text-sm"
              data-testid="bhp-emp-site-filter"
            >
              <option value="">(wszystkie)</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk bar */}
        <div className="flex flex-wrap gap-2 items-center bg-[#131C2F] rounded-lg p-2">
          <Button size="sm" variant="ghost" onClick={selectAllVisible}
            className="text-[#CBD5E1] h-8" data-testid="bhp-emp-select-all">
            <CheckSquare className="h-3.5 w-3.5 mr-1" /> Zaznacz widocznych
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}
            className="text-[#94A3B8] h-8" data-testid="bhp-emp-clear-sel">
            <Square className="h-3.5 w-3.5 mr-1" /> Wyczysc
          </Button>
          <span className="text-[#CBD5E1] text-sm ml-2">
            Zaznaczono: <b>{selected.size}</b> / {filtered.length}
          </span>
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={() => setShowDownload(true)}
              disabled={selected.size === 0}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white h-8"
              data-testid="bhp-emp-download-btn"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Pobierz dokumenty ({selected.size})
            </Button>
          </div>
        </div>

        {/* Employees table */}
        {filtered.length === 0 ? (
          <p className="text-[#94A3B8] py-4">Brak pracownikow.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((emp) => {
              const isSel = selected.has(emp.id);
              const isArch = !!emp.is_archived;
              return (
                <div
                  key={emp.id}
                  className={`rounded-lg border p-3 transition-colors ${isSel ? 'bg-[#2A3B59] border-[#4F6343]' : 'bg-[#131C2F] border-[#2A3B59]'} ${isArch ? 'opacity-70' : ''}`}
                  data-testid={`bhp-emp-row-${emp.id}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelect(emp.id)}
                      className="shrink-0"
                      data-testid={`bhp-emp-check-${emp.id}`}
                    >
                      {isSel
                        ? <CheckSquare className="h-5 w-5 text-[#4F6343]" />
                        : <Square className="h-5 w-5 text-[#94A3B8]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[#CBD5E1] font-semibold">{emp.full_name}</span>
                        {emp.job_title && (
                          <span className="text-xs bg-[#19243C] text-[#CBD5E1] px-2 py-0.5 rounded">{emp.job_title}</span>
                        )}
                        {isArch && (
                          <span className="text-xs bg-[#DC4A3A]/20 text-[#DC4A3A] px-2 py-0.5 rounded flex items-center gap-1">
                            <Archive className="h-3 w-3" /> Archiwum
                          </span>
                        )}
                        {emp.documents_total > 0 && (
                          <span className="text-xs bg-[#4F6343]/30 text-[#5F7552] px-2 py-0.5 rounded flex items-center gap-1">
                            <FileText className="h-3 w-3" /> {emp.documents_total}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1">
                        <span className="text-[11px] text-[#64748B] flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Zarej.: {formatDate(emp.registered_at)}
                        </span>
                        <ValidityBadge date={emp.bhp_valid_until} label="BHP" />
                        {emp.height_work_certified && (
                          <ValidityBadge date={emp.height_valid_until} label="Wysok." />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}
                        className="text-[#94A3B8] h-8 px-2" data-testid={`bhp-emp-edit-${emp.id}`}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {isArch ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => restore(emp)}
                            className="text-[#5F7552] h-8 px-2" data-testid={`bhp-emp-restore-${emp.id}`}>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => hardDelete(emp)}
                            className="text-[#DC4A3A] h-8 px-2" title="Usuń trwale"
                            data-testid={`bhp-emp-hard-delete-${emp.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => archive(emp)}
                          className="text-[#D4AF37] h-8 px-2" data-testid={`bhp-emp-archive-${emp.id}`}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Download modal */}
      {showDownload && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDownload(false)}>
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#CBD5E1]">Pobierz dokumenty ({selected.size})</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowDownload(false)} className="text-[#94A3B8]">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Kategorie</label>
                <div className="space-y-1 bg-[#131C2F] rounded p-2">
                  {DOC_CATEGORIES.map((c) => (
                    <label key={c.value} className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
                      <input type="checkbox" checked={downloadCats.has(c.value)}
                        onChange={() => toggleDownloadCat(c.value)}
                        data-testid={`bhp-dl-cat-${c.value}`}
                        className="accent-[#4F6343]" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#94A3B8] mb-1 block">Format</label>
                <div className="flex gap-3 bg-[#131C2F] rounded p-2">
                  <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
                    <input type="radio" name="fmt" checked={downloadFormat === 'zip'}
                      onChange={() => setDownloadFormat('zip')}
                      data-testid="bhp-dl-fmt-zip"
                      className="accent-[#4F6343]" />
                    ZIP (osobne pliki)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
                    <input type="radio" name="fmt" checked={downloadFormat === 'pdf'}
                      onChange={() => setDownloadFormat('pdf')}
                      data-testid="bhp-dl-fmt-pdf"
                      className="accent-[#4F6343]" />
                    Scalony PDF
                  </label>
                </div>
              </div>
              <div className="bg-[#131C2F] rounded p-2 text-[11px] text-[#94A3B8] flex gap-2">
                <AlertTriangle className="h-4 w-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Scalony PDF dziala tylko gdy wszystkie dokumenty to prawidlowe pliki PDF. W pozostalych przypadkach uzyj ZIP.</span>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={() => setShowDownload(false)} className="text-[#94A3B8]">
                  Anuluj
                </Button>
                <Button onClick={doBulkDownload} disabled={downloading}
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="bhp-dl-confirm-btn">
                  {downloading ? 'Pobieram...' : 'Pobierz'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}>
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#CBD5E1]">{editing.full_name}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="text-[#94A3B8]">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* BHP info form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#94A3B8]">Stanowisko</label>
                  <Input
                    value={editForm.job_title}
                    onChange={(e) => setEditForm((f) => ({ ...f, job_title: e.target.value }))}
                    placeholder="np. Hakowy, Sygnalista, Murarz"
                    className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                    data-testid="bhp-edit-job-title"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8]">Data rejestracji</label>
                  <Input
                    type="date"
                    value={editForm.registered_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, registered_at: e.target.value }))}
                    className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                    data-testid="bhp-edit-registered-at"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8]">BHP ważne do</label>
                  <Input
                    type="date"
                    value={editForm.bhp_valid_until}
                    onChange={(e) => setEditForm((f) => ({ ...f, bhp_valid_until: e.target.value }))}
                    className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                    data-testid="bhp-edit-bhp-valid-until"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer mt-5">
                    <input
                      type="checkbox"
                      checked={editForm.height_work_certified}
                      onChange={(e) => setEditForm((f) => ({ ...f, height_work_certified: e.target.checked }))}
                      data-testid="bhp-edit-height-checkbox"
                      className="accent-[#4F6343]"
                    />
                    Uprawnienia wysokościowe
                  </label>
                </div>
                {editForm.height_work_certified && (
                  <div>
                    <label className="text-xs text-[#94A3B8]">Wysokościowe ważne do</label>
                    <Input
                      type="date"
                      value={editForm.height_valid_until}
                      onChange={(e) => setEditForm((f) => ({ ...f, height_valid_until: e.target.value }))}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-height-valid-until"
                    />
                  </div>
                )}
              </div>

              {/* HR fields */}
              <div className="border-t border-[#2A3B59] pt-3">
                <p className="text-[#CBD5E1] font-semibold mb-2 text-sm">Dane pracownika</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#94A3B8]">PESEL</label>
                    <Input
                      value={editForm.pesel}
                      onChange={(e) => setEditForm((f) => ({ ...f, pesel: e.target.value }))}
                      placeholder="11 cyfr"
                      maxLength={11}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-pesel"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Nazwa firmy</label>
                    <Input
                      value={editForm.company_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-company"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Wielkość etatu</label>
                    <select
                      value={editForm.employment_fraction}
                      onChange={(e) => setEditForm((f) => ({ ...f, employment_fraction: e.target.value }))}
                      className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded-md h-10 px-3 text-sm"
                      data-testid="bhp-edit-employment"
                    >
                      <option value="">(brak)</option>
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="1/1">1/1 (pełen)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Typ zezwolenia</label>
                    <Input
                      value={editForm.permit_type}
                      onChange={(e) => setEditForm((f) => ({ ...f, permit_type: e.target.value }))}
                      placeholder="np. zezwolenie typu A"
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-permit-type"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Zezwolenie ważne do</label>
                    <Input
                      type="date"
                      value={editForm.permit_valid_until}
                      onChange={(e) => setEditForm((f) => ({ ...f, permit_valid_until: e.target.value }))}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-permit-valid"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Legalny pobyt do</label>
                    <Input
                      type="date"
                      value={editForm.legal_stay_until}
                      onChange={(e) => setEditForm((f) => ({ ...f, legal_stay_until: e.target.value }))}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1]"
                      data-testid="bhp-edit-legal-stay"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveEdit} className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                  data-testid="bhp-edit-save-btn">
                  Zapisz pola BHP
                </Button>
              </div>

              {/* Documents */}
              <div className="border-t border-[#2A3B59] pt-3">
                <p className="text-[#CBD5E1] font-semibold mb-2">Dokumenty ({docs.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs text-[#94A3B8]">Kategoria</label>
                    <select
                      value={uploadCat}
                      onChange={(e) => setUploadCat(e.target.value)}
                      className="w-full bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded-md h-9 px-2 text-sm"
                      data-testid="bhp-upload-category"
                    >
                      {DOC_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8]">Termin ważności (opc.)</label>
                    <Input
                      type="date"
                      value={uploadValidUntil}
                      onChange={(e) => setUploadValidUntil(e.target.value)}
                      className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1] h-9"
                      data-testid="bhp-upload-valid-until"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center mb-2">
                  <label className="flex items-center gap-2 text-sm text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadIsHeight}
                      onChange={(e) => setUploadIsHeight(e.target.checked)}
                      className="accent-[#4F6343]"
                      data-testid="bhp-upload-height-checkbox"
                    />
                    Badania wysokościowe
                  </label>
                  <label className="flex items-center gap-1 bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-9 px-3 rounded cursor-pointer ml-auto">
                    <Upload className="h-3.5 w-3.5" /> Dodaj plik (PDF, max 10MB)
                    <input type="file" accept="application/pdf,image/*"
                      onChange={uploadDoc} className="hidden"
                      data-testid="bhp-upload-input" />
                  </label>
                </div>
                {docs.length === 0 ? (
                  <p className="text-[#94A3B8] text-sm">Brak dokumentów.</p>
                ) : (
                  <div className="space-y-1">
                    {docs.map((d) => {
                      const catLabel = DOC_CATEGORIES.find((c) => c.value === d.category)?.label || d.category;
                      const days = daysBetween(d.valid_until);
                      let validColor = 'text-[#94A3B8]';
                      if (days !== null) {
                        if (days < 0) validColor = 'text-[#DC4A3A]';
                        else if (days < 30) validColor = 'text-[#D4AF37]';
                        else validColor = 'text-[#5F7552]';
                      }
                      return (
                        <div key={d.id}
                          className="flex flex-wrap items-center gap-2 bg-[#131C2F] rounded p-2 text-sm"
                          data-testid={`bhp-doc-${d.id}`}>
                          <FileText className="h-4 w-4 text-[#4F6343] shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[#CBD5E1] font-medium">{d.file_name}</span>
                            <span className="text-[#94A3B8] text-xs ml-2">{catLabel}</span>
                            {d.is_height_related && (
                              <span className="ml-2 text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] px-1.5 py-0.5 rounded">wysokość</span>
                            )}
                            {d.valid_until && (
                              <span className={`ml-2 text-[11px] ${validColor}`}>
                                ważny do {formatDate(d.valid_until)}
                                {days !== null && days < 0 && ' (przeterm.)'}
                                {days !== null && days >= 0 && days < 30 && ` (${days}d)`}
                              </span>
                            )}
                            <span className="text-[#64748B] text-[11px] ml-2">
                              · {new Date(d.uploaded_at).toLocaleDateString('pl-PL')} · {Math.round((d.size_bytes || 0) / 1024)} KB
                            </span>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => downloadDoc(d)}
                            className="text-[#CBD5E1] h-7 px-2">
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteDoc(d)}
                            className="text-[#DC4A3A] h-7 px-2">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
};
