import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { LogOut, Calendar, AlertCircle, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format, getDaysInMonth, getDay, startOfMonth, isToday as isDateToday } from 'date-fns';
import { pl } from 'date-fns/locale';
import { LocationsButton } from './LocationsButton';
import { InventoryCheckModal } from './InventoryCheckModal';

// Lazy-load heavy equipment section
const EquipmentForeman = lazy(() => import('./EquipmentForeman').then((m) => ({ default: m.EquipmentForeman })));
const WarehouseForeman = lazy(() => import('./WarehouseForeman').then((m) => ({ default: m.WarehouseForeman })));
const EquipmentSpinner = () => <div className="p-4 text-center text-[#94A3B8] text-sm">Ładowanie sprzętu...</div>;

const SITE_COLORS_HEX = ['#3B4F5C', '#4A5A41', '#5F4A3B', '#5A4F6C', '#6C5A4F', '#4F6C5A'];
const WEEKEND_BG = '#3D2E2E';
const WEEKEND_BORDER = '#6B4444';
const HOLIDAY_BORDER = '#DC2626';

export const WorkerDashboard = () => {
  const { user, logout, isImpersonating, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [foremanData, setForemanData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [mySites, setMySites] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [hourEntries, setHourEntries] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [editingCell, setEditingCell] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const [requestModal, setRequestModal] = useState(null);
  const [requestHours, setRequestHours] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [holidays, setHolidays] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkHours, setBulkHours] = useState('');
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [absences, setAbsences] = useState([]);
  const [eqTab, setEqTab] = useState('electronics');
  const [dismissedAbsences, setDismissedAbsences] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissed_absences') || '[]'); } catch { return []; }
  });

  const fetchData = useCallback(async () => {
    try {
      const monthName = format(selectedMonth, 'MMMM', { locale: pl }).toUpperCase();
      const year = selectedMonth.getFullYear();
      const monthNum = selectedMonth.getMonth() + 1;

      // PRIMARY - render hours table as fast as possible
      const [foremanRes, employeesRes, sitesRes, assignmentsRes, hoursRes] = await Promise.all([
        api.get('/foreman/me'),
        api.get(`/employees?month=${monthNum}&year=${year}`),
        api.get('/sites'),
        api.get(`/assignments?month=${monthName}&year=${year}`),
        api.get(`/hours?start_date=${format(startOfMonth(selectedMonth), 'yyyy-MM-dd')}&end_date=${format(new Date(year, selectedMonth.getMonth() + 1, 0), 'yyyy-MM-dd')}`),
      ]);

      const foreman = foremanRes.data;
      setForemanData(foreman);
      const foremanSiteIds = foreman.assigned_sites || [];

      setSites(sitesRes.data);
      const allAssignedSites = sitesRes.data.filter((s) => foremanSiteIds.includes(s.id));
      const onlyBudowy = allAssignedSites.filter((s) => s.excel_column);
      setMySites(onlyBudowy);

      const allAssignments = assignmentsRes.data;
      const myAssignments = allAssignments.filter((a) => foremanSiteIds.includes(a.site_id));
      setAssignments(myAssignments);

      const myEmployeeIds = new Set();
      myAssignments.forEach((a) => {
        if (a.assigned_dates && a.assigned_dates.length > 0) myEmployeeIds.add(a.employee_id);
      });
      setEmployees(employeesRes.data.filter((e) => myEmployeeIds.has(e.id)));

      const hoursMap = {};
      hoursRes.data.forEach((entry) => {
        hoursMap[`${entry.employee_id}-${entry.work_date}`] = entry.hours_worked;
      });
      setHourEntries(hoursMap);
      setLoading(false);

      // SECONDARY - holidays + absences don't block the main view
      const [holidaysRes, absencesRes] = await Promise.all([
        api.get(`/holidays?year=${year}`).catch(() => ({ data: { holidays: [] } })),
        api.get(`/absences?month=${monthNum}&year=${year}`).catch(() => ({ data: [] })),
      ]);
      setHolidays(holidaysRes.data.holidays || []);
      setAbsences((absencesRes.data || []).filter((a) => myEmployeeIds.has(a.employee_id)));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 404) {
        toast.error('Twoje konto nie zostalo jeszcze skonfigurowane');
      }
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (!user) { navigate('/worker-entry'); return; }
    fetchData();
  }, [user, navigate, fetchData]);

  // Dynamiczny manifest PWA: brygadzista uzywajacy "Add to Home Screen"
  // ma trafiac na /foreman po kliknieciu ikony, nie na /login admina
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const original = link.getAttribute('href');
    const m = {
      name: 'FeGrro Brygadzista',
      short_name: 'FeGrro Brygadzista',
      description: 'Panel brygadzisty - FeGrro',
      start_url: '/foreman',
      scope: '/',
      display: 'standalone',
      background_color: '#0F172A',
      theme_color: '#0F172A',
      orientation: 'any',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    };
    const blob = new Blob([JSON.stringify(m)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    return () => {
      URL.revokeObjectURL(url);
      if (original) link.setAttribute('href', original);
    };
  }, []);

  const getSiteColorHex = (siteId) => {
    const allSites = sites.length > 0 ? sites : mySites;
    const idx = allSites.findIndex(s => s.id === siteId);
    return idx >= 0 ? SITE_COLORS_HEX[idx % SITE_COLORS_HEX.length] : null;
  };

  const getCellAssignment = (employeeId, date) => {
    let lastMatch = null;
    for (const a of assignments) {
      if (a.employee_id === employeeId && a.assigned_dates && a.assigned_dates.includes(date)) {
        lastMatch = a;
      }
    }
    return lastMatch;
  };

  const getCellBgColor = (employeeId, date, isWeekend) => {
    const assignment = getCellAssignment(employeeId, date);
    if (assignment) return getSiteColorHex(assignment.site_id);
    if (isWeekend) return WEEKEND_BG;
    return null;
  };

  const canEditCell = (employeeId, date) => {
    // Must be assigned to my site
    const assignment = getCellAssignment(employeeId, date);
    if (!assignment) return false;
    // Only today and yesterday
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const cellDate = new Date(date + 'T00:00:00');
    return cellDate.getTime() === today.getTime() || cellDate.getTime() === yesterday.getTime();
  };

  const isAbsenceDate = (employeeId, dateStr) => {
    return absences.some(a =>
      a.employee_id === employeeId &&
      (a.status === 'pending' || a.status === 'approved') &&
      a.dates && a.dates.includes(dateStr)
    );
  };


  const handleCellClick = (employeeId, date) => {
    if (canEditCell(employeeId, date)) {
      setEditingCell(`${employeeId}-${date}`);
      setTempValue(hourEntries[`${employeeId}-${date}`] ?? '');
    } else {
      const assignment = getCellAssignment(employeeId, date);
      if (assignment) {
        // Cell is assigned to my site but not today/yesterday → offer request
        setRequestModal({ employeeId, date, siteId: assignment.site_id });
        setRequestHours('');
        setRequestReason('');
      }
    }
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
    if (!assignment) { setEditingCell(null); return; }

    // Check if employee has hours on another site
    try {
      const checkRes = await api.get(`/hours/check-existing?employee_id=${employeeId}&work_date=${date}&site_id=${assignment.site_id}`);
      if (checkRes.data.has_hours) {
        const confirmed = window.confirm(
          `Uwaga! Ten pracownik ma juz wpisane ${checkRes.data.hours}h na budowie "${checkRes.data.site_name}" w tym dniu. Czy chcesz nadpisac?`
        );
        if (!confirmed) { setEditingCell(null); return; }
      }
    } catch (e) {
      // Check endpoint may not exist for all setups - continue with save
    }

    try {
      await api.post('/hours', {
        employee_id: employeeId,
        site_id: assignment.site_id,
        work_date: date,
        hours_worked: hours,
        is_absent: hours === 0
      });
      setHourEntries(prev => ({ ...prev, [key]: hours }));
      if (hours === 0) {
        toast.success('Godziny usuniete');
      } else {
        toast.success('Godziny zapisane');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Nie udalo sie zapisac');
      setEditingCell(null);
    }
  };

  const handleSendRequest = async () => {
    if (!requestModal) return;
    const hours = parseFloat(requestHours);
    if (!hours || hours < 1 || hours > 14) {
      toast.error('Podaj godziny (1-14)');
      return;
    }
    try {
      await api.post('/requests', {
        employee_id: requestModal.employeeId,
        site_id: requestModal.siteId,
        work_date: requestModal.date,
        hours_worked: hours,
        reason: requestReason || 'Prosba brygadzisty o uzupelnienie godzin'
      });
      toast.success('Prosba wyslana do administratora');
      setRequestModal(null);
    } catch (error) {
      toast.error('Nie udalo sie wyslac prosby');
    }
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
    if (!hours || hours < 0 || hours > 14) {
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

  const getEmployeeHoursBySite = (employeeId) => {
    const hoursBySite = {};
    let unassigned = 0;
    mySites.forEach(site => { hoursBySite[site.id] = 0; });
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

  const getDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const numDays = getDaysInMonth(selectedMonth);
    const days = [];
    for (let day = 1; day <= numDays; day++) {
      const d = new Date(year, month, day);
      const dayOfWeek = getDay(d);
      const dateStr = format(d, 'yyyy-MM-dd');
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.includes(dateStr);
      days.push({
        day,
        date: dateStr,
        isWeekend,
        isHoliday,
        isToday: isDateToday(d),
        dayName: format(d, 'EEE', { locale: pl })
      });
    }
    return days;
  };

  const handleLogout = () => {
    logout();
    navigate('/worker-entry');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151] mx-auto" />
          <p className="mt-4 text-[#CBD5E1]">Wczytywanie...</p>
        </div>
      </div>
    );
  }

  // No sites assigned yet
  if (!foremanData || !foremanData.assigned_sites || foremanData.assigned_sites.length === 0) {
    return (
      <div className="min-h-screen bg-[#1E293B]">
        <div className="bg-[#2A384C] text-white p-4 shadow-lg flex items-center justify-between">
          <h1 className="text-xl font-bold">Witaj, {user?.full_name}!</h1>
          <Button onClick={handleLogout} variant="ghost" className="text-white hover:bg-[#334155]" data-testid="logout-btn">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center justify-center p-8">
          <Card className="bg-[#2A384C] border-[#334155] max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-16 w-16 text-[#5F7151] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-[#CBD5E1] mb-2">Oczekiwanie na przypisanie</h2>
              <p className="text-[#94A3B8]">
                Twoje konto zostalo zarejestrowane. Administrator musi przypisac Ci budowy. Poczekaj na aktywacje.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const days = getDays();
  const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: pl });

  return (
    <div className="min-h-screen flex flex-col bg-[#1E293B]">
      {/* Inventory check blocking modal */}
      <InventoryCheckModal />
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="bg-[#E8B76A] text-[#1E293B] px-4 py-2 text-sm font-semibold flex items-center justify-between gap-2 shrink-0" data-testid="impersonation-banner">
          <span>👁️ Wcielony jako brygadzista <b>{user?.full_name}</b> (sesja 1h)</span>
          <Button
            size="sm"
            onClick={() => {
              const r = stopImpersonation();
              if (r.success) {
                window.location.href = '/admin/dashboard';
              } else {
                logout();
                window.location.href = '/login';
              }
            }}
            className="bg-[#1E293B] text-white hover:bg-[#0F172A] h-8"
            data-testid="stop-impersonation-btn"
          >
            ← Wróć do admina
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="bg-[#2A384C] text-white shadow-lg shrink-0">
        <div className="max-w-full mx-auto p-4 flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">{user?.full_name}</h1>
            <p className="text-[#94A3B8] text-sm">
              Budowy: {mySites.map(s => s.name).join(', ')} | {monthLabel}
            </p>
          </div>
          <LocationsButton />
          <Button onClick={handleLogout} variant="ghost" className="text-white hover:bg-[#334155]" data-testid="logout-btn">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="shrink-0 p-4 pb-0 overflow-x-auto">
        {/* Equipment section: 4 sub-tabs (Elektronarzędzia / Akcesoria / Szalunki / Magazyn) */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setEqTab('electronics')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${eqTab === 'electronics' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="foreman-tab-electronics"
            >
              Elektronarzędzia
            </button>
            <button
              onClick={() => setEqTab('accessories')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${eqTab === 'accessories' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="foreman-tab-accessories"
            >
              Akcesoria
            </button>
            <button
              onClick={() => setEqTab('formwork')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${eqTab === 'formwork' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="foreman-tab-formwork"
            >
              Szalunki
            </button>
            <button
              onClick={() => setEqTab('warehouse')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${eqTab === 'warehouse' ? 'bg-[#5F7151] text-white' : 'bg-[#2A384C] text-[#94A3B8] hover:bg-[#334155]'}`}
              data-testid="foreman-tab-warehouse"
            >
              Materiały
            </button>
          </div>
          {eqTab === 'electronics' && (
            <Suspense fallback={<EquipmentSpinner />}>
              <EquipmentForeman category="electronics" title="Moje elektronarzedzia" />
            </Suspense>
          )}
          {eqTab === 'accessories' && (
            <Suspense fallback={<EquipmentSpinner />}>
              <EquipmentForeman category="accessories" title="Moje akcesoria" />
            </Suspense>
          )}
          {eqTab === 'formwork' && (
            <Suspense fallback={<EquipmentSpinner />}>
              <EquipmentForeman category="formwork" title="Moje szalunki" />
            </Suspense>
          )}
          {eqTab === 'warehouse' && (
            <Suspense fallback={<EquipmentSpinner />}>
              <WarehouseForeman />
            </Suspense>
          )}
        </div>

        {/* Absence alerts for foreman */}
        {absences.filter(a => (a.status === 'pending' || a.status === 'approved') && !dismissedAbsences.includes(a.id)).length > 0 && (
          <div className="mb-3 space-y-2">
            {absences.filter(a => (a.status === 'pending' || a.status === 'approved') && !dismissedAbsences.includes(a.id)).map(a => (
              <div key={a.id} className="p-3 bg-[#7F1D1D]/40 border-2 border-[#7F2D2D] rounded-lg flex items-center justify-between gap-2" data-testid={`foreman-absence-${a.id}`}>
                <div>
                  <p className="text-[#FCA5A5] font-bold text-sm">{a.employee_name || 'Pracownik'} — wolne</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(a.dates || []).map(d => (
                      <span key={d} className="px-1.5 py-0.5 rounded bg-[#7F2D2D] text-[#FCA5A5] text-xs font-medium">{d}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const updated = [...dismissedAbsences, a.id];
                    setDismissedAbsences(updated);
                    localStorage.setItem('dismissed_absences', JSON.stringify(updated));
                  }}
                  className="shrink-0 px-3 py-1.5 bg-[#334155] text-[#CBD5E1] text-xs font-bold rounded hover:bg-[#5F7151] hover:text-white transition-colors"
                  data-testid={`dismiss-absence-${a.id}`}
                >
                  Przyjąłem
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Info bar */}
        <div className="mb-4 p-3 bg-[#2A384C] rounded-lg border border-[#334155] flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[#94A3B8]">Mozesz edytowac:</span>
          <span className="px-2 py-1 bg-[#5F7151]/30 text-[#6B8E4E] rounded font-semibold">Dzisiaj</span>
          <span className="px-2 py-1 bg-[#5F7151]/30 text-[#6B8E4E] rounded font-semibold">Wczoraj</span>
          <span className="text-[#64748B]">| Inne dni → wyslij prosbe</span>
        </div>

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
              Tabela godzin
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            <div className="overflow-auto h-full">
              <table className="w-full text-sm border-collapse" data-testid="foreman-hours-table">
                <thead className="sticky top-0 z-30" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                  <tr className="bg-[#1E293B]">
                    <th className="border border-[#334155] p-1 text-center text-[#94A3B8] min-w-[35px] sticky left-0 z-40 bg-[#1E293B]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      L.p.
                    </th>
                    <th className="border border-[#334155] p-2 text-left text-[#CBD5E1] min-w-[140px] sticky left-[35px] z-40 bg-[#1E293B]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                      Pracownik
                    </th>
                    {days.map(d => {
                      const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#334155';
                      const borderWidth = d.isToday ? '2px' : d.isHoliday ? '3px' : d.isWeekend ? '2px' : '1px';
                      return (
                      <th
                        key={d.day}
                        className="p-1 text-center min-w-[42px] relative"
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
                    {mySites.map((site, idx) => (
                      <th
                        key={`sh-${site.id}`}
                        className="border border-[#334155] p-1 text-center min-w-[60px]"
                        style={{ backgroundColor: SITE_COLORS_HEX[sites.findIndex(s => s.id === site.id) % SITE_COLORS_HEX.length] + '55' }}
                      >
                        <div className="text-[#CBD5E1] text-[10px] font-semibold leading-tight">{site.name}</div>
                      </th>
                    ))}
                    <th className="border border-[#334155] p-2 text-center text-[#5F7151] font-bold min-w-[60px] bg-[#1E293B]">
                      SUMA
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(employee => {
                    const { hoursBySite, unassigned } = getEmployeeHoursBySite(employee.id);
                    const totalHours = Object.values(hoursBySite).reduce((s, h) => s + h, 0) + unassigned;

                    return (
                      <tr key={employee.id} className="border-b border-[#334155]">
                        <td className="border border-[#334155] p-1 text-center text-[#94A3B8] text-xs font-medium bg-[#1E293B] sticky left-0 z-[15]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }}>
                          {employees.indexOf(employee) + 1}
                        </td>
                        <td className="border border-[#334155] p-2 text-[#CBD5E1] font-medium bg-[#1E293B] sticky left-[35px] z-[15]" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.3)' }} data-testid={`emp-name-${employee.id}`}>
                          {employee.full_name}
                        </td>
                        {days.map(d => {
                          const cellKey = `${employee.id}-${d.date}`;
                          const hours = hourEntries[cellKey];
                          const isEditing = editingCell === cellKey;
                          const bgColor = getCellBgColor(employee.id, d.date, d.isWeekend || d.isHoliday);
                          const editable = canEditCell(employee.id, d.date);
                          const hasAssignment = !!getCellAssignment(employee.id, d.date);
                          const hasAbsence = isAbsenceDate(employee.id, d.date);
                          const borderColor = d.isToday ? '#22C55E' : d.isHoliday ? HOLIDAY_BORDER : d.isWeekend ? WEEKEND_BORDER : '#334155';
                          const borderWidth = d.isToday ? '2px' : d.isHoliday ? '3px' : d.isWeekend ? '2px' : '1px';

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
                              className={`p-0 text-center transition-colors relative ${hasAssignment ? 'cursor-pointer' : ''} ${editable ? 'hover:brightness-125' : ''}`}
                              style={{
                                backgroundColor: cellBg,
                                borderLeft: `${borderWidth} solid ${borderColor}`,
                                borderRight: `${borderWidth} solid ${borderColor}`,
                                borderTop: `${borderWidth} solid ${borderColor}`,
                                borderBottom: `${borderWidth} solid ${borderColor}`,
                                opacity: hasAssignment ? 1 : 0.5,
                              }}
                              onClick={() => hasAssignment && handleCellClick(employee.id, d.date)}
                              data-testid={`cell-${employee.id}-${d.day}`}
                              title={showNN ? 'Nieobecność nieusprawiedliwiona' : showNU ? 'Nieobecność usprawiedliwiona' : undefined}
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
                            </td>
                          );
                        })}
                        {/* Per-site totals */}
                        {mySites.map((site) => {
                          const siteIdx = sites.findIndex(s => s.id === site.id);
                          return (
                            <td
                              key={`t-${employee.id}-${site.id}`}
                              className="border border-[#334155] p-1 text-center"
                              style={{ backgroundColor: SITE_COLORS_HEX[siteIdx % SITE_COLORS_HEX.length] + '33' }}
                            >
                              <span className="text-[#CBD5E1] font-semibold text-sm">
                                {hoursBySite[site.id] || 0}
                              </span>
                            </td>
                          );
                        })}
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
            <div className="p-4 border-t border-[#334155]">
              <p className="text-xs font-semibold mb-2 text-[#CBD5E1]">Legenda:</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: WEEKEND_BG }} />
                  <span className="text-[#94A3B8]">Sobota/Niedziela</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 rounded-sm border-2 border-[#DC2626]" style={{ backgroundColor: WEEKEND_BG }} />
                  <span className="text-[#94A3B8]">Swieto ustawowe</span>
                </div>
                {mySites.map((site) => {
                  const siteIdx = sites.findIndex(s => s.id === site.id);
                  return (
                    <div key={site.id} className="flex items-center gap-1.5">
                      <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: SITE_COLORS_HEX[siteIdx % SITE_COLORS_HEX.length] }} />
                      <span className="text-[#94A3B8]">{site.name}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#64748B] mt-2">
                Kliknij komorke (dzis/wczoraj) aby wpisac godziny | Inne dni → wyslij prosbe do administratora
              </p>
            </div>
          </CardContent>
        </Card>

        {employees.length === 0 && (
          <Card className="bg-[#2A384C] border-[#334155] mt-4">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-12 w-12 text-[#5F7151] mx-auto mb-3" />
              <p className="text-[#CBD5E1] font-semibold">Brak przypisanych pracownikow</p>
              <p className="text-[#94A3B8] text-sm mt-1">Administrator musi przypisac pracownikow do Twoich budow</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Request Modal */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setRequestModal(null)}>
          <Card className="bg-[#2A384C] border-[#334155] w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-[#CBD5E1] text-lg flex items-center gap-2">
                <Send className="h-5 w-5 text-[#5F7151]" />
                Prosba o edycje godzin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[#94A3B8]">
                Data: <span className="text-[#CBD5E1] font-semibold">{requestModal.date}</span>
              </p>
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Godziny (1-14)</label>
                <Input
                  type="number"
                  min="1"
                  max="14"
                  value={requestHours}
                  onChange={e => setRequestHours(e.target.value)}
                  className="bg-[#1E293B] border-[#334155] text-white"
                  data-testid="request-hours-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-[#CBD5E1] block mb-1">Powod (opcjonalnie)</label>
                <Input
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Np. uzupelnienie z poprzedniego tygodnia"
                  className="bg-[#1E293B] border-[#334155] text-white placeholder:text-[#64748B]"
                  data-testid="request-reason-input"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSendRequest}
                  className="flex-1 bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                  data-testid="send-request-btn"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Wyslij prosbe
                </Button>
                <Button
                  onClick={() => setRequestModal(null)}
                  variant="outline"
                  className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                >
                  Anuluj
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
