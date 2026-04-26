import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { 
  ArrowLeft, Calendar as CalendarIcon, Building2, 
  Users, Check, X 
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { pl } from 'date-fns/locale';

export const AssignmentManager = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState([]);
  const [assignFullMonth, setAssignFullMonth] = useState(false);
  const [existingAssignments, setExistingAssignments] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate, currentMonth]);

  const fetchData = async () => {
    try {
      const [employeesRes, sitesRes, assignmentsRes] = await Promise.all([
        api.get('/employees'),
        api.get('/sites'),
        api.get(`/assignments?month=${format(currentMonth, 'MMMM', { locale: pl }).toUpperCase()}&year=${currentMonth.getFullYear()}`)
      ]);
      
      setEmployees(employeesRes.data);
      // Only show 'budowa' category sites here (sklep/magazyn/inne live only in Lokalizacje tab)
      const onlyBudowy = (sitesRes.data || []).filter((s) => {
        const cat = s.category;
        return !cat || cat === 'budowa';
      });
      setSites(onlyBudowy);
      
      // Process existing assignments
      const assignmentMap = {};
      assignmentsRes.data.forEach(assignment => {
        if (!assignmentMap[assignment.employee_id]) {
          assignmentMap[assignment.employee_id] = {};
        }
        assignment.assigned_dates.forEach(date => {
          assignmentMap[assignment.employee_id][date] = assignment.site_id;
        });
      });
      setExistingAssignments(assignmentMap);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  };

  const handleDateClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (assignFullMonth) return; // Can't select individual dates when full month is enabled
    
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr);
      } else {
        return [...prev, dateStr];
      }
    });
  };

  const handleFullMonthToggle = (checked) => {
    setAssignFullMonth(checked);
    if (checked) {
      // Select all days in the month
      const allDates = getDaysInMonth().map(date => format(date, 'yyyy-MM-dd'));
      setSelectedDates(allDates);
    } else {
      setSelectedDates([]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedEmployee) {
      toast.error('Wybierz pracownika');
      return;
    }
    if (!selectedSite) {
      toast.error('Wybierz budowę');
      return;
    }
    if (selectedDates.length === 0) {
      toast.error('Wybierz przynajmniej jeden dzień');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/assignments', {
        employee_id: selectedEmployee,
        site_id: selectedSite,
        month: format(currentMonth, 'MMMM', { locale: pl }).toUpperCase(),
        year: currentMonth.getFullYear(),
        dates: selectedDates,
        assign_full_month: assignFullMonth
      });
      
      toast.success('Przypisanie zapisane!');
      setSelectedDates([]);
      setAssignFullMonth(false);
      fetchData(); // Refresh to show new assignments
    } catch (error) {
      console.error('Failed to create assignment:', error);
      toast.error('Nie udało się zapisać przypisania');
    } finally {
      setSubmitting(false);
    }
  };

  const isDateAssigned = (date, employeeId) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return existingAssignments[employeeId]?.[dateStr] || null;
  };

  const getSiteColor = (siteId) => {
    const colors = [
      'bg-[#2A384C] border-[#5F7151]',
      'bg-[#2A384C] border-[#6B8E4E]',
      'bg-[#2A384C] border-[#4A5A41]',
      'bg-[#2A384C] border-[#334155]',
      'bg-[#2A384C] border-[#5F7151]',
    ];
    const index = sites.findIndex(s => s.id === siteId);
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151] mx-auto"></div>
          <p className="mt-4 text-[#94A3B8]">Wczytywanie...</p>
        </div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth();
  const monthName = format(currentMonth, 'LLLL yyyy', { locale: pl });
  const employee = employees.find(e => e.id === selectedEmployee);
  const site = sites.find(s => s.id === selectedSite);

  return (
    <div className="min-h-screen bg-[#1E293B]">
      {/* Header */}
      <div className="bg-[#1E293B] text-white shadow-lg">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/admin/dashboard')}
              variant="ghost"
              className="text-white hover:bg-[#2A384C]"
              data-testid="back-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Przypisywanie pracowników</h1>
              <p className="text-green-100 text-sm">Zarządzaj przypisaniami do budów</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle>Wybierz pracownika i budowę</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee">Pracownik</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger id="employee" data-testid="employee-select">
                    <SelectValue placeholder="Wybierz pracownika" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {emp.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="site">Budowa</Label>
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger id="site" data-testid="site-select">
                    <SelectValue placeholder="Wybierz budowę" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {site.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Full Month Toggle */}
            <div className="flex items-center justify-between p-4 bg-[#1E293B] rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="full-month" className="text-base font-semibold">
                  Przypisz na cały miesiąc
                </Label>
                <p className="text-sm text-[#94A3B8]">
                  Automatycznie wybierze wszystkie dni w miesiącu
                </p>
              </div>
              <Switch
                id="full-month"
                checked={assignFullMonth}
                onCheckedChange={handleFullMonthToggle}
                data-testid="full-month-toggle"
              />
            </div>
          </CardContent>
        </Card>

        {/* Calendar Card */}
        {selectedEmployee && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-6 w-6 text-[#6B8E4E]" />
                  {monthName}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    data-testid="prev-month-btn"
                  >
                    ← Poprzedni
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    data-testid="next-month-btn"
                  >
                    Następny →
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {employee && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium">
                    Przypisywanie: <span className="font-bold">{employee.full_name}</span>
                    {site && <> → <span className="font-bold text-[#6B8E4E]">{site.name}</span></>}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Wybrano dni: {selectedDates.length}
                  </p>
                </div>
              )}

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {/* Day headers */}
                {['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'].map(day => (
                  <div key={day} className="text-center font-semibold text-sm text-[#94A3B8] p-2">
                    {day}
                  </div>
                ))}

                {/* Empty cells for start of month */}
                {Array.from({ length: (getDay(daysInMonth[0]) + 6) % 7 }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-2" />
                ))}

                {/* Calendar days */}
                {daysInMonth.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isSelected = selectedDates.includes(dateStr);
                  const existingSiteId = isDateAssigned(date, selectedEmployee);
                  const existingSite = sites.find(s => s.id === existingSiteId);
                  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateClick(date)}
                      disabled={assignFullMonth}
                      className={`
                        relative p-3 rounded-lg border-2 text-center transition-all
                        ${isSelected ? 'border-[#5F7151] bg-green-50' : 'border-[#334155] hover:border-[#334155]'}
                        ${existingSiteId ? getSiteColor(existingSiteId) : 'bg-[#2A384C]'}
                        ${isToday ? 'ring-2 ring-blue-400' : ''}
                        ${assignFullMonth ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                      `}
                      data-testid={`day-${dateStr}`}
                    >
                      <div className="text-sm font-semibold">{format(date, 'd')}</div>
                      {isSelected && (
                        <div className="absolute top-1 right-1">
                          <Check className="h-4 w-4 text-[#6B8E4E]" />
                        </div>
                      )}
                      {existingSiteId && (
                        <div className="text-xs mt-1 truncate" title={existingSite?.name}>
                          {existingSite?.name.substring(0, 8)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-6 p-4 bg-[#1E293B] rounded-lg">
                <p className="text-sm font-semibold mb-2">Legenda:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#5F7151] bg-green-50 rounded"></div>
                    <span>Wybrane</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 ring-2 ring-blue-400 rounded"></div>
                    <span>Dzisiaj</span>
                  </div>
                  {sites.slice(0, 2).map((site, idx) => (
                    <div key={site.id} className="flex items-center gap-2">
                      <div className={`w-4 h-4 border rounded ${getSiteColor(site.id)}`}></div>
                      <span className="truncate">{site.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="mt-6">
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedEmployee || !selectedSite || selectedDates.length === 0 || submitting}
                  className="w-full btn-primary"
                  data-testid="submit-assignment-btn"
                >
                  {submitting ? 'Zapisywanie...' : `Zapisz przypisanie (${selectedDates.length} dni)`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Assignments Summary */}
        {selectedEmployee && Object.keys(existingAssignments[selectedEmployee] || {}).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Aktualne przypisania</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sites.map(site => {
                  const siteDays = Object.entries(existingAssignments[selectedEmployee] || {})
                    .filter(([_, siteId]) => siteId === site.id)
                    .map(([date]) => date);
                  
                  if (siteDays.length === 0) return null;
                  
                  return (
                    <div key={site.id} className="flex items-center justify-between p-3 bg-[#1E293B] rounded-lg">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-[#6B8E4E]" />
                        <div>
                          <p className="font-semibold">{site.name}</p>
                          <p className="text-xs text-[#94A3B8]">{siteDays.length} dni w tym miesiącu</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
