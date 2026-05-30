import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Calendar, CheckCircle2, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (iso) => {
  if (!iso) return '-';
  try {
    return format(new Date(iso + 'T00:00:00'), 'd MMM', { locale: pl });
  } catch {
    return iso;
  }
};

const dayDiff = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
};

/**
 * Harmonogram zadan dla pracownika (read-only).
 * Renderuje sie tylko gdy serwer zwroci niepusta liste lub visible_sites.
 * Jezeli admin wylaczyl widocznosc dla brygadzistow tej budowy - cicho ukryty.
 */
export const PublicSchedule = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [hasVisible, setHasVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    axios.get(`${API}/public/schedule/${token}?days_ahead=14`)
      .then(res => {
        if (cancelled) return;
        setRows(res.data?.rows || []);
        setHasVisible((res.data?.visible_sites || []).length > 0);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [token]);

  // Cicho ukryty gdy brak widocznych budow ALBO brak zadan
  if (!loaded) return null;
  if (!hasVisible) return null;
  if (rows.length === 0) return null;

  return (
    <Card className="bg-[#243049] border-[#3D5378] mb-4" data-testid="public-schedule">
      <CardHeader className="pb-2">
        <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
          <Calendar className="h-5 w-5 text-[#4F6343]" />
          Harmonogram budowy ({rows.length})
        </CardTitle>
        <p className="text-xs text-[#94A3B8]">Najbliższe 2 tygodnie</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((t) => {
          const isDone = !!t.actual_end_date;
          const endDiff = dayDiff(t.end_date);
          const isOverdue = endDiff !== null && endDiff < 0 && !isDone;
          const isToday = endDiff === 0;
          const isSoon = endDiff !== null && endDiff > 0 && endDiff <= 3 && !isDone;
          const accentColor = isDone
            ? '#4F6343'
            : isOverdue
              ? '#9B2C2C'
              : isToday
                ? '#D4AF37'
                : isSoon
                  ? '#B45309'
                  : '#3D5378';

          return (
            <div
              key={t.id}
              className="p-2.5 rounded-lg border-l-4 bg-[#1E2A44]"
              style={{ borderLeftColor: accentColor }}
              data-testid={`public-schedule-task-${t.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-[#5F7552] shrink-0" />}
                    <p className={`font-semibold text-sm truncate ${isDone ? 'text-[#94A3B8] line-through' : 'text-[#F1F5F9]'}`}>
                      {t.name}
                    </p>
                  </div>
                  {t.budowa_name && (
                    <p className="text-[10px] text-[#CBD5E1] mt-0.5 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {t.budowa_name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-[#CBD5E1]">
                    <span>Start: <span className="text-[#F1F5F9] font-medium">{fmtDate(t.start_date)}</span></span>
                    <span>Koniec: <span className="text-[#F1F5F9] font-medium">{fmtDate(t.end_date)}</span></span>
                  </div>
                </div>
                {!isDone && endDiff !== null && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ backgroundColor: accentColor + '33', color: accentColor }}
                  >
                    {endDiff < 0 ? `${Math.abs(endDiff)}d po` : endDiff === 0 ? 'Dziś' : `Za ${endDiff}d`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default PublicSchedule;
