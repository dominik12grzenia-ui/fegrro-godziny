/**
 * Wyceny - standalone module (iter95k)
 * 4 zakladki:
 *   1. Lista wycen + edytor (wycena -> etapy -> pozycje -> podpozycje R/M/S)
 *   2. Ceny materialow
 *   3. Ceny robocizny
 *   4. Ceny sprzetu
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Plus, Trash2, Pencil, ChevronRight, ChevronDown, FileText, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../context/AuthContext';

const fmtPLN = (v) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

const TYPE_LABEL = { materials: 'Materiał', labor: 'Robocizna', equipment: 'Sprzęt' };
const TYPE_COLOR = { materials: '#CBD5E1', labor: '#9DBC85', equipment: '#D4AF37' };

export const Wyceny = () => {
  const [tab, setTab] = useState('list');
  const [selectedId, setSelectedId] = useState(null);  // id otwartej wyceny

  return (
    <Card className="bg-[#131C2F] border-[#2A3B59]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#D4AF37]" />
            Wyceny ofertowe
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#0B1120] border border-[#2A3B59] mb-3">
            <TabsTrigger value="list" data-testid="wyceny-tab-list"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Wyceny
            </TabsTrigger>
            <TabsTrigger value="materials" data-testid="wyceny-tab-materials"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny materiałów
            </TabsTrigger>
            <TabsTrigger value="labor" data-testid="wyceny-tab-labor"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny robocizny
            </TabsTrigger>
            <TabsTrigger value="equipment" data-testid="wyceny-tab-equipment"
              className="data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B1120]">
              Ceny sprzętu
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            {selectedId ? (
              <WycenaEditor wycenaId={selectedId} onBack={() => setSelectedId(null)} />
            ) : (
              <WycenyList onOpen={(id) => setSelectedId(id)} />
            )}
          </TabsContent>
          <TabsContent value="materials">
            <MaterialsPriceBook />
          </TabsContent>
          <TabsContent value="labor">
            <LaborPriceBook />
          </TabsContent>
          <TabsContent value="equipment">
            <EquipmentPriceBook />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// =============== LISTA WYCEN ===============
const WycenyList = ({ onOpen }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    api.get('/wyceny').then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const create = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Podaj nazwę wyceny'); return; }
    try {
      const r = await api.post('/wyceny', { name });
      toast.success('Utworzono wycenę');
      setNewName(''); setCreating(false);
      fetchRows();
      onOpen(r.data.id);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Usunąć wycenę "${name}"? Wszystkie etapy/pozycje zostaną usunięte.`)) return;
    try {
      await api.delete(`/wyceny/${id}`);
      toast.success('Usunięto');
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Nazwa nowej wyceny..." className="bg-[#0B1120] border-[#2A3B59] flex-1"
          data-testid="wyceny-new-name" />
        <Button onClick={create} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="wyceny-create-btn">
          <Plus className="h-4 w-4 mr-1" /> Utwórz wycenę
        </Button>
      </div>
      {loading ? <div className="text-[#94A3B8] text-sm">Ładuję...</div>
        : rows.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="wyceny-empty">
            Brak wycen. Wpisz nazwę i kliknij „Utwórz wycenę".
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="wyceny-list">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Nazwa</th>
                <th className="text-right p-2">Pozycje</th>
                <th className="text-right p-2">Suma netto</th>
                <th className="text-left p-2">Utworzono</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/40 cursor-pointer"
                    onClick={() => onOpen(w.id)} data-testid={`wycena-row-${w.id}`}>
                  <td className="p-2 text-white font-semibold">{w.name}</td>
                  <td className="p-2 text-right text-[#CBD5E1] tabular-nums">{w.lines_count || 0}</td>
                  <td className="p-2 text-right text-[#D4AF37] tabular-nums font-semibold">{fmtPLN(w.total_netto)}</td>
                  <td className="p-2 text-[#94A3B8] text-xs">{(w.created_at || '').slice(0, 10)}</td>
                  <td className="p-2 text-right">
                    <button onClick={(e) => { e.stopPropagation(); remove(w.id, w.name); }}
                      className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`wycena-del-${w.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
};

// =============== EDYTOR WYCENY (stages -> positions -> R/M/S) ===============
const WycenaEditor = ({ wycenaId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [newStageName, setNewStageName] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    api.get(`/wyceny/${wycenaId}/template`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [wycenaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // iter95p: lokalna aktualizacja konkretnej linii bez refetch calego template (zachowuje focus)
  const updateLineLocal = useCallback((lineId, patch) => {
    setData((prev) => {
      if (!prev) return prev;
      const stages = (prev.stages || []).map((st) => ({
        ...st,
        positions: (st.positions || []).map((p) => ({
          ...p,
          slots: (p.slots || []).map((s) => s.id === lineId ? { ...s, ...patch } : s),
        })),
      }));
      return { ...prev, stages };
    });
  }, []);

  const totalNetto = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    (data.stages || []).forEach((s) => {
      (s.positions || []).forEach((p) => {
        (p.slots || []).forEach((slot) => {
          if (slot.children?.length > 0) {
            slot.children.forEach((ch) => { total += (ch.quantity || 0) * (ch.unit_price_netto || 0); });
          } else {
            total += (slot.quantity || 0) * (slot.unit_price_netto || 0);
          }
        });
      });
    });
    return total;
  }, [data]);

  const addStage = async () => {
    if (!newStageName.trim()) return;
    try {
      await api.post('/wyceny/stages', { wycena_id: wycenaId, name: newStageName.trim(), order: (data?.stages?.length || 0) });
      setNewStageName('');
      fetchData();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const delStage = async (id) => {
    if (!window.confirm('Usunąć etap? Wszystkie pozycje zostaną usunięte.')) return;
    try { await api.delete(`/wyceny/stages/${id}`); fetchData(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const addPosition = async (stageId) => {
    const name = window.prompt('Nazwa pozycji:');
    if (!name) return;
    try {
      await api.post('/wyceny/positions', { wycena_id: wycenaId, stage_id: stageId, name, order: 0 });
      fetchData();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const delPosition = async (id) => {
    if (!window.confirm('Usunąć pozycję? Wszystkie podpozycje zostaną usunięte.')) return;
    try { await api.delete(`/wyceny/positions/${id}`); fetchData(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  if (loading) return <div className="text-[#94A3B8]">Ładuję wycenę...</div>;
  if (!data) return null;
  const w = data.wycena;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button onClick={onBack} variant="outline" className="border-[#2A3B59] text-[#CBD5E1]" data-testid="wycena-back-btn">
          <ArrowLeft className="h-4 w-4 mr-1" /> Lista wycen
        </Button>
        <div className="flex-1">
          <div className="text-white text-lg font-semibold">{w.name}</div>
          {w.notes && <div className="text-xs text-[#94A3B8]">{w.notes}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#94A3B8] uppercase">Suma netto</div>
          <div className="text-[#D4AF37] text-xl font-bold tabular-nums" data-testid="wycena-total">
            {fmtPLN(totalNetto)} zł
          </div>
        </div>
      </div>

      {/* Lista etapow */}
      <div className="space-y-2">
        {(data.stages || []).map((st) => (
          <StageBlock key={st.id} stage={st} wycenaId={wycenaId}
            expanded={expanded} toggleExpand={toggleExpand}
            onChange={fetchData} onLocalUpdate={updateLineLocal}
            onAddPos={() => addPosition(st.id)}
            onDelStage={() => delStage(st.id)}
            onDelPos={delPosition} />
        ))}
      </div>

      {/* Dodaj etap */}
      <div className="flex items-center gap-2 pt-2 border-t border-[#2A3B59]">
        <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStage()}
          placeholder="Nazwa nowego etapu..." className="bg-[#0B1120] border-[#2A3B59]"
          data-testid="stage-new-name" />
        <Button onClick={addStage} variant="outline" className="border-[#5F7552] text-[#9DBC85]"
          data-testid="stage-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj etap
        </Button>
      </div>
    </div>
  );
};

