// iter95bo: Panel "Historia zmian" + "Kosz" dla Finansów
// Read-only audit log dla finance_zapis, finance_invoice, finance_budowa
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { History, Trash2, RotateCcw, Search, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceRefresh } from './_shared';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const ENTITY_LABELS = {
  finance_zapis: 'Zapis finansowy',
  finance_invoice: 'Faktura',
  finance_budowa: 'Budowa',
};

const ACTION_LABELS = {
  create: { label: 'Dodano', color: 'text-[#4F6343] bg-[#4F6343]/15' },
  update: { label: 'Edytowano', color: 'text-[#D4AF37] bg-[#D4AF37]/15' },
  delete: { label: 'Usunięto', color: 'text-[#DC4A3A] bg-[#DC4A3A]/15' },
  restore: { label: 'Przywrócono', color: 'text-[#9DBC85] bg-[#9DBC85]/15' },
};

const fmtField = (val) => {
  if (val === null || val === undefined) return <span className="text-[#94A3B8] italic">brak</span>;
  if (typeof val === 'number') return val.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
  if (typeof val === 'boolean') return val ? 'tak' : 'nie';
  if (typeof val === 'string' && val.length > 60) return val.slice(0, 60) + '…';
  return String(val);
};

export const AuditPanel = () => {
  const [activeTab, setActiveTab] = useState('history');
  const [entries, setEntries] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDays, setFilterDays] = useState(30);

  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('days', filterDays);
      params.set('limit', '200');
      if (filterEntity) params.set('entity', filterEntity);
      if (filterAction) params.set('action', filterAction);
      const r = await api.get(`/audit-log?${params}`);
      setEntries(r.data.rows || []);
    } catch (e) {
      toast.error('Błąd pobierania historii: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, [filterEntity, filterAction, filterDays]);

  const fetchDeleted = useCallback(async () => {
    try {
      const r = await api.get('/audit-log/deleted?days=90');
      setDeleted(r.data.rows || []);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    else fetchDeleted();
  }, [activeTab, fetchHistory, fetchDeleted]);
  // iter95dq: auto-refresh po zmianie zapisu w innym panelu
  useFinanceRefresh(useCallback(() => {
    if (activeTab === 'history') fetchHistory();
    else fetchDeleted();
  }, [activeTab, fetchHistory, fetchDeleted]));

  const restore = async (entity, entityId) => {
    if (!window.confirm('Przywrócić skasowany rekord?')) return;
    try {
      await api.post('/audit-log/restore', { entity, entity_id: entityId });
      toast.success('Przywrócono');
      fetchDeleted();
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <Card className="bg-[#243049] border-[#3D5378] shadow-lg" data-testid="audit-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-white font-display text-lg tracking-tight flex items-center gap-2">
          <History className="h-5 w-5 text-[#D4AF37]" />
          Audyt zmian finansowych
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#1E2A44] border border-[#3D5378] mb-3">
            <TabsTrigger value="history" data-testid="audit-tab-history" className="data-[state=active]:bg-[#4F6343] data-[state=active]:text-white text-[#CBD5E1]">
              <Search className="h-4 w-4 mr-1" /> Historia zmian
            </TabsTrigger>
            <TabsTrigger value="trash" data-testid="audit-tab-trash" className="data-[state=active]:bg-[#4F6343] data-[state=active]:text-white text-[#CBD5E1]">
              <Trash2 className="h-4 w-4 mr-1" /> Kosz ({deleted.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            {/* Filtry */}
            <div className="flex flex-wrap gap-2 items-end mb-3 text-sm">
              <div>
                <label className="block text-[#94A3B8] text-xs mb-1">Typ</label>
                <select value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}
                  className="bg-[#152033] border border-[#3D5378] text-white px-2 py-1 rounded text-sm"
                  data-testid="audit-filter-entity">
                  <option value="">Wszystkie</option>
                  <option value="finance_zapis">Zapisy</option>
                  <option value="finance_invoice">Faktury</option>
                  <option value="finance_budowa">Budowy</option>
                </select>
              </div>
              <div>
                <label className="block text-[#94A3B8] text-xs mb-1">Akcja</label>
                <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
                  className="bg-[#152033] border border-[#3D5378] text-white px-2 py-1 rounded text-sm"
                  data-testid="audit-filter-action">
                  <option value="">Wszystkie</option>
                  <option value="create">Dodano</option>
                  <option value="update">Edytowano</option>
                  <option value="delete">Usunięto</option>
                  <option value="restore">Przywrócono</option>
                </select>
              </div>
              <div>
                <label className="block text-[#94A3B8] text-xs mb-1">Okres</label>
                <select value={filterDays} onChange={(e) => setFilterDays(parseInt(e.target.value, 10))}
                  className="bg-[#152033] border border-[#3D5378] text-white px-2 py-1 rounded text-sm"
                  data-testid="audit-filter-days">
                  <option value={7}>Ostatnie 7 dni</option>
                  <option value={30}>Ostatnie 30 dni</option>
                  <option value={90}>Ostatnie 90 dni</option>
                  <option value={365}>Ostatni rok</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-[#CBD5E1] text-sm p-4">Ładowanie...</div>
            ) : entries.length === 0 ? (
              <div className="text-[#CBD5E1] text-sm p-4 text-center">Brak zmian w wybranym okresie.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs uppercase">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Typ</th>
                      <th className="text-left p-2">Akcja</th>
                      <th className="text-left p-2">Użytkownik</th>
                      <th className="text-left p-2">Szczegóły</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-t border-[#3D5378] hover:bg-[#1E2A44]/50" data-testid={`audit-row-${e.id}`}>
                        <td className="p-2 text-white whitespace-nowrap font-mono text-xs">
                          {e.ts.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="p-2 text-[#CBD5E1]">{ENTITY_LABELS[e.entity] || e.entity}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION_LABELS[e.action]?.color || 'text-[#CBD5E1]'}`}>
                            {ACTION_LABELS[e.action]?.label || e.action}
                          </span>
                        </td>
                        <td className="p-2 text-[#CBD5E1] text-xs">
                          <UserIcon className="h-3 w-3 inline mr-1" />{e.user_name}
                        </td>
                        <td className="p-2 text-xs text-[#94A3B8]">
                          {e.action === 'update' && e.diff ? (
                            <div className="space-y-0.5">
                              {Object.entries(e.diff).slice(0, 3).map(([field, vals]) => (
                                <div key={field}>
                                  <span className="text-[#D4AF37]">{field}:</span>{' '}
                                  <span className="text-[#DC4A3A] line-through">{fmtField(vals.old)}</span>
                                  {' → '}
                                  <span className="text-[#9DBC85]">{fmtField(vals.new)}</span>
                                </div>
                              ))}
                              {Object.keys(e.diff).length > 3 && (
                                <div className="text-[#64748B]">… i {Object.keys(e.diff).length - 3} innych pól</div>
                              )}
                            </div>
                          ) : e.action === 'create' && e.snapshot ? (
                            <span>{e.snapshot.kontrahent || e.snapshot.name || e.snapshot.nr_faktury} {e.snapshot.netto ? `(${e.snapshot.netto} zł)` : ''}</span>
                          ) : e.action === 'delete' && e.snapshot ? (
                            <span className="text-[#DC4A3A]">{e.snapshot.kontrahent || e.snapshot.name || e.snapshot.nr_faktury} {e.snapshot.netto ? `(${e.snapshot.netto} zł)` : ''}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="trash">
            <p className="text-[#94A3B8] text-xs mb-3">
              Skasowane rekordy z ostatnich 90 dni. Możesz je przywrócić — dane pozostają w bazie, ale są niewidoczne w listach.
            </p>
            {loading ? (
              <div className="text-[#CBD5E1] text-sm p-4">Ładowanie...</div>
            ) : deleted.length === 0 ? (
              <div className="text-[#CBD5E1] text-sm p-4 text-center">Kosz jest pusty.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#1E2A44] text-[#CBD5E1] text-xs uppercase">
                    <tr>
                      <th className="text-left p-2">Skasowano</th>
                      <th className="text-left p-2">Typ</th>
                      <th className="text-left p-2">Nazwa / Kontrahent</th>
                      <th className="text-right p-2">Kwota</th>
                      <th className="text-left p-2">Przez kogo</th>
                      <th className="text-right p-2">Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleted.map((d) => {
                      const rec = d.record;
                      return (
                        <tr key={`${d.entity}-${rec.id}`} className="border-t border-[#3D5378] hover:bg-[#1E2A44]/50" data-testid={`trash-row-${rec.id}`}>
                          <td className="p-2 text-white whitespace-nowrap font-mono text-xs">
                            {String(rec.deleted_at || '').slice(0, 16).replace('T', ' ')}
                          </td>
                          <td className="p-2 text-[#CBD5E1]">{ENTITY_LABELS[d.entity] || d.entity}</td>
                          <td className="p-2 text-[#CBD5E1]">
                            {rec.kontrahent || rec.name || rec.nr_faktury || '—'}
                          </td>
                          <td className="p-2 text-right text-[#D4AF37] font-semibold">
                            {rec.netto ? Number(rec.netto).toLocaleString('pl-PL', { maximumFractionDigits: 2 }) + ' zł' : '—'}
                          </td>
                          <td className="p-2 text-[#94A3B8] text-xs">{rec.deleted_by_name || rec.deleted_by || '—'}</td>
                          <td className="p-2 text-right">
                            <Button onClick={() => restore(d.entity, rec.id)}
                              className="bg-[#4F6343] hover:bg-[#5F7552] text-white h-7 text-xs px-2"
                              data-testid={`restore-${rec.id}`}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Przywróć
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
