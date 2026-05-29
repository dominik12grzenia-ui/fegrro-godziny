// iter95at: Panel Prognoz przyszlych kosztow/zyskow/wyplat
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../context/AuthContext';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { TrendingUp, TrendingDown, Building2, Wallet, BarChart3 } from 'lucide-react';

const fmtPLN = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const monthName = (y, m) => {
  const names = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  return `${names[m - 1]} ${y}`;
};

const Stat = ({ label, value, sub, accent = '#9DBC85', icon: Icon, testId }) => (
  <div className="border border-[#2A3B59] bg-[#131C2F] rounded-lg p-4 space-y-1" data-testid={testId}>
    <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
    </div>
    <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>
      {value} <span className="text-sm font-normal text-[#94A3B8]">zł</span>
    </div>
    {sub && <div className="text-[10px] text-[#64748B]">{sub}</div>}
  </div>
);

export const Forecast = () => {
  const [back, setBack] = useState(6);
  const [forward, setForward] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/finance/forecast?back=${back}&forward=${forward}`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error('Błąd: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [back, forward]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 text-[#94A3B8]" data-testid="forecast-loading">Ładuję prognozy…</div>;
  if (!data) return <div className="p-6 text-[#94A3B8]">Brak danych.</div>;

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
          <div className="text-xs text-[#94A3B8]">
            Średnia z ostatnich <b className="text-[#9DBC85]">{back} mies.</b>
            ({data.range.history_start} → {data.range.history_end})
            · Prognoza na <b className="text-[#9DBC85]">{forward} mies.</b> w przód
          </div>
        </div>
        <label className="text-xs text-[#CBD5E1] flex items-center gap-1">
          Historia:
          <select value={back} onChange={(e) => setBack(parseInt(e.target.value))}
            className="bg-[#131C2F] border border-[#2A3B59] rounded h-8 px-2 text-xs text-white"
            data-testid="forecast-back-select">
            {[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n}>{n} msc</option>)}
          </select>
        </label>
        <label className="text-xs text-[#CBD5E1] flex items-center gap-1">
          Prognoza:
          <select value={forward} onChange={(e) => setForward(parseInt(e.target.value))}
            className="bg-[#131C2F] border border-[#2A3B59] rounded h-8 px-2 text-xs text-white"
            data-testid="forecast-forward-select">
            {[1, 3, 6, 9, 12].map((n) => <option key={n} value={n}>{n} msc</option>)}
          </select>
        </label>
      </div>

      {/* KPI top row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="forecast-kpi">
        <Stat label="Średnie koszty firmowe / msc" value={fmtPLN(cc.total_avg_monthly)} accent="#D4AF37"
          sub={`${cc.categories.length} kategorii kosztowych`} icon={Wallet} testId="kpi-company-avg" />
        <Stat label={`Koszty budów (${forward} msc)`} value={fmtPLN(bc.totals.total)} accent="#9DBC85"
          sub="Z harmonogramów aktywnych budów" icon={Building2} testId="kpi-building-costs" />
        <Stat label={`Przychody budów (${forward} msc)`} value={fmtPLN(bi.total)} accent="#22C55E"
          sub="Pozycje przychodowe budżetu" icon={TrendingUp} testId="kpi-building-income" />
        <Stat label={`Bilans P&L (${forward} msc)`} value={fmtPLN(bal.totals.profit)}
          accent={bal.totals.profit >= 0 ? '#22C55E' : '#FCA5A5'}
          sub={`Przychody − koszty (firma + budowy)`}
          icon={bal.totals.profit >= 0 ? TrendingUp : TrendingDown}
          testId="kpi-balance" />
      </div>

      {/* Sekcja A: Koszty firmowe */}
      <Card className="bg-[#0B1120] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-[#D4AF37] flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Koszty utrzymania firmy (KP / KSB / KSP)
          </CardTitle>
          <div className="text-xs text-[#94A3B8]">
            Średni miesięczny koszt z ostatnich {back} miesięcy. <b>Nie zawiera</b> kosztów budów (KBB).
          </div>
        </CardHeader>
        <CardContent>
          {cc.categories.length === 0 ? (
            <div className="text-sm text-[#94A3B8] italic">Brak danych w wybranym okresie.</div>
          ) : (
            <div className="border border-[#2A3B59] rounded overflow-hidden">
              <table className="w-full text-xs" data-testid="company-costs-table">
                <thead className="bg-[#131C2F] text-[#94A3B8] uppercase text-[10px]">
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
                    <tr key={c.code} className="border-t border-[#2A3B59]" data-testid={`company-row-${c.code}`}>
                      <td className="px-3 py-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background: c.category === 'KP' ? '#3F5235' : c.category === 'KSB' ? '#5F4E20' : '#2D4D5C',
                            color: 'white',
                          }}>{c.category}</span>
                      </td>
                      <td className="px-3 py-1.5 text-[#CBD5E1]">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-[9px] text-[#64748B]">{c.code} · {c.count} wpisów</div>
                      </td>
                      <td className="px-3 py-1.5 text-right text-[#94A3B8] tabular-nums">{fmtPLN(c.total_back)} zł</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#9DBC85] font-semibold">{fmtPLN(c.avg_monthly)} zł</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#D4AF37] font-semibold">{fmtPLN(c.avg_monthly * forward)} zł</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#D4AF37]/40 bg-[#D4AF37]/5 font-bold">
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-white">RAZEM koszty firmowe</td>
                    <td className="px-3 py-2 text-right text-[#94A3B8] tabular-nums">{fmtPLN(cc.total_avg_monthly * back)} zł</td>
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
      <Card className="bg-[#0B1120] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-[#9DBC85] flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Prognoza kosztów budów (z harmonogramów)
          </CardTitle>
          <div className="text-xs text-[#94A3B8]">
            Liniowe rozłożenie <b>plan_netto</b> z pozycji budżetu na miesiące w zakresie <b>start_date → end_date</b> etapu.
            Tylko etapy z wypełnionymi datami.
          </div>
        </CardHeader>
        <CardContent>
          {bc.totals.total === 0 ? (
            <div className="text-sm text-[#94A3B8] italic" data-testid="building-empty">
              Brak harmonogramów z datami w aktywnych budowach. Uzupełnij <b>start_date</b> i <b>end_date</b> w etapach
              modułu Budżetowanie aby zobaczyć prognozę.
            </div>
          ) : (
            <div className="border border-[#2A3B59] rounded overflow-hidden">
              <table className="w-full text-xs" data-testid="building-costs-table">
                <thead className="bg-[#131C2F] text-[#94A3B8] uppercase text-[10px]">
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
                    <tr key={`${mo.y}-${mo.m}`} className="border-t border-[#2A3B59]"
                        data-testid={`building-row-${mo.y}-${mo.m}`}>
                      <td className="px-3 py-1.5 text-white font-semibold tabular-nums">{monthName(mo.y, mo.m)}</td>
                      <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(mo.materials)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(mo.labor)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(mo.equipment)} zł</td>
                      <td className="px-3 py-1.5 text-right text-[#94A3B8] tabular-nums">{fmtPLN(mo.other)} zł</td>
                      <td className="px-3 py-1.5 text-right font-bold text-[#9DBC85] tabular-nums bg-[#3F5235]/20">{fmtPLN(mo.total)} zł</td>
                      <td className="px-3 py-1.5 text-[10px] text-[#94A3B8]">
                        {mo.per_budowa.slice(0, 3).map((b, i) => (
                          <span key={i} className="mr-2">{b.name}: <b className="text-[#9DBC85]">{fmtPLN(b.value)}</b></span>
                        ))}
                        {mo.per_budowa.length > 3 && <span className="text-[#64748B]">+{mo.per_budowa.length - 3}</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#9DBC85]/40 bg-[#9DBC85]/5 font-bold">
                    <td className="px-3 py-2 text-white">RAZEM ({forward} msc)</td>
                    <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(bc.totals.materials)} zł</td>
                    <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(bc.totals.labor)} zł</td>
                    <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">{fmtPLN(bc.totals.equipment)} zł</td>
                    <td className="px-3 py-2 text-right text-[#94A3B8] tabular-nums">{fmtPLN(bc.totals.other)} zł</td>
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
      <Card className="bg-[#0B1120] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Bilans miesięczny (przychody − koszty)
          </CardTitle>
          <div className="text-xs text-[#94A3B8]">
            Koszty firmowe stałe ({fmtPLN(cc.total_avg_monthly)} zł/msc) + koszty budów + przychody z pozycji <code>is_income</code>.
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-[#2A3B59] rounded overflow-hidden">
            <table className="w-full text-xs" data-testid="balance-table">
              <thead className="bg-[#131C2F] text-[#94A3B8] uppercase text-[10px]">
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
                  <tr key={`${mo.y}-${mo.m}`} className="border-t border-[#2A3B59]"
                      data-testid={`balance-row-${mo.y}-${mo.m}`}>
                    <td className="px-3 py-1.5 text-white font-semibold tabular-nums">{monthName(mo.y, mo.m)}</td>
                    <td className="px-3 py-1.5 text-right text-[#22C55E] tabular-nums">{fmtPLN(mo.income)} zł</td>
                    <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">−{fmtPLN(mo.costs_company)} zł</td>
                    <td className="px-3 py-1.5 text-right text-[#CBD5E1] tabular-nums">−{fmtPLN(mo.costs_building)} zł</td>
                    <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${mo.profit >= 0 ? 'text-[#22C55E]' : 'text-[#FCA5A5]'} bg-[#D4AF37]/5`}>
                      {mo.profit >= 0 ? '' : '−'}{fmtPLN(Math.abs(mo.profit))} zł
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#D4AF37]/40 bg-[#D4AF37]/5 font-bold">
                  <td className="px-3 py-2 text-white">RAZEM</td>
                  <td className="px-3 py-2 text-right text-[#22C55E] tabular-nums">{fmtPLN(bal.totals.income)} zł</td>
                  <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">−{fmtPLN(bal.totals.costs_company)} zł</td>
                  <td className="px-3 py-2 text-right text-[#CBD5E1] tabular-nums">−{fmtPLN(bal.totals.costs_building)} zł</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${bal.totals.profit >= 0 ? 'text-[#22C55E]' : 'text-[#FCA5A5]'}`}>
                    {bal.totals.profit >= 0 ? '' : '−'}{fmtPLN(Math.abs(bal.totals.profit))} zł
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Forecast;
