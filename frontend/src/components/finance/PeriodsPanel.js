// iter95bp: Panel okresow ksiegowych - zamykanie/odblokowywanie miesiecy
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Lock, Unlock, Calendar, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export const PeriodsPanel = () => {
  const [periods, setPeriods] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const fetchPeriods = useCallback(async () => {
    try {
      const r = await api.get(`/finance/periods?year=${year}`);
      setPeriods(r.data.rows || []);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const isLocked = (month) => periods.some(p => p.year === year && p.month === month && p.status === 'closed');
  const getPeriod = (month) => periods.find(p => p.year === year && p.month === month);

  const togglePeriod = async (month, currentlyLocked) => {
    const action = currentlyLocked ? 'open' : 'close';
    const verb = currentlyLocked ? 'odblokować' : 'zamknąć';
    if (!window.confirm(`Czy na pewno ${verb} ${MONTHS[month - 1]} ${year}?`)) return;
    try {
      await api.post(`/finance/periods/${action}`, { year, month });
      toast.success(currentlyLocked ? `Odblokowano ${MONTHS[month - 1]} ${year}` : `Zamknięto ${MONTHS[month - 1]} ${year}`);
      fetchPeriods();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378] shadow-lg" data-testid="periods-panel">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#D4AF37]" />
          Okresy księgowe
        </CardTitle>
        <p className="text-xs text-[#94A3B8] mt-1">
          Zamykając miesiąc blokujesz dodawanie/edycję/usuwanie zapisów w nim. Zapobiega to przypadkowym zmianom historycznych danych po zaksięgowaniu.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-[#CBD5E1] text-sm">Rok:</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className="bg-[#152033] border border-[#3D5378] text-white px-2 py-1 rounded text-sm"
            data-testid="periods-year-select">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {loading && <span className="text-[#94A3B8] text-xs">Ładuję...</span>}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {MONTHS.map((monthName, i) => {
            const month = i + 1;
            const locked = isLocked(month);
            const period = getPeriod(month);
            return (
              <div key={month}
                className={`p-3 rounded border ${locked ? 'border-[#DC4A3A] bg-[#DC4A3A]/10' : 'border-[#3D5378] bg-[#152033]'}`}
                data-testid={`period-${year}-${month}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold text-sm">{monthName}</span>
                  {locked ? (
                    <Lock className="h-4 w-4 text-[#DC4A3A]" />
                  ) : (
                    <Unlock className="h-4 w-4 text-[#9DBC85]" />
                  )}
                </div>
                <div className="text-xs text-[#94A3B8] mb-2">
                  {locked ? (
                    <>
                      <span className="text-[#DC4A3A]">ZAMKNIĘTY</span>
                      {period?.closed_by_name && (
                        <div className="text-[10px] mt-0.5">przez {period.closed_by_name}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-[#9DBC85]">OTWARTY</span>
                  )}
                </div>
                <Button onClick={() => togglePeriod(month, locked)}
                  className={`w-full text-xs h-7 ${locked ? 'bg-[#3D5378] hover:bg-[#4A5F8E]' : 'bg-[#4F6343] hover:bg-[#5F7552]'} text-white`}
                  data-testid={`toggle-period-${year}-${month}`}>
                  {locked ? <><Unlock className="h-3 w-3 mr-1" /> Otwórz</> : <><Lock className="h-3 w-3 mr-1" /> Zamknij</>}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded text-xs text-[#CBD5E1] flex gap-2">
          <AlertTriangle className="h-4 w-4 text-[#D4AF37] flex-shrink-0" />
          <div>
            <strong className="text-[#D4AF37]">Tip dla księgowej:</strong> Zamknij miesiąc po finalnym zaksięgowaniu wszystkich faktur. Jeśli musisz coś poprawić — najpierw odblokuj, popraw, ponownie zamknij. Każda zmiana okresu jest logowana w panelu Audyt.
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
