import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Link2, Copy, Wallet, AlertTriangle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format, getDaysInMonth, getDay, startOfMonth, isToday as isDateToday } from 'date-fns';
import { pl } from 'date-fns/locale';

const SITE_COLORS_HEX = ['#3B4F5C', '#4A5A41', '#5F4A3B', '#5A4F6C', '#6C5A4F', '#4F6C5A'];
const WEEKEND_BG = '#3D2E2E';
const WEEKEND_BORDER = '#6B4444';
const HOLIDAY_BORDER = '#DC2626';

export const HoursTable = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [hourEntries, setHourEntries] = useState({});
  const [hourMeta, setHourMeta] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [editingCell, setEditingCell] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [selectedSiteForAssignment, setSelectedSiteForAssignment] = useState(null);
  const [pendingAssignments, setPendingAssignments] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [showLinks, setShowLinks] = useState(false);
  const [employeeLinks, setEmployeeLinks] = useState([]);
  const [advanceSummary, setAdvanceSummary] = useState({});
  const [showAdvanceModal, setShowAdvanceModal] = useState(null); // employee object
  const [advanceList, setAdvanceList] = useState([]);
  const [newAdvanceAmount, setNewAdvanceAmount] = useState('');
  const [newAdvanceNote, setNewAdvanceNote] = useState('');
  const [carryForwardId, setCarryForwardId] = useState(null);
  const [carryAmount, setCarryAmount] = useState('');
  const [penaltySummary, setPenaltySummary] = useState({});
  const [showPenaltyModal, setShowPenaltyModal] = useState(null);
  const [penaltyList, setPenaltyList] = useState([]);
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyDesc, setNewPenaltyDesc] = useState('');
  const [newPenaltyImage, setNewPenaltyImage] = useState(null);
  const [viewPenaltyImage, setViewPenaltyImage] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkHours, setBulkHours] = useState('');
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [absences, setAbsences] = useState([]);

  const isAdmin = user?.role === 'admin';
  const tableScrollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const monthName = format(selectedMonth, 'MMMM', { locale: pl }).toUpperCase();
      const year = selectedMonth.getFullYear();
      const monthNum = selectedMonth.getMonth() + 1;
      const [employeesRes, sitesRes, assignmentsRes, hoursRes, holidaysRes, advSummaryRes, penSummaryRes, absencesRes] = await Promise.all([
        api.get(`/employees?month=${monthNum}&year=${year}`),
        api.get('/sites'),
        api.get(`/assignments?month=${monthName}&year=${year}`),
        api.get(`/hours?start_date=${format(startOfMonth(selectedMonth), 'yyyy-MM-dd')}&end_date=${format(new Date(year, selectedMonth.getMonth() + 1, 0), 'yyyy-MM-dd')}`),
        api.get(`/holidays?year=${year}`),
        api.get(`/advances/summary?month=${monthNum}&year=${year}`),
        api.get(`/penalties/summary?month=${monthNum}&year=${year}`),
        api.get(`/absences?month=${monthNum}&year=${year}`)
      ]);
      setEmployees(employeesRes.data);
      // Hours table shows ONLY Excel-synced budowy (sites with excel_column).
      // Manual budowy (added in app, not in Excel) and Lokalizacje are filtered out here.
      const onlyExcelBudowy = (sitesRes.data || []).filter((s) => s.excel_column);
      setSites(onlyExcelBudowy);
      setAssignments(assignmentsRes.data);
      setHolidays(holidaysRes.data.holidays || []);
      setAdvanceSummary(advSummaryRes.data);
      setPenaltySummary(penSummaryRes.data);
      setAbsences(absencesRes.data);
      const hoursMap = {};
      const metaMap = {};
      hoursRes.data.forEach(entry => {
        const key = `${entry.employee_id}-${entry.work_date}`;
        hoursMap[key] = entry.hours_worked;
        metaMap[key] = {
          updatedBy: entry.updated_by_name || entry.created_by_name || null,
          updatedAt: entry.updated_at || entry.created_at || null
        };
      });
      setHourEntries(hoursMap);
      setHourMeta(metaMap);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Nie udalo sie pobrac danych');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchData();
  }, [user, navigate, fetchData]);

  // Auto-scroll to yesterday's column when data loads
  useEffect(() => {
    if (!loading && tableScrollRef.current) {
      setTimeout(() => {
        const container = tableScrollRef.current;
        const todayCol = container?.querySelector('[data-today="true"]');
        if (todayCol) {
          const containerRect = container.getBoundingClientRect();
          const colRect = todayCol.getBoundingClientRect();
          // Scroll so yesterday/today is visible near left side, after sticky columns
          const stickyOffset = 120; // approximate width of sticky L.p. + Name columns on mobile
          const scrollTo = container.scrollLeft + (colRect.left - containerRect.left) - stickyOffset - 42;
          container.scrollLeft = Math.max(0, scrollTo);
        }
      }, 300);
    }
  }, [loading]);

  const getSiteColorHex = (siteId) => {
    const idx = sites.findIndex(s => s.id === siteId);
    return idx >= 0 ? SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] : null;
  };

  const getCellAssignment = (employeeId, date) => {
    // Return the LAST (most recent) assignment for this employee/date
    let lastMatch = null;
    for (const a of assignments) {
      if (a.employee_id === employeeId && a.assigned_dates && a.assigned_dates.includes(date)) {
        lastMatch = a;
      }
    }
    return lastMatch;
  };

  const getCellBgColor = (employeeId, date, isWeekend) => {
    const pendingKey = `${employeeId}-${date}`;
    if (pendingAssignments[pendingKey]) {
      return getSiteColorHex(pendingAssignments[pendingKey]);
    }
    const assignment = getCellAssignment(employeeId, date);
    if (assignment) {
      return getSiteColorHex(assignment.site_id);
    }
    if (isWeekend) return WEEKEND_BG;
    return null;
  };

  const isAbsenceDate = (employeeId, dateStr) => {
    return absences.some(a =>
      a.employee_id === employeeId &&
      (a.status === 'pending' || a.status === 'approved') &&
      a.dates && a.dates.includes(dateStr)
    );
  };

  const handleCellClick = (employeeId, date) => {
    if (selectedSiteForAssignment) {
      const key = `${employeeId}-${date}`;
      // Check if cell is already assigned to a site
      const existingAssignment = getCellAssignment(employeeId, date);
      if (existingAssignment && existingAssignment.site_id) {
        // Click on assigned cell = unassign this day
        handleUnassignDay(employeeId, date);
        return;
      }
      setPendingAssignments(prev => {
        const updated = { ...prev };
        if (updated[key] === selectedSiteForAssignment) {
          delete updated[key];
        } else {
          updated[key] = selectedSiteForAssignment;
        }
        return updated;
      });
      return;
    }
    if (!isAdmin) return;
    setEditingCell(`${employeeId}-${date}`);
    setTempValue(hourEntries[`${employeeId}-${date}`] ?? '');
  };

  const handleCellDoubleClick = (employeeId, date) => {
    setEditingCell(`${employeeId}-${date}`);
    setTempValue(hourEntries[`${employeeId}-${date}`] ?? '');
  };

  const handleCellBlur = async (employeeId, date) => {
    const key = `${employeeId}-${date}`;
    const hours = parseFloat(tempValue) || 0;
    const oldHours = hourEntries[key] || 0;
    
    // Skip save if value didn't change
    if (hours === oldHours) {
      setEditingCell(null);
      return;
    }
    
    if (hours < 0 || hours > 14) {
      toast.error('Godziny musza byc miedzy 0 a 14');
      setEditingCell(null);
      return;
    }
    const assignment = getCellAssignment(employeeId, date);
    try {
      await api.post('/hours', {
        employee_id: employeeId,
        site_id: assignment ? assignment.site_id : null,
        work_date: date,
        hours_worked: hours,
        is_absent: hours === 0
      });
      setHourEntries(prev => ({ ...prev, [key]: hours }));
      if (hours === 0) {
        const userName = localStorage.getItem('user_name') || 'Admin';
        setHourMeta(prev => ({ ...prev, [key]: { updatedBy: userName, updatedAt: new Date().toISOString(), deletedBy: userName, deletedAt: new Date().toISOString() } }));
        toast.success('Godziny usuniete');
      } else {
        const userName = localStorage.getItem('user_name') || 'Admin';
        setHourMeta(prev => ({ ...prev, [key]: { updatedBy: userName, updatedAt: new Date().toISOString(), deletedBy: null, deletedAt: null } }));
        toast.success('Godziny zapisane');
      }
    } catch (error) {
      toast.error('Nie udalo sie zapisac godzin');
      setEditingCell(null);
    }
  };

  const handleBulkAssign = async () => {
    const keys = Object.keys(pendingAssignments);
    if (keys.length === 0) { toast.error('Zaznacz komorki do przypisania'); return; }
    const monthName = format(selectedMonth, 'MMMM', { locale: pl }).toUpperCase();
    const year = selectedMonth.getFullYear();
    try {
      const grouped = {};
      keys.forEach(key => {
        const siteId = pendingAssignments[key];
        // Date is always last 10 chars (YYYY-MM-DD), empId is everything before
        const fullDate = key.slice(-10);
        const empId = key.slice(0, key.length - 11);
        const gKey = `${empId}__${siteId}`;
        if (!grouped[gKey]) grouped[gKey] = { empId, siteId, dates: [] };
        grouped[gKey].dates.push(fullDate);
      });
      for (const { empId, siteId, dates } of Object.values(grouped)) {
        await api.post('/assignments', {
          employee_id: empId,
          site_id: siteId,
          month: monthName,
          year: year,
          dates: dates,
          assign_full_month: false
        });
      }
      toast.success(`Przypisano ${keys.length} komorek`);
      setPendingAssignments({});
      fetchData();
    } catch (error) {
      toast.error('Nie udalo sie przypisac');
    }
  };

  const handleSelectFullMonth = (employeeId) => {
    if (!selectedSiteForAssignment) return;
    const allDays = getDays();
    const newPending = { ...pendingAssignments };
    allDays.forEach(d => {
      newPending[`${employeeId}-${d.date}`] = selectedSiteForAssignment;
    });
    setPendingAssignments(newPending);
    toast.success('Zaznaczono caly miesiac');
  };

  const getEmployeesPerSite = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const counts = {};
    const assignedToday = new Set();
    sites.forEach(site => { counts[site.id] = new Set(); });
    // Use getCellAssignment (same logic as cell colors) - last assignment wins
    for (const emp of employees) {
      const assignment = getCellAssignment(emp.id, today);
      if (assignment && assignment.site_id && counts[assignment.site_id]) {
        counts[assignment.site_id].add(emp.id);
        assignedToday.add(emp.id);
      }
    }
    const result = {};
    for (const [siteId, empSet] of Object.entries(counts)) {
      result[siteId] = empSet.size;
    }
    result._unassigned = employees.filter(e => !assignedToday.has(e.id)).length;
    return result;
  };

  const employeesPerSite = getEmployeesPerSite();

  const getEmployeeHoursBySite = (employeeId) => {
    const hoursBySite = {};
    let unassigned = 0;
    sites.forEach(site => { hoursBySite[site.id] = 0; });
    Object.entries(hourEntries).forEach(([key, hours]) => {
      if (!key.startsWith(`${employeeId}-`)) return;
      const date = key.substring(employeeId.length + 1);
      const assignment = getCellAssignment(employeeId, date);
      if (assignment) {
        hoursBySite[assignment.site_id] = (hoursBySite[assignment.site_id] || 0) + (hours || 0);
      } else {
        unassigned += (hours || 0);
      }
    });
    return { hoursBySite, unassigned };
  };

  const toggleBulkEmployee = (employeeId) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleBulkSave = async () => {
    const hours = parseFloat(bulkHours);
    if (isNaN(hours) || hours < 0 || hours > 14) {
      toast.error('Podaj godziny (0-14)');
      return;
    }
    if (bulkSelected.size === 0) {
      toast.error('Zaznacz pracownikow');
      return;
    }
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    setBulkSaving(true);
    let saved = 0;
    let failed = 0;
    for (const empId of bulkSelected) {
      const assignment = getCellAssignment(empId, todayStr);
      if (!assignment) { failed++; continue; }
      try {
        await api.post('/hours', {
          employee_id: empId,
          site_id: assignment.site_id,
          work_date: todayStr,
          hours_worked: hours,
          is_absent: hours === 0
        });
        setHourEntries(prev => ({ ...prev, [`${empId}-${todayStr}`]: hours }));
        saved++;
      } catch { failed++; }
    }
    setBulkSaving(false);
    setBulkMode(false);
    setBulkSelected(new Set());
    setBulkHours('');
    if (saved > 0) toast.success(`Zapisano ${hours}h dla ${saved} pracownikow`);
    if (failed > 0) toast.error(`Nie udalo sie zapisac dla ${failed} pracownikow`);
  };

  const getDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const numDays = getDaysInMonth(selectedMonth);
    const days = [];
    for (let day = 1; day <= numDays; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = getDay(date);
      days.push({
        day,
        date: format(date, 'yyyy-MM-dd'),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isHoliday: holidays.includes(format(date, 'yyyy-MM-dd')),
        isToday: isDateToday(date),
        dayName: format(date, 'EEE', { locale: pl })
      });
    }
    return days;
  };

  const openAdvanceModal = async (employee) => {
    setShowAdvanceModal(employee);
    setNewAdvanceAmount('');
    setNewAdvanceNote('');
    setCarryForwardId(null);
    setCarryAmount('');
    try {
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      const res = await api.get(`/advances?employee_id=${employee.id}&month=${monthNum}&year=${year}`);
      setAdvanceList(res.data);
    } catch (err) {
      toast.error('Nie udalo sie pobrac zaliczek');
    }
  };

  const handleAddAdvance = async () => {
    if (!newAdvanceAmount || parseFloat(newAdvanceAmount) <= 0) {
      toast.error('Wpisz prawidlowa kwote');
      return;
    }
    try {
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      await api.post('/advances', {
        employee_id: showAdvanceModal.id,
        amount: parseFloat(newAdvanceAmount),
        month: monthNum,
        year: year,
        note: newAdvanceNote || null
      });
      toast.success('Zaliczka dodana');
      setNewAdvanceAmount('');
      setNewAdvanceNote('');
      // Refresh advance list and summary
      const res = await api.get(`/advances?employee_id=${showAdvanceModal.id}&month=${monthNum}&year=${year}`);
      setAdvanceList(res.data);
      const summaryRes = await api.get(`/advances/summary?month=${monthNum}&year=${year}`);
      setAdvanceSummary(summaryRes.data);
    } catch (err) {
      toast.error('Nie udalo sie dodac zaliczki');
    }
  };

  const handleDeleteAdvance = async (advanceId) => {
    try {
      await api.delete(`/advances/${advanceId}`);
      toast.success('Zaliczka usunieta');
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      const res = await api.get(`/advances?employee_id=${showAdvanceModal.id}&month=${monthNum}&year=${year}`);
      setAdvanceList(res.data);
      const summaryRes = await api.get(`/advances/summary?month=${monthNum}&year=${year}`);
      setAdvanceSummary(summaryRes.data);
    } catch (err) {
      toast.error('Nie udalo sie usunac zaliczki');
    }
  };

  const handleCarryForward = async (advanceId) => {
    if (!carryAmount || parseFloat(carryAmount) <= 0) {
      toast.error('Wpisz prawidlowa kwote');
      return;
    }
    try {
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      let targetMonth = monthNum + 1;
      let targetYear = year;
      if (targetMonth > 12) { targetMonth = 1; targetYear++; }
      
      await api.post(`/advances/${advanceId}/carry-forward`, {
        amount: parseFloat(carryAmount),
        target_month: targetMonth,
        target_year: targetYear
      });
      toast.success('Zaliczka przeniesiona na nastepny miesiac');
      setCarryForwardId(null);
      setCarryAmount('');
      const res = await api.get(`/advances?employee_id=${showAdvanceModal.id}&month=${monthNum}&year=${year}`);
      setAdvanceList(res.data);
      const summaryRes = await api.get(`/advances/summary?month=${monthNum}&year=${year}`);
      setAdvanceSummary(summaryRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad przenoszenia zaliczki');
    }
  };

  const handleUnassign = async (employeeId, employeeName) => {
    if (!window.confirm(`Czy na pewno chcesz odpisać ${employeeName} od wszystkich budów w tym miesiącu?`)) return;
    try {
      const monthName = format(selectedMonth, 'LLLL', { locale: pl }).toUpperCase();
      const year = selectedMonth.getFullYear();
      await api.delete(`/assignments/unassign?employee_id=${employeeId}&month=${monthName}&year=${year}`);
      toast.success(`${employeeName} odpisany od budów`);
      fetchData();
    } catch (err) {
      toast.error('Błąd odpisywania');
    }
  };

  const handleUnassignDay = async (employeeId, date) => {
    try {
      const monthName = format(selectedMonth, 'LLLL', { locale: pl }).toUpperCase();
      const year = selectedMonth.getFullYear();
      await api.delete(`/assignments/unassign?employee_id=${employeeId}&month=${monthName}&year=${year}&date=${date}`);
      toast.success('Odpisano dzień');
      fetchData();
    } catch (err) {
      toast.error('Błąd odpisywania');
    }
  };

  const openPenaltyModal = async (employee) => {
    setShowPenaltyModal(employee);
    setNewPenaltyAmount('');
    setNewPenaltyDesc('');
    setNewPenaltyImage(null);
    setViewPenaltyImage(null);
    try {
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      const res = await api.get(`/penalties?employee_id=${employee.id}&month=${monthNum}&year=${year}`);
      setPenaltyList(res.data);
    } catch (err) {
      toast.error('Nie udalo sie pobrac kar');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Zdjecie max 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setNewPenaltyImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAddPenalty = async () => {
    if (!newPenaltyAmount || parseFloat(newPenaltyAmount) <= 0) {
      toast.error('Wpisz prawidlowa kwote');
      return;
    }
    try {
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      await api.post('/penalties', {
        employee_id: showPenaltyModal.id,
        amount: parseFloat(newPenaltyAmount),
        month: monthNum,
        year: year,
        description: newPenaltyDesc || null,
        image_data: newPenaltyImage || null
      });
      toast.success('Kara dodana');
      setNewPenaltyAmount('');
      setNewPenaltyDesc('');
      setNewPenaltyImage(null);
      const res = await api.get(`/penalties?employee_id=${showPenaltyModal.id}&month=${monthNum}&year=${year}`);
      setPenaltyList(res.data);
      const summaryRes = await api.get(`/penalties/summary?month=${monthNum}&year=${year}`);
      setPenaltySummary(summaryRes.data);
    } catch (err) {
      toast.error('Nie udalo sie dodac kary');
    }
  };

  const handleDeletePenalty = async (penaltyId) => {
    try {
      await api.delete(`/penalties/${penaltyId}`);
      toast.success('Kara usunieta');
      const monthNum = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();
      const res = await api.get(`/penalties?employee_id=${showPenaltyModal.id}&month=${monthNum}&year=${year}`);
      setPenaltyList(res.data);
      const summaryRes = await api.get(`/penalties/summary?month=${monthNum}&year=${year}`);
      setPenaltySummary(summaryRes.data);
    } catch (err) {
      toast.error('Nie udalo sie usunac kary');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151]" />
        <p className="mt-4 text-[#CBD5E1]">Wczytywanie...</p>
      </div>
    );
  }

  const days = getDays();
  const filteredEmployees = isAdmin ? employees : employees;
  const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: pl });
  const pendingCount = Object.keys(pendingAssignments).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#1E293B]">
      {/* Header */}
      <div className="bg-[#2A384C] text-white shadow-lg shrink-0">
        <div className="max-w-full mx-auto p-4 flex items-center gap-4">
          <Button
            onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/worker/dashboard')}
            variant="ghost"
            className="text-white hover:bg-[#334155]"
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Button onClick={() => setSelectedMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })} variant="ghost" size="sm" className="text-white hover:bg-[#334155] p-1" data-testid="prev-month">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl sm:text-2xl font-bold capitalize">{monthLabel}</h1>
              <Button onClick={() => setSelectedMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })} variant="ghost" size="sm" className="text-white hover:bg-[#334155] p-1" data-testid="next-month">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-[#94A3B8] text-sm">
              {isAdmin ? 'Widok administratora' : 'Twoja budowa'}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={async () => {
                try {
                  const res = await api.post('/employees/generate-all-links');
                  setEmployeeLinks(res.data);
                  setShowLinks(true);
                  toast.success('Linki wygenerowane');
                } catch (err) {
                  toast.error('Nie udalo sie wygenerowac linkow');
                }
              }}
              size="sm"
              className="bg-[#334155] text-[#CBD5E1] hover:bg-[#5F7151] hover:text-white"
              data-testid="generate-links-btn"
            >
              <Link2 className="h-4 w-4 mr-1" />
              Linki pracownikow
            </Button>
          )}
          {selectedSiteForAssignment && (
            <span></span>
          )}
        </div>
      </div>

      <div className="shrink-0 p-4 pb-0 overflow-x-auto">
        {/* Assignment mode selector */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-[#2A384C] rounded-lg border border-[#334155] flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#94A3B8] mr-2">Tryb:</span>
            <Button
              onClick={() => { setSelectedSiteForAssignment(null); setPendingAssignments({}); }}
              size="sm"
              className={!selectedSiteForAssignment
                ? 'bg-[#5F7151] text-white'
                : 'bg-[#334155] text-[#CBD5E1] hover:bg-[#3D4F63]'
              }
              data-testid="mode-edit-hours"
            >
              Edycja godzin
            </Button>
            {sites.map((site, idx) => {
              const color = SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length];
              const isActive = selectedSiteForAssignment === site.id;
              return (
                <Button
                  key={site.id}
                  onClick={() => { setSelectedSiteForAssignment(site.id); setPendingAssignments({}); }}
                  size="sm"
                  style={isActive ? { backgroundColor: color, color: '#fff' } : {}}
                  className={!isActive
                    ? 'bg-[#334155] text-[#CBD5E1] hover:bg-[#3D4F63]'
                    : ''
                  }
                  data-testid={`assign-site-${site.id}`}
                >
                  <span className="inline-block w-3 h-3 rounded-sm mr-1.5" style={{ backgroundColor: color }} />
                  {site.name}
                  <span className="ml-1.5 bg-black/30 text-xs px-1.5 py-0.5 rounded-full font-medium" data-testid={`site-count-${site.id}`}>
                    <Users className="inline h-3 w-3 mr-0.5" />{employeesPerSite[site.id] || 0}
                  </span>
                </Button>
              );
            })}
            {employeesPerSite._unassigned > 0 && (
              <span className="text-xs text-[#E8836A] bg-[#4A2020] px-2 py-1 rounded-full font-medium">
                <Users className="inline h-3 w-3 mr-0.5" />Nieprzypisani: {employeesPerSite._unassigned}
              </span>
            )}
          </div>
        )}

        {/* Assignment action buttons - visible on mobile */}
        {selectedSiteForAssignment && (
          <div className="mb-4 p-3 bg-[#0F172A] rounded-lg border-2 border-[#5F7151] flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#94A3B8]">Zaznaczono: {pendingCount}</span>
            <Button
              onClick={handleBulkAssign}
              disabled={pendingCount === 0}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
              size="sm"
              data-testid="bulk-assign-btn"
            >
              Przypisz ({pendingCount})
            </Button>
            <Button
              onClick={() => {
                employees.forEach(emp => handleSelectFullMonth(emp.id));
              }}
              size="sm"
              className="bg-[#334155] text-[#CBD5E1] hover:bg-[#5F7151] hover:text-white border border-[#5F7151]"
              data-testid="full-month-all-btn"
            >
              Caly miesiac (wszyscy)
            </Button>
            <Button
              onClick={() => { setPendingAssignments({}); setSelectedSiteForAssignment(null); }}
              variant="outline"
              size="sm"
              className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
              data-testid="cancel-assign-btn"
            >
              Anuluj
            </Button>
          </div>
        )}

        {/* Bulk mode bar */}
        <div className="mb-4 p-3 bg-[#2A384C] rounded-lg border border-[#334155]">
          {!bulkMode ? (
            <Button
              onClick={() => setBulkMode(true)}
              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white gap-2"
              data-testid="bulk-mode-btn"
            >
              <Users className="h-4 w-4" />
              Szybkie wpisywanie godzin (dzis)
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[#CBD5E1] font-semibold text-sm">Godziny:</span>
                <Input
                  type="number"
                  min="0"
                  max="14"
                  value={bulkHours}
                  onChange={(e) => setBulkHours(e.target.value)}
                  placeholder="np. 10"
                  className="w-24 bg-[#1E293B] border-[#5F7151] text-white text-center h-10"
                  data-testid="bulk-hours-input"
                  autoFocus
                />
                <span className="text-[#94A3B8] text-sm">Zaznacz pracownikow ponizej:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {employees.map(emp => {
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  const hasAssignment = !!getCellAssignment(emp.id, todayStr);
                  if (!hasAssignment) return null;
                  const isSelected = bulkSelected.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleBulkEmployee(emp.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-[#5F7151] text-white ring-2 ring-[#6B8E4E]'
                          : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155]'
                      }`}
                      data-testid={`bulk-emp-${emp.id}`}
                    >
                      {emp.full_name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || !bulkHours || bulkSelected.size === 0}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white gap-2"
                  data-testid="bulk-save-btn"
                >
                  {bulkSaving ? 'Zapisywanie...' : `Zapisz ${bulkHours || '?'}h dla ${bulkSelected.size} os.`}
                </Button>
                <Button
                  onClick={() => { setBulkMode(false); setBulkSelected(new Set()); setBulkHours(''); }}
                  variant="outline"
                  className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                  data-testid="bulk-cancel-btn"
                >
                  Anuluj
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4">
        <Card className="bg-[#2A384C] border-[#334155] h-full flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-[#5F7151]" />
              Godziny pracy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            <div className="overflow-auto h-full" ref={tableScrollRef}>
              <table className="w-full text-sm border-collapse" data-testid="hours-table">
                <thead className="sticky top-0 z-30" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                  <tr className="bg-[#1E293B]">
                    <th className="border border-[#334155] p-1 text-center text-[#94A3B8] min-w-[35px] sticky left-0 z-40 bg-[#1E293B]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      L.p.
                    </th>
                    <th className="border border-[#334155] p-1 sm:p-2 text-left text-[#CBD5E1] min-w-[90px] sm:min-w-[140px] max-w-[100px] sm:max-w-none sticky left-[35px] z-40 bg-[#1E293B]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      Pracownik
                    </th>
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] min-w-[100px] bg-[#1E293B]">
                      Telefon
                    </th>
                    {isAdmin && (
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[90px] bg-[#1E293B]">
                        Zaliczki
                      </th>
                    )}
                    {isAdmin && (
                      <th className="border border-[#334155] p-2 text-center text-[#CBD5E1] min-w-[90px] bg-[#1E293B]">
                        Kary
                      </th>
                    )}
                    {days.map(d => {
                      const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#334155';
                      const borderWidth = d.isToday ? '2px' : d.isHoliday ? '3px' : '1px';
                      return (
                      <th
                        key={d.day}
                        className="p-1 text-center min-w-[42px] relative"
                        data-today={d.isToday ? 'true' : undefined}
                        style={{
                          backgroundColor: d.isWeekend || d.isHoliday ? WEEKEND_BG : '#1E293B',
                          borderLeft: `${borderWidth} solid ${borderColor}`,
                          borderRight: `${borderWidth} solid ${borderColor}`,
                          borderTop: `${borderWidth} solid ${borderColor}`,
                          borderBottom: `${borderWidth} solid ${borderColor}`,
                        }}
                      >
                        <div className="text-[#CBD5E1] font-bold text-xs">{d.day}</div>
                        <div className={`text-[10px] ${d.isWeekend || d.isHoliday ? 'text-[#E8836A]' : 'text-[#94A3B8]'}`}>
                          {d.dayName}
                        </div>
                      </th>
                      );
                    })}
                    {sites.map((site, idx) => (
                      <th
                        key={`sh-${site.id}`}
                        className="border border-[#334155] p-1 text-center min-w-[60px]"
                        style={{ backgroundColor: SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] + '55' }}
                      >
                        <div className="text-[#CBD5E1] text-[10px] font-semibold leading-tight">{site.name}</div>
                      </th>
                    ))}
                    <th className="border border-[#334155] p-1 text-center min-w-[60px] bg-[#1E293B]">
                      <div className="text-[#94A3B8] text-[10px] font-semibold">Nieprzy-<br/>pisane</div>
                    </th>
                    <th className="border border-[#334155] p-2 text-center text-[#5F7151] font-bold min-w-[60px] bg-[#1E293B]">
                      SUMA
                    </th>
                  </tr>
                  {/* Sum row under headers */}
                  <tr className="bg-[#0F172A]">
                    <td className="border border-[#334155] p-0 bg-[#0F172A] sticky left-0 z-40" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}></td>
                    <td className="border border-[#334155] p-1 bg-[#0F172A] sticky left-[35px] z-40 text-[#5F7151] font-bold text-[10px]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>SUMA</td>
                    <td className="border border-[#334155] p-0 bg-[#0F172A]"></td>
                    {isAdmin && <td className="border border-[#334155] p-0 bg-[#0F172A]"></td>}
                    {isAdmin && <td className="border border-[#334155] p-0 bg-[#0F172A]"></td>}
                    {days.map(d => {
                      const dayTotal = filteredEmployees.reduce((sum, emp) => sum + (hourEntries[`${emp.id}-${d.date}`] || 0), 0);
                      return (
                        <td key={`dsum-${d.day}`} className="border border-[#334155] p-0 text-center bg-[#0F172A]">
                          <span className="text-[#5F7151] text-[10px] font-bold">{dayTotal || ''}</span>
                        </td>
                      );
                    })}
                    {sites.map((site, idx) => {
                      const siteTotal = filteredEmployees.reduce((sum, emp) => {
                        const { hoursBySite } = getEmployeeHoursBySite(emp.id);
                        return sum + (hoursBySite[site.id] || 0);
                      }, 0);
                      return (
                        <td key={`ssum-${site.id}`} className="border border-[#334155] p-1 text-center" style={{ backgroundColor: SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] + '55' }}>
                          <span className="text-white font-bold text-xs">{siteTotal}</span>
                        </td>
                      );
                    })}
                    <td className="border border-[#334155] p-1 text-center bg-[#0F172A]">
                      <span className="text-[#E8836A] font-bold text-xs">{filteredEmployees.reduce((sum, emp) => sum + getEmployeeHoursBySite(emp.id).unassigned, 0)}</span>
                    </td>
                    <td className="border border-[#334155] p-1 text-center bg-[#0F172A]">
                      <span className="text-[#5F7151] font-bold text-xs">{filteredEmployees.reduce((sum, emp) => { const { hoursBySite, unassigned } = getEmployeeHoursBySite(emp.id); return sum + Object.values(hoursBySite).reduce((s, h) => s + h, 0) + unassigned; }, 0)}</span>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(employee => {
                    const { hoursBySite, unassigned } = getEmployeeHoursBySite(employee.id);
                    const totalHours = Object.values(hoursBySite).reduce((s, h) => s + h, 0) + unassigned;

                    return (
                      <tr key={employee.id} className="border-b border-[#334155]">
                        {/* Row number */}
                        <td className="border border-[#334155] p-1 text-center text-[#94A3B8] text-xs font-medium bg-[#1E293B] sticky left-0 z-[15]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                          {filteredEmployees.indexOf(employee) + 1}
                        </td>
                        {/* Name - always neutral dark bg, no site color */}
                        <td className="border border-[#334155] p-1 sm:p-2 text-[#CBD5E1] font-medium bg-[#1E293B] sticky left-[35px] z-[15] max-w-[100px] sm:max-w-none" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }} data-testid={`emp-name-${employee.id}`}>
                          <div className="flex items-center gap-1 sm:gap-2">
                            <span className="truncate text-xs sm:text-sm">{employee.full_name}</span>
                            {selectedSiteForAssignment && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSelectFullMonth(employee.id); }}
                                className="shrink-0 text-[10px] px-2 py-1 rounded font-semibold bg-[#334155] text-[#CBD5E1] hover:bg-[#5F7151] hover:text-white transition-colors whitespace-nowrap border border-[#5F7151]/50"
                                data-testid={`full-month-${employee.id}`}
                              >
                                Caly m-c
                              </button>
                            )}
                            {isAdmin && selectedSiteForAssignment && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUnassign(employee.id, employee.full_name); }}
                                className="shrink-0 text-[10px] px-1.5 py-1 rounded font-semibold bg-[#4A2020] text-red-400 hover:bg-red-800 hover:text-white transition-colors whitespace-nowrap border border-red-800/50"
                                data-testid={`unassign-${employee.id}`}
                              >
                                Odpisz
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="border border-[#334155] p-2 text-[#94A3B8] text-xs bg-[#1E293B]">
                          {employee.phone_number || '-'}
                        </td>
                        {isAdmin && (
                          <td
                            className="border border-[#334155] p-2 text-center bg-[#1E293B] cursor-pointer hover:bg-[#334155] transition-colors"
                            onClick={() => openAdvanceModal(employee)}
                            data-testid={`advance-cell-${employee.id}`}
                          >
                            {advanceSummary[employee.id] ? (
                              <span className="text-[#E8836A] font-bold text-sm">
                                {advanceSummary[employee.id]} zl
                              </span>
                            ) : (
                              <span className="text-[#4A5568] text-xs">-</span>
                            )}
                          </td>
                        )}
                        {isAdmin && (
                          <td
                            className="border border-[#334155] p-2 text-center bg-[#1E293B] cursor-pointer hover:bg-[#334155] transition-colors"
                            onClick={() => openPenaltyModal(employee)}
                            data-testid={`penalty-cell-${employee.id}`}
                          >
                            {penaltySummary[employee.id] ? (
                              <span className="text-[#DC2626] font-bold text-sm">
                                {penaltySummary[employee.id]} zl
                              </span>
                            ) : (
                              <span className="text-[#4A5568] text-xs">-</span>
                            )}
                          </td>
                        )}
                        {days.map(d => {
                          const cellKey = `${employee.id}-${d.date}`;
                          const hours = hourEntries[cellKey];
                          const meta = hourMeta[cellKey];
                          const isEditing = editingCell === cellKey;
                          const bgColor = getCellBgColor(employee.id, d.date, d.isWeekend || d.isHoliday);
                          const isPending = !!pendingAssignments[cellKey];
                          const isHovered = hoveredCell === cellKey;
                          const hasAbsence = isAbsenceDate(employee.id, d.date);
                          const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#334155';
                          const borderWidth = d.isToday ? '2px' : d.isHoliday ? '3px' : '1px';

                          // Check if past working day with no hours
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const cellDate = new Date(d.date + 'T00:00:00');
                          const isPast = cellDate < today;
                          const isWorkDay = !d.isWeekend && !d.isHoliday;
                          const noHours = !hours || hours === 0;
                          const showNN = isPast && isWorkDay && noHours && !hasAbsence;
                          const showNU = isWorkDay && noHours && hasAbsence;

                          const cellBg = showNN ? '#4A2020' : showNU ? '#7F1D1D' : hasAbsence ? '#7F1D1D' : (bgColor || '#2A384C');

                          return (
                            <td
                              key={d.day}
                              className={`p-0 text-center cursor-pointer transition-colors relative ${isPending ? 'ring-2 ring-white/30 ring-inset' : ''}`}
                              style={{
                                backgroundColor: cellBg,
                                borderLeft: `${borderWidth} solid ${borderColor}`,
                                borderRight: `${borderWidth} solid ${borderColor}`,
                                borderTop: `${borderWidth} solid ${borderColor}`,
                                borderBottom: `${borderWidth} solid ${borderColor}`,
                              }}
                              onClick={() => handleCellClick(employee.id, d.date)}
                              onDoubleClick={() => handleCellDoubleClick(employee.id, d.date)}
                              onMouseEnter={() => meta && hours && hours !== 0 && setHoveredCell(cellKey)}
                              onMouseLeave={() => setHoveredCell(null)}
                              data-testid={`cell-${employee.id}-${d.day}`}
                              title={showNN ? 'Nieobecność nieusprawiedliwiona' : showNU ? 'Nieobecność usprawiedliwiona' : hasAbsence ? 'Nieobecność zgłoszona' : undefined}
                            >
                              {isEditing ? (
                                <Input
                                  type="number"
                                  min="0"
                                  max="14"
                                  value={tempValue}
                                  onChange={(e) => setTempValue(e.target.value)}
                                  onBlur={() => handleCellBlur(employee.id, d.date)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCellBlur(employee.id, d.date);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  autoFocus
                                  className="w-full h-8 text-center bg-[#0F172A] text-white border-[#5F7151] text-sm p-0 rounded-none"
                                  data-testid={`input-${employee.id}-${d.day}`}
                                />
                              ) : showNN ? (
                                <span className="text-red-400 text-[10px] font-bold block py-1.5">NN</span>
                              ) : showNU ? (
                                <span className="text-[#FCA5A5] text-[10px] font-bold block py-1.5">NU</span>
                              ) : (
                                <span className="text-white text-xs font-medium block py-1.5">
                                  {hours !== undefined && hours !== null && hours !== '' && hours !== 0 ? hours : <span className="text-[#4A5568]">-</span>}
                                </span>
                              )}
                              {isHovered && meta && meta.updatedBy && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#0F172A] text-[#CBD5E1] text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-lg border border-[#334155] pointer-events-none">
                                  {(!hours || hours === 0) && meta.deletedBy ? (
                                    <>Usunieto: {meta.deletedBy}<br/>{meta.deletedAt && new Date(meta.deletedAt).toLocaleString('pl-PL')}</>
                                  ) : (
                                    <>Wpisal: {meta.updatedBy}{meta.updatedAt && <><br/>{new Date(meta.updatedAt).toLocaleString('pl-PL')}</>}</>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {/* Per-site totals */}
                        {sites.map((site, idx) => (
                          <td
                            key={`t-${employee.id}-${site.id}`}
                            className="border border-[#334155] p-1 text-center"
                            style={{ backgroundColor: SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] + '33' }}
                          >
                            <span className="text-[#CBD5E1] font-semibold text-sm">
                              {hoursBySite[site.id] || 0}
                            </span>
                          </td>
                        ))}
                        {/* Unassigned */}
                        <td className="border border-[#334155] p-1 text-center bg-[#1E293B]">
                          <span className={`font-semibold text-sm ${unassigned > 0 ? 'text-[#E8836A]' : 'text-[#64748B]'}`}>
                            {unassigned}
                          </span>
                        </td>
                        {/* Total */}
                        <td className="border border-[#334155] p-1 text-center bg-[#1E293B]">
                          <span className="text-[#5F7151] font-bold text-base">{totalHours}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="p-4 border-t border-[#334155] shrink-0">
              <p className="text-xs font-semibold mb-2 text-[#CBD5E1]">Legenda:</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: WEEKEND_BG }} />
                  <span className="text-[#94A3B8]">Sobota/Niedziela</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm border-2 border-[#DC2626]" />
                  <span className="text-[#94A3B8]">Swieto ustawowe</span>
                </div>
                {sites.map((site, idx) => (
                  <div key={site.id} className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] }} />
                    <span className="text-[#94A3B8]">{site.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#64748B] mt-2">
                Najedz na komorke z godzinami aby zobaczyc kto je wpisal | Kliknij komorke aby edytowac
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Links Modal */}
      {showLinks && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowLinks(false)}>
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <Link2 className="h-5 w-5 text-[#5F7151]" />
                Linki z godzinami dla pracownikow
              </CardTitle>
              <p className="text-xs text-[#94A3B8]">Skopiuj link i wyslij pracownikowi przez Viber/WhatsApp</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {employeeLinks.map(link => {
                const fullUrl = `${window.location.origin}/hours/${link.token}`;
                return (
                  <div key={link.employee_id} className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[#CBD5E1] font-semibold">{link.full_name}</span>
                      <span className="text-[#64748B] text-xs">{link.phone_number || 'brak tel.'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={fullUrl}
                        className="flex-1 bg-[#0F172A] text-[#94A3B8] text-xs rounded px-2 py-1.5 border border-[#334155]"
                        data-testid={`link-${link.employee_id}`}
                      />
                      <Button
                        onClick={() => { navigator.clipboard.writeText(fullUrl); toast.success(`Link skopiowany: ${link.full_name}`); }}
                        size="sm"
                        className="bg-[#5F7151] hover:bg-[#4A5A41] text-white shrink-0"
                        data-testid={`copy-link-${link.employee_id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button onClick={() => setShowLinks(false)} className="w-full bg-[#334155] text-[#CBD5E1] hover:bg-[#3D4F63]">
                Zamknij
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Advance (Zaliczki) Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdvanceModal(null)}>
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-3">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <Wallet className="h-5 w-5 text-[#E8836A]" />
                Zaliczki: {showAdvanceModal.full_name}
              </CardTitle>
              <p className="text-xs text-[#94A3B8]">
                {format(selectedMonth, 'LLLL yyyy', { locale: pl })}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Total */}
              <div className="p-3 bg-[#1E293B] rounded-lg border border-[#334155] flex items-center justify-between">
                <span className="text-[#94A3B8] text-sm">Suma zaliczek:</span>
                <span className="text-[#E8836A] font-bold text-xl" data-testid="advance-total">
                  {advanceList.reduce((s, a) => s + a.amount, 0)} zl
                </span>
              </div>

              {/* Advance list */}
              {advanceList.length > 0 ? (
                <div className="space-y-2">
                  {advanceList.map(adv => (
                    <div key={adv.id} className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#CBD5E1] font-bold text-lg">{adv.amount} zl</span>
                        <span className="text-[#64748B] text-[10px]">
                          {adv.created_at ? new Date(adv.created_at).toLocaleString('pl-PL') : ''}
                        </span>
                      </div>
                      {adv.note && (
                        <p className="text-[#94A3B8] text-xs mb-2">{adv.note}</p>
                      )}
                      {adv.carried_from_month && (
                        <p className="text-[#6B8E4E] text-[10px] mb-2">
                          Przeniesione z {adv.carried_from_month}/{adv.carried_from_year}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {carryForwardId === adv.id ? (
                          <div className="flex gap-1 flex-1">
                            <Input
                              type="number"
                              min="0"
                              max={adv.amount}
                              value={carryAmount}
                              onChange={e => setCarryAmount(e.target.value)}
                              placeholder="Kwota"
                              className="bg-[#0F172A] text-white border-[#334155] text-xs h-7 flex-1"
                              data-testid="carry-amount-input"
                            />
                            <Button
                              onClick={() => handleCarryForward(adv.id)}
                              size="sm"
                              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white h-7 text-xs px-2"
                              data-testid="carry-confirm-btn"
                            >
                              OK
                            </Button>
                            <Button
                              onClick={() => { setCarryForwardId(null); setCarryAmount(''); }}
                              size="sm"
                              variant="outline"
                              className="border-[#334155] text-[#94A3B8] h-7 text-xs px-2"
                            >
                              X
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              onClick={() => { setCarryForwardId(adv.id); setCarryAmount(String(adv.amount)); }}
                              size="sm"
                              variant="outline"
                              className="border-[#334155] text-[#94A3B8] hover:text-[#CBD5E1] h-7 text-[10px] px-2"
                              data-testid={`carry-btn-${adv.id}`}
                            >
                              Przenies
                            </Button>
                            <Button
                              onClick={() => handleDeleteAdvance(adv.id)}
                              size="sm"
                              variant="outline"
                              className="border-[#6B4444] text-[#E8836A] hover:bg-[#6B4444] h-7 text-[10px] px-2"
                              data-testid={`delete-advance-${adv.id}`}
                            >
                              Usun
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#64748B] text-sm text-center py-4">Brak zaliczek w tym miesiacu</p>
              )}

              {/* Add new advance */}
              <div className="p-3 bg-[#0F172A] rounded-lg border border-[#5F7151]/30">
                <p className="text-[#CBD5E1] text-xs font-semibold mb-2">Dodaj nowa zaliczke</p>
                <div className="flex gap-2 mb-2">
                  <Input
                    type="number"
                    min="0"
                    value={newAdvanceAmount}
                    onChange={e => setNewAdvanceAmount(e.target.value)}
                    placeholder="Kwota (zl)"
                    className="bg-[#1E293B] text-white border-[#334155] text-sm flex-1"
                    data-testid="new-advance-amount"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newAdvanceNote}
                    onChange={e => setNewAdvanceNote(e.target.value)}
                    placeholder="Notatka (opcjonalnie)"
                    className="bg-[#1E293B] text-white border-[#334155] text-sm flex-1"
                    data-testid="new-advance-note"
                  />
                  <Button
                    onClick={handleAddAdvance}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white shrink-0"
                    data-testid="add-advance-btn"
                  >
                    Dodaj
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => setShowAdvanceModal(null)}
                className="w-full bg-[#334155] text-[#CBD5E1] hover:bg-[#3D4F63]"
              >
                Zamknij
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Penalty (Kary) Modal */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowPenaltyModal(null)}>
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-3">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#DC2626]" />
                Kary: {showPenaltyModal.full_name}
              </CardTitle>
              <p className="text-xs text-[#94A3B8]">
                {format(selectedMonth, 'LLLL yyyy', { locale: pl })}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-[#1E293B] rounded-lg border border-[#334155] flex items-center justify-between">
                <span className="text-[#94A3B8] text-sm">Suma kar:</span>
                <span className="text-[#DC2626] font-bold text-xl" data-testid="penalty-total">
                  {penaltyList.reduce((s, p) => s + p.amount, 0)} zl
                </span>
              </div>

              {penaltyList.length > 0 ? (
                <div className="space-y-2">
                  {penaltyList.map(pen => (
                    <div key={pen.id} className="p-3 bg-[#1E293B] rounded-lg border border-[#334155]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#DC2626] font-bold text-lg">{pen.amount} zl</span>
                        <span className="text-[#64748B] text-[10px]">
                          {pen.created_at ? new Date(pen.created_at).toLocaleString('pl-PL') : ''}
                        </span>
                      </div>
                      {pen.description && (
                        <p className="text-[#94A3B8] text-xs mb-2">{pen.description}</p>
                      )}
                      {pen.image_data && (
                        <img
                          src={pen.image_data}
                          alt="Zdjecie kary"
                          className="w-full max-h-40 object-cover rounded cursor-pointer mb-2 border border-[#334155]"
                          onClick={() => setViewPenaltyImage(pen.image_data)}
                          data-testid={`penalty-image-${pen.id}`}
                        />
                      )}
                      <Button
                        onClick={() => handleDeletePenalty(pen.id)}
                        size="sm"
                        variant="outline"
                        className="border-[#6B4444] text-[#DC2626] hover:bg-[#6B4444] h-7 text-[10px] px-2"
                        data-testid={`delete-penalty-${pen.id}`}
                      >
                        Usun
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#64748B] text-sm text-center py-4">Brak kar w tym miesiacu</p>
              )}

              <div className="p-3 bg-[#0F172A] rounded-lg border border-[#DC2626]/20">
                <p className="text-[#CBD5E1] text-xs font-semibold mb-2">Dodaj nowa kare</p>
                <div className="flex gap-2 mb-2">
                  <Input
                    type="number"
                    min="0"
                    value={newPenaltyAmount}
                    onChange={e => setNewPenaltyAmount(e.target.value)}
                    placeholder="Kwota (zl)"
                    className="bg-[#1E293B] text-white border-[#334155] text-sm flex-1"
                    data-testid="new-penalty-amount"
                  />
                </div>
                <Input
                  value={newPenaltyDesc}
                  onChange={e => setNewPenaltyDesc(e.target.value)}
                  placeholder="Opis kary"
                  className="bg-[#1E293B] text-white border-[#334155] text-sm mb-2"
                  data-testid="new-penalty-desc"
                />
                <div className="flex gap-2 items-center mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-[#94A3B8] text-xs bg-[#1E293B] border border-[#334155] rounded px-3 py-2 hover:bg-[#334155]">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      data-testid="penalty-image-upload"
                    />
                    {newPenaltyImage ? 'Zdjecie dodane' : 'Dodaj zdjecie'}
                  </label>
                  {newPenaltyImage && (
                    <img src={newPenaltyImage} alt="Preview" className="h-10 w-10 rounded object-cover border border-[#334155]" />
                  )}
                </div>
                <Button
                  onClick={handleAddPenalty}
                  className="w-full bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  data-testid="add-penalty-btn"
                >
                  Dodaj kare
                </Button>
              </div>

              <Button
                onClick={() => setShowPenaltyModal(null)}
                className="w-full bg-[#334155] text-[#CBD5E1] hover:bg-[#3D4F63]"
              >
                Zamknij
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Full-size penalty image viewer */}
      {viewPenaltyImage && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setViewPenaltyImage(null)}>
          <img src={viewPenaltyImage} alt="Kara" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
};
