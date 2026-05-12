import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { prefetch } from '../context/apiCache';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { 
  Users, Building2, Clock, FileText, LogOut, 
  CheckCircle, XCircle, MapPin, Phone, Calendar,
  RefreshCw, Download, Bell, AlertTriangle, Link, Copy, ExternalLink, Trash2, AlertCircle, Shirt
} from 'lucide-react';
import { toast } from 'sonner';
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

const EquipmentAdmin = lazy(equipmentAdminImport);
const ClothingAdmin = lazy(clothingAdminImport);
const BhpAdmin = lazy(bhpAdminImport);
const WarehouseAdmin = lazy(warehouseAdminImport);
const SitesTab = lazy(sitesTabImport);
const ForemenTab = lazy(foremenTabImport);
const RequestsTab = lazy(requestsTabImport);
const ToolsTab = lazy(toolsTabImport);

const TabSpinner = () => (
  <div className="p-8 text-center text-[#94A3B8] text-sm">Ładowanie...</div>
);

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
      background_color: '#0F172A',
      theme_color: '#0F172A',
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
      <div className="min-h-screen bg-[#1E293B] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5F7151] mx-auto"></div>
          <p className="mt-4 text-[#94A3B8]">Wczytywanie...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1E293B]">
      {/* Header */}
      <div className="bg-[#1E293B] text-white shadow-lg">
        <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://fegrro.pl/wp-content/uploads/2020/02/LOGO-4.svg" 
              alt="FeGrro Logo" 
              className="h-12"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Panel Administratora</h1>
              <p className="text-green-100 text-sm">{user?.email}</p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="text-white hover:bg-[#2A384C]"
            data-testid="admin-logout-btn"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {/* Absence requests alert */}
        {absenceRequests.length > 0 && (
          <div className="mb-4 p-3 bg-[#7F2D2D]/30 border-2 border-[#7F2D2D] rounded-lg flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('requests')} data-testid="absence-alert-banner">
            <AlertCircle className="h-6 w-6 text-[#FCA5A5] shrink-0" />
            <div>
              <p className="text-[#FCA5A5] font-bold text-sm">
                {absenceRequests.length} {absenceRequests.length === 1 ? 'prośba' : 'próśb'} o wolne do akceptacji
              </p>
              <p className="text-[#94A3B8] text-xs">
                {absenceRequests.map(a => a.employee_name || 'Pracownik').join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-[#2A384C] border-[#334155]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Pracownicy</p>
                  <p className="text-3xl font-bold text-[#6B8E4E]">{stats.totalEmployees}</p>
                </div>
                <Users className="h-12 w-12 text-[#6B8E4E] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2A384C] border-[#334155]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Budowy</p>
                  <p className="text-3xl font-bold text-[#6B8E4E]">{stats.totalSites}</p>
                </div>
                <Building2 className="h-12 w-12 text-[#6B8E4E] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#2A384C] border-[#334155]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Prośby</p>
                  <p className="text-3xl font-bold text-[#5F7151]">{stats.pendingRequests}</p>
                </div>
                <Clock className="h-12 w-12 text-[#5F7151] opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-[#2A384C] border-[#334155] cursor-pointer hover:border-[#5F7151] transition-colors"
            onClick={() => setActiveTab('clothing')}
            data-testid="stat-clothing-orders"
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#94A3B8]">Zamówienia</p>
                  <p className="text-3xl font-bold text-[#5F7151]">{stats.pendingClothing}</p>
                </div>
                <Shirt className="h-12 w-12 text-[#5F7151] opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Tabela Godzin */}
        <div className="mb-6">
          <Card className="bg-[#2A384C] border-[#334155]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[#CBD5E1] mb-2">📊 Tabela Godzin Pracy</h3>
                  <p className="text-sm text-[#94A3B8]">Zarządzaj godzinami wszystkich pracowników w jednej tabeli</p>
                </div>
                <Button
                  onClick={() => navigate('/admin/hours-table')}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 scrollbar-thin">
            <TabsList className="inline-flex w-auto min-w-max gap-1 flex-nowrap">
              <TabsTrigger value="sites" data-testid="sites-tab" className="whitespace-nowrap shrink-0">Lokalizacje</TabsTrigger>
              <TabsTrigger value="foremen" data-testid="foremen-tab" className="whitespace-nowrap shrink-0">
                Brygadzisci
                {foremen.filter(f => f.status === 'pending').length > 0 && (
                  <span className="ml-1 bg-[#E8836A] text-white text-xs rounded-full px-1.5 py-0.5">
                    {foremen.filter(f => f.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="requests-tab" className="whitespace-nowrap shrink-0">
                Prosby
                {(stats.pendingRequests + notifications.length + absenceRequests.length) > 0 && (
                  <span className="ml-1 bg-[#5F7151] text-white text-xs rounded-full px-1.5 py-0.5">
                    {stats.pendingRequests + notifications.length + absenceRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" data-testid="equipment-tab" className="whitespace-nowrap shrink-0">
                Elektronarzędzia
                {equipmentOrdersByCategory.electronics > 0 && (
                  <span className="ml-1 bg-[#E8B76A] text-[#1E293B] text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {equipmentOrdersByCategory.electronics}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="accessories" data-testid="accessories-tab" className="whitespace-nowrap shrink-0">
                Akcesoria
                {equipmentOrdersByCategory.accessories > 0 && (
                  <span className="ml-1 bg-[#E8B76A] text-[#1E293B] text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {equipmentOrdersByCategory.accessories}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="formwork" data-testid="formwork-tab" className="whitespace-nowrap shrink-0">
                Szalunki
                {equipmentOrdersByCategory.formwork > 0 && (
                  <span className="ml-1 bg-[#E8B76A] text-[#1E293B] text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {equipmentOrdersByCategory.formwork}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="warehouse" data-testid="warehouse-tab" className="whitespace-nowrap shrink-0">
                Materiały
                {equipmentOrdersByCategory.warehouse > 0 && (
                  <span className="ml-1 bg-[#E8B76A] text-[#1E293B] text-xs rounded-full px-1.5 py-0.5 font-bold">
                    {equipmentOrdersByCategory.warehouse}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="clothing" data-testid="clothing-tab" className="whitespace-nowrap shrink-0">Ubrania</TabsTrigger>
              <TabsTrigger value="bhp" data-testid="bhp-tab" className="whitespace-nowrap shrink-0">BHP</TabsTrigger>
              <TabsTrigger value="tools" data-testid="tools-tab" className="whitespace-nowrap shrink-0">Narzedzia</TabsTrigger>
            </TabsList>
          </div>

          {/* Sites Tab */}
          <TabsContent value="sites" className="space-y-4 bg-[#1E293B]">
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
          <TabsContent value="foremen" className="space-y-4 bg-[#1E293B]">
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
          <TabsContent value="requests" className="space-y-4 bg-[#1E293B]">
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
          <TabsContent value="equipment" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="electronics" title="Elektronarzedzia" />
            </Suspense>
          </TabsContent>

          <TabsContent value="accessories" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="accessories" title="Akcesoria" />
            </Suspense>
          </TabsContent>

          <TabsContent value="formwork" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <EquipmentAdmin category="formwork" title="Szalunki" />
            </Suspense>
          </TabsContent>

          <TabsContent value="warehouse" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <WarehouseAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="clothing" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <ClothingAdmin />
            </Suspense>
          </TabsContent>

          <TabsContent value="bhp" className="space-y-4 bg-[#1E293B]">
            <Suspense fallback={<TabSpinner />}>
              <BhpAdmin />
            </Suspense>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4 bg-[#1E293B]">
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
        </Tabs>
      </div>
    </div>
  );
};
