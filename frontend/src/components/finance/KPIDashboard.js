// iter95bq: Dashboard KPI - wskazniki finansowe + Top kosztow + alerty
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, DollarSign, Building2, AlertTriangle, Info, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceRefresh, useMonthsFilter, MonthsBar } from './_shared';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const fmtPLN = (v) => {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return '0 zł';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' zł';
};

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

const KpiCard = ({ icon: Icon, label, value, trend, sub, color = '#D4AF37', testId }) => (
  <div className="bg-[#1E2A44] border border-[#3D5378] rounded-lg p-4" data-testid={testId}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-[#94A3B8] text-xs uppercase tracking-wide">{label}</span>
      <Icon className="h-4 w-4" style={{ color }} />
    </div>
    <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
    {sub && <div className="text-xs text-[#CBD5E1] mt-1">{sub}</div>}
    {trend !== undefined && trend !== null && (
      <div className={`text-xs mt-1 flex items-center gap-1 ${trend >= 0 ? 'text-[#9DBC85]' : 'text-[#DC4A3A]'}`}>
        {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {trend >= 0 ? '+' : ''}{trend}%
      </div>
    )}
  </div>
);

const TopCostsCard = ({ data, period }) => {
  const total = (data || []).reduce((s, c) => s + c.total, 0);
  return (
    <Card className="bg-[#243049] border-[#3D5378]" data-testid="top-costs-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-[#DC4A3A]" />
          Top 3 kosztów — {MONTHS[period.month - 1]} {period.year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!data || data.length === 0) ? (
          <div className="text-[#94A3B8] text-sm text-center py-4">Brak kosztów w tym miesiącu</div>
        ) : (
          <div className="space-y-3">
            {data.map((c, i) => {
              const pct = total > 0 ? (c.total / total * 100) : 0;
              return (
                <div key={c.kod_id || i} data-testid={`top-cost-${i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#CBD5E1] text-sm">
                      <span className="text-[#D4AF37] font-bold mr-2">#{i + 1}</span>
                      {c.kod_name}
                    </span>
                    <span className="text-white font-semibold tabular-nums">{fmtPLN(c.total)}</span>
                  </div>
                  <div className="h-2 bg-[#152033] rounded overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#DC4A3A] to-[#D4AF37]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-0.5">{pct.toFixed(1)}% kosztów · {c.count} zapisów</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const AlertsCard = ({ alerts }) => {
  const severityColors = {
    critical: 'text-[#DC4A3A] bg-[#DC4A3A]/15 border-[#DC4A3A]/40',
    warning: 'text-[#D4AF37] bg-[#D4AF37]/15 border-[#D4AF37]/40',
    info: 'text-[#94A3B8] bg-[#3D5378]/30 border-[#3D5378]',
  };
  return (
    <Card className="bg-[#243049] border-[#3D5378]" data-testid="alerts-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
          Alerty finansowe {alerts.length > 0 && <span className="text-[#DC4A3A]">({alerts.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-[#9DBC85] text-sm text-center py-4">Brak alertów — wszystko OK</div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={a.type} className={`p-3 rounded border ${severityColors[a.severity] || severityColors.info}`} data-testid={`alert-${a.type}`}>
                <div className="flex items-start gap-2">
                  {a.severity === 'critical' ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                   : a.severity === 'warning' ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                   : <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{a.title}</div>
                    {a.total_amount && (
                      <div className="text-xs mt-1 opacity-80">Łącznie: {fmtPLN(a.total_amount)}</div>
                    )}
                    {a.items && a.items.length > 0 && (
                      <div className="text-xs mt-2 space-y-0.5 opacity-90">
                        {a.items.slice(0, 5).map((it, j) => (
                          <div key={j}>
                            • {it.kontrahent || it.name || it.nr_faktury}
                            {it.over_by && <span className="ml-1">— przekr. o {fmtPLN(it.over_by)} ({it.over_pct}%)</span>}
                            {it.netto && !it.over_by && <span className="ml-1">— {fmtPLN(it.netto)}</span>}
                          </div>
                        ))}
                        {a.items.length > 5 && <div className="text-[#94A3B8]">… i {a.items.length - 5} kolejnych</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const KPIDashboard = () => {
  const [kpi, setKpi] = useState(null);
  const [topCosts, setTopCosts] = useState({ rows: [], period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 } });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  // iter94: multi-month filter (dla YTD w KPI)
  const currentYear = new Date().getFullYear();
  const { selectedMonths, toggleMonth, selectAll, selectNone, monthsQueryParam } = useMonthsFilter(`kpi_months_${currentYear}`);

  const fetchAll = useCallback(async () => {
    try {
      const kpiUrl = monthsQueryParam ? `/dashboard/kpi?${monthsQueryParam}` : '/dashboard/kpi';
      const [k, t, a] = await Promise.all([
        api.get(kpiUrl),
        api.get('/dashboard/top-costs'),
        api.get('/dashboard/alerts'),
      ]);
      setKpi(k.data);
      setTopCosts(t.data);
      setAlerts(a.data.alerts || []);
    } catch (e) {
      toast.error('Błąd: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  }, [monthsQueryParam]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // iter95dq: silent refetch po dodaniu/edycji/usunieciu zapisu w innym panelu
  useFinanceRefresh(fetchAll);

  if (loading && !kpi) return <div className="text-[#CBD5E1] p-4">Ładuję KPI...</div>;
  if (!kpi) return null;

  return (
    <div className="space-y-4" data-testid="kpi-dashboard">
      {/* Header with export buttons */}
      <div className="flex justify-end gap-2">
        <a
          href={`${API}/finance/export/csv?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Manualny fetch + download żeby przekazać token
            e.preventDefault();
            const t = localStorage.getItem('token');
            fetch(e.target.href || e.currentTarget.href, { headers: { Authorization: `Bearer ${t}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `finanse-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Eksport CSV pobrany');
              })
              .catch(() => toast.error('Błąd eksportu'));
          }}
          className="text-xs bg-[#4F6343] hover:bg-[#5F7552] text-white px-3 py-1.5 rounded inline-flex items-center gap-1"
          data-testid="export-csv-month-btn"
        >
          <Download className="h-3 w-3" /> Eksport CSV (bieżący miesiąc)
        </a>
        <a
          href={`${API}/finance/export/budowy-summary?year=${new Date().getFullYear()}`}
          onClick={(e) => {
            e.preventDefault();
            const t = localStorage.getItem('token');
            fetch(e.currentTarget.href, { headers: { Authorization: `Bearer ${t}` } })
              .then(r => r.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `budowy-summary-${new Date().getFullYear()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Podsumowanie pobrane');
              })
              .catch(() => toast.error('Błąd eksportu'));
          }}
          className="text-xs bg-[#3D5378] hover:bg-[#4A5F8E] text-white px-3 py-1.5 rounded inline-flex items-center gap-1"
          data-testid="export-csv-summary-btn"
        >
          <Download className="h-3 w-3" /> Podsumowanie budów (YTD)
        </a>
      </div>

      {/* iter94: pasek miesiecy - wpływa na YTD w KPI */}
      <div className="bg-[#243049] border border-[#3D5378] rounded-lg px-3 py-2" data-testid="kpi-months-bar-wrap">
        <MonthsBar
          selectedMonths={selectedMonths}
          toggleMonth={toggleMonth}
          selectAll={selectAll}
          selectNone={selectNone}
          testIdPrefix="kpi-months"
          label="Miesiące wliczane do YTD (Cash Flow rocznie / Sprzedaż YTD):"
        />
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Cash flow MTD"
          value={fmtPLN(kpi.cash_flow_mtd)}
          sub={`Przychód ${fmtPLN(kpi.revenue_mtd)} · Koszty ${fmtPLN(kpi.costs_mtd)}`}
          color={kpi.cash_flow_mtd >= 0 ? '#9DBC85' : '#DC4A3A'}
          testId="kpi-cash-mtd"
        />
        <KpiCard
          icon={TrendingUp}
          label="Cash flow YTD"
          value={fmtPLN(kpi.cash_flow_ytd)}
          sub={`Przychód ${fmtPLN(kpi.revenue_ytd)} · Koszty ${fmtPLN(kpi.costs_ytd)}`}
          color={kpi.cash_flow_ytd >= 0 ? '#9DBC85' : '#DC4A3A'}
          testId="kpi-cash-ytd"
        />
        <KpiCard
          icon={Building2}
          label="Aktywne budowy"
          value={kpi.active_sites_count}
          color="#D4AF37"
          testId="kpi-active-sites"
        />
        <KpiCard
          icon={TrendingUp}
          label="Średnia marża"
          value={`${kpi.margin_avg_pct}%`}
          sub="YTD revenue / costs"
          color={kpi.margin_avg_pct >= 0 ? '#9DBC85' : '#DC4A3A'}
          testId="kpi-margin"
        />
      </div>

      {/* Top costs + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopCostsCard data={topCosts.rows} period={topCosts.period} />
        <AlertsCard alerts={alerts} />
      </div>
    </div>
  );
};
