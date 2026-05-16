import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { ChevronDown, ChevronRight, ChevronLeft, FileText, Download, Search } from 'lucide-react';
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

  useEffect(() => { fetchData(); }, [fetchData]);

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
          const adv_h = parseFloat(newRec.advances_hours || 0);
          const pen = parseFloat(newRec.penalties_zl || 0);
          const house = parseFloat(newRec.housing_zl || 0);
          const o_minus = parseFloat(newRec.other_minus_zl || 0);
          const bonus = parseFloat(newRec.bonus_zl || 0);
          const driver = parseFloat(newRec.driver_zl || 0);
          const o_plus = parseFloat(newRec.other_plus_zl || 0);
          const hours_amount = +(r.total_hours * rate).toFixed(2);
          const advances_zl = +(adv_h * rate).toFixed(2);
          const payout = +(hours_amount - advances_zl - pen - house - o_minus + bonus + driver + o_plus).toFixed(2);
          return { ...r, record: newRec, computed: { hours_amount, advances_zl, payout } };
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
            <div className="ml-auto flex gap-2">
              <Button onClick={() => downloadPdf(true)} disabled={downloading || selected.size === 0}
                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white" data-testid="payroll-pdf-selected">
                <Download className="h-4 w-4 mr-1" /> PDF wybranych ({selected.size})
              </Button>
              <Button onClick={() => downloadPdf(false)} disabled={downloading}
                variant="outline" className="border-[#5F7151] text-[#5F7151] hover:bg-[#334155] hover:text-[#5F7151]" data-testid="payroll-pdf-all">
                <Download className="h-4 w-4 mr-1" /> PDF wszystkich
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
                      <Checkbox
                        checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.employee_id))}
                        onCheckedChange={toggleSelectAllVisible}
                        data-testid="payroll-select-all"
                      />
                    </th>
                    <th className="p-2 text-left">Pracownik</th>
                    <th className="p-2 text-right">Godziny</th>
                    <th className="p-2 text-right">Stawka zl/h</th>
                    <th className="p-2 text-right">Kwota godzin</th>
                    <th className="p-2 text-right">Zal. (h)</th>
                    <th className="p-2 text-right">Kary zl</th>
                    <th className="p-2 text-right">Mieszk. zl</th>
                    <th className="p-2 text-right">Inne -</th>
                    <th className="p-2 text-right">Dodatki +</th>
                    <th className="p-2 text-right">Kierowca +</th>
                    <th className="p-2 text-right">Inne +</th>
                    <th className="p-2 text-right">Wyplata</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={14} className="p-6 text-center text-[#64748B]">Brak pracownikow</td></tr>
                  )}
                  {visibleRows.map((r, idx) => (
                    <React.Fragment key={r.employee_id}>
                      <tr className={idx % 2 === 0 ? 'bg-[#1E293B]/40' : ''} data-testid={`payroll-row-${r.employee_id}`}>
                        <td className="p-2"><Checkbox checked={selected.has(r.employee_id)} onCheckedChange={() => toggleSelected(r.employee_id)} data-testid={`payroll-check-${r.employee_id}`} /></td>
                        <td className="p-2 text-[#CBD5E1] font-medium">
                          <button onClick={() => toggleExpanded(r.employee_id)} className="flex items-center gap-1 hover:text-white text-left">
                            {expanded.has(r.employee_id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {r.full_name}
                          </button>
                        </td>
                        <td className="p-2 text-right text-white font-semibold">{r.total_hours}</td>
                        <td className="p-2 text-right"><NumCell row={r} field="rate" handleNum={handleNum} step="0.5" /></td>
                        <td className="p-2 text-right text-[#94A3B8]">{r.computed.hours_amount.toFixed(2)}</td>
                        <td className="p-2 text-right"><NumCell row={r} field="advances_hours" handleNum={handleNum} step="0.5" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="penalties_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="housing_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="other_minus_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="bonus_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="driver_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right"><NumCell row={r} field="other_plus_zl" handleNum={handleNum} step="10" /></td>
                        <td className="p-2 text-right text-[#5F7151] font-bold" data-testid={`payroll-payout-${r.employee_id}`}>{r.computed.payout.toFixed(2)} zl</td>
                        <td className="p-2 text-center">{savingId === r.employee_id && <span className="text-[#E8B76A] text-xs">...</span>}</td>
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
    </div>
  );
};

const NumCell = ({ row, field, handleNum, step }) => {
  const initial = row.record[field] || 0;
  return (
    <input
      type="number"
      step={step}
      min="0"
      defaultValue={initial}
      key={`${row.employee_id}-${field}-${initial}`}
      onBlur={(e) => {
        const v = e.target.value;
        if (parseFloat(v || 0) !== initial) handleNum(row, field, v);
      }}
      className="w-20 bg-[#1E293B] border border-[#334155] text-white rounded px-2 py-1 text-right text-sm"
      data-testid={`payroll-input-${row.employee_id}-${field}`}
    />
  );
};

export default PayrollAdmin;
