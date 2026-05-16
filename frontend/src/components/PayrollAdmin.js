import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { ChevronDown, ChevronRight, ChevronLeft, FileText, Download, Search, UserPlus, Archive, ArchiveRestore, Trash2, Lock, Unlock, History, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { SkeletonTable } from './ui/skeletons';

const PL_MONTHS = ['styczen','luty','marzec','kwiecien','maj','czerwiec','lipiec','sierpien','wrzesien','pazdziernik','listopad','grudzien'];

const today = new Date();

export const PayrollAdmin = () => {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const nameInputRef = React.useRef(null);
  const phoneInputRef = React.useRef(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);
  const [auditFor, setAuditFor] = useState(null);  // {emp_id, name}
  const [auditEntries, setAuditEntries] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payroll?year=${year}&month=${month}`);
      setData(res.data);
    } catch (e) {
      toast.error('Blad pobierania wyplat');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const fetchArchived = useCallback(async () => {
    try {
      const res = await api.get('/employees?include_archived=true');
      setArchived(res.data.filter((e) => e.is_archived));
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const handleAdd = async () => {
    // Fallback do ref jezeli stan nie zsynchronizowany (race przy onClick)
    const name = (newName || nameInputRef.current?.value || '').trim();
    const phone = (newPhone || phoneInputRef.current?.value || '').trim();
    if (!name || name.split(/\s+/).length < 2) {
      toast.error('Podaj imie i nazwisko');
      return;
    }
    try {
      await api.post('/employees', { full_name: name, phone_number: phone || null });
      toast.success(`Dodano: ${name}`);
      setShowAdd(false); setNewName(''); setNewPhone('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad dodawania');
    }
  };

  const handleArchive = async (row) => {
    if (!window.confirm(`Zarchiwizowac ${row.full_name}?\n\nPracownik znika z aktywnych list ale jego dane pozostaja.`)) return;
    try {
      await api.post(`/employees/${row.employee_id}/archive`);
      toast.success(`Zarchiwizowano: ${row.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad archiwizacji');
    }
  };

  const handleUnarchive = async (emp) => {
    try {
      await api.post(`/employees/${emp.id}/unarchive`);
      toast.success(`Przywrocono: ${emp.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const handleHardDelete = async (emp) => {
    if (!window.confirm(
      `TRWALE usunac ${emp.full_name}?\n\n` +
      'Usunie wszystkie dane: godziny, zaliczki, kary, nieobecnosci, BHP, odziez, wyplaty.\n\n' +
      'Operacja NIEODWRACALNA.'
    )) return;
    try {
      const res = await api.delete(`/employees/${emp.id}`);
      toast.success(`Usunieto trwale: ${emp.full_name}`);
      fetchData(); fetchArchived();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad usuwania');
    }
  };

  const isLocked = !!data?.locked;
  const lockInfo = data?.lock_info;

  const handleLockToggle = async () => {
    try {
      if (isLocked) {
        if (!window.confirm(`Odblokowac wyplate za ${PL_MONTHS[month - 1]} ${year}? Pola znow beda edytowalne.`)) return;
        await api.post(`/payroll/unlock?year=${year}&month=${month}`);
        toast.success('Odblokowano - mozna edytowac');
      } else {
        if (!window.confirm(
          `Zamknac wyplate za ${PL_MONTHS[month - 1]} ${year}?\n\n` +
          'Po zamknieciu pola beda tylko do odczytu - nikt nie zmodyfikuje danych. ' +
          'Mozesz w kazdej chwili odblokowac.'
        )) return;
        await api.post(`/payroll/lock?year=${year}&month=${month}`);
        toast.success('Zamknieto - pola tylko do odczytu');
      }
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad');
    }
  };

  const openAudit = async (row) => {
    setAuditFor({ id: row.employee_id, name: row.full_name });
    setAuditEntries([]);
    try {
      const res = await api.get(`/payroll/${row.employee_id}/audit?year=${year}&month=${month}`);
      setAuditEntries(res.data.entries || []);
    } catch {
      toast.error('Blad pobierania historii');
    }
  };

  const fieldLabels = {
    rate: 'Stawka zl/h',
    is_fixed_salary: 'Stala pensja',
    fixed_salary_amount: 'Kwota stalej pensji',
    advances_hours: 'Zaliczki (h)',
    penalties_zl: 'Kary',
    other_minus_zl: 'Inne -',
    bonus_zl: 'Dodatki',
    driver_zl: 'Kierowca',
    other_plus_zl: 'Inne +',
  };
  const fmtVal = (field, v) => {
    if (field === 'is_fixed_salary') return v ? 'TAK' : 'NIE';
    return Number(v ?? 0).toFixed(2);
  };


  const changeMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m); setYear(y); setSelected(new Set()); setExpanded(new Set());
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const visibleRows = (data?.rows || []).filter((r) =>
    !filter || r.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  const toggleSelectAllVisible = () => {
    const ids = visibleRows.map((r) => r.employee_id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  // Live edit: debounced save per row
  const saveRecord = async (row, patch) => {
    setSavingId(row.employee_id);
    const newRec = { ...row.record, ...patch };
    try {
      await api.put(`/payroll/${row.employee_id}?year=${year}&month=${month}`, newRec);
      // Optimistic update of computed
      setData((d) => {
        if (!d) return d;
        const rows = d.rows.map((r) => {
          if (r.employee_id !== row.employee_id) return r;
          const rate = parseFloat(newRec.rate || 0);
          const is_fixed = !!newRec.is_fixed_salary;
          const fixed_amt = parseFloat(newRec.fixed_salary_amount || 0);
          const adv_h = parseFloat(newRec.advances_hours || 0);
          const pen = parseFloat(newRec.penalties_zl || 0);
          const o_minus = parseFloat(newRec.other_minus_zl || 0);
          const bonus = parseFloat(newRec.bonus_zl || 0);
          const driver = parseFloat(newRec.driver_zl || 0);
          const o_plus = parseFloat(newRec.other_plus_zl || 0);
          let hours_amount, rate_effective;
          if (is_fixed) {
            hours_amount = +fixed_amt.toFixed(2);
            rate_effective = r.total_hours > 0 ? +(fixed_amt / r.total_hours).toFixed(2) : 0;
          } else {
            hours_amount = +(r.total_hours * rate).toFixed(2);
            rate_effective = +rate.toFixed(2);
          }
          const advances_zl = +(adv_h * rate_effective).toFixed(2);
          const payout = +(hours_amount - advances_zl - pen - o_minus + bonus + driver + o_plus).toFixed(2);
          return { ...r, record: newRec, computed: { hours_amount, advances_zl, rate_effective, payout } };
        });
        return { ...d, rows };
      });
    } catch (e) {
      toast.error('Blad zapisu');
    } finally {
      setSavingId(null);
    }
  };

  const handleNum = (row, field, value) => {
    const num = value === '' ? 0 : parseFloat(value);
    if (Number.isNaN(num)) return;
    saveRecord(row, { [field]: num });
  };

  const handleToggleFixed = (row) => {
    saveRecord(row, { is_fixed_salary: !row.record.is_fixed_salary });
  };

  const downloadPdf = async (onlySelected) => {
    setDownloading(true);
    try {
      const body = { employee_ids: onlySelected ? Array.from(selected) : null };
      if (onlySelected && body.employee_ids.length === 0) {
        toast.error('Zaznacz przynajmniej jednego pracownika');
        setDownloading(false);
        return;
      }
      const res = await api.post(
        `/payroll/pdf?year=${year}&month=${month}`,
        body,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `wyplaty_${PL_MONTHS[month - 1]}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF wygenerowany');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad generowania PDF');
    } finally {
      setDownloading(false);
    }
  };

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await api.post(
        `/payroll/pdf/report?year=${year}&month=${month}`,
        {},
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_wyplat_${PL_MONTHS[month - 1]}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Raport wygenerowany');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Blad generowania raportu');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header: month picker + actions */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#5F7151]" /> Wyplaty - {PL_MONTHS[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-[#1E293B] rounded-lg border border-[#334155] overflow-hidden">
              <Button variant="ghost" size="sm" onClick={() => changeMonth(-1)} className="text-white hover:bg-[#334155]" data-testid="payroll-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-[#CBD5E1] px-3 capitalize font-semibold" data-testid="payroll-month-label">{PL_MONTHS[month - 1]} {year}</span>
              <Button variant="ghost" size="sm" onClick={() => changeMonth(1)} className="text-white hover:bg-[#334155]" data-testid="payroll-next-month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Szukaj pracownika..."
                className="pl-8 bg-[#1E293B] border-[#334155] text-white"
                data-testid="payroll-search"
              />
            </div>
            <div className="ml-auto flex gap-2 flex-wrap">
              <Button onClick={handleLockToggle}
                className={isLocked
                  ? "bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] font-bold"
                  : "bg-[#334155] hover:bg-[#475569] text-[#CBD5E1]"}
                data-testid="payroll-lock-toggle"
              >
                {isLocked ? <><Unlock className="h-4 w-4 mr-1" /> Odblokuj miesiac</> : <><Lock className="h-4 w-4 mr-1" /> Zamknij miesiac</>}
              </Button>
              <Button onClick={() => setShowAdd(true)} disabled={isLocked} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="payroll-add-employee">
                <UserPlus className="h-4 w-4 mr-1" /> Dodaj pracownika
              </Button>
              <Button onClick={downloadReport} disabled={downloading}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white" data-testid="payroll-pdf-report">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Raport PDF
              </Button>
              <Button onClick={() => downloadPdf(true)} disabled={downloading || selected.size === 0}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="payroll-pdf-selected">
                <Download className="h-4 w-4 mr-1" /> Karteczki ({selected.size})
              </Button>
              <Button onClick={() => downloadPdf(false)} disabled={downloading}
                variant="outline" className="border-[#5F7151] text-[#5F7151] hover:bg-[#334155] hover:text-[#5F7151]" data-testid="payroll-pdf-all">
                <Download className="h-4 w-4 mr-1" /> Karteczki wszystkich
              </Button>
            </div>
          </div>
          {data?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-[#1E293B] rounded p-2 border border-[#334155]">
                <div className="text-[#94A3B8]">Suma godzin</div>
                <div className="text-white font-bold text-lg" data-testid="payroll-total-hours">{data.totals.total_hours} h</div>
              </div>
              <div className="bg-[#1E293B] rounded p-2 border border-[#334155]">
                <div className="text-[#94A3B8]">Suma kwot z godzin</div>
                <div className="text-white font-bold text-lg">{data.totals.total_hours_amount.toFixed(2)} zl</div>
              </div>
              <div className="bg-[#1E293B] rounded p-2 border border-[#5F7151]">
                <div className="text-[#94A3B8]">Suma wyplat</div>
                <div className="text-[#5F7151] font-bold text-lg" data-testid="payroll-total-payout">{data.totals.total_payout.toFixed(2)} zl</div>
              </div>
            </div>
          )}
          {isLocked && (
            <div className="bg-[#E8B76A]/15 border border-[#E8B76A] rounded p-3 text-[#FCD34D] text-sm flex items-center gap-2" data-testid="payroll-locked-banner">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                <strong>Miesiac zamkniety</strong>
                {lockInfo && (
                  <> &middot; {lockInfo.locked_at?.slice(0, 10)} przez {lockInfo.locked_by_name}</>
                )}
                {' '}- pola sa tylko do odczytu. Kliknij <em>"Odblokuj miesiac"</em> aby edytowac.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><SkeletonTable rows={8} cols={7} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="payroll-table">
                <thead className="bg-[#1E293B] text-[#CBD5E1]">
                  <tr>
                    <th className="p-2 text-left">
                      <input
                        type="checkbox"
                        checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.employee_id))}
                        onChange={toggleSelectAllVisible}
                        data-testid="payroll-select-all"
                        className="h-4 w-4 accent-[#5F7151] cursor-pointer"
                      />
                    </th>
                    <th className="p-2 text-left">Pracownik</th>
                    <th className="p-2 text-center">Stala</th>
                    <th className="p-2 text-right">Godziny</th>
                    <th className="p-2 text-right">Stawka zl/h</th>
                    <th className="p-2 text-right">Kwota godzin</th>
                    <th className="p-2 text-right">Zal. (h)</th>
                    <th className="p-2 text-right">Kary zl</th>
                    <th className="p-2 text-right">Dodatki +</th>
                    <th className="p-2 text-right">Kierowca +</th>
                    <th className="p-2 text-right">Inne -</th>
                    <th className="p-2 text-right">Inne +</th>
                    <th className="p-2 text-right">Wyplata</th>
                    <th className="p-2 text-center">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={14} className="p-6 text-center text-[#64748B]">Brak pracownikow</td></tr>
                  )}
                  {visibleRows.map((r, idx) => (
                    <React.Fragment key={r.employee_id}>
                      <tr className={idx % 2 === 0 ? 'bg-[#1E293B]/40' : ''} data-testid={`payroll-row-${r.employee_id}`}>
                        <td className="p-2"><input type="checkbox" checked={selected.has(r.employee_id)} onChange={() => toggleSelected(r.employee_id)} data-testid={`payroll-check-${r.employee_id}`} className="h-4 w-4 accent-[#5F7151] cursor-pointer" /></td>
                        <td className="p-2 text-[#CBD5E1] font-medium">
                          <button onClick={() => toggleExpanded(r.employee_id)} className="flex items-center gap-1 hover:text-white text-left">
                            {expanded.has(r.employee_id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {r.full_name}
                          </button>
                        </td>
                        <td className="p-2 text-right text-white font-semibold">{r.total_hours}</td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!r.record.is_fixed_salary}
                            onChange={() => handleToggleFixed(r)}
                            disabled={isLocked}
                            data-testid={`payroll-fixed-${r.employee_id}`}
                            title="Stala pensja - wpisz kwote w 'Kwota godzin', stawka liczy sie automatycznie"
                            className={`h-4 w-4 accent-[#5F7151] cursor-pointer ${isLocked ? 'opacity-50' : ''}`}
                          />
                        </td>
                        <td className="p-2 text-right">
                          {r.record.is_fixed_salary ? (
                            <span className="inline-block w-20 text-right text-[#94A3B8] text-sm pr-2" data-testid={`payroll-rate-readonly-${r.employee_id}`}>{(r.computed.rate_effective ?? 0).toFixed(2)}</span>
                          ) : (
                            <NumCell row={r} field="rate" handleNum={handleNum} step="0.5" disabled={isLocked} />
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {r.record.is_fixed_salary ? (
                            <NumCell row={r} field="fixed_salary_amount" handleNum={handleNum} step="100" disabled={isLocked} />
                          ) : (
                            <span className="inline-block text-[#94A3B8]" data-testid={`payroll-hamount-${r.employee_id}`}>{r.computed.hours_amount.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="p-2 text-right"><NumCell row={r} field="advances_hours" handleNum={handleNum} step="0.5" disabled={isLocked} /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="penalties_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="bonus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="driver_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="other_minus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="other_plus_zl" handleNum={handleNum} step="10" disabled={isLocked} /></td>
                        <td className="p-2 text-right text-[#5F7151] font-bold" data-testid={`payroll-payout-${r.employee_id}`}>{r.computed.payout.toFixed(2)} zl</td>
                        <td className="p-2 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            {savingId === r.employee_id && <span className="text-[#E8B76A] text-xs">...</span>}
                            <button
                              onClick={() => openAudit(r)}
                              className="p-1 rounded hover:bg-[#334155] text-[#94A3B8] hover:text-[#5F7151]"
                              title="Historia zmian"
                              data-testid={`payroll-audit-${r.employee_id}`}
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleArchive(r)}
                              disabled={isLocked}
                              className={`p-1 rounded hover:bg-[#334155] text-[#94A3B8] hover:text-[#E8B76A] ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                              title={isLocked ? 'Najpierw odblokuj miesiac' : 'Zarchiwizuj'}
                              data-testid={`payroll-archive-${r.employee_id}`}
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded.has(r.employee_id) && (
                        <tr className="bg-[#0F172A]">
                          <td colSpan={14} className="p-3">
                            <div className="text-xs text-[#94A3B8] mb-2">Rozpiska godzin per budowa:</div>
                            {r.sites_breakdown.length === 0 ? (
                              <div className="text-[#64748B] text-sm">Brak godzin w tym miesiacu</div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {r.sites_breakdown.map((s) => (
                                  <span key={s.site_id || 'none'} className="px-2 py-1 rounded bg-[#1E293B] border border-[#334155] text-sm" data-testid={`payroll-site-${r.employee_id}-${s.site_id||'none'}`}>
                                    <span className="text-[#CBD5E1]">{s.site_name}</span>
                                    <span className="text-[#5F7151] font-bold ml-1">{s.hours} h</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archiwum */}
      <Card className="bg-[#2A384C] border-[#334155]">
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-[#CBD5E1] hover:text-white"
            data-testid="payroll-toggle-archived"
          >
            {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Archive className="h-4 w-4 text-[#E8B76A]" />
            <span className="font-semibold">Archiwum pracownikow ({archived.length})</span>
          </button>
        </CardHeader>
        {showArchived && (
          <CardContent>
            {archived.length === 0 ? (
              <div className="text-[#64748B] text-sm py-2">Brak zarchiwizowanych pracownikow.</div>
            ) : (
              <div className="space-y-2" data-testid="payroll-archived-list">
                {archived.map((emp) => (
                  <div key={emp.id} className="flex items-center justify-between bg-[#1E293B] border border-[#334155] rounded p-3">
                    <div>
                      <div className="text-[#CBD5E1] font-medium">{emp.full_name}</div>
                      <div className="text-xs text-[#64748B]">
                        {emp.phone_number || '(brak telefonu)'}
                        {emp.archived_at && <> &middot; zarchiwizowano {emp.archived_at.slice(0, 10)}</>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => handleUnarchive(emp)}
                        className="border-[#5F7151] text-[#5F7151] hover:bg-[#334155] hover:text-[#5F7151]"
                        data-testid={`payroll-unarchive-${emp.id}`}
                      >
                        <ArchiveRestore className="h-4 w-4 mr-1" /> Przywroc
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleHardDelete(emp)}
                        className="bg-[#9b3a2a] hover:bg-[#7a2d20] text-white"
                        data-testid={`payroll-delete-${emp.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Usun trwale
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Modal: historia zmian audytu */}
      <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
        <DialogContent className="bg-[#2A384C] border-[#334155] text-[#CBD5E1] max-w-2xl" data-testid="payroll-audit-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Historia zmian - {auditFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {auditEntries.length === 0 ? (
              <div className="text-[#64748B] text-sm py-4 text-center">Brak zmian w tym miesiacu.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#1E293B] sticky top-0">
                  <tr>
                    <th className="p-2 text-left text-[#94A3B8]">Data</th>
                    <th className="p-2 text-left text-[#94A3B8]">Pole</th>
                    <th className="p-2 text-right text-[#94A3B8]">Stara</th>
                    <th className="p-2 text-right text-[#94A3B8]">Nowa</th>
                    <th className="p-2 text-left text-[#94A3B8]">Kto</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e.id} className="border-t border-[#334155]">
                      <td className="p-2 text-[#CBD5E1] whitespace-nowrap">{e.changed_at.replace('T', ' ').slice(0, 16)}</td>
                      <td className="p-2 text-[#CBD5E1]">{fieldLabels[e.field] || e.field}</td>
                      <td className="p-2 text-right text-[#94A3B8] line-through">{fmtVal(e.field, e.old_value)}</td>
                      <td className="p-2 text-right text-[#5F7151] font-bold">{fmtVal(e.field, e.new_value)}</td>
                      <td className="p-2 text-[#94A3B8]">{e.changed_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditFor(null)} className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white">
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal: dodaj pracownika */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#2A384C] border-[#334155] text-[#CBD5E1]" data-testid="payroll-add-modal">
          <DialogHeader>
            <DialogTitle className="text-white">Dodaj pracownika</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Imie i nazwisko</label>
              <Input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jan Kowalski"
                className="bg-[#1E293B] border-[#334155] text-white"
                data-testid="payroll-add-name"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-[#94A3B8] block mb-1">Telefon (opcjonalnie)</label>
              <Input
                ref={phoneInputRef}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+48..."
                className="bg-[#1E293B] border-[#334155] text-white"
                data-testid="payroll-add-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] hover:text-white">
              Anuluj
            </Button>
            <Button onClick={handleAdd} className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="payroll-add-submit">
              <UserPlus className="h-4 w-4 mr-1" /> Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const NumCell = ({ row, field, handleNum, step, disabled }) => {
  const initial = row.record[field] || 0;
  return (
    <input
      type="number"
      step={step}
      min="0"
      defaultValue={initial}
      key={`${row.employee_id}-${field}-${initial}`}
      disabled={disabled}
      onBlur={(e) => {
        const v = e.target.value;
        if (parseFloat(v || 0) !== initial) handleNum(row, field, v);
      }}
      className={`w-20 bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-1 text-right text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      data-testid={`payroll-input-${row.employee_id}-${field}`}
    />
  );
};

export default PayrollAdmin;
