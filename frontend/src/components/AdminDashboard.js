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
  <div className="p-8 text-center text-[#94A3B8] text-sm">Ładowanie...</div>
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
  }, [open, todayIso]);

  const handleSave = async () => {
    if (!date) return toast.error('Podaj datę');
    if (!netto || isNaN(parseFloat(netto))) return toast.error('Podaj kwotę netto');
    if (!kodId) return toast.error('Wybierz kod kosztu');
    setSaving(true);
    try {
      const d = new Date(date);
      await api.post('/finance/zapisy', {
        date,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        kontrahent: kontrahent || '',
        kod_id: kodId,
        budowa_id: budowaId || null,
        netto: parseFloat(netto),
        brutto: parseFloat(netto),
        notes: notes || '',
        source: 'manual',
      });
      toast.success('Zapis dodany');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#131C2F] border-[#2A3B59] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#D4AF37]">Dodaj zapis (koszt bez faktury)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-[#94A3B8] text-xs">Data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="dash-quickadd-date" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Kontrahent (opcjonalnie)</label>
            <Input value={kontrahent} onChange={(e) => setKontrahent(e.target.value)}
              placeholder="np. Bricomat sp. z o.o."
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="dash-quickadd-kontrahent" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Kod kosztu *</label>
            <select value={kodId} onChange={(e) => setKodId(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded h-10 px-3"
              data-testid="dash-quickadd-kod">
              <option value="">— wybierz —</option>
              {kody.filter((k) => k.category !== 'PZS' && k.category !== 'PZSV').map((k) => (
                <option key={k.id} value={k.id}>{k.category} – {k.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Budowa (opcjonalnie)</label>
            <select value={budowaId} onChange={(e) => setBudowaId(e.target.value)}
              className="w-full bg-[#0B1120] border border-[#2A3B59] text-white rounded h-10 px-3"
              data-testid="dash-quickadd-budowa">
              <option value="">— nieprzypisane —</option>
              {budowy.filter((b) => !b.is_archived).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Netto (PLN) *</label>
            <Input type="number" step="0.01" value={netto} onChange={(e) => setNetto(e.target.value)}
              placeholder="0,00"
              className="bg-[#0B1120] border-[#2A3B59] text-white text-lg font-mono tabular-nums"
              data-testid="dash-quickadd-netto" />
          </div>
          <div>
            <label className="text-[#94A3B8] text-xs">Opis / uwagi (opcjonalnie)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="np. paliwo do koparki"
              className="bg-[#0B1120] border-[#2A3B59] text-white" data-testid="dash-quickadd-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}
            className="border-[#2A3B59] text-[#CBD5E1] bg-transparent hover:bg-[#19243C]"
            data-testid="dash-quickadd-cancel">Anuluj</Button>
          <ActionButton onAction={handleSave} disabled={saving}
            className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
            data-testid="dash-quickadd-save">{saving ? 'Zapisywanie...' : 'Zapisz'}</ActionButton>
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
      background_color: '#0B1120',
      theme_color: '#0B1120',
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
      <div className="min-h-screen bg-[#0B1120] p-4">
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
    <div className="min-h-screen bg-[#0B1120]">
      {/* Sticky Header with Glassmorphism */}
      <div className="sticky top-0 z-50 bg-[#0B1120]/80 backdrop-blur-xl border-b border-[#2A3B59] shadow-sm">
        <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg" 
              alt="FeGrro Logo" 
              className="h-10 sm:h-12"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight">Panel Administratora</h1>
              <p className="text-[#94A3B8] text-xs sm:text-sm font-medium">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PushNotificationButton compact />
            <ActionButton
              onAction={handleLogout}
              variant="ghost"
              className="text-[#94A3B8] hover:text-white hover:bg-[#19243C] transition-colors"
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

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
          <Card className="bg-[#19243C] border-[#2A3B59] shadow-lg shadow-black/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#94A3B8] mb-1">Pracownicy</p>
                  <p className="text-3xl font-display font-bold text-[#5F7552] tracking-tight">{stats.totalEmployees}</p>
                </div>
                <Users className="h-10 w-10 text-[#5F7552] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#19243C] border-[#2A3B59] shadow-lg shadow-black/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#94A3B8] mb-1">Budowy</p>
                  <p className="text-3xl font-display font-bold text-[#5F7552] tracking-tight">{stats.totalSites}</p>
                </div>
                <Building2 className="h-10 w-10 text-[#5F7552] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#19243C] border-[#2A3B59] shadow-lg shadow-black/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#94A3B8] mb-1">Prośby</p>
                  <p className="text-3xl font-display font-bold text-[#D4AF37] tracking-tight">{stats.pendingRequests}</p>
                </div>
                <Clock className="h-10 w-10 text-[#D4AF37] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-[#19243C] border-[#2A3B59] shadow-lg shadow-black/20 cursor-pointer hover:border-[#4F6343] hover:bg-[#131C2F] transition-all group"
            onClick={() => setActiveTab('clothing')}
            data-testid="stat-clothing-orders"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#94A3B8] group-hover:text-white transition-colors mb-1">Zamówienia</p>
                  <p className="text-3xl font-display font-bold text-[#4F6343] tracking-tight">{stats.pendingClothing}</p>
                </div>
                <Shirt className="h-10 w-10 text-[#4F6343] opacity-20 group-hover:opacity-40 transition-opacity" />
              </div>
            </CardContent>
          </Card>

          {/* Szybkie dodanie kosztu/zapisu - bez konieczosci wchodzenia w Finanse */}
          <Card
            className="bg-[#19243C] border-[#2A3B59] shadow-lg shadow-black/20 cursor-pointer hover:border-[#D4AF37] hover:bg-[#131C2F] transition-all group"
            onClick={() => setQuickAddOpen(true)}
            data-testid="stat-quick-add-zapis"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#94A3B8] group-hover:text-white transition-colors mb-1">Dodaj zapis</p>
                  <p className="text-base font-display font-bold text-[#D4AF37] tracking-tight">Koszt bez faktury</p>
                </div>
                <Plus className="h-10 w-10 text-[#D4AF37] opacity-30 group-hover:opacity-60 transition-opacity" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Tabela Godzin */}
        <div>
          <Card className="bg-gradient-to-br from-[#19243C] to-[#131C2F] border-[#2A3B59] shadow-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-white tracking-tight mb-1">Tabela Godzin Pracy</h3>
                  <p className="text-sm text-[#94A3B8]">Zarządzaj godzinami wszystkich pracowników w jednej tabeli</p>
                </div>
                <Button
                  onClick={() => navigate('/admin/hours-table')}
                  className="bg-[#4F6343] hover:bg-[#5F7552] text-white shadow-md w-full sm:w-auto transition-colors"
                  data-testid="hours-table-btn"
                >
                  <Clock className="h-5 w-5 mr-2" />
                  Otwórz tabelę godzin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 scrollbar-thin">
            <TabsList className="inline-flex w-auto min-w-max gap-1 flex-nowrap bg-[#19243C] p-1 border border-[#2A3B59] rounded-lg">
              <TabsTrigger value="sites" data-testid="sites-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Lokalizacje</TabsTrigger>
              <TabsTrigger value="foremen" data-testid="foremen-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Brygadziści
                {foremen.filter(f => f.status === 'pending').length > 0 && (
                  <span className="ml-2 bg-[#9B2C2C] text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow-sm">
                    {foremen.filter(f => f.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="requests-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Prosby
                {(stats.pendingRequests + notifications.length + absenceRequests.length) > 0 && (
                  <span className="ml-2 bg-[#4F6343] text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow-sm">
                    {stats.pendingRequests + notifications.length + absenceRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" data-testid="equipment-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Elektronarzędzia
                {equipmentOrdersByCategory.electronics > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#0B1120] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.electronics}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="accessories" data-testid="accessories-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Akcesoria
                {equipmentOrdersByCategory.accessories > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#0B1120] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.accessories}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="formwork" data-testid="formwork-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Szalunki
                {equipmentOrdersByCategory.formwork > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#0B1120] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.formwork}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="warehouse" data-testid="warehouse-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Materiały
                {equipmentOrdersByCategory.warehouse > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#0B1120] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {equipmentOrdersByCategory.warehouse}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="clothing" data-testid="clothing-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">
                Odzież
                {stats.pendingClothing > 0 && (
                  <span className="ml-2 bg-[#D4AF37] text-[#0B1120] text-[10px] rounded px-1.5 py-0.5 font-bold shadow-sm">
                    {stats.pendingClothing}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="bhp" data-testid="bhp-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">BHP</TabsTrigger>
              <TabsTrigger value="payroll" data-testid="payroll-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Wypłaty</TabsTrigger>
              <TabsTrigger value="finance" data-testid="finance-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Finanse</TabsTrigger>
              <TabsTrigger value="budget" data-testid="budget-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Budżetowanie</TabsTrigger>
              <TabsTrigger value="wyceny" data-testid="wyceny-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Wyceny</TabsTrigger>
              <TabsTrigger value="forecast" data-testid="forecast-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Prognozy</TabsTrigger>
              <TabsTrigger value="tools" data-testid="tools-tab" className="whitespace-nowrap shrink-0 rounded-md data-[state=active]:bg-[#2A3B59] data-[state=active]:text-white transition-all text-[#94A3B8]">Narzędzia</TabsTrigger>
            </TabsList>
          </div>

          {/* Tabs Content Sections */}
          <div className="bg-[#0B1120] rounded-lg">
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
