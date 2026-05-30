import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { ActionButton } from '../ui/action-button';
import { Calendar, CheckCircle2, Clock, Building2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

// Helper - YYYY-MM-DD dzis (UTC date string)
const todayStr = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return format(d, 'yyyy-MM-dd');
};

const fmtDate = (iso) => {
  if (!iso) return '-';
  try {
    return format(new Date(iso + 'T00:00:00'), 'd MMM yyyy', { locale: pl });
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

export const ForemanSchedule = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [editTask, setEditTask] = useState(null);
  const [endDateInput, setEndDateInput] = useState('');
  const [actualEndInput, setActualEndInput] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/budget/my-schedule?days_ahead=14');
      setRows(res.data.rows || []);
    } catch (e) {
      toast.error('Nie udało się pobrać harmonogramu');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEdit = (task) => {
    setEditTask(task);
    setEndDateInput(task.end_date || '');
    setActualEndInput(task.actual_end_date || '');
  };

  const closeEdit = () => {
    setEditTask(null);
    setEndDateInput('');
    setActualEndInput('');
  };

  const savePlannedEnd = async () => {
    if (!editTask) return;
    if (!endDateInput) { toast.error('Podaj datę'); throw new Error('no_date'); }
    // Optimistic update
    const snapshot = rows;
    setRows(prev => prev.map(r => r.id === editTask.id ? { ...r, end_date: endDateInput } : r));
    try {
      await api.patch(`/budget/tasks/${editTask.id}`, { end_date: endDateInput });
      toast.success('Planowany termin zaktualizowany');
      fetchData(true);
    } catch (e) {
      setRows(snapshot);
      toast.error(e.response?.data?.detail || 'Nie udało się zapisać');
      throw e;
    }
  };

  const saveActualEnd = async () => {
    if (!editTask) return;
    if (!actualEndInput) { toast.error('Podaj datę'); throw new Error('no_date'); }
    // Walidacja front: nie w przyszłości
    if (actualEndInput > todayStr()) {
      toast.error('Data zakończenia nie może być w przyszłości');
      throw new Error('future');
    }
    const snapshot = rows;
    setRows(prev => prev.map(r => r.id === editTask.id ? { ...r, actual_end_date: actualEndInput } : r));
    try {
      await api.patch(`/budget/tasks/${editTask.id}`, { actual_end_date: actualEndInput });
      toast.success('Zadanie oznaczone jako zakończone');
      closeEdit();
      fetchData(true);
    } catch (e) {
      setRows(snapshot);
      toast.error(e.response?.data?.detail || 'Nie udało się zapisać');
      throw e;
    }
  };

  const clearActualEnd = async () => {
    if (!editTask) return;
    const snapshot = rows;
    setRows(prev => prev.map(r => r.id === editTask.id ? { ...r, actual_end_date: null } : r));
    try {
      await api.patch(`/budget/tasks/${editTask.id}`, { clear_actual_end_date: true });
      toast.success('Cofnięto oznaczenie zakończenia');
      setActualEndInput('');
      fetchData(true);
    } catch (e) {
      setRows(snapshot);
      toast.error(e.response?.data?.detail || 'Nie udało się zapisać');
      throw e;
    }
  };

  if (loading) {
    return (
      <Card className="bg-[#243049] border-[#3D5378]">
        <CardContent className="pt-6 text-center text-[#CBD5E1]">
          Ładowanie harmonogramu...
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="bg-[#243049] border-[#3D5378]">
        <CardHeader>
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5 text-[#4F6343]" /> Harmonogram - 2 tygodnie
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-[#4F6343] mx-auto mb-3" />
          <p className="text-[#F1F5F9] font-semibold">Brak zadań na najbliższe 14 dni</p>
          <p className="text-[#CBD5E1] text-sm mt-1">Wszystkie zadania są poza zakresem lub już zakończone.</p>
        </CardContent>
      </Card>
    );
  }

  // Sortowanie: najpierw spóźnione (end_date < dziś), potem dzisiejsze, potem nadchodzące
  const sorted = [...rows].sort((a, b) => {
    const aEnd = a.end_date || a.start_date || '';
    const bEnd = b.end_date || b.start_date || '';
    return aEnd.localeCompare(bEnd);
  });

  return (
    <div className="space-y-3" data-testid="foreman-schedule">
      <Card className="bg-[#243049] border-[#3D5378]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[#F1F5F9] flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5 text-[#4F6343]" />
            Harmonogram - najbliższe 2 tygodnie ({sorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.map((t) => {
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
                className="p-3 rounded-lg border-l-4 bg-[#1E2A44] hover:bg-[#2A3855] cursor-pointer transition-colors"
                style={{ borderLeftColor: accentColor }}
                onClick={() => openEdit(t)}
                data-testid={`schedule-task-${t.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isDone && <CheckCircle2 className="h-4 w-4 text-[#5F7552] shrink-0" />}
                      <p className={`font-semibold truncate ${isDone ? 'text-[#94A3B8] line-through' : 'text-[#F1F5F9]'}`}>
                        {t.name}
                      </p>
                    </div>
                    {t.budowa_name && (
                      <p className="text-xs text-[#CBD5E1] mt-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {t.budowa_name}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                      <span className="text-[#CBD5E1]">
                        Start: <span className="text-[#F1F5F9] font-medium">{fmtDate(t.start_date)}</span>
                      </span>
                      <span className="text-[#CBD5E1]">
                        Koniec: <span className="text-[#F1F5F9] font-medium">{fmtDate(t.end_date)}</span>
                      </span>
                      {t.actual_end_date && (
                        <span className="text-[#5F7552] font-medium">
                          ✓ Wykonano: {fmtDate(t.actual_end_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {!isDone && endDiff !== null && (
                      <span
                        className="text-xs font-bold px-2 py-1 rounded"
                        style={{ backgroundColor: accentColor + '33', color: accentColor }}
                      >
                        {endDiff < 0 ? `${Math.abs(endDiff)}d spóźnienie` : endDiff === 0 ? 'Dziś' : `Za ${endDiff}d`}
                      </span>
                    )}
                    {typeof t.progress_pct === 'number' && (
                      <div className="text-[10px] text-[#CBD5E1] mt-1 flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {Math.round(t.progress_pct)}%
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editTask && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={closeEdit}
        >
          <Card
            className="bg-[#243049] border-[#3D5378] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle className="text-[#F1F5F9] text-base">
                Edycja zadania
              </CardTitle>
              <p className="text-sm text-[#CBD5E1] truncate" data-testid="schedule-edit-task-name">
                {editTask.name}
              </p>
              {editTask.budowa_name && (
                <p className="text-xs text-[#94A3B8]">{editTask.budowa_name}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-[#F1F5F9] block mb-1">
                  Planowany termin zakończenia
                </label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={endDateInput}
                    onChange={(e) => setEndDateInput(e.target.value)}
                    className="bg-[#1E2A44] border-[#3D5378] text-white"
                    data-testid="schedule-end-date-input"
                  />
                  <ActionButton
                    onAction={savePlannedEnd}
                    loadingText="..."
                    successText="✓"
                    className="bg-[#3D5378] hover:bg-[#4F6343] text-white shrink-0"
                    data-testid="schedule-save-end-date"
                  >Zapisz</ActionButton>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-1">
                  Możesz przesunąć planowany termin zakończenia.
                </p>
              </div>

              <div>
                <label className="text-sm text-[#F1F5F9] block mb-1">
                  Faktyczne zakończenie (max dziś)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={actualEndInput}
                    max={todayStr()}
                    onChange={(e) => setActualEndInput(e.target.value)}
                    className="bg-[#1E2A44] border-[#3D5378] text-white"
                    data-testid="schedule-actual-end-input"
                  />
                  <ActionButton
                    onAction={saveActualEnd}
                    loadingText="..."
                    successText="✓"
                    className="bg-[#4F6343] hover:bg-[#3F5235] text-white shrink-0"
                    data-testid="schedule-save-actual-end"
                  >Zakończ</ActionButton>
                </div>
                {editTask.actual_end_date && (
                  <ActionButton
                    onAction={clearActualEnd}
                    variant="outline"
                    className="mt-2 border-[#9B2C2C] text-[#FCA5A5] hover:bg-[#7F1D1D]"
                    data-testid="schedule-clear-actual-end"
                  >
                    Cofnij zakończenie
                  </ActionButton>
                )}
                <p className="text-[10px] text-[#94A3B8] mt-1">
                  Oznacz zadanie jako wykonane wpisując rzeczywistą datę zakończenia.
                </p>
              </div>

              <div className="pt-2 border-t border-[#3D5378]">
                <button
                  onClick={closeEdit}
                  className="w-full px-4 py-2 rounded-lg bg-[#1E2A44] text-[#CBD5E1] hover:bg-[#3D5378] text-sm"
                  data-testid="schedule-close-modal"
                >
                  Zamknij
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ForemanSchedule;
