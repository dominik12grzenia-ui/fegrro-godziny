import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { prefetch } from '../context/apiCache';
import PushNotificationButton from './PushNotificationButton';
import { Button } from './ui/button';
import { ActionButton } from './ui/action-button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { SkeletonBox, SkeletonCards, SkeletonTable } from './ui/skeletons';
import { 
  Users, Building2, Clock, FileText, LogOut, 
  CheckCircle, XCircle, MapPin, Phone, Calendar,
  RefreshCw, Download, Bell, AlertTriangle, Link, Copy, ExternalLink, Trash2, AlertCircle, Shirt, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { SitesMap } from './SitesMap';
import { emitFinanceRefresh } from './finance/_shared';

// Lazy-loaded heavy tabs — code-split away from the main bundle.
// Each import factory is kept in a const so we can call it directly
// to PREFETCH chunks immediately after mount (warming the cache so the
// first tab click renders instantly, not after a network round-trip).
const equipmentAdminImport = () => import('./EquipmentAdmin').then((m) => ({ default: m.EquipmentAdmin }));
const clothingAdminImport = () => import('./ClothingAdmin').then((m) => ({ default: m.ClothingAdmin }));
const bhpAdminImport = () => import('./BhpAdmin').then((m) => ({ default: m.BhpAdmin }));
const warehouseAdminImport = () => import('./WarehouseAdmin').then((m) => ({ default: m.WarehouseAdmin }));
const sitesTabImport = () => import('./admin/SitesTab').then((m) => ({ default: m.SitesTab }));
const foremenTabImport = () => import('./admin/ForemenTab').then((m) => ({ default: m.ForemenTab }));
const requestsTabImport = () => import('./admin/RequestsTab').then((m) => ({ default: m.RequestsTab }));
const toolsTabImport = () => import('./admin/ToolsTab').then((m) => ({ default: m.ToolsTab }));
const payrollAdminImport = () => import('./PayrollAdmin').then((m) => ({ default: m.PayrollAdmin }));
const financeImport = () => import('./Finance').then((m) => ({ default: m.Finance }));
const budgetImport = () => import('./Budget').then((m) => ({ default: m.Budget }));
const wycenyImport = () => import('./Wyceny').then((m) => ({ default: m.Wyceny }));
const forecastImport = () => import('./Forecast').then((m) => ({ default: m.Forecast }));

const EquipmentAdmin = lazy(equipmentAdminImport);
const ClothingAdmin = lazy(clothingAdminImport);
const BhpAdmin = lazy(bhpAdminImport);
const WarehouseAdmin = lazy(warehouseAdminImport);
const SitesTab = lazy(sitesTabImport);
const ForemenTab = lazy(foremenTabImport);
const RequestsTab = lazy(requestsTabImport);
const ToolsTab = lazy(toolsTabImport);
const PayrollAdmin = lazy(payrollAdminImport);
const Finance = lazy(financeImport);
const Budget = lazy(budgetImport);
const Wyceny = lazy(wycenyImport);
const Forecast = lazy(forecastImport);

const TabSpinner = () => (
  <div className="p-8 text-center text-[#CBD5E1] text-sm">Ładowanie...</div>
);

// =================== MODAL: SZYBKI DODAJ ZAPIS (z dashboardu) ===================
// Niewielki wariant tego samego modala co w Finance.js - osobny komponent
// zeby admin mogl szybko dodac koszt bez wchodzenia w Finanse.
const QuickAddZapisModal = ({ open, onClose }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [kontrahent, setKontrahent] = useState('');
  const [notes, setNotes] = useState('');
  const [netto, setNetto] = useState('');
  const [kodId, setKodId] = useState('');
  const [budowaId, setBudowaId] = useState('');
  const [kody, setKody] = useState([]);
  const [budowy, setBudowy] = useState([]);
  const [saving, setSaving] = useState(false);
  // iter95dp: koszt cykliczny
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState(12);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/finance/kody').catch(() => ({ data: { rows: [] } })),
      api.get('/finance/budowy').catch(() => ({ data: { rows: [] } })),
    ]).then(([k, b]) => {
      // Backend zwraca {rows:[...]}, ale na wszelki wypadek wspieramy tez raw array.
      const kodyArr = Array.isArray(k.data) ? k.data : (k.data?.rows || []);
      const budowyArr = Array.isArray(b.data) ? b.data : (b.data?.rows || []);
      setKody(kodyArr);
      setBudowy(budowyArr);
    });
    setDate(todayIso); setKontrahent(''); setNotes(''); setNetto(''); setKodId(''); setBudowaId('');
    setIsRecurring(false); setRecurringMonths(12);
  }, [open, todayIso]);

  const handleSave = async () => {
    if (!date) return toast.error('Podaj datę');
    if (!netto || isNaN(parseFloat(netto))) return toast.error('Podaj kwotę netto');
    if (!kodId) return toast.error('Wybierz kod kosztu');
    setSaving(true);
    try {
      const payload = {
        date,
        kontrahent: kontrahent || '',
        kod_id: kodId,
        budowa_id: budowaId || null,
        netto: parseFloat(netto),
        notes: notes || '',
      };
      if (isRecurring) {
        const n = Math.max(1, Math.min(120, parseInt(recurringMonths, 10) || 1));
        const r = await api.post('/finance/zapisy/recurring', { ...payload, months: n });
        const c = r.data?.created_count ?? n;
        const s = r.data?.skipped_count ?? 0;
        toast.success(`Dodano koszt cykliczny: ${c} mc${s > 0 ? ` (pominięto ${s} zamknięt${s === 1 ? 'y' : 'ych'} okres${s === 1 ? '' : 'ów'})` : ''}`);
      } else {
        const d = new Date(date);
        await api.post('/finance/zapisy', {
          ...payload,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          brutto: parseFloat(netto),
          source: 'manual',
        });
        toast.success('Zapis dodany');
      }
      emitFinanceRefresh('quickadd-modal');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1E2A44] border-[#3D5378] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37]">Dodaj zapis (koszt bez faktury)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-[#CBD5E1] text-xs">Data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="dash-quickadd-date" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Kontrahent (opcjonalnie)</label>
            <Input value={kontrahent} onChange={(e) => setKontrahent(e.target.value)}
              placeholder="np. Bricomat sp. z o.o."
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="dash-quickadd-kontrahent" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Kod kosztu *</label>
            <select value={kodId} onChange={(e) => setKodId(e.target.value)}
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded h-10 px-3"
              data-testid="dash-quickadd-kod">
              <option value="">— wybierz —</option>
              {kody.filter((k) => k.category !== 'PZS' && k.category !== 'PZSV').map((k) => (
                <option key={k.id} value={k.id}>{`${k.category} – ${k.name}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Budowa (opcjonalnie)</label>
            <select value={budowaId} onChange={(e) => setBudowaId(e.target.value)}
              className="w-full bg-[#152033] border border-[#3D5378] text-white rounded h-10 px-3"
              data-testid="dash-quickadd-budowa">
              <option value="">— nieprzypisane —</option>
              {budowy.filter((b) => !b.is_archived).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Netto (PLN) *</label>
            <Input type="number" step="0.01" value={netto} onChange={(e) => setNetto(e.target.value)}
              placeholder="0,00"
              className="bg-[#152033] border-[#3D5378] text-white text-lg font-mono tabular-nums"
              data-testid="dash-quickadd-netto" />
          </div>
          <div>
            <label className="text-[#CBD5E1] text-xs">Opis / uwagi (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="np. paliwo do koparki"
              className="bg-[#152033] border-[#3D5378] text-white" data-testid="dash-quickadd-notes" />
          </div>
          {/* iter95dp: koszt cykliczny */}
          <div className="border border-[#3D5378] rounded p-3 bg-[#243049]/40">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="accent-[#4F6343] h-4 w-4"
                data-testid="dash-quickadd-recurring-toggle"
              />
              <span className="text-sm text-[#F1F5F9] font-medium">Koszt cykliczny — powtarzaj co miesiąc</span>
            </label>
            {isRecurring && (
              <div className="mt-3 flex items-end gap-3">
                <div className="w-32">
                  <label className="text-[#CBD5E1] text-[10px] uppercase block mb-1">Liczba mc</label>
                  <Input
                    type="number" min="1" max="120" step="1"
                    value={recurringMonths}
                    onChange={(e) => setRecurringMonths(e.target.value)}
                    className="no-spinner bg-[#152033] border-[#3D5378] text-white"
                    data-testid="dash-quickadd-recurring-months"
                  />
                </div>
                <div className="text-xs text-[#94A3B8] leading-snug flex-1">
                  Powstanie <strong className="text-[#D4AF37]">{Math.max(1, parseInt(recurringMonths, 10) || 0)}</strong> zapisów po <strong className="text-[#D4AF37]">{Number(netto || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł</strong>, jeden na każdy miesiąc od {date}.
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}
            className="border-[#3D5378] text-[#F1F5F9] bg-transparent hover:bg-[#243049]"
            data-testid="dash-quickadd-cancel">Anuluj</Button>
          <ActionButton onAction={handleSave} disabled={saving}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
            data-testid="dash-quickadd-save">{saving ? 'Zapisywanie...' : (isRecurring ? `Zapisz ${Math.max(1, parseInt(recurringMonths, 10) || 0)} mc` : 'Zapisz')}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AdminDashboard = () => {
  const { user, logout, impersonateForeman } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sites');
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalSites: 0,
    pendingRequests: 0,
    pendingClothing: 0,
    todayHours: 0
  });
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [foremen, setForemen] = useState([]);
  const [foremanSiteSelections, setForemanSiteSelections] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [bhpAlerts, setBhpAlerts] = useState({ employees: [], documents: [] });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [geocoding, setGeocoding] = useState(null);
  const [publicLinks, setPublicLinks] = useState([]);
  const [generatingLinks, setGeneratingLinks] = useState(false);
  const [equipmentOrdersByCategory, setEquipmentOrdersByCategory] = useState({
    electronics: 0, accessories: 0, formwork: 0, warehouse: 0,
  });

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    fetchData();
  }, [user, navigate]);

  // Pobierz alerty BHP/dokumentow do bannera. Niezalezne od fetchData.
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const fetchBhp = () => {
      api.get('/bhp/alerts?days=30')
        .then((res) => setBhpAlerts(res.data || { employees: [], documents: [] }))
        .catch(() => setBhpAlerts({ employees: [], documents: [] }));
    };
    fetchBhp();
    // Odswiezaj co 15 min zeby admin widzial nowe wygasniecia bez F5
    const interval = setInterval(fetchBhp, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  // Dynamiczny manifest PWA dla admina: kliknięcie "Dodaj do ekranu glównego"
  // z panelu admina ustawi ikone tak, by po ponownym otwarciu wracała na /admin/dashboard,
  // nie na /foreman (statyczny manifest zwraca brygadziste).
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const original = link.getAttribute('href');
    const m = {
      name: 'FeGrro Admin',
      short_name: 'FeGrro Admin',
      description: 'Panel administratora - FeGrro',
      start_url: '/admin/dashboard',
      scope: '/',
      display: 'standalone',
      background_color: '#152033',
      theme_color: '#152033',
      orientation: 'any',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    };
    const blob = new Blob([JSON.stringify(m)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    return () => {
      URL.revokeObjectURL(url);
      if (original) link.setAttribute('href', original);
    };
  }, []);

  // Aggressive prefetch: as soon as the dashboard mounts we (1) start
  // downloading every lazy chunk in the background so the first click on
  // any tab is instant, and (2) warm the apiCache with the data each tab
  // needs. This gives the user sub-second tab switching including the very
  // first click on Elektronarzedzia / Akcesoria / Szalunki / Materialy.
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const handle = setTimeout(() => {
      // Warm chunks (these promises are cached by webpack)
      equipmentAdminImport().catch(() => {});
      sitesTabImport().catch(() => {});
      foremenTabImport().catch(() => {});
      requestsTabImport().catch(() => {});
      toolsTabImport().catch(() => {});
      warehouseAdminImport().catch(() => {});
      clothingAdminImport().catch(() => {});
      bhpAdminImport().catch(() => {});
      // iter95bj: warm wszystkie pozostale duze chunki
      payrollAdminImport().catch(() => {});
      financeImport().catch(() => {});
      budgetImport().catch(() => {});
      wycenyImport().catch(() => {});
      forecastImport().catch(() => {});
      // Warm data caches for equipment-heavy tabs (most common destinations)
      prefetch('/equipment?category=electronics');
      prefetch('/equipment?category=accessories');
      prefetch('/equipment?category=formwork');
      prefetch('/equipment/assignments/all');
      prefetch('/equipment/history');
      prefetch('/equipment/defects');
      prefetch('/equipment/transfers/all');
      prefetch('/equipment/returns/pending');
      prefetch('/equipment/inventory/list');
      prefetch('/equipment/inventory/shortages?status=open');
      prefetch('/equipment/scrapped?category=electronics');
      prefetch('/settings/warehouse-keeper');
      prefetch('/warehouse/materials');
      prefetch('/warehouse/orders');
      // iter95bj: warm data dla Wyceny/Budget/Finance/Forecast/Payroll
      prefetch('/wyceny');
      prefetch('/wyceny/clients');
      prefetch('/finance/budowy');
      prefetch('/finance/kody');
      prefetch('/budget/budowy');
      prefetch('/foremen');
    }, 100); // small delay so primary render isn't blocked
    return () => clearTimeout(handle);
  }, [user]);

  const fetchData = async () => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // PRIMARY - render stats + hours table as soon as these arrive
      const [employeesRes, sitesRes, assignmentsRes] = await Promise.all([
        api.get(`/employees?month=${currentMonth}&year=${currentYear}`),
        api.get('/sites'),
        api.get('/assignments'),
      ]);
      setEmployees(employeesRes.data);
      setSites(sitesRes.data);
      setAssignments(assignmentsRes.data);
      const budowyCount = (sitesRes.data || []).filter((s) => s.excel_column).length;
      setStats((s) => ({ ...s, totalEmployees: employeesRes.data.length, totalSites: budowyCount, todayHours: 0 }));
      setLoading(false);

      // SECONDARY - fill counters and tabs below without blocking
      const [requestsRes, foremenRes, notificationsRes, syncLogsRes, absencesRes, clothingOrdersRes, eqOrdersRes, eqPartialRes, whOrdersRes] = await Promise.all([
        api.get('/requests?status=pending'),
        api.get('/foremen'),
        api.get('/notifications'),
        api.get('/sync/logs'),
        api.get('/absences?status=pending'),
        api.get('/clothing/orders').catch(() => ({ data: [] })),
        api.get('/equipment/orders?status=pending').catch(() => ({ data: [] })),
        api.get('/equipment/orders?status=partial').catch(() => ({ data: [] })),
        api.get('/warehouse/orders').catch(() => ({ data: [] })),
      ]);
      setRequests(requestsRes.data);
      setForemen(foremenRes.data);
      setNotifications(notificationsRes.data);
      setAbsenceRequests(absencesRes.data);
      setSyncLogs(syncLogsRes.data);
      const pendingClothing = (clothingOrdersRes.data || []).filter((o) => o.status !== 'issued').length;
      setStats((s) => ({ ...s, pendingRequests: requestsRes.data.length, pendingClothing }));
      // Pending equipment orders by category (incl. partial)
      const eqByCat = { electronics: 0, accessories: 0, formwork: 0, warehouse: 0 };
      [...(eqOrdersRes.data || []), ...(eqPartialRes.data || [])].forEach((o) => {
        const c = o.category || 'electronics';
        if (eqByCat[c] !== undefined) eqByCat[c] += 1;
      });
      // Warehouse (Materiały) - pending or partial orders
      eqByCat.warehouse = (whOrdersRes.data || []).filter(
        (o) => o.status === 'pending' || o.status === 'partial'
      ).length;
      setEquipmentOrdersByCategory(eqByCat);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Nie udało się pobrać danych');
      setLoading(false);
    }
  };

  const handleApproveRequest = async (requestId) => {
    try {
      await api.put(`/requests/${requestId}/review`, { status: 'approved' });
      toast.success('Prośba zatwierdzona');
      fetchData();
    } catch (error) {
      toast.error('Nie udało się zatwierdzić prośby');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await api.put(`/requests/${requestId}/review`, { status: 'rejected' });
      toast.success('Prośba odrzucona');
      fetchData();
    } catch (error) {
      toast.error('Nie udało się odrzucić prośby');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#152033] p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <SkeletonBox style={{ height: 64 }} />
          <SkeletonCards count={4} />
          <SkeletonBox style={{ height: 120 }} />
          <SkeletonTable rows={8} cols={6} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#152033]">
      {/* Sticky Header — iter95dj soft-dark redesign */}
      <div className="sticky top-0 z-50 bg-[#181F30]/80 backdrop-blur-xl border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <img
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg"
              alt="FeGrro Logo"
              className="h-8 sm:h-10 lg:h-12 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-100 truncate">Panel Administratora</h1>
              <p className="text-slate-400 text-[10px] sm:text-xs font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <PushNotificationButton compact />
            <ActionButton
              onAction={handleLogout}
              variant="ghost"
              className="text-[#CBD5E1] hover:text-white hover:bg-[#243049] transition-colors"
              data-testid="admin-logout-btn"
            ><LogOut className="h-5 w-5" /></ActionButton>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Absence requests alert */}
        {absenceRequests.length > 0 && (
          <div className="p-4 bg-[#9B2C2C]/20 border border-[#9B2C2C]/50 rounded-lg flex items-center gap-4 cursor-pointer hover:bg-[#9B2C2C]/30 transition-colors shadow-sm" onClick={() => setActiveTab('requests')} data-testid="absence-alert-banner">
            <AlertCircle className="h-6 w-6 text-[#FCA5A5] shrink-0" />
            <div>
              <p className="text-[#FCA5A5] font-bold text-sm">
                {absenceRequests.length} {absenceRequests.length === 1 ? 'prośba' : 'próśb'} o wolne do akceptacji
              </p>
              <p className="text-[#FCA5A5]/70 text-xs mt-0.5">
                {absenceRequests.map(a => a.employee_name || 'Pracownik').join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* BHP/dokumenty - banner wygasajacych dokumentow */}
        {(bhpAlerts.employees?.length > 0 || bhpAlerts.documents?.length > 0) && (() => {
          // Liczba pracownikow z DOWOLNYM problemem (BHP/wysokosc/zezwolenie/pobyt LUB dokumenty)
          const ids = new Set();
          (bhpAlerts.employees || []).forEach((e) => ids.add(e.employee_id));
          (bhpAlerts.documents || []).forEach((d) => ids.add(d.employee_id));
          const total = ids.size;
          const hasExpired = (bhpAlerts.employees || []).some((e) => e.alerts?.some((a) => a.expired))
            || (bhpAlerts.documents || []).some((d) => d.expired);
          const bg = hasExpired
            ? 'bg-[#9B2C2C]/20 border-[#9B2C2C]/50'
            : 'bg-[#D4AF37]/15 border-[#D4AF37]/50';
          const iconColor = hasExpired ? 'text-[#FCA5A5]' : 'text-[#D4AF37]';
          const titleColor = hasExpired ? 'text-[#FCA5A5]' : 'text-[#D4AF37]';
          const descColor = hasExpired ? 'text-[#FCA5A5]/70' : 'text-[#D4AF37]/70';
          
          return (
            <div
              className={`p-4 ${bg} border rounded-lg flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity shadow-sm`}
              onClick={() => setActiveTab('bhp')}
              data-testid="bhp-expiry-banner">
              <AlertCircle className={`h-6 w-6 ${iconColor} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${titleColor}`}>
                  {hasExpired ? 'Wygasłe lub krytyczne dokumenty: ' : 'Kończą się dokumenty: '}
                  {total} {total === 1 ? 'pracownikowi' : 'pracownikom'}
                </p>
                <p className={`text-xs mt-0.5 truncate ${descColor}`}>
                  BHP / badania wysokościowe / zezwolenie / legalny pobyt — kliknij aby zobaczyć szczegóły
                </p>
              </div>
            </div>
          );
        })()}

        {/* iter95dj: KPI Cards - soft dark redesign z lewym akcentem brandowym */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#222B40] border border-white/10 border-l-4 border-l-[#9DBC85] rounded-xl p-5 shadow-sm hover:shadow-md hover:border-l-[#5F7552] transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pracownicy</p>
                <p className="text-3xl font-bold text-slate-100 tracking-tight tabular-nums" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>{stats.totalEmployees}</p>
              </div>
              <Users className="h-9 w-9 text-[#9DBC85]/30" />
            </div>
          </div>

          <div className="bg-[#222B40] border border-white/10 border-l-4 border-l-[#9DBC85] rounded-xl p-5 shadow-sm hover:shadow-md hover:border-l-[#5F7552] transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Budowy</p>
                <p className="text-3xl font-bold text-slate-100 tracking-tight tabular-nums" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>{stats.totalSites}</p>
              </div>
              <Building2 className="h-9 w-9 text-[#9DBC85]/30" />
            </div>
          </div>

          <div className="bg-[#222B40] border border-white/10 border-l-4 border-l-[#FCD34D] rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Prośby</p>
                <p className="text-3xl font-bold text-slate-100 tracking-tight tabular-nums" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>{stats.pendingRequests}</p>
              </div>
              <Clock className="h-9 w-9 text-[#FCD34D]/40" />
            </div>
          </div>

          <button
            className="bg-[#222B40] border border-white/10 border-l-4 border-l-[#60A5FA] rounded-xl p-5 shadow-sm hover:shadow-md hover:bg-[#2D3850] transition-all text-left group"
            onClick={() => setActiveTab('clothing')}
            data-testid="stat-clothing-orders"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 group-hover:text-slate-300 transition-colors">Zamówienia</p>
                <p className="text-3xl font-bold text-slate-100 tracking-tight tabular-nums" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>{stats.pendingClothing}</p>
              </div>
              <Shirt className="h-9 w-9 text-[#60A5FA]/40 group-hover:text-[#60A5FA]/60 transition-colors" />
            </div>
          </button>

          {/* Szybkie dodanie kosztu — pełnoprawny przycisk akcji */}
          <button
            className="bg-[#9DBC85]/10 border border-[#9DBC85]/30 rounded-xl p-5 shadow-sm hover:bg-[#9DBC85]/20 hover:border-[#9DBC85]/50 hover:shadow-[0_0_15px_rgba(157,188,133,0.15)] transition-all text-left group"
            onClick={() => setQuickAddOpen(true)}
            data-testid="stat-quick-add-zapis"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#9DBC85] uppercase tracking-wider mb-2">+ Dodaj zapis</p>
                <p className="text-sm font-semibold text-slate-100 tracking-tight">Koszt bez faktury</p>
              </div>
              <Plus className="h-9 w-9 text-[#9DBC85] group-hover:rotate-90 transition-transform" />
            </div>
          </button>
        </div>

        {/* Quick Actions - Tabela Godzin (redesigned) */}
        <div>
          <div className="bg-[#222B40] border border-white/10 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-100 tracking-tight mb-1" style={{fontFamily: "'Cabinet Grotesk', sans-serif"}}>Tabela Godzin Pracy</h3>
                  <p className="text-sm text-slate-400">Zarządzaj godzinami wszystkich pracowników w jednej tabeli</p>
                </div>
                <Button
                  onClick={() => navigate('/admin/hours-table')}
                  className="bg-[#9DBC85] hover:bg-[#5F7552] text-slate-900 font-medium shadow-[0_0_15px_rgba(157,188,133,0.15)] w-full sm:w-auto transition-colors"
                  data-testid="hours-table-btn"
                >
                  <Clock className="h-5 w-5 mr-2" />
                  Otwórz tabelę godzin
                </Button>
              </div>
          </div>
        </div>

        {/* Tabs - iter95dj redesigned as pills */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 scrollbar-hide">
            <TabsList className="inline-flex w-auto min-w-max gap-1.5 flex-nowrap bg-transparent p-0 border-0 rounded-none">
              <TabsTrigger value="sites" data-testid="sites-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] data-[state=active]:shadow-sm transition-all">Lokalizacje</TabsTrigger>
              <TabsTrigger value="foremen" data-testid="foremen-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Brygadziści
                {foremen.filter(f => f.status === 'pending').length > 0 && (
                  <span className="ml-2 bg-[#9B2C2C] text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow-sm">
                    {foremen.filter(f => f.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="requests-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Prosby
                {(stats.pendingRequests + notifications.length + absenceRequests.length) > 0 && (
                  <span className="ml-2 bg-[#4F6343] text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow-sm">
                    {stats.pendingRequests + notifications.length + absenceRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" data-testid="equipment-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Elektronarzędzia
                {equipmentOrdersByCategory.electronics > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#152033] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.electronics}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="accessories" data-testid="accessories-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Akcesoria
                {equipmentOrdersByCategory.accessories > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#152033] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.accessories}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="formwork" data-testid="formwork-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Szalunki
                {equipmentOrdersByCategory.formwork > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#152033] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.formwork}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="warehouse" data-testid="warehouse-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Materiały
                {equipmentOrdersByCategory.warehouse > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#152033] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.warehouse}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="clothing" data-testid="clothing-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">
                Odzież
                {stats.pendingClothing > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#152033] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {stats.pendingClothing}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="bhp" data-testid="bhp-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">BHP</TabsTrigger>
              <TabsTrigger value="payroll" data-testid="payroll-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Wypłaty</TabsTrigger>
              <TabsTrigger value="finance" data-testid="finance-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Finanse</TabsTrigger>
              <TabsTrigger value="budget" data-testid="budget-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Budżetowanie</TabsTrigger>
              <TabsTrigger value="wyceny" data-testid="wyceny-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Wyceny</TabsTrigger>
              <TabsTrigger value="forecast" data-testid="forecast-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Prognozy</TabsTrigger>
              <TabsTrigger value="tools" data-testid="tools-tab" className="whitespace-nowrap shrink-0 rounded-full px-4 py-2 text-sm font-medium border border-white/5 bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 data-[state=active]:bg-[#9DBC85] data-[state=active]:text-slate-900 data-[state=active]:border-[#9DBC85] transition-all">Narzędzia</TabsTrigger>
            </TabsList>
          </div>

          {/* Tabs Content Sections */}
          <div className="bg-[#152033] rounded-lg">
            <TabsContent value="sites" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <SitesTab
                sites={sites}
                employees={employees}
                assignments={assignments}
                geocoding={geocoding}
                setGeocoding={setGeocoding}
                fetchData={fetchData}
              />
            </Suspense>
          </TabsContent>

          {/* Foremen Tab */}
          <TabsContent value="foremen" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <ForemenTab
                foremen={foremen}
                sites={sites}
                foremanSiteSelections={foremanSiteSelections}
                setForemanSiteSelections={setForemanSiteSelections}
                fetchData={fetchData}
                impersonateForeman={impersonateForeman}
              />
            </Suspense>
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <RequestsTab
                requests={requests}
                employees={employees}
                sites={sites}
                notifications={notifications}
                absenceRequests={absenceRequests}
                setAbsenceRequests={setAbsenceRequests}
                handleApproveRequest={handleApproveRequest}
                handleRejectRequest={handleRejectRequest}
                fetchData={fetchData}
              />
            </Suspense>
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="electronics" title="Elektronarzędzia" />
            </Suspense>
          </TabsContent>

          <TabsContent value="accessories" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="accessories" title="Akcesoria" />
            </Suspense>
          </TabsContent>

          <TabsContent value="formwork" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="formwork" title="Szalunki" />
            </Suspense>
          </TabsContent>

          <TabsContent value="warehouse" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <WarehouseAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="clothing" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <ClothingAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="bhp" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <BhpAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <PayrollAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <Finance />
            </Suspense>
          </TabsContent>

          <TabsContent value="budget" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <Budget />
            </Suspense>
          </TabsContent>

          <TabsContent value="wyceny" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <Wyceny />
            </Suspense>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <Forecast />
            </Suspense>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4 m-0">
            <Suspense fallback={<TabSpinner />}>
              <ToolsTab
                syncing={syncing}
                setSyncing={setSyncing}
                generatingPdf={generatingPdf}
                setGeneratingPdf={setGeneratingPdf}
                syncLogs={syncLogs}
                publicLinks={publicLinks}
                setPublicLinks={setPublicLinks}
                generatingLinks={generatingLinks}
                setGeneratingLinks={setGeneratingLinks}
                fetchData={fetchData}
              />
            </Suspense>
          </TabsContent>
          </div>
        </Tabs>
      </div>
      <QuickAddZapisModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
};
