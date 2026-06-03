import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Users, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, getDaysInMonth, getDay, startOfMonth, isToday as isDateToday } from 'date-fns';
import { pl } from 'date-fns/locale';
import { EmployeeLinksModal } from './hours/EmployeeLinksModal';
import { AdvanceModal } from './hours/AdvanceModal';
import { PenaltyModal } from './hours/PenaltyModal';

const SITE_COLORS_HEX = ['#3B4F5C', '#3F5235', '#5F4A3B', '#5A4F6C', '#6C5A4F', '#4F6C5A'];
const WEEKEND_BG = '#3D2E2E';
const WEEKEND_BORDER = '#6B4444';
const HOLIDAY_BORDER = '#9B2C2C';

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
  const [expandedNameId, setExpandedNameId] = useState(null);
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
      const [employeesRes, sitesRes, assignmentsRes, hoursRes, holidaysRes, advSummaryRes, penSummaryRes, absencesRes, budowyRes] = await Promise.all([
        api.get(`/employees?month=${monthNum}&year=${year}`),
        api.get('/sites'),
        api.get(`/assignments?month=${monthName}&year=${year}`),
        api.get(`/hours?start_date=${format(startOfMonth(selectedMonth), 'yyyy-MM-dd')}&end_date=${format(new Date(year, selectedMonth.getMonth() + 1, 0), 'yyyy-MM-dd')}`),
        api.get(`/holidays?year=${year}`),
        api.get(`/advances/summary?month=${monthNum}&year=${year}`),
        api.get(`/penalties/summary?month=${monthNum}&year=${year}`),
        api.get(`/absences?month=${monthNum}&year=${year}`),
        api.get('/finance/budowy'),
      ]);
      setEmployees(employeesRes.data);
      // iter95aa: Pokazujemy WYLACZNIE budowy zsynchronizowane z finance_budowy ktore:
      //   1) maja show_in_hours = true
      //   2) NIE sa archived
      //   3) maja niepusta nazwe (eliminuje fantomy '0', '', null)
      const allowedBudowyIds = new Set(
        (budowyRes.data?.rows || [])
          .filter((b) => b.show_in_hours && !b.is_archived && (b.name || '').trim() && (b.name || '').trim() !== '0')
          .map((b) => b.id)
      );
      // Budowy musza tez przeniesc kolor z finance_budowy na sites (na wszelki wypadek)
      const budowaColorMap = {};
      (budowyRes.data?.rows || []).forEach((b) => { budowaColorMap[b.id] = b.color || null; });

      const onlyExcelBudowy = (sitesRes.data || [])
        .filter((s) => s.excel_column || allowedBudowyIds.has(s.finance_budowa_id))
        .filter((s) => (s.name || '').trim() && (s.name || '').trim() !== '0')
        .map((s) => ({
          ...s,
          color: s.color || (s.finance_budowa_id ? budowaColorMap[s.finance_budowa_id] : null),
        }));
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
        // Defensywne rzutowanie (legacy moglo zapisac string)
        const hw = typeof entry.hours_worked === 'number'
          ? entry.hours_worked
          : parseFloat(entry.hours_worked) || 0;
        hoursMap[key] = hw;
        metaMap[key] = {
          updatedBy: entry.updated_by_name || entry.created_by_name || null,
          updatedAt: entry.updated_at || entry.created_at || null
        };
      });
      setHourEntries(hoursMap);
      setHourMeta(metaMap);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Nie udalo sie pobrać danych');
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
    // iter95x: priorytet custom site.color, fallback do legacy index palette
    const site = sites.find(s => s.id === siteId);
    if (site && site.color) return site.color;
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
      toast.error('Godziny musza być miedzy 0 a 14');
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
    toast.success('Zaznaczono caly miesiąc');
  };

  const getEmployeesPerSite = () => {
    // iter95aa: licz po CALYM widocznym miesiacu (nie tylko 'dziś')
    // Wczesniej liczylo tylko na dzien dzisiejszy - dlatego user widzial 35 'nieprzypisanych'
    // gdy wiekszosc miala przypisania na inne dni miesiaca.
    const counts = {};
    const assignedAnyDay = new Set();
    sites.forEach(site => { counts[site.id] = new Set(); });
    // Jezeli employee ma JAKIEKOLWIEK przypisanie w widocznym miesiacu - liczy sie jako 'przypisany'
    for (const emp of employees) {
      const datesByEmp = (assignments || []).filter((a) => a.employee_id === emp.id);
      const sitesForEmp = new Set();
      datesByEmp.forEach((a) => {
        if (a.site_id && counts[a.site_id]) {
          sitesForEmp.add(a.site_id);
        }
      });
      // Uwzglednij pending (jeszcze nie zapisane)
      Object.values(pendingAssignments || {}).forEach((siteId) => {
        if (counts[siteId]) sitesForEmp.add(siteId);
      });
      sitesForEmp.forEach((sid) => counts[sid].add(emp.id));
      if (sitesForEmp.size > 0) assignedAnyDay.add(emp.id);
    }
    const result = {};
    for (const [siteId, empSet] of Object.entries(counts)) {
      result[siteId] = empSet.size;
    }
    result._unassigned = employees.filter(e => !assignedAnyDay.has(e.id)).length;
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
      toast.error('Nie udalo sie pobrać zaliczek');
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
      toast.success('Zaliczka przeniesiona na nastepny miesiąc');
      setCarryForwardId(null);
      setCarryAmount('');
      const res = await api.get(`/advances?employee_id=${showAdvanceModal.id}&month=${monthNum}&year=${year}`);
      setAdvanceList(res.data);
      const summaryRes = await api.get(`/advances/summary?month=${monthNum}&year=${year}`);
      setAdvanceSummary(summaryRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Błąd przenoszenia zaliczki');
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
      toast.error('Nie udalo sie pobrać kar');
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
      <div className="min-h-screen bg-[#1E2A44] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4F6343]" />
        <p className="mt-4 text-[#F1F5F9]">Wczytywanie...</p>
      </div>
    );
  }

  const days = getDays();
  const filteredEmployees = isAdmin ? employees : employees;
  const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: pl });
  const pendingCount = Object.keys(pendingAssignments).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#1E2A44]">
      {/* Header — iter95dj soft dark redesign */}
      <div className="bg-[#222B40] text-slate-100 border-b border-white/10 shadow-sm shrink-0">
        <div className="max-w-full mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4 flex-wrap">
          <Button
            onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/worker/dashboard')}
            variant="ghost"
            className="text-slate-300 hover:bg-white/10 p-2"
            data-testid="back-btn"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-3">
              <Button onClick={() => setSelectedMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })} variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 p-1" data-testid="prev-month">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-base sm:text-lg lg:text-xl font-bold capitalize truncate" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>{monthLabel}</h1>
              <Button onClick={() => setSelectedMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })} variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 p-1" data-testid="next-month">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-slate-400 text-[10px] sm:text-xs hidden sm:block">
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
              className="bg-[#9DBC85] hover:bg-[#5F7552] text-slate-900 font-medium"
              data-testid="generate-links-btn"
            >
              <Link2 className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Linki pracownikow</span>
            </Button>
          )}
          {selectedSiteForAssignment && (
            <span></span>
          )}
        </div>
      </div>

      <div className="shrink-0 p-2 sm:p-4 pb-0 overflow-x-auto">
        {/* Assignment mode selector */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-[#243049] rounded-lg border border-[#3D5378] flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#CBD5E1] mr-2">Tryb:</span>
            <Button
              onClick={() => { setSelectedSiteForAssignment(null); setPendingAssignments({}); }}
              size="sm"
              className={!selectedSiteForAssignment
                ? 'bg-[#4F6343] text-white'
                : 'bg-[#3D5378] text-[#F1F5F9] hover:bg-[#3D4F63]'
              }
              data-testid="mode-edit-hours"
            >
              Edycja godzin
            </Button>
            {sites.map((site, idx) => {
              // iter95cq: priorytetowo uzyj koloru z bazy (admin moze go zmienic w Finanse->Budowy),
              // fallback do palety SITE_COLORS_HEX. Wczesniej kropka brala tylko z palety
              // i nie aktualizowala sie po zmianie koloru w Finansach.
              const color = site.color || SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length];
              const isActive = selectedSiteForAssignment === site.id;
              return (
                <Button
                  key={site.id}
                  onClick={() => { setSelectedSiteForAssignment(site.id); setPendingAssignments({}); }}
                  size="sm"
                  style={isActive ? { backgroundColor: color, color: '#fff' } : {}}
                  className={!isActive
                    ? 'bg-[#3D5378] text-[#F1F5F9] hover:bg-[#3D4F63]'
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
              <span className="text-xs text-[#DC4A3A] bg-[#7F2229] px-2 py-1 rounded-full font-medium">
                <Users className="inline h-3 w-3 mr-0.5" />Nieprzypisani: {employeesPerSite._unassigned}
              </span>
            )}
          </div>
        )}

        {/* Assignment action buttons - visible on mobile */}
        {selectedSiteForAssignment && (
          <div className="mb-4 p-3 bg-[#152033] rounded-lg border-2 border-[#4F6343] flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#CBD5E1]">Zaznaczono: {pendingCount}</span>
            <ActionButton
              onAction={handleBulkAssign}
              disabled={pendingCount === 0}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
              size="sm"
              data-testid="bulk-assign-btn"
            >Przypisz ({pendingCount})</ActionButton>
            <Button
              onClick={() => {
                employees.forEach(emp => handleSelectFullMonth(emp.id));
              }}
              size="sm"
              className="bg-[#3D5378] text-[#F1F5F9] hover:bg-[#4F6343] hover:text-white border border-[#4F6343]"
              data-testid="full-month-all-btn"
            >
              Caly miesiąc (wszyscy)
            </Button>
            <Button
              onClick={() => { setPendingAssignments({}); setSelectedSiteForAssignment(null); }}
              variant="outline"
              size="sm"
              className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378]"
              data-testid="cancel-assign-btn"
            >
              Anuluj
            </Button>
          </div>
        )}

        {/* Bulk mode bar */}
        <div className="mb-4 p-3 bg-[#243049] rounded-lg border border-[#3D5378]">
          {!bulkMode ? (
            <Button
              onClick={() => setBulkMode(true)}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white gap-2"
              data-testid="bulk-mode-btn"
            >
              <Users className="h-4 w-4" />
              Szybkie wpisywanie godzin (dzis)
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[#F1F5F9] font-semibold text-sm">Godziny:</span>
                <Input
                  type="number"
                  min="0"
                  max="14"
                  value={bulkHours}
                  onChange={(e) => setBulkHours(e.target.value)}
                  placeholder="np. 10"
                  className="w-24 bg-[#1E2A44] border-[#4F6343] text-white text-center h-10"
                  data-testid="bulk-hours-input"
                  autoFocus
                />
                <span className="text-[#CBD5E1] text-sm">Zaznacz pracownikow ponizej:</span>
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
                          ? 'bg-[#4F6343] text-white ring-2 ring-[#5F7552]'
                          : 'bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378]'
                      }`}
                      data-testid={`bulk-emp-${emp.id}`}
                    >
                      {emp.full_name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <ActionButton
                  onAction={handleBulkSave}
                  disabled={bulkSaving || !bulkHours || bulkSelected.size === 0}
                  className="bg-[#4F6343] hover:bg-[#3F5235] text-white gap-2"
                  data-testid="bulk-save-btn"
                >{bulkSaving ? 'Zapisywanie...' : `Zapisz ${bulkHours || '?'}h dla ${bulkSelected.size} os.`}</ActionButton>
                <Button
                  onClick={() => { setBulkMode(false); setBulkSelected(new Set()); setBulkHours(''); }}
                  variant="outline"
                  className="border-[#3D5378] text-[#F1F5F9] hover:bg-[#3D5378]"
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
        <Card className="bg-[#243049] border-[#3D5378] h-full flex flex-col">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-[#4F6343]" />
              Godziny pracy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            <div className="overflow-auto h-full" ref={tableScrollRef}>
              <table className="w-full text-sm border-collapse" data-testid="hours-table">
                <thead className="sticky top-0 z-30" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                  <tr className="bg-[#1E2A44]">
                    <th className="border border-[#3D5378] p-1 text-center text-[#CBD5E1] min-w-[35px] sticky left-0 z-40 bg-[#1E2A44]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      L.p.
                    </th>
                    <th className="border border-[#3D5378] p-1 sm:p-2 text-left text-[#F1F5F9] min-w-[90px] sm:min-w-[140px] max-w-[100px] sm:max-w-none sticky left-[35px] z-40 bg-[#1E2A44]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      Pracownik
                    </th>
                    <th className="border border-[#3D5378] p-2 text-left text-[#F1F5F9] min-w-[100px] bg-[#1E2A44]">
                      Telefon
                    </th>
                    {isAdmin && (
                      <th className="border border-[#3D5378] p-2 text-center text-[#F1F5F9] min-w-[90px] bg-[#1E2A44]">
                        Zaliczki
                      </th>
                    )}
                    {isAdmin && (
                      <th className="border border-[#3D5378] p-2 text-center text-[#F1F5F9] min-w-[90px] bg-[#1E2A44]">
                        Kary
                      </th>
                    )}
                    {days.map(d => {
                      const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#3D5378';
                      const borderWidth = d.isToday ? '2px' : d.isHoliday ? '3px' : '1px';
                      return (
                      <th
                        key={d.day}
                        className="p-1 text-center min-w-[42px] relative"
                        data-today={d.isToday ? 'true' : undefined}
                        style={{
                          backgroundColor: d.isWeekend || d.isHoliday ? WEEKEND_BG : '#1E2A44',
                          borderLeft: `${borderWidth} solid ${borderColor}`,
                          borderRight: `${borderWidth} solid ${borderColor}`,
                          borderTop: `${borderWidth} solid ${borderColor}`,
                          borderBottom: `${borderWidth} solid ${borderColor}`,
                        }}
                      >
                        <div className="text-[#F1F5F9] font-bold text-xs">{d.day}</div>
                        <div className={`text-[10px] ${d.isWeekend || d.isHoliday ? 'text-[#DC4A3A]' : 'text-[#CBD5E1]'}`}>
                          {d.dayName}
                        </div>
                      </th>
                      );
                    })}
                    {sites.map((site, idx) => (
                      <th
                        key={`sh-${site.id}`}
                        className="border border-[#3D5378] p-1 text-center min-w-[60px]"
                        style={{ backgroundColor: (site.color || SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length]) + '55' }}
                      >
                        <div className="text-[#F1F5F9] text-[10px] font-semibold leading-tight">{site.name}</div>
                      </th>
                    ))}
                    <th className="border border-[#3D5378] p-1 text-center min-w-[60px] bg-[#1E2A44]">
                      <div className="text-[#CBD5E1] text-[10px] font-semibold">Nieprzy-<br/>pisane</div>
                    </th>
                    <th className="border border-[#3D5378] p-2 text-center text-[#4F6343] font-bold min-w-[60px] bg-[#1E2A44]">
                      SUMA
                    </th>
                  </tr>
                  {/* Sum row under headers */}
                  <tr className="bg-[#152033]">
                    <td className="border border-[#3D5378] p-0 bg-[#152033] sticky left-0 z-40" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}></td>
                    <td className="border border-[#3D5378] p-1 bg-[#152033] sticky left-[35px] z-40 text-[#4F6343] font-bold text-[10px]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>SUMA</td>
                    <td className="border border-[#3D5378] p-0 bg-[#152033]"></td>
                    {isAdmin && <td className="border border-[#3D5378] p-0 bg-[#152033]"></td>}
                    {isAdmin && <td className="border border-[#3D5378] p-0 bg-[#152033]"></td>}
                    {days.map(d => {
                      const dayTotal = filteredEmployees.reduce((sum, emp) => sum + (hourEntries[`${emp.id}-${d.date}`] || 0), 0);
                      const dayTotalRounded = Math.round(dayTotal * 100) / 100;
                      return (
                        <td key={`dsum-${d.day}`} className="border border-[#3D5378] p-0 text-center bg-[#152033]">
                          <span className="text-[#4F6343] text-[10px] font-bold">{dayTotalRounded || ''}</span>
                        </td>
                      );
                    })}
                    {sites.map((site, idx) => {
                      const siteTotal = filteredEmployees.reduce((sum, emp) => {
                        const { hoursBySite } = getEmployeeHoursBySite(emp.id);
                        return sum + (hoursBySite[site.id] || 0);
                      }, 0);
                      return (
                        <td key={`ssum-${site.id}`} className="border border-[#3D5378] p-1 text-center" style={{ backgroundColor: (site.color || SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length]) + '55' }}>
                          <span className="text-white font-bold text-xs">{Math.round(siteTotal * 100) / 100}</span>
                        </td>
                      );
                    })}
                    <td className="border border-[#3D5378] p-1 text-center bg-[#152033]">
                      <span className="text-[#DC4A3A] font-bold text-xs">{Math.round(filteredEmployees.reduce((sum, emp) => sum + getEmployeeHoursBySite(emp.id).unassigned, 0) * 100) / 100}</span>
                    </td>
                    <td className="border border-[#3D5378] p-1 text-center bg-[#152033]">
                      <span className="text-[#4F6343] font-bold text-xs">{Math.round(filteredEmployees.reduce((sum, emp) => { const { hoursBySite, unassigned } = getEmployeeHoursBySite(emp.id); return sum + Object.values(hoursBySite).reduce((s, h) => s + h, 0) + unassigned; }, 0) * 100) / 100}</span>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(employee => {
                    const { hoursBySite, unassigned } = getEmployeeHoursBySite(employee.id);
                    const totalHours = Math.round((Object.values(hoursBySite).reduce((s, h) => s + h, 0) + unassigned) * 100) / 100;

                    return (
                      <tr
                        key={employee.id}
                        className="border-b border-[#3D5378]"
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 44px' }}
                      >
                        {/* Row number */}
                        <td className="border border-[#3D5378] p-1 text-center text-[#CBD5E1] text-xs font-medium bg-[#1E2A44] sticky left-0 z-[15]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                          {filteredEmployees.indexOf(employee) + 1}
                        </td>
                        {/* Name - always neutral dark bg, no site color. Click to toggle full name on mobile. */}
                        <td className="border border-[#3D5378] p-1 sm:p-2 text-[#F1F5F9] font-medium bg-[#1E2A44] sticky left-[35px] z-[15] max-w-[100px] sm:max-w-none" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }} data-testid={`emp-name-${employee.id}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedNameId((prev) => prev === employee.id ? null : employee.id);
                              }}
                              className={`text-left text-[#F1F5F9] hover:text-white text-xs sm:text-sm leading-tight ${expandedNameId === employee.id ? 'whitespace-normal break-words' : 'truncate'}`}
                              data-testid={`emp-name-toggle-${employee.id}`}
                            >
                              {employee.full_name}
                            </button>
                            {(selectedSiteForAssignment || (isAdmin && selectedSiteForAssignment)) && (
                              <div className="flex gap-1 shrink-0 self-start sm:self-auto">
                                {selectedSiteForAssignment && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSelectFullMonth(employee.id); }}
                                    className="shrink-0 text-[10px] px-2 py-1 rounded font-semibold bg-[#3D5378] text-[#F1F5F9] hover:bg-[#4F6343] hover:text-white transition-colors whitespace-nowrap border border-[#4F6343]/50"
                                    data-testid={`full-month-${employee.id}`}
                                  >
                                    Caly m-c
                                  </button>
                                )}
                                {isAdmin && selectedSiteForAssignment && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUnassign(employee.id, employee.full_name); }}
                                    className="shrink-0 text-[10px] px-1.5 py-1 rounded font-semibold bg-[#7F2229] text-red-400 hover:bg-red-800 hover:text-white transition-colors whitespace-nowrap border border-red-800/50"
                                    data-testid={`unassign-${employee.id}`}
                                  >
                                    Odpisz
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="border border-[#3D5378] p-2 text-[#CBD5E1] text-xs bg-[#1E2A44]">
                          {employee.phone_number || '-'}
                        </td>
                        {isAdmin && (
                          <td
                            className="border border-[#3D5378] p-2 text-center bg-[#1E2A44] cursor-pointer hover:bg-[#3D5378] transition-colors"
                            onClick={() => openAdvanceModal(employee)}
                            data-testid={`advance-cell-${employee.id}`}
                          >
                            {advanceSummary[employee.id] ? (
                              <span className="text-[#DC4A3A] font-bold text-sm">
                                {Number(advanceSummary[employee.id] || 0).toLocaleString('pl-PL', {minimumFractionDigits: 0, maximumFractionDigits: 2}).replace(/\u00A0/g, ' ')} zł
                              </span>
                            ) : (
                              <span className="text-[#4A5568] text-xs">-</span>
                            )}
                          </td>
                        )}
                        {isAdmin && (
                          <td
                            className="border border-[#3D5378] p-2 text-center bg-[#1E2A44] cursor-pointer hover:bg-[#3D5378] transition-colors"
                            onClick={() => openPenaltyModal(employee)}
                            data-testid={`penalty-cell-${employee.id}`}
                          >
                            {penaltySummary[employee.id] ? (
                              <span className="text-[#9B2C2C] font-bold text-sm">
                                {Number(penaltySummary[employee.id] || 0).toLocaleString('pl-PL', {minimumFractionDigits: 0, maximumFractionDigits: 2}).replace(/\u00A0/g, ' ')} zł
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
                          const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#3D5378';
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

                          const cellBg = showNN ? '#7F2229' : showNU ? '#7F1D1D' : hasAbsence ? '#7F1D1D' : (bgColor || '#243049');

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
                                  className="w-full h-8 text-center bg-[#152033] text-white border-[#4F6343] text-sm p-0 rounded-none"
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
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#152033] text-[#F1F5F9] text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-lg border border-[#3D5378] pointer-events-none">
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
                            className="border border-[#3D5378] p-1 text-center"
                            style={{ backgroundColor: (site.color || SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length]) + '33' }}
                          >
                            <span className="text-[#F1F5F9] font-semibold text-sm">
                              {hoursBySite[site.id] || 0}
                            </span>
                          </td>
                        ))}
                        {/* Unassigned */}
                        <td className="border border-[#3D5378] p-1 text-center bg-[#1E2A44]">
                          <span className={`font-semibold text-sm ${unassigned > 0 ? 'text-[#DC4A3A]' : 'text-[#94A3B8]'}`}>
                            {unassigned}
                          </span>
                        </td>
                        {/* Total */}
                        <td className="border border-[#3D5378] p-1 text-center bg-[#1E2A44]">
                          <span className="text-[#4F6343] font-bold text-base">{totalHours}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="p-4 border-t border-[#3D5378] shrink-0">
              <p className="text-xs font-semibold mb-2 text-[#F1F5F9]">Legenda:</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: WEEKEND_BG }} />
                  <span className="text-[#CBD5E1]">Sobota/Niedziela</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm border-2 border-[#9B2C2C]" />
                  <span className="text-[#CBD5E1]">Swieto ustawowe</span>
                </div>
                {sites.map((site, idx) => (
                  <div key={site.id} className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: site.color || SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] }} />
                    <span className="text-[#CBD5E1]">{site.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-2">
                Najedz na komorke z godzinami aby zobaczyc kto je wpisal | Kliknij komorke aby edytować
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <EmployeeLinksModal
        open={showLinks}
        employeeLinks={employeeLinks}
        onClose={() => setShowLinks(false)}
      />

      <AdvanceModal
        employee={showAdvanceModal}
        selectedMonth={selectedMonth}
        advanceList={advanceList}
        newAdvanceAmount={newAdvanceAmount}
        setNewAdvanceAmount={setNewAdvanceAmount}
        newAdvanceNote={newAdvanceNote}
        setNewAdvanceNote={setNewAdvanceNote}
        carryForwardId={carryForwardId}
        setCarryForwardId={setCarryForwardId}
        carryAmount={carryAmount}
        setCarryAmount={setCarryAmount}
        onAdd={handleAddAdvance}
        onDelete={handleDeleteAdvance}
        onCarryForward={handleCarryForward}
        onClose={() => setShowAdvanceModal(null)}
      />

      <PenaltyModal
        employee={showPenaltyModal}
        selectedMonth={selectedMonth}
        penaltyList={penaltyList}
        newPenaltyAmount={newPenaltyAmount}
        setNewPenaltyAmount={setNewPenaltyAmount}
        newPenaltyDesc={newPenaltyDesc}
        setNewPenaltyDesc={setNewPenaltyDesc}
        newPenaltyImage={newPenaltyImage}
        onImageUpload={handleImageUpload}
        viewPenaltyImage={viewPenaltyImage}
        setViewPenaltyImage={setViewPenaltyImage}
        onAdd={handleAddPenalty}
        onDelete={handleDeletePenalty}
        onClose={() => setShowPenaltyModal(null)}
      />
    </div>
  );
};
