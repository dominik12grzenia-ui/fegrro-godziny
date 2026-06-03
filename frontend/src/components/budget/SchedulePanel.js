// iter95bc: wydzielony z Budget.js (refaktor split)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, FileText, ArrowLeft, BookOpen, Search, FileSpreadsheet, FileDown, Calendar, X, ChevronLeft, FileBarChart, FilePlus, Receipt, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../context/AuthContext';
import { ScheduleTaskModal } from './ScheduleTaskModal';
import { GenerateScheduleModal } from './GenerateScheduleModal';
import { GanttView } from './GanttView';

export const SchedulePanel = ({ budowaId, onChange }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [viewMode, setViewMode] = useState('list');  // 'list' | 'gantt'
  const [genModal, setGenModal] = useState(false);  // iter95j

  const fetchTasks = useCallback(() => {
    if (!budowaId) return;
    api.get(`/budget/${budowaId}/tasks`)
      .then((r) => setTasks(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [budowaId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć zadanie?')) return;
    try {
      await api.delete(`/budget/tasks/${id}`);
      toast.success('Usunięte');
      fetchTasks();
      onChange && onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Gantt - obliczamy zakres dat
  const ganttData = useMemo(() => {
    if (tasks.length === 0) return null;
    const dates = tasks.flatMap((t) => [new Date(t.start_date), new Date(t.end_date)]);
    const minD = new Date(Math.min(...dates));
    const maxD = new Date(Math.max(...dates));
    const totalDays = Math.max(1, Math.ceil((maxD - minD) / (1000 * 60 * 60 * 24)));
    return { minD, maxD, totalDays };
  }, [tasks]);

  return (
    <Card className="bg-[#1E2A44] border-[#3D5378]">
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-white text-base">Harmonogram zadań</CardTitle>
        <div className="flex gap-2">
          <div className="inline-flex rounded overflow-hidden border border-[#3D5378]">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-xs ${viewMode === 'list' ? 'bg-[#D4AF37] text-[#152033]' : 'bg-[#1E2A44] text-[#CBD5E1]'}`} data-testid="schedule-view-list">Lista</button>
            <button onClick={() => setViewMode('gantt')} className={`px-3 py-1 text-xs ${viewMode === 'gantt' ? 'bg-[#D4AF37] text-[#152033]' : 'bg-[#1E2A44] text-[#CBD5E1]'}`} data-testid="schedule-view-gantt">Gantt</button>
          </div>
          <Button size="sm" onClick={() => setGenModal(true)} variant="outline"
            className="border-[#5F7552] text-[#9DBC85] hover:bg-[#5F7552]/20 h-8"
            data-testid="schedule-generate-btn"
            title="Generuje task dla każdej pozycji budżetu (z auto-progresem z protokołu)">
            <Calendar className="h-4 w-4 mr-1" /> Generuj z budżetu
          </Button>
          <Button size="sm" onClick={() => { setEditTask(null); setModalOpen(true); }} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#152033] h-8" data-testid="schedule-add-task-btn">
            <Plus className="h-4 w-4 mr-1" /> Dodaj zadanie
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading && tasks.length === 0 ? (
          <div className="text-[#CBD5E1] text-sm">Ładuję...</div>
        ) : tasks.length === 0 ? (
          <div className="text-[#CBD5E1] text-sm py-6 text-center" data-testid="schedule-empty">
            Brak zadań. Kliknij „Dodaj zadanie" aby utworzyć harmonogram.
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full text-xs" data-testid="schedule-list-table">
            <thead className="text-[#CBD5E1] border-b border-[#3D5378]">
              <tr>
                <th className="text-left p-2">Zadanie</th>
                <th className="text-left p-2">Start</th>
                <th className="text-left p-2">Planowany koniec</th>
                <th className="text-left p-2">Faktyczny koniec</th>
                <th className="text-right p-2">Dni</th>
                <th className="text-right p-2">% wyk.</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const days = Math.ceil((new Date(t.end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24)) + 1;
                const isAuto = t.progress_source === 'auto';
                const finishedEarly = t.actual_end_date && t.actual_end_date < t.end_date;
                const earlyDays = finishedEarly ? Math.ceil((new Date(t.end_date) - new Date(t.actual_end_date)) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <tr key={t.id} className="border-b border-[#3D5378]/40 hover:bg-[#152033]/40">
                    <td className="p-2 text-white">
                      <span className="inline-block w-3 h-3 rounded mr-2 align-middle" style={{ backgroundColor: t.color || '#D4AF37' }} />
                      {t.name}
                      {isAuto && <span className="ml-1 text-[10px] text-[#9DBC85]" title="Progres auto z protokołu">🔗</span>}
                    </td>
                    <td className="p-2 text-[#F1F5F9]">{t.start_date}</td>
                    <td className="p-2 text-[#F1F5F9]">{t.end_date}</td>
                    <td className="p-2 text-[#9DBC85]">
                      {t.actual_end_date ? (
                        <span title={finishedEarly ? `Wcześniej o ${earlyDays} dni` : ''}>
                          {t.actual_end_date}{finishedEarly && <span className="ml-1">⚡</span>}
                        </span>
                      ) : <span className="text-[#94A3B8]">—</span>}
                    </td>
                    <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{days}</td>
                    <td className="p-2 text-right text-[#D4AF37] tabular-nums">{(t.progress_pct || 0).toFixed(1)}%</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button onClick={() => { setEditTask(t); setModalOpen(true); }} className="text-[#CBD5E1] hover:text-white mr-2" data-testid={`schedule-edit-${t.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(t.id)} className="text-[#CBD5E1] hover:text-[#FCA5A5]" data-testid={`schedule-del-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <GanttView tasks={tasks} ganttData={ganttData} />
        )}
      </CardContent>
      {modalOpen && (
        <ScheduleTaskModal
          budowaId={budowaId}
          editTask={editTask}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchTasks(); onChange && onChange(); }}
        />
      )}
      {genModal && (
        <GenerateScheduleModal
          budowaId={budowaId}
          onClose={() => setGenModal(false)}
          onSaved={() => { setGenModal(false); fetchTasks(); onChange && onChange(); }}
        />
      )}
    </Card>
  );
};