const StageBlock = ({ stage, wycenaId, expanded, toggleExpand, onChange, onLocalUpdate, onAddPos, onDelStage, onDelPos }) => {
  return (
    <div className="border border-[#2A3B59] rounded bg-[#0B1120]/30">
      <div className="flex items-center justify-between p-2 bg-[#131C2F] border-b border-[#2A3B59]">
        <div className="font-semibold text-white">📁 {stage.name}</div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onAddPos} variant="outline" className="border-[#2A3B59] text-[#CBD5E1] h-7"
            data-testid={`pos-add-${stage.id}`}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Pozycja
          </Button>
          <button onClick={onDelStage} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`stage-del-${stage.id}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {(stage.positions || []).length === 0 ? (
        <div className="text-[#64748B] text-xs p-3 text-center">Brak pozycji. Kliknij „Pozycja" aby dodać.</div>
      ) : (
        <div>
          {(stage.positions || []).map((p) => (
            <PositionBlock key={p.id} position={p} wycenaId={wycenaId} stageId={stage.id}
              expanded={expanded} toggleExpand={toggleExpand} onChange={onChange} onLocalUpdate={onLocalUpdate}
              onDel={() => onDelPos(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

const PositionBlock = ({ position, wycenaId, stageId, expanded, toggleExpand, onChange, onLocalUpdate, onDel }) => {
  const isOpen = expanded.has(position.id);
  const slotsTotal = (position.slots || []).reduce((acc, s) => {
    if (s.children?.length > 0) return acc + s.children.reduce((a, c) => a + (c.quantity || 0) * (c.unit_price_netto || 0), 0);
    return acc + (s.quantity || 0) * (s.unit_price_netto || 0);
  }, 0);

  return (
    <div className="border-b border-[#2A3B59]/40 last:border-b-0">
      <div className="flex items-center justify-between p-2 hover:bg-[#0B1120]/40">
        <button onClick={() => toggleExpand(position.id)} className="flex items-center gap-2 text-left flex-1"
          data-testid={`pos-toggle-${position.id}`}>
          {isOpen ? <ChevronDown className="h-4 w-4 text-[#D4AF37]" /> : <ChevronRight className="h-4 w-4 text-[#94A3B8]" />}
          <span className="text-[#CBD5E1] font-medium">{position.name}</span>
          <span className="text-[10px] text-[#94A3B8]">({(position.slots || []).length} podpoz.)</span>
        </button>
        <div className="text-[#D4AF37] tabular-nums font-semibold mr-3">{fmtPLN(slotsTotal)} zł</div>
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`pos-del-${position.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {isOpen && (
        <SlotsTable position={position} wycenaId={wycenaId} stageId={stageId} onChange={onChange} onLocalUpdate={onLocalUpdate} />
      )}
    </div>
  );
};

