// iter95at: Panel Prognoz przyszlych kosztow/zyskow/wyplat
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Building2, Wallet, BarChart3, Search } from 'lucide-react';

const fmtPLN = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthName = (y, m) => {
  const names = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  return `${names[m - 1]} ${y}`;
};

const Stat = ({ label, value, sub, accent = '#9DBC85', icon: Icon, testId, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left border border-[#3D5378] bg-[#1E2A44] rounded-lg p-4 space-y-1 transition w-full ${
      onClick ? 'hover:border-[#9DBC85]/60 hover:bg-[#1E2A44]/80 cursor-pointer' : 'cursor-default'
    }`}
    data-testid={testId}
  >
    <div className="text-[10px] uppercase tracking-wider text-[#CBD5E1] flex items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      {onClick && <Search className="h-3 w-3 ml-auto text-[#5F7552]" />}
    </div>
    <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>
      {value} <span className="text-sm font-normal text-[#CBD5E1]">zł</span>
    </div>
    {sub && <div className="text-[10px] text-[#94A3B8]">{sub}</div>}
  </button>
);

// iter95au: drill-down modal pokazujacy szczegoly KPI
const DetailsModal = ({ kind, code, back, forward, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ kind, back, forward });
    if (code) params.set('code', code);
    setLoading(true);
    api.get(`/finance/forecast/details?${params.toString()}`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [kind, code, back, forward]);

  const titles = {
    company: 'Koszty utrzymania firmy — wszystkie zapisy',
    company_category: `Koszty kategorii: ${code || ''} — szczegóły`,
    building: 'Koszty budów (z harmonogramów) — rozbicie pozycji',
    income: 'Przychody z budów (z harmonogramów)',
  };
  const monthName = (y, m) => {
    const names = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    return `${names[m - 1]} ${y}`;
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
                     data-testid="forecast-details-modal">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37]">{titles[kind] || 'Szczegóły'}</DialogTitle>
          {data && (
            <div className="text-xs text-[#CBD5E1]">
              {kind.startsWith('company') ? (
                <>Okres: <b className="text-white">{data.range?.start} → {data.range?.end}</b> · {data.count} zapisów · suma <b className="text-[#9DBC85]">{fmtPLN(data.total)} zł</b>{kind === 'company' && data.avg_monthly !== undefined && <> · śr. <b className="text-[#9DBC85]">{fmtPLN(data.avg_monthly)} zł/msc</b></>}</>
              ) : (
                <>{data.count} pozycji budżetu w prognozie · suma w oknie <b className="text-[#9DBC85]">{fmtPLN(data.total)} zł</b></>
              )}
            </div>
          )}
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto border border-[#3D5378] rounded">
          {loading ? (
            <div className="p-6 text-center text-[#CBD5E1] text-sm">Ładuję…</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-6 text-center text-[#CBD5E1] text-sm italic">Brak danych w wybranym okresie.</div>
          ) : kind.startsWith('company') ? (
            <table className="w-full text-xs min-w-[700px]" data-testid="details-company-table">
              <thead className="bg-[#152033] sticky top-0 text-[#CBD5E1] uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Kategoria / Kod</th>
                  <th className="text-left px-3 py-2">Nazwa</th>
                  <th className="text-left px-3 py-2">Budowa / komentarz</th>
                  <th className="text-right px-3 py-2">Kwota netto</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#3D5378] hover:bg-[#152033]/60"
                      data-testid={`details-row-${r.id}`}>
                    <td className="px-3 py-1.5 text-[#F1F5F9] tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-1"
                        style={{
                          background: r.category === 'KP' ? '#3F5235' : r.category === 'KSB' ? '#5F4E20' : '#2D4D5C',
                          color: 'white',
                        }}>{r.category}</span>
                      <span className="text-[10px] text-[#94A3B8]">{r.kod_id}</span>
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.kod_name}</td>
                    <td className="px-3 py-1.5 text-[#CBD5E1] text-[11px]">
                      {r.budowa_name && <span className="text-[#9DBC85]">{r.budowa_name}</span>}
                      {r.budowa_name && r.comment && ' · '}
                      {r.comment}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#9DBC85] font-semibold tabular-nums">{fmtPLN(r.netto)} zł</td>
                  </tr>
                ))}
                <tr className="bg-[#D4AF37]/10 border-t-2 border-[#D4AF37]/40 font-bold">
                  <td colSpan={4} className="px-3 py-2 text-white">RAZEM ({data.count} zapisów)</td>
                  <td className="px-3 py-2 text-right text-[#D4AF37] tabular-nums">{fmtPLN(data.total)} zł</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs min-w-[900px]" data-testid="details-building-table">
              <thead className="bg-[#152033] sticky top-0 text-[#CBD5E1] uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Budowa</th>
                  <th className="text-left px-3 py-2">Etap (daty)</th>
                  <th className="text-left px-3 py-2">Pozycja</th>
                  <th className="text-left px-3 py-2">Typ</th>
                  <th className="text-right px-3 py-2">Plan netto</th>
                  {(data.months || []).map((mo) => (
                    <th key={`${mo.y}-${mo.m}`} className="text-right px-3 py-2 whitespace-nowrap">{monthName(mo.y, mo.m)}</th>
                  ))}
                  <th className="text-right px-3 py-2 bg-[#3F5235]/30">W oknie</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#3D5378] hover:bg-[#152033]/60"
                      data-testid={`details-row-${r.id}`}>
                    <td className="px-3 py-1.5 text-white">{r.budowa_name}</td>
                    <td className="px-3 py-1.5 text-[#CBD5E1] text-[11px]">
                      <div className="text-[#F1F5F9]">{r.stage_name}</div>
                      <div className="text-[10px]">{r.start_date} → {r.end_date}</div>
                    </td>
                    <td className="px-3 py-1.5 text-[#F1F5F9]">
                      {r.name}
                      {r.quantity > 0 && (
                        <div className="text-[10px] text-[#94A3B8]">
                          {r.quantity} {r.unit} × {fmtPLN(r.unit_price_netto)} zł
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{
                          background: r.type === 'materials' ? '#5F7552' : r.type === 'labor' ? '#5F4E20' : r.type === 'equipment' ? '#2D4D5C' : '#475569',
                          color: 'white',
                        }}>{r.type || '—'}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(r.plan_netto)} zł</td>
                    {(data.months || []).map((mo) => {
                      const found = (r.per_month || []).find((p) => p.y === mo.y && p.m === mo.m);
                      return (
                        <td key={`${mo.y}-${mo.m}`} className="px-3 py-1.5 text-right tabular-nums text-[#F1F5F9]">
                          {found ? `${fmtPLN(found.value)}` : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right text-[#9DBC85] font-semibold tabular-nums bg-[#3F5235]/20">{fmtPLN(r.in_window)} zł</td>
                  </tr>
                ))}
                <tr className="bg-[#D4AF37]/10 border-t-2 border-[#D4AF37]/40 font-bold">
                  <td colSpan={5 + (data.months || []).length} className="px-3 py-2 text-white">RAZEM w oknie prognozy ({data.count} pozycji)</td>
                  <td className="px-3 py-2 text-right text-[#D4AF37] tabular-nums">{fmtPLN(data.total)} zł</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="border-[#3D5378] text-[#F1F5F9]"
            data-testid="details-close">Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const Forecast = () => {
  const [back, setBack] = useState(6);
  const [forward, setForward] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // iter95au: modal drill-down
  const [details, setDetails] = useState(null); // {kind, code?}

  const load = useCallback(() => {
    api.get(`/finance/forecast?back=${back}&forward=${forward}`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [back, forward]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="p-6 text-[#CBD5E1]" data-testid="forecast-loading">Ładuję prognozy…</div>;
  if (!data) return <div className="p-6 text-[#CBD5E1]">Brak danych.</div>;

  const cc = data.company_costs;
  const bc = data.building_costs;
  const bi = data.building_income;
  const bal = data.balance;

  return (
    <div className="space-y-5" data-testid="forecast-panel">
      {/* Naglowek + kontrolki */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <div className="text-xl font-semibold text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#9DBC85]" /> Panel Prognoz
          </div>
          <div className="text-xs text-[#CBD5E1]">
            Średnia z ostatnich <b className="text-[#9DBC85]">{back} mies.</b>
            ({data.range.history_start} → {data.range.history_end})
            · Prognoza na <b className="text-[#9DBC85]">{forward} mies.</b> w przód
          </div>
        </div>
        <label className="text-xs text-[#F1F5F9] flex items-center gap-1">
          Historia:
          <select value={back} onChange={(e) => setBack(parseInt(e.target.value))}
            className="bg-[#1E2A44] border border-[#3D5378] rounded h-8 px-2 text-xs text-white"
            data-testid="forecast-back-select">
            {[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n}>{n} msc</option>)}
          </select>
        </label>
        <label className="text-xs text-[#F1F5F9] flex items-center gap-1">
          Prognoza:
          <select value={forward} onChange={(e) => setForward(parseInt(e.target.value))}
            className="bg-[#1E2A44] border border-[#3D5378] rounded h-8 px-2 text-xs text-white"
            data-testid="forecast-forward-select">
            {[1, 3, 6, 9, 12].map((n) => <option key={n} value={n}>{n} msc</option>)}
          </select>
        </label>
      </div>

      {/* KPI top row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="forecast-kpi">
        <Stat label="Średnie koszty firmowe / msc" value={fmtPLN(cc.total_avg_monthly)} accent="#D4AF37"
          sub={`${cc.categories.length} kategorii kosztowych — kliknij by zobaczyć zapisy`} icon={Wallet} testId="kpi-company-avg"
          onClick={() => setDetails({ kind: 'company' })} />
        <Stat label={`Koszty budów (${forward} msc)`} value={fmtPLN(bc.totals.total)} accent="#9DBC85"
          sub="Z harmonogramów aktywnych budów — kliknij by zobaczyć pozycje" icon={Building2} testId="kpi-building-costs"
          onClick={() => setDetails({ kind: 'building' })} />
        <Stat label={`Przychody budów (${forward} msc)`} value={fmtPLN(bi.total)} accent="#22C55E"
          sub="Pozycje przychodowe budżetu — kliknij by zobaczyć" icon={TrendingUp} testId="kpi-building-income"
          onClick={() => setDetails({ kind: 'income' })} />
        <Stat label={`Bilans P&L (${forward} msc)`} value={fmtPLN(bal.totals.profit)}
          accent={bal.totals.profit >= 0 ? '#22C55E' : '#FCA5A5'}
          sub={`Przychody − koszty (firma + budowy)`}
          icon={bal.totals.profit >= 0 ? TrendingUp : TrendingDown}
          testId="kpi-balance" />
      </div>

      {/* Sekcja A: Koszty firmowe */}
      <Card className="bg-[#152033] border-[#3D5378]">
        <CardHeader>
          <CardTitle className="text-[#D4AF37] flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Koszty utrzymania firmy (KP / KSB / KSP)
          </CardTitle>
          <div className="text-xs text-[#CBD5E1]">
            Średni miesięczny koszt z ostatnich {back} miesięcy. <b>Nie zawiera</b> kosztów budów (KBB).
          </div>
        </CardHeader>
        <CardContent>
          {cc.categories.length === 0 ? (
            <div className="text-sm text-[#CBD5E1] italic">Brak danych w wybranym okresie.</div>
          ) : (
            <div className="border border-[#3D5378] rounded overflow-x-auto w-full">
              <table className="w-full text-xs min-w-[640px]" data-testid="company-costs-table">
                <thead className="bg-[#1E2A44] text-[#CBD5E1] uppercase text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2">Kategoria</th>
                    <th className="text-left px-3 py-2">Kod / Nazwa</th>
                    <th className="text-right px-3 py-2">Suma za {back} msc</th>
                    <th className="text-right px-3 py-2">Śr. / miesiąc</th>
                    <th className="text-right px-3 py-2">Prognoza {forward} msc</th>
                  </tr>
                </thead>
                <tbody>
                  {cc.categories.map((c) => (
                    <tr key={c.code} className="border-t border-[#3D5378] hover:bg-[#D4AF37]/5 cursor-pointer"
                        data-testid={`company-row-${c.code}`}
                        onClick={() => setDetails({ kind: 'company_category', code: c.code })}
                        title="Kliknij aby zobaczyć wszystkie zapisy w tej kategorii">
                      <td className="px-3 py-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background: c.category === 'KP' ? '#3F5235' : c.category === 'KSB' ? '#5F4E20' : '#2D4D5C',
                            color: 'white',
                          }}>{c.category}</span>
                      </td>
                      <td className="px-3 py-1.5 text-[#F1F5F9]">
                        <div className="font-semibold flex items-center gap-1">
                          {c.name}
                          <Search className="h-3 w-3 text-[#5F7552]" />
                        </div>
                        <div className="text-[9px] text-[#94A3B8]">{c.code} · {c.count} wpisów</div>
                      </td>
                      <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(c.total_back)} zł</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#9DBC85] font-semibold">{fmtPLN(c.avg_monthly)} zł</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#D4AF37] font-semibold">{fmtPLN(c.avg_monthly * forward)} zł</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#D4AF37]/40 bg-[#D4AF37]/5 font-bold">
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-white">RAZEM koszty firmowe</td>
                    <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(cc.total_avg_monthly * back)} zł</td>
                    <td className="px-3 py-2 text-right text-[#9DBC85] tabular-nums">{fmtPLN(cc.total_avg_monthly)} zł</td>
                    <td className="px-3 py-2 text-right text-[#D4AF37] tabular-nums">{fmtPLN(cc.forecast_total_period)} zł</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sekcja B: Koszty budow z harmonogramow */}
      <Card className="bg-[#152033] border-[#3D5378]">
        <CardHeader>
          <CardTitle className="text-[#9DBC85] flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Prognoza kosztów budów (z harmonogramów)
          </CardTitle>
          <div className="text-xs text-[#CBD5E1]">
            Liniowe rozłożenie <b>plan_netto</b> z pozycji budżetu na miesiące w zakresie <b>start_date → end_date</b> etapu.
            Tylko etapy z wypełnionymi datami.
          </div>
        </CardHeader>
        <CardContent>
          {bc.totals.total === 0 ? (
            <div className="text-sm text-[#CBD5E1] italic" data-testid="building-empty">
              Brak harmonogramów z datami w aktywnych budowach. Uzupełnij <b>start_date</b> i <b>end_date</b> w etapach
              modułu Budżetowanie aby zobaczyć prognozę.
            </div>
          ) : (
            <div className="border border-[#3D5378] rounded overflow-x-auto w-full">
              <table className="w-full text-xs min-w-[820px]" data-testid="building-costs-table">
                <thead className="bg-[#1E2A44] text-[#CBD5E1] uppercase text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2">Miesiąc</th>
                    <th className="text-right px-3 py-2">Materiały</th>
                    <th className="text-right px-3 py-2">Robocizna</th>
                    <th className="text-right px-3 py-2">Sprzęt</th>
                    <th className="text-right px-3 py-2">Inne</th>
                    <th className="text-right px-3 py-2 bg-[#3F5235]/30">SUMA</th>
                    <th className="text-left px-3 py-2">Per budowa</th>
                  </tr>
                </thead>
                <tbody>
                  {bc.months.map((mo) => (
                    <tr key={`${mo.y}-${mo.m}`} className="border-t border-[#3D5378]"
                        data-testid={`building-row-${mo.y}-${mo.m}`}>
                      <td className="px-3 py-1.5 text-white font-semibold tabular-nums">{monthName(mo.y, mo.m)}</td>
                      <td className="px-3 py-1.5 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(mo.materials)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(mo.labor)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(mo.equipment)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(mo.other)} zł</td>
                      <td className="px-3 py-1.5 text-right font-bold text-[#9DBC85] tabular-nums bg-[#3F5235]/20">{fmtPLN(mo.total)} zł</td>
                      <td className="px-3 py-1.5 text-[10px] text-[#CBD5E1]">
                        {mo.per_budowa.slice(0, 3).map((b, i) => (
                          <span key={i} className="mr-2">{b.name}: <b className="text-[#9DBC85]">{fmtPLN(b.value)}</b></span>
                        ))}
                        {mo.per_budowa.length > 3 && <span className="text-[#94A3B8]">+{mo.per_budowa.length - 3}</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#9DBC85]/40 bg-[#9DBC85]/5 font-bold">
                    <td className="px-3 py-2 text-white">RAZEM ({forward} msc)</td>
                    <td className="px-3 py-2 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(bc.totals.materials)} zł</td>
                    <td className="px-3 py-2 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(bc.totals.labor)} zł</td>
                    <td className="px-3 py-2 text-right text-[#F1F5F9] tabular-nums">{fmtPLN(bc.totals.equipment)} zł</td>
                    <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(bc.totals.other)} zł</td>
                    <td className="px-3 py-2 text-right text-[#9DBC85] tabular-nums">{fmtPLN(bc.totals.total)} zł</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sekcja C: Bilans P&L */}
      <Card className="bg-[#152033] border-[#3D5378]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Bilans miesięczny (przychody − koszty)
          </CardTitle>
          <div className="text-xs text-[#CBD5E1]">
            Koszty firmowe stałe ({fmtPLN(cc.total_avg_monthly)} zł/msc) + koszty budów + przychody z pozycji <code>is_income</code>.
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-[#3D5378] rounded overflow-x-auto w-full">
            <table className="w-full text-xs min-w-[640px]" data-testid="balance-table">
              <thead className="bg-[#1E2A44] text-[#CBD5E1] uppercase text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2">Miesiąc</th>
                  <th className="text-right px-3 py-2 text-[#22C55E]">Przychody</th>
                  <th className="text-right px-3 py-2">Koszty firmowe</th>
                  <th className="text-right px-3 py-2">Koszty budów</th>
                  <th className="text-right px-3 py-2 bg-[#D4AF37]/10">ZYSK</th>
                </tr>
              </thead>
              <tbody>
                {bal.months.map((mo) => (
                  <tr key={`${mo.y}-${mo.m}`} className="border-t border-[#3D5378]"
                      data-testid={`balance-row-${mo.y}-${mo.m}`}>
                    <td className="px-3 py-1.5 text-white font-semibold tabular-nums">{monthName(mo.y, mo.m)}</td>
                    <td className="px-3 py-1.5 text-right text-[#22C55E] tabular-nums">{fmtPLN(mo.income)} zł</td>
                    <td className="px-3 py-1.5 text-right text-[#F1F5F9] tabular-nums">−{fmtPLN(mo.costs_company)} zł</td>
                    <td className="px-3 py-1.5 text-right text-[#F1F5F9] tabular-nums">−{fmtPLN(mo.costs_building)} zł</td>
                    <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${mo.profit >= 0 ? 'text-[#22C55E]' : 'text-[#FCA5A5]'} bg-[#D4AF37]/5`}>
                      {mo.profit >= 0 ? '' : '−'}{fmtPLN(Math.abs(mo.profit))} zł
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#D4AF37]/40 bg-[#D4AF37]/5 font-bold">
                  <td className="px-3 py-2 text-white">RAZEM</td>
                  <td className="px-3 py-2 text-right text-[#22C55E] tabular-nums">{fmtPLN(bal.totals.income)} zł</td>
                  <td className="px-3 py-2 text-right text-[#F1F5F9] tabular-nums">−{fmtPLN(bal.totals.costs_company)} zł</td>
                  <td className="px-3 py-2 text-right text-[#F1F5F9] tabular-nums">−{fmtPLN(bal.totals.costs_building)} zł</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${bal.totals.profit >= 0 ? 'text-[#22C55E]' : 'text-[#FCA5A5]'}`}>
                    {bal.totals.profit >= 0 ? '' : '−'}{fmtPLN(Math.abs(bal.totals.profit))} zł
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* iter95au: drill-down modal */}
      {details && (
        <DetailsModal
          kind={details.kind}
          code={details.code}
          back={back}
          forward={forward}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
};

export default Forecast;
