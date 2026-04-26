import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, Clock, Wallet, AlertTriangle, CalendarOff, X, Download, Share, PlusSquare } from 'lucide-react';
import { format, getDaysInMonth, getDay, addDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SITE_COLORS = ['#3B4F5C', '#4A5A41', '#5F4A3B', '#5A4F6C', '#6C5A4F', '#4F6C5A'];
const WEEKEND_BG = '#3D2E2E';
const HOLIDAY_BORDER = '#DC2626';

export const PublicHours = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [holidays, setHolidays] = useState([]);
  const [advances, setAdvances] = useState({ advances: [], total: 0 });
  const [penalties, setPenalties] = useState({ penalties: [], total: 0 });
  const [viewPenaltyImage, setViewPenaltyImage] = useState(null);
  const [absences, setAbsences] = useState([]);
  const [absenceMode, setAbsenceMode] = useState(false);
  const [selectedAbsenceDates, setSelectedAbsenceDates] = useState(new Set());
  const [absenceSaving, setAbsenceSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const monthNum = selectedMonth.getMonth() + 1;
        const year = selectedMonth.getFullYear();
        const [hoursRes, holidaysRes, advancesRes, penaltiesRes, absencesRes] = await Promise.all([
          axios.get(`${API}/public/hours/${token}`),
          axios.get(`${API}/holidays?year=${year}`),
          axios.get(`${API}/public/advances/${token}?month=${monthNum}&year=${year}`),
          axios.get(`${API}/public/penalties/${token}?month=${monthNum}&year=${year}`),
          axios.get(`${API}/public/absences/${token}`)
        ]);
        setData(hoursRes.data);
        setHolidays(holidaysRes.data.holidays || []);
        setAdvances(advancesRes.data);
        setPenalties(penaltiesRes.data);
        setAbsences(absencesRes.data);
      } catch (err) {
        setError('Nieprawidlowy link lub blad serwera');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, selectedMonth]);

  // Dynamiczny manifest PWA + zapamietanie tokenu dla starych kafelkow
  useEffect(() => {
    if (!token) return;
    // Zapamietaj worker token - uzywany gdy PWA otworzy sie na /login lub / (stare kafelki)
    try { localStorage.setItem('fegrro_worker_token', token); } catch {}

    if (!data?.employee_name) return;

    const originalManifest = document.querySelector('link[rel="manifest"]');
    const originalManifestHref = originalManifest?.getAttribute('href');

    const customManifest = {
      name: 'FeGrro Godziny',
      short_name: 'FeGrro',
      description: `Godziny pracy - ${data.employee_name}`,
      start_url: `/hours/${token}`,
      scope: `/hours/${token}`,
      display: 'standalone',
      background_color: '#0F172A',
      theme_color: '#0F172A',
      orientation: 'any',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    };

    const blob = new Blob([JSON.stringify(customManifest)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    if (originalManifest) originalManifest.setAttribute('href', blobUrl);

    return () => {
      URL.revokeObjectURL(blobUrl);
      if (originalManifest && originalManifestHref) originalManifest.setAttribute('href', originalManifestHref);
    };
  }, [data?.employee_name, token]);

  const changeMonth = (delta) => {
    setSelectedMonth(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  // Absence dates from all pending/approved absences
  const absenceDateSet = new Set();
  absences.forEach(a => {
    if (a.status === 'pending' || a.status === 'approved') {
      (a.dates || []).forEach(d => absenceDateSet.add(d));
    }
  });

  const toggleAbsenceDate = (dateStr) => {
    setSelectedAbsenceDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleSubmitAbsence = async () => {
    if (selectedAbsenceDates.size === 0) {
      toast.error('Zaznacz dni nieobecnosci');
      return;
    }
    setAbsenceSaving(true);
    try {
      await axios.post(`${API}/public/absences/${token}`, {
        dates: Array.from(selectedAbsenceDates).sort()
      });
      toast.success('Nieobecnosc zgloszona! / Відсутність зареєстровано!');
      setAbsenceMode(false);
      setSelectedAbsenceDates(new Set());
      // Refresh absences
      const res = await axios.get(`${API}/public/absences/${token}`);
      setAbsences(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Blad przy zglaszaniu nieobecnosci');
    } finally {
      setAbsenceSaving(false);
    }
  };

  const handleCancelAbsence = async (absenceId) => {
    try {
      await axios.delete(`${API}/public/absences/${token}/${absenceId}`);
      toast.success('Nieobecnosc anulowana');
      setAbsences(prev => prev.filter(a => a.id !== absenceId));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Nie mozna anulowac');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center p-6">
        <Card className="bg-[#2A384C] border-[#334155] max-w-sm w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-red-400 text-lg">{error || 'Blad'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();
  const numDays = getDaysInMonth(selectedMonth);
  const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: pl });
  const siteNames = data.site_names || {};
  const siteIds = Object.keys(siteNames);

  // Build daily data for selected month
  const dayRows = [];
  let monthTotal = 0;
  const siteTotals = {};
  siteIds.forEach(id => { siteTotals[id] = 0; });

  for (let day = 1; day <= numDays; day++) {
    const d = new Date(year, month, day);
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayOfWeek = getDay(d);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(dateStr);
    const dayName = format(d, 'EEEE', { locale: pl });

    const entry = data.entries.find(e => e.work_date === dateStr);
    const hours = entry ? entry.hours_worked : null;
    const siteName = entry ? entry.site_name : null;
    const siteId = entry ? entry.site_id : null;
    const isAbsent = entry ? entry.is_absent : false;

    if (hours) {
      monthTotal += hours;
      if (siteId && siteTotals[siteId] !== undefined) {
        siteTotals[siteId] += hours;
      }
    }

    dayRows.push({ day, dateStr, dayName, isWeekend, isHoliday, hours, siteName, siteId, isAbsent, isAbsenceReported: absenceDateSet.has(dateStr) });
  }

  return (
    <div className="min-h-screen bg-[#1E293B]">
      {/* Header */}
      <div className="bg-[#2A384C] text-white p-4 shadow-lg">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-center mb-1">
            <img src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg" alt="FeGrro" className="h-8 mr-3" />
            <h1 className="text-xl font-bold">{data.employee_name}</h1>
          </div>
          <p className="text-center text-[#94A3B8] text-sm">Godziny pracy</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4 bg-[#2A384C] rounded-lg p-3 border border-[#334155]">
          <Button onClick={() => changeMonth(-1)} variant="ghost" size="sm" className="text-white hover:bg-[#334155]" data-testid="prev-month">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-[#CBD5E1] font-semibold capitalize">{monthLabel}</span>
          <Button onClick={() => changeMonth(1)} variant="ghost" size="sm" className="text-white hover:bg-[#334155]" data-testid="next-month">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Summary card */}
        <Card className="bg-[#2A384C] border-[#334155] mb-4">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#5F7151]" />
                <span className="text-[#94A3B8] text-sm">Suma godzin:</span>
              </div>
              <span className="text-[#5F7151] font-bold text-2xl">{monthTotal}</span>
            </div>
            {siteIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {siteIds.map((sId, idx) => (
                  <span key={sId} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SITE_COLORS[idx % SITE_COLORS.length] + '44', color: '#CBD5E1' }}>
                    {siteNames[sId]}: <strong>{siteTotals[sId] || 0}h</strong>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day list */}
        <Card className="bg-[#2A384C] border-[#334155]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#CBD5E1] text-base">Szczegoly</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#334155]">
              {dayRows.map(row => {
                const siteIdx = row.siteId ? siteIds.indexOf(row.siteId) : -1;
                const isAbsenceDay = row.isAbsenceReported && !row.isWeekend && !row.isHoliday;
                const bgColor = isAbsenceDay
                  ? '#4A2020'
                  : row.siteId ? SITE_COLORS[siteIdx % SITE_COLORS.length] + '22'
                  : (row.isWeekend ? WEEKEND_BG + '66' : 'transparent');
                const borderStyle = row.isHoliday
                  ? `3px solid ${HOLIDAY_BORDER}`
                  : row.isWeekend
                    ? '2px solid #6B4444'
                    : isAbsenceDay
                      ? '2px solid #7F2D2D'
                      : 'none';

                const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
                const canSelect = absenceMode && row.dateStr >= tomorrow && !absenceDateSet.has(row.dateStr);
                const isSelected = selectedAbsenceDates.has(row.dateStr);

                // NN/NU logic for past working days
                const today = format(new Date(), 'yyyy-MM-dd');
                const isPast = row.dateStr < today;
                const isWorkDay = !row.isWeekend && !row.isHoliday;
                const noHours = !row.hours || row.hours === 0;
                const showNN = isPast && isWorkDay && noHours && !isAbsenceDay;
                const showNU = isWorkDay && noHours && isAbsenceDay;
                const nnBg = showNN ? '#4A2020' : showNU ? '#7F1D1D' : null;

                return (
                  <div
                    key={row.day}
                    className={`flex items-center px-4 py-2.5 ${canSelect ? 'cursor-pointer hover:bg-[#334155]' : ''} ${isSelected ? 'ring-2 ring-inset ring-[#DC2626]' : ''}`}
                    style={{ backgroundColor: isSelected ? '#5A2020' : (nnBg || bgColor), borderLeft: borderStyle }}
                    data-testid={`public-day-${row.day}`}
                    onClick={() => canSelect && toggleAbsenceDate(row.dateStr)}
                  >
                    <div className="w-8 text-center">
                      <span className={`font-bold text-sm ${row.isWeekend || row.isHoliday ? 'text-[#E8836A]' : 'text-[#CBD5E1]'}`}>
                        {row.day}
                      </span>
                    </div>
                    <div className="flex-1 ml-3">
                      <span className={`text-sm capitalize ${row.isWeekend || row.isHoliday ? 'text-[#E8836A]' : 'text-[#94A3B8]'}`}>
                        {row.dayName}
                        {row.isHoliday && <span className="ml-1 text-[10px] text-red-400 font-semibold">SWIETO</span>}
                      </span>
                      {row.siteName && !showNN && !showNU && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: siteIdx >= 0 ? SITE_COLORS[siteIdx % SITE_COLORS.length] + '55' : '#334155', color: '#CBD5E1' }}>
                          {row.siteName}
                        </span>
                      )}
                      {showNU && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-[#FCA5A5] font-semibold">
                          NIEOBECNOSC USPRAWIEDLIWIONA
                        </span>
                      )}
                    </div>
                    <div className="text-right min-w-[50px]">
                      {absenceMode && canSelect ? (
                        <span className={`text-xs font-semibold ${isSelected ? 'text-red-400' : 'text-[#64748B]'}`}>
                          {isSelected ? 'X' : 'Zaznacz'}
                        </span>
                      ) : showNN ? (
                        <span className="text-red-400 font-bold text-sm">NN</span>
                      ) : showNU ? (
                        <span className="text-[#FCA5A5] font-bold text-sm">NU</span>
                      ) : row.hours !== null && row.hours > 0 ? (
                        <span className="text-[#5F7151] font-bold text-lg">{row.hours}h</span>
                      ) : (
                        <span className="text-[#4A5568] text-sm">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 p-3 bg-[#2A384C] rounded-lg border border-[#334155]">
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border-2 border-[#DC2626]" />
              <span className="text-[#94A3B8]">Swieto ustawowe</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border-2 border-[#6B4444]" style={{ backgroundColor: WEEKEND_BG }} />
              <span className="text-[#94A3B8]">Weekend</span>
            </div>
          </div>
        </div>

        {/* Advances section */}
        {advances.advances.length > 0 && (
          <Card className="mt-4 bg-[#2A384C] border-[#334155]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-[#E8836A]" />
                Zaliczki
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {advances.advances.map((adv, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-[#1E293B] rounded border border-[#334155]">
                  <div>
                    <span className="text-[#E8836A] font-bold">{adv.amount} zl</span>
                    {adv.note && <span className="text-[#94A3B8] text-xs ml-2">{adv.note}</span>}
                  </div>
                  <span className="text-[#64748B] text-[10px]">
                    {adv.created_at ? new Date(adv.created_at).toLocaleString('pl-PL') : ''}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between p-2 bg-[#0F172A] rounded border border-[#E8836A]/30">
                <span className="text-[#94A3B8] text-sm">Suma zaliczek:</span>
                <span className="text-[#E8836A] font-bold text-lg" data-testid="public-advance-total">{advances.total} zl</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Penalties section */}
        {penalties.penalties.length > 0 && (
          <Card className="mt-4 bg-[#2A384C] border-[#334155]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-[#DC2626]" />
                Kary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {penalties.penalties.map((pen, idx) => (
                <div key={pen.id || `pen-${idx}`} className="p-2 bg-[#1E293B] rounded border border-[#334155]">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-[#DC2626] font-bold">{pen.amount} zl</span>
                      {pen.description && <span className="text-[#94A3B8] text-xs ml-2">{pen.description}</span>}
                    </div>
                    <span className="text-[#64748B] text-[10px]">
                      {pen.created_at ? new Date(pen.created_at).toLocaleString('pl-PL') : ''}
                    </span>
                  </div>
                  {pen.image_data && (
                    <img
                      src={pen.image_data}
                      alt="Zdjecie kary"
                      className="w-full max-h-40 object-cover rounded cursor-pointer border border-[#334155] mt-1"
                      onClick={() => setViewPenaltyImage(pen.image_data)}
                    />
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between p-2 bg-[#0F172A] rounded border border-[#DC2626]/30">
                <span className="text-[#94A3B8] text-sm">Suma kar:</span>
                <span className="text-[#DC2626] font-bold text-lg" data-testid="public-penalty-total">{penalties.total} zl</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Absence section */}
        <Card className="mt-4 bg-[#2A384C] border-[#334155]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
              <CalendarOff className="h-4 w-4 text-[#E8836A]" />
              Zglos nieobecnosc / Повiдомити про вiдсутнiсть
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!absenceMode ? (
              <Button
                onClick={() => setAbsenceMode(true)}
                className="w-full bg-[#7F2D2D] hover:bg-[#991B1B] text-white gap-2"
                data-testid="absence-start-btn"
              >
                <CalendarOff className="h-4 w-4" />
                <span>Nie bede w pracy / Не буду на роботi</span>
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#94A3B8]">
                  Zaznacz dni powyzej (od jutra) / Позначте днi вище (вiд завтра):
                </p>
                <p className="text-xs text-[#64748B]">
                  Zaznaczono: {selectedAbsenceDates.size} dni / Позначено: {selectedAbsenceDates.size} днiв
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitAbsence}
                    disabled={absenceSaving || selectedAbsenceDates.size === 0}
                    className="flex-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                    data-testid="absence-submit-btn"
                  >
                    {absenceSaving ? 'Wysylanie...' : 'Zglos / Повiдомити'}
                  </Button>
                  <Button
                    onClick={() => { setAbsenceMode(false); setSelectedAbsenceDates(new Set()); }}
                    variant="outline"
                    className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                    data-testid="absence-cancel-btn"
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            )}

            {/* List of existing absences */}
            {absences.filter(a => a.status === 'pending').length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#334155]">
                <p className="text-xs text-[#94A3B8] font-semibold">
                  Oczekujace / Очiкуючi:
                </p>
                {absences.filter(a => a.status === 'pending').map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2 bg-[#1E293B] rounded border border-[#7F2D2D]">
                    <div>
                      <span className="text-[#E8836A] text-sm font-medium">{a.dates.join(', ')}</span>
                      <span className="text-[#64748B] text-[10px] ml-2">Oczekuje / Очiкує</span>
                    </div>
                    <button
                      onClick={() => handleCancelAbsence(a.id)}
                      className="text-[#64748B] hover:text-red-400 transition-colors p-1"
                      title="Anuluj / Скасувати"
                      data-testid={`cancel-absence-${a.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {absences.filter(a => a.status === 'approved').length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#334155]">
                <p className="text-xs text-[#94A3B8] font-semibold">
                  Zatwierdzone / Затвердженi:
                </p>
                {absences.filter(a => a.status === 'approved').map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2 bg-[#1E293B] rounded border border-[#334155]">
                    <div>
                      <span className="text-[#22C55E] text-sm font-medium">{a.dates.join(', ')}</span>
                      <span className="text-[#64748B] text-[10px] ml-2">Zatwierdzono / Затверджено</span>
                    </div>
                    <button
                      onClick={() => handleCancelAbsence(a.id)}
                      className="text-[#64748B] hover:text-red-400 transition-colors p-1"
                      title="Cofnij / Скасувати"
                      data-testid={`cancel-approved-${a.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* PWA Install Instructions */}
        {!window.matchMedia('(display-mode: standalone)').matches && (
          <Card className="mt-4 bg-[#2A384C] border-[#334155]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2 text-base">
                <Download className="h-4 w-4 text-[#5F7151]" />
                Dodaj na ekran / Додати на екран
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/iPad|iPhone|iPod/.test(navigator.userAgent) ? (
                <>
                  <div className="flex items-center gap-2 bg-[#1E293B] p-2.5 rounded-lg">
                    <span className="bg-[#334155] p-1.5 rounded"><Share className="h-4 w-4 text-[#CBD5E1]" /></span>
                    <span className="text-[#94A3B8] text-xs">1. Kliknij <strong className="text-[#CBD5E1]">Udostepnij</strong> (ikona na dole)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#1E293B] p-2.5 rounded-lg">
                    <span className="bg-[#334155] p-1.5 rounded"><PlusSquare className="h-4 w-4 text-[#CBD5E1]" /></span>
                    <span className="text-[#94A3B8] text-xs">2. Wybierz <strong className="text-[#CBD5E1]">Dodaj do ekranu poczatkowego</strong></span>
                  </div>
                  <p className="text-[10px] text-[#64748B] pt-1">
                    Натиснiть "Подiлитися" внизу, потiм "На Початковий екран"
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-[#1E293B] p-2.5 rounded-lg">
                    <span className="bg-[#334155] p-1.5 rounded"><Download className="h-4 w-4 text-[#CBD5E1]" /></span>
                    <span className="text-[#94A3B8] text-xs">Kliknij <strong className="text-[#CBD5E1]">menu (3 kropki)</strong> i wybierz <strong className="text-[#CBD5E1]">Zainstaluj aplikacje</strong> lub <strong className="text-[#CBD5E1]">Dodaj do ekranu</strong></span>
                  </div>
                  <p className="text-[10px] text-[#64748B] pt-1">
                    Натиснiть меню (3 крапки) i оберiть "Встановити додаток"
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {viewPenaltyImage && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setViewPenaltyImage(null)}>
            <img src={viewPenaltyImage} alt="Kara" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
};