const SlotsTable = ({ position, wycenaId, stageId, onChange, onLocalUpdate }) => {
  const [adding, setAdding] = useState(null);  // type to add

  const addSlot = async (type) => {
    try {
      await api.post('/wyceny/lines', {
        wycena_id: wycenaId, stage_id: stageId, position_id: position.id,
        type, name: TYPE_LABEL[type], quantity: 0, unit_price_netto: 0, order: 0,
      });
      onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const delLine = async (id) => {
    if (!window.confirm('Usunąć linię?')) return;
    try { await api.delete(`/wyceny/lines/${id}`); onChange(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="bg-[#0B1120]/60 p-2">
      <table className="w-full text-xs">
        <thead className="text-[#94A3B8]">
          <tr>
            <th className="text-left p-1">Typ</th>
            <th className="text-left p-1">Nazwa</th>
            <th className="text-left p-1">J.m.</th>
            <th className="text-right p-1">Ilość</th>
            <th className="text-right p-1">Cena netto</th>
            <th className="text-right p-1">Wartość</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(position.slots || []).map((slot) => (
            <SlotRow key={slot.id} slot={slot} onChange={onChange} onLocalUpdate={onLocalUpdate} onDel={() => delLine(slot.id)} />
          ))}
          {(position.slots || []).length === 0 && (
            <tr><td colSpan="7" className="text-[#64748B] text-center p-2">Brak podpozycji</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex gap-2 mt-2 pt-2 border-t border-[#2A3B59]">
        <button onClick={() => addSlot('materials')} className="text-[#CBD5E1] text-xs px-2 py-1 rounded border border-[#2A3B59] hover:bg-[#131C2F]"
          data-testid={`add-slot-mat-${position.id}`}>+ Materiał</button>
        <button onClick={() => addSlot('labor')} className="text-[#9DBC85] text-xs px-2 py-1 rounded border border-[#5F7552] hover:bg-[#131C2F]"
          data-testid={`add-slot-lab-${position.id}`}>+ Robocizna</button>
        <button onClick={() => addSlot('equipment')} className="text-[#D4AF37] text-xs px-2 py-1 rounded border border-[#D4AF37]/40 hover:bg-[#131C2F]"
          data-testid={`add-slot-equ-${position.id}`}>+ Sprzęt</button>
      </div>
    </div>
  );
};

const SlotRow = ({ slot, onLocalUpdate, onChange, onDel }) => {
  const [picker, setPicker] = useState(false);
  const [edit, setEdit] = useState({ name: slot.name, unit: slot.unit || '', quantity: slot.quantity, unit_price_netto: slot.unit_price_netto });

  useEffect(() => {
    setEdit({ name: slot.name, unit: slot.unit || '', quantity: slot.quantity, unit_price_netto: slot.unit_price_netto });
  }, [slot]);

  // iter95p: zapis lokalny - bez refetch wszystkiego (zachowuje focus)
  const save = async () => {
    const payload = {
      name: edit.name, unit: edit.unit,
      quantity: parseFloat(edit.quantity) || 0,
      unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
    };
    try {
      await api.patch(`/wyceny/lines/${slot.id}`, payload);
      onLocalUpdate(slot.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const value = (parseFloat(edit.quantity) || 0) * (parseFloat(edit.unit_price_netto) || 0);

  return (
    <tr className="border-t border-[#2A3B59]/30" data-testid={`slot-row-${slot.id}`}>
      <td className="p-1">
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2A3B59', color: TYPE_COLOR[slot.type] }}>
          {TYPE_LABEL[slot.type]}
        </span>
      </td>
      <td className="p-1">
        <div className="flex gap-1 items-center">
          <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onBlur={save}
            className="bg-[#0B1120] border-[#2A3B59] h-7 text-xs" data-testid={`slot-name-${slot.id}`} />
          <button onClick={() => setPicker(true)} className="text-[#D4AF37] hover:text-[#FCE99A] text-[10px] px-1 border border-[#D4AF37]/40 rounded"
            title="Wybierz z cennika" data-testid={`slot-pick-${slot.id}`}>📖</button>
        </div>
      </td>
      <td className="p-1">
        <Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} onBlur={save}
          className="bg-[#0B1120] border-[#2A3B59] h-7 text-xs w-20" />
      </td>
      <td className="p-1">
        <Input type="number" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} onBlur={save}
          className="bg-[#0B1120] border-[#2A3B59] h-7 text-xs text-right tabular-nums" />
      </td>
      <td className="p-1">
        <Input type="number" step="0.01" value={edit.unit_price_netto} onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })} onBlur={save}
          className="bg-[#0B1120] border-[#2A3B59] h-7 text-xs text-right tabular-nums" />
      </td>
      <td className="p-1 text-right text-[#D4AF37] tabular-nums font-semibold">{fmtPLN(value)}</td>
      <td className="p-1 text-right">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`slot-del-${slot.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
      {picker && (
        <td>
          <PriceBookPicker category={slot.type} onPick={(item) => {
            setEdit({ name: item.name, unit: item.unit || '', quantity: 1, unit_price_netto: item.unit_price_netto });
            api.patch(`/wyceny/lines/${slot.id}`, {
              name: item.name, unit: item.unit, quantity: 1, unit_price_netto: item.unit_price_netto,
            }).then(onChange).catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)));
            setPicker(false);
          }} onClose={() => setPicker(false)} />
        </td>
      )}
    </tr>
  );
};

// =============== PRICE BOOK (MATERIALS - Excel-style) ===============
const MATERIAL_SUB_CATS = ['izolacje', 'betony', 'stal', 'murowane', 'drobnica', 'pozostałe'];

const MaterialsPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'materials' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja wiersza bez fetchRows (zachowuje focus + brak migotania)
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async (subCategory) => {
    try {
      await api.post('/wyceny/cennik', {
        category: 'materials', sub_category: subCategory, name: '',
        unit_price_netto: 0,
      });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  // Grupuj po sub_category - zachowaj zdefiniowana kolejnosc
  const grouped = useMemo(() => {
    const g = {};
    MATERIAL_SUB_CATS.forEach((c) => { g[c] = []; });
    rows.forEach((r) => {
      const sc = (r.sub_category || 'pozostałe').toLowerCase();
      const key = MATERIAL_SUB_CATS.includes(sc) ? sc : 'pozostałe';
      g[key].push(r);
    });
    return g;
  }, [rows]);

  return (
    <div className="space-y-2" data-testid="materials-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj produktu..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="materials-search" />
        <div className="text-xs text-[#94A3B8]">
          {rows.length} pozycji · 11 kolumn (kategoria · nazwa produktu · cena · oferent · opakowanie · ilość · jd · zapotrzebowanie · jd. do jd. · warstw · uwagi)
        </div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="materials-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[100px]">kategoria</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[160px]">nazwa produktu</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[100px]">cena oferty</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[120px]">oferent</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[100px]">opakowanie</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[70px]">ilość</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[60px]">jd</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">zapotrzebowanie</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[90px]">jd. do jd.</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[90px]">warstw</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[140px]">uwagi</th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_SUB_CATS.map((sc) => (
                <React.Fragment key={sc}>
                  <tr className="bg-[#131C2F]">
                    <td colSpan="11" className="p-1.5 border-b border-[#2A3B59] text-[#D4AF37] font-semibold text-[11px] uppercase">
                      📁 {sc}
                    </td>
                    <td className="p-1 border-b border-[#2A3B59] text-right">
                      <button onClick={() => addRow(sc)} className="text-[#9DBC85] hover:text-[#C8E4B5] text-[11px]"
                        title="Dodaj pozycję w kategorii" data-testid={`mat-add-${sc}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {(grouped[sc] || []).length === 0 ? (
                    <tr><td colSpan="12" className="p-2 text-[#64748B] text-center text-[10px]">— brak pozycji —</td></tr>
                  ) : (
                    grouped[sc].map((it) => (
                      <MaterialRow key={it.id} item={it} onLocalUpdate={updateLocal} onCategoryChange={fetchRows} onDel={() => remove(it.id)} />
                    ))
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MaterialRow = ({ item, onLocalUpdate, onCategoryChange, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  // iter95p: zapis bez triggera fetch - aktualizuje tylko lokalnie (zachowuje focus)
  const save = async (extra = {}) => {
    const payload = {
      name: edit.name || '',
      unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
      oferent: edit.oferent || '',
      opakowanie: edit.opakowanie || '',
      pkg_qty: edit.pkg_qty === '' || edit.pkg_qty == null ? null : parseFloat(edit.pkg_qty),
      pkg_unit: edit.pkg_unit || '',
      zapotrzebowanie: edit.zapotrzebowanie === '' || edit.zapotrzebowanie == null ? null : parseFloat(edit.zapotrzebowanie),
      zap_unit: edit.zap_unit || '',
      liczba_warstw: edit.liczba_warstw === '' || edit.liczba_warstw == null ? null : parseFloat(edit.liczba_warstw),
      notes: edit.notes || '',
      sub_category: edit.sub_category || '',
      ...extra,
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);  // optimistic update parent state
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30" data-testid={`mat-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40">
        <select value={edit.sub_category || ''}
          onChange={(e) => { setEdit({ ...edit, sub_category: e.target.value }); save({ sub_category: e.target.value }).then(onCategoryChange); }}
          className={`${inputCls} text-[#CBD5E1]`}>
          {MATERIAL_SUB_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save} className={`${inputCls} text-white`} data-testid={`mat-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.01" value={edit.unit_price_netto ?? ''}
          onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right text-[#D4AF37] tabular-nums`} data-testid={`mat-price-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.oferent || ''} onChange={(e) => setEdit({ ...edit, oferent: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.opakowanie || ''} onChange={(e) => setEdit({ ...edit, opakowanie: e.target.value })}
          onBlur={save} placeholder="wiaderko/paleta..."
          className={`${inputCls} text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.001" value={edit.pkg_qty ?? ''}
          onChange={(e) => setEdit({ ...edit, pkg_qty: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.pkg_unit || ''} onChange={(e) => setEdit({ ...edit, pkg_unit: e.target.value })}
          onBlur={save} placeholder="kg/m2..." className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.001" value={edit.zapotrzebowanie ?? ''}
          onChange={(e) => setEdit({ ...edit, zapotrzebowanie: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.zap_unit || ''} onChange={(e) => setEdit({ ...edit, zap_unit: e.target.value })}
          onBlur={save} placeholder="kg/m2..." className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input type="number" step="0.5" value={edit.liczba_warstw ?? ''}
          onChange={(e) => setEdit({ ...edit, liczba_warstw: e.target.value })}
          onBlur={save} className={`${inputCls} text-right tabular-nums text-[#CBD5E1]`} />
      </td>
      <td className="border-r border-[#2A3B59]/40">
        <input value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
          onBlur={save} className={`${inputCls} text-[#94A3B8]`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`mat-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (LABOR - Excel-style: m2/m3 + historia) ===============
const fmtPrice = (v) => v == null || v === '' ? '—' : new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const LaborPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'labor' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows (zachowuje focus)
  const updateLocal = useCallback((id, patch, fullDoc = null) => {
    setRows((prev) => prev.map((r) => r.id === id ? (fullDoc || { ...r, ...patch }) : r));
  }, []);

  // iter95p: po zmianie ceny refetch tylko TEGO wiersza (zeby zaktualizowac price_history)
  const refetchOne = useCallback(async (id) => {
    try {
      const r = await api.get('/wyceny/cennik', { params: { category: 'labor' } });
      const fresh = (r.data?.rows || []).find((x) => x.id === id);
      if (fresh) updateLocal(id, {}, fresh);
    } catch (_e) { /* ignore */ }
  }, [updateLocal]);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'labor', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="labor-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy robocizny..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="labor-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="labor-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#94A3B8]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="labor-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="labor-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[260px]">nazwa robocizny</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m²</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[120px]">cena za m³</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[280px]">
                  Wartości historyczne po zmianach (historia)
                </th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <LaborRow key={it.id} item={it} onLocalUpdate={updateLocal} onPriceChange={refetchOne} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const LaborRow = ({ item, onLocalUpdate, onPriceChange, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      price_m2: edit.price_m2 === '' || edit.price_m2 == null ? null : parseFloat(edit.price_m2),
      price_m3: edit.price_m3 === '' || edit.price_m3 == null ? null : parseFloat(edit.price_m3),
    };
    // iter95p: czy zmienila sie cena? jezeli tak - refetch (zeby zaktualizowac price_history)
    const priceChanged = (item.price_m2 !== payload.price_m2) || (item.price_m3 !== payload.price_m3);
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      if (priceChanged) {
        await onPriceChange(item.id);
      } else {
        onLocalUpdate(item.id, payload);
      }
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";
  const history = item.price_history || [];

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30 align-top" data-testid={`labor-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. tynkowanie ścian, malowanie..."
          className={`${inputCls} text-white`} data-testid={`labor-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m2 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m2: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m2-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_m3 ?? ''}
          onChange={(e) => setEdit({ ...edit, price_m3: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`labor-price-m3-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        {history.length === 0 ? (
          <span className="text-[10px] text-[#64748B]">— brak zmian —</span>
        ) : (
          <div className="space-y-0.5 max-h-32 overflow-y-auto" data-testid={`labor-history-${item.id}`}>
            {history.slice().reverse().map((h, i) => (
              <div key={i} className="text-[10px] flex gap-1.5 items-baseline">
                <span className="text-[#64748B] tabular-nums">{(h.date || '').slice(0, 10)}</span>
                <span className="text-[#94A3B8]">
                  {h.field === 'price_m2' ? 'm²' : h.field === 'price_m3' ? 'm³' : h.field}:
                </span>
                <span className="text-[#FCA5A5] tabular-nums line-through">{fmtPrice(h.old)}</span>
                <span className="text-[#64748B]">→</span>
                <span className="text-[#9DBC85] tabular-nums font-semibold">{fmtPrice(h.new)}</span>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="text-right pr-1 pt-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`labor-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (EQUIPMENT - Excel-style: 3 ceny + wynajmujący + koszty poboczne) ===============
const EquipmentPriceBook = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category: 'equipment' };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // iter95p: lokalna aktualizacja bez fetchRows
  const updateLocal = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = async () => {
    try {
      await api.post('/wyceny/cennik', { category: 'equipment', name: '' });
      fetchRows();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-2" data-testid="equipment-pricebook">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj nazwy sprzętu..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="equipment-search" />
        <Button onClick={addRow} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="equipment-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
        <div className="text-xs text-[#94A3B8]">{rows.length} pozycji</div>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div> : rows.length === 0 ? (
        <div className="text-[#94A3B8] text-sm py-6 text-center" data-testid="equipment-empty">
          Brak pozycji. Kliknij „Dodaj pozycję".
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#2A3B59] rounded">
          <table className="w-full text-xs" data-testid="equipment-table">
            <thead className="bg-[#0B1120] text-[#94A3B8] sticky top-0">
              <tr>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[200px]">nazwa sprzętu</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za godzinę</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za dzień</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[110px]">koszt za miesiąc</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[160px]">wynajmujący</th>
                <th className="text-right p-2 border-b border-r border-[#2A3B59] min-w-[100px]">koszty poboczne</th>
                <th className="text-left p-2 border-b border-r border-[#2A3B59] min-w-[200px]">opis kosztów pobocznych</th>
                <th className="p-2 border-b border-[#2A3B59] w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <EquipmentRow key={it.id} item={it} onLocalUpdate={updateLocal} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
          <div className="bg-[#0B1120]/50 text-[10px] text-[#64748B] p-2 border-t border-[#2A3B59]">
            ℹ Koszty poboczne są doliczane do każdej jednostki rozliczeniowej (godzina/dzień/miesiąc). Opis pozwala wyjaśnić co wchodzi w skład tej dopłaty (np. transport, paliwo, operator).
          </div>
        </div>
      )}
    </div>
  );
};

const EquipmentRow = ({ item, onLocalUpdate, onDel }) => {
  const [edit, setEdit] = useState(item);
  useEffect(() => { setEdit(item); }, [item]);

  const save = async () => {
    const payload = {
      name: edit.name || '',
      price_hour: edit.price_hour === '' || edit.price_hour == null ? null : parseFloat(edit.price_hour),
      price_day: edit.price_day === '' || edit.price_day == null ? null : parseFloat(edit.price_day),
      price_month: edit.price_month === '' || edit.price_month == null ? null : parseFloat(edit.price_month),
      wynajmujacy: edit.wynajmujacy || '',
      extra_cost: edit.extra_cost === '' || edit.extra_cost == null ? null : parseFloat(edit.extra_cost),
      extra_cost_desc: edit.extra_cost_desc || '',
    };
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, payload);
      onLocalUpdate(item.id, payload);
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  const inputCls = "bg-transparent border-0 h-7 text-xs w-full focus:bg-[#0B1120] outline-none px-1";

  return (
    <tr className="border-b border-[#2A3B59]/40 hover:bg-[#0B1120]/30" data-testid={`equipment-row-${item.id}`}>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          onBlur={save}
          placeholder="np. zagęszczarka, młot udarowy..."
          className={`${inputCls} text-white`} data-testid={`equipment-name-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_hour ?? ''}
          onChange={(e) => setEdit({ ...edit, price_hour: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-hour-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_day ?? ''}
          onChange={(e) => setEdit({ ...edit, price_day: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-day-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.price_month ?? ''}
          onChange={(e) => setEdit({ ...edit, price_month: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#D4AF37] font-semibold`}
          data-testid={`equipment-price-month-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.wynajmujacy || ''} onChange={(e) => setEdit({ ...edit, wynajmujacy: e.target.value })}
          onBlur={save}
          placeholder="np. Ramirent, własny..."
          className={`${inputCls} text-[#CBD5E1]`} data-testid={`equipment-wyn-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input type="number" step="0.01" value={edit.extra_cost ?? ''}
          onChange={(e) => setEdit({ ...edit, extra_cost: e.target.value })}
          onBlur={save}
          className={`${inputCls} text-right tabular-nums text-[#FCA5A5]`}
          data-testid={`equipment-extra-${item.id}`} />
      </td>
      <td className="border-r border-[#2A3B59]/40 p-1">
        <input value={edit.extra_cost_desc || ''} onChange={(e) => setEdit({ ...edit, extra_cost_desc: e.target.value })}
          onBlur={save}
          placeholder="np. transport, paliwo..."
          className={`${inputCls} text-[#94A3B8]`} data-testid={`equipment-extra-desc-${item.id}`} />
      </td>
      <td className="text-right pr-1">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`equipment-del-${item.id}`}>
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
};

// =============== PRICE BOOK (LABOR / EQUIPMENT - simple) ===============
const PriceBook = ({ category }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = { category };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params })
      .then((r) => setRows(r.data?.rows || []))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [category, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const remove = async (id) => {
    if (!window.confirm('Usunąć pozycję cennika?')) return;
    try { await api.delete(`/wyceny/cennik/${id}`); fetchRows(); }
    catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-3" data-testid={`pricebook-${category}`}>
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-[#0B1120] border-[#2A3B59] max-w-sm" data-testid="pricebook-search" />
        <Button onClick={() => setAdding(true)} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]"
          data-testid="pricebook-add-btn">
          <Plus className="h-4 w-4 mr-1" /> Dodaj pozycję
        </Button>
      </div>
      {loading ? <div className="text-[#94A3B8]">Ładuję...</div>
        : rows.length === 0 ? (
          <div className="text-[#94A3B8] text-sm py-6 text-center">Brak pozycji w cenniku.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[#94A3B8] border-b border-[#2A3B59]">
              <tr>
                <th className="text-left p-2">Nazwa</th>
                <th className="text-left p-2">J.m.</th>
                <th className="text-right p-2">Cena netto (zł)</th>
                <th className="text-left p-2">Notatki</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <PriceBookRow key={it.id} item={it} onChange={fetchRows} onDel={() => remove(it.id)} />
              ))}
            </tbody>
          </table>
        )}
      {adding && (
        <PriceBookAddModal category={category} onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); fetchRows(); }} />
      )}
    </div>
  );
};

const PriceBookRow = ({ item, onChange, onDel }) => {
  const [edit, setEdit] = useState({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });

  useEffect(() => {
    setEdit({ name: item.name, unit: item.unit || '', unit_price_netto: item.unit_price_netto, notes: item.notes || '' });
  }, [item]);

  const save = async () => {
    try {
      await api.patch(`/wyceny/cennik/${item.id}`, {
        name: edit.name, unit: edit.unit,
        unit_price_netto: parseFloat(edit.unit_price_netto) || 0,
        notes: edit.notes,
      });
      onChange();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };

  return (
    <tr className="border-b border-[#2A3B59]/40">
      <td className="p-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2"><Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs w-24" /></td>
      <td className="p-2"><Input type="number" step="0.01" value={edit.unit_price_netto}
        onChange={(e) => setEdit({ ...edit, unit_price_netto: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs text-right tabular-nums w-32" /></td>
      <td className="p-2"><Input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} onBlur={save}
        className="bg-[#0B1120] border-[#2A3B59] h-8 text-xs" /></td>
      <td className="p-2 text-right">
        <button onClick={onDel} className="text-[#94A3B8] hover:text-[#FCA5A5]" data-testid={`pricebook-del-${item.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
};

const PriceBookAddModal = ({ category, onClose, onSaved }) => {
  const [form, setForm] = useState({ name: '', unit: '', unit_price_netto: 0, notes: '' });
  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę'); return; }
    try {
      await api.post('/wyceny/cennik', {
        category, name: form.name.trim(), unit: form.unit,
        unit_price_netto: parseFloat(form.unit_price_netto) || 0, notes: form.notes,
      });
      toast.success('Dodano');
      onSaved();
    } catch (e) { toast.error('Błąd: ' + (e.response?.data?.detail || e.message)); }
  };
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="pricebook-modal">
        <DialogHeader>
          <DialogTitle>Dodaj pozycję cennika ({TYPE_LABEL[category]})</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div><label className="text-xs text-[#94A3B8]">Nazwa *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-name" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-[#94A3B8]">J.m.</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="szt / m / kg / h..." className="bg-[#0B1120] border-[#2A3B59]" /></div>
            <div><label className="text-xs text-[#94A3B8]">Cena netto</label>
              <Input type="number" step="0.01" value={form.unit_price_netto}
                onChange={(e) => setForm({ ...form, unit_price_netto: e.target.value })}
                className="bg-[#0B1120] border-[#2A3B59]" data-testid="pricebook-modal-price" /></div>
          </div>
          <div><label className="text-xs text-[#94A3B8]">Notatki</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-[#0B1120] border-[#2A3B59]" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
          <Button onClick={save} className="bg-[#D4AF37] hover:bg-[#B8941F] text-[#0B1120]" data-testid="pricebook-modal-save">Zapisz</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PriceBookPicker = ({ category, onPick, onClose }) => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const params = { category };
    if (search) params.q = search;
    api.get('/wyceny/cennik', { params }).then((r) => setRows(r.data?.rows || [])).catch(() => setRows([]));
  }, [category, search]);
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md" data-testid="pricebook-picker">
        <DialogHeader>
          <DialogTitle>Wybierz z cennika ({TYPE_LABEL[category]})</DialogTitle>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-[#0B1120] border-[#2A3B59] mb-2" autoFocus />
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 ? <div className="text-[#94A3B8] text-sm py-4 text-center">Brak. Dodaj pozycje w zakładce „Ceny..."</div>
            : rows.map((it) => (
              <button key={it.id} onClick={() => onPick(it)}
                className="block w-full text-left p-2 hover:bg-[#0B1120]/50 border-b border-[#2A3B59]/40"
                data-testid={`picker-item-${it.id}`}>
                <div className="text-[#CBD5E1] font-medium">{it.name}</div>
                <div className="text-[10px] text-[#94A3B8]">
                  {it.unit || '—'} · <span className="text-[#D4AF37]">{fmtPLN(it.unit_price_netto)} zł</span>
                </div>
              </button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-[#2A3B59] text-[#94A3B8]">Anuluj</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Wyceny;
