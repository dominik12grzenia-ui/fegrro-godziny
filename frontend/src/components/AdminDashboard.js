import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { 
  Users, Building2, Clock, FileText, LogOut, 
  CheckCircle, XCircle, MapPin, Phone, Calendar,
  RefreshCw, Download, Bell, AlertTriangle, Link, Copy, ExternalLink, Trash2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { SitesMap } from './SitesMap';
import { EquipmentAdmin } from './EquipmentAdmin';

export const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sites');
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalSites: 0,
    pendingRequests: 0,
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

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const [employeesRes, sitesRes, requestsRes, foremenRes, notificationsRes, syncLogsRes, assignmentsRes, absencesRes] = await Promise.all([
        api.get(`/employees?month=${currentMonth}&year=${currentYear}`),
        api.get('/sites'),
        api.get('/requests?status=pending'),
        api.get('/foremen'),
        api.get('/notifications'),
        api.get('/sync/logs'),
        api.get('/assignments'),
        api.get('/absences?status=pending')
      ]);
      
      setEmployees(employeesRes.data);
      setSites(sitesRes.data);
      setRequests(requestsRes.data);
      setForemen(foremenRes.data);
      setNotifications(notificationsRes.data);
      setAbsenceRequests(absencesRes.data);
      setSyncLogs(syncLogsRes.data);
      setAssignments(assignmentsRes.data);
      
      setStats({
        totalEmployees: employeesRes.data.length,
        totalSites: sitesRes.data.length,
        pendingRequests: requestsRes.data.length,
        todayHours: 0
      });
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Nie udało się pobrać danych');
    } finally {
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  <p className="text-sm text-[#94A3B8]">Lokalizacje</p>
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
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-5">
              <TabsTrigger value="sites" data-testid="sites-tab" className="whitespace-nowrap">Lokalizacje</TabsTrigger>
              <TabsTrigger value="foremen" data-testid="foremen-tab" className="whitespace-nowrap">
                Brygadzisci
                {foremen.filter(f => f.status === 'pending').length > 0 && (
                  <span className="ml-1 bg-[#E8836A] text-white text-xs rounded-full px-1.5 py-0.5">
                    {foremen.filter(f => f.status === 'pending').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="requests-tab" className="whitespace-nowrap">
                Prosby
                {(stats.pendingRequests + notifications.length + absenceRequests.length) > 0 && (
                  <span className="ml-1 bg-[#5F7151] text-white text-xs rounded-full px-1.5 py-0.5">
                    {stats.pendingRequests + notifications.length + absenceRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="equipment" data-testid="equipment-tab" className="whitespace-nowrap">Sprzet</TabsTrigger>
              <TabsTrigger value="tools" data-testid="tools-tab" className="whitespace-nowrap">Narzedzia</TabsTrigger>
            </TabsList>
          </div>

          {/* Sites Tab */}
          <TabsContent value="sites" className="space-y-4 bg-[#1E293B]">
            {/* Map */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader className="pb-2">
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#5F7151]" />
                  Mapa lokalizacji
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] rounded-b-lg overflow-hidden" data-testid="sites-map">
                  <SitesMap sites={sites} employees={employees} assignments={assignments} />
                </div>
              </CardContent>
            </Card>

            {/* Add Location Form */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#5F7151]" />
                  Dodaj nowa lokalizacje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    type="text"
                    id="new-site-name"
                    placeholder="Nazwa (np. Budowa Krakow, Sklep Castorama)"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-sm rounded px-3 py-2 placeholder:text-[#64748B] md:col-span-2"
                    data-testid="new-site-name"
                  />
                  <select
                    id="new-site-category"
                    defaultValue="budowa"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-sm rounded px-3 py-2"
                    data-testid="new-site-category"
                  >
                    <option value="budowa">Budowa</option>
                    <option value="sklep">Sklep</option>
                    <option value="magazyn">Magazyn</option>
                    <option value="inne">Inne</option>
                  </select>
                  <Button
                    onClick={async () => {
                      const name = document.getElementById('new-site-name').value.trim();
                      const category = document.getElementById('new-site-category').value;
                      if (!name) { toast.error('Podaj nazwe'); return; }
                      try {
                        await api.post('/sites', { name, category });
                        toast.success(`Dodano: ${name}`);
                        document.getElementById('new-site-name').value = '';
                        fetchData();
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad');
                      }
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                    data-testid="add-site-btn"
                  >
                    Dodaj
                  </Button>
                </div>
                <p className="text-xs text-[#94A3B8] mt-2">
                  Po dodaniu wpisz adres ponizej karty by ustawic lokalizacje na mapie.
                </p>
              </CardContent>
            </Card>

            {/* Sites List */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1]">Lokalizacje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sites.map((site) => {
                    const cat = site.category || 'budowa';
                    const catLabel = { budowa: 'Budowa', sklep: 'Sklep', magazyn: 'Magazyn', inne: 'Inne' }[cat] || cat;
                    const catColor = {
                      budowa: 'bg-[#5F7151] text-white',
                      sklep: 'bg-[#92400E] text-[#FED7AA]',
                      magazyn: 'bg-[#1E40AF] text-[#BFDBFE]',
                      inne: 'bg-[#475569] text-[#CBD5E1]',
                    }[cat] || 'bg-[#475569] text-[#CBD5E1]';
                    return (
                    <Card key={site.id} className="bg-[#1E293B] border-[#334155]" data-testid={`site-card-${site.id}`}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-base text-[#CBD5E1] flex-1">{site.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${catColor}`} data-testid={`site-category-${site.id}`}>
                            {catLabel}
                          </span>
                        </div>
                        {site.location_lat && site.location_lng ? (
                          <p className="text-xs text-[#5F7151]">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {site.location_lat.toFixed(4)}, {site.location_lng.toFixed(4)}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-[#94A3B8]">Brak lokalizacji</p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Wpisz adres..."
                                className="flex-1 bg-[#0F172A] border border-[#334155] text-[#CBD5E1] text-xs rounded px-2 py-1.5 placeholder:text-[#64748B]"
                                data-testid={`address-input-${site.id}`}
                                id={`addr-${site.id}`}
                              />
                              <Button
                                onClick={async () => {
                                  const addr = document.getElementById(`addr-${site.id}`).value;
                                  if (!addr) { toast.error('Wpisz adres'); return; }
                                  setGeocoding(site.id);
                                  try {
                                    const res = await api.get(`/geocode?address=${encodeURIComponent(addr)}`);
                                    await api.put(`/sites/${site.id}`, {
                                      location_lat: res.data.lat,
                                      location_lng: res.data.lng,
                                      google_maps_url: res.data.formatted_address,
                                      address: res.data.formatted_address
                                    });
                                    toast.success(`Lokalizacja ustawiona: ${res.data.formatted_address}`);
                                    fetchData();
                                  } catch (err) {
                                    toast.error(err.response?.data?.detail || 'Blad geokodowania');
                                  } finally {
                                    setGeocoding(null);
                                  }
                                }}
                                size="sm"
                                disabled={geocoding === site.id}
                                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white text-xs"
                                data-testid={`geocode-btn-${site.id}`}
                              >
                                {geocoding === site.id ? '...' : 'Ustaw'}
                              </Button>
                            </div>
                          </div>
                        )}
                        {site.google_maps_url && (
                          <p className="text-[10px] text-[#64748B] truncate">{site.google_maps_url}</p>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                  {sites.length === 0 && (
                    <div className="col-span-full text-center p-8 text-[#94A3B8]">
                      Brak lokalizacji - dodaj pierwsza powyzej.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Foremen Tab */}
          <TabsContent value="foremen" className="space-y-4 bg-[#1E293B]">
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1]">Brygadzisci</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {foremen.map((foreman) => {
                    const currentSiteIds = foremanSiteSelections[foreman.id] ?? foreman.assigned_sites ?? [];
                    const isPending = foreman.status === 'pending';

                    return (
                      <div key={foreman.id} className={`p-4 rounded-lg border ${isPending ? 'border-[#E8836A]/50 bg-[#1E293B]' : 'border-[#334155] bg-[#1E293B]'}`} data-testid={`foreman-${foreman.id}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="text-[#CBD5E1] font-semibold text-lg">{foreman.full_name}</span>
                            {isPending && (
                              <span className="ml-2 text-xs bg-[#E8836A]/20 text-[#E8836A] px-2 py-0.5 rounded font-semibold">NOWY</span>
                            )}
                            {!isPending && (
                              <span className="ml-2 text-xs bg-[#5F7151]/20 text-[#6B8E4E] px-2 py-0.5 rounded font-semibold">Aktywny</span>
                            )}
                          </div>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs text-[#94A3B8] mb-2">Przypisane budowy:</p>
                          <div className="flex flex-wrap gap-2">
                            {sites.map(site => {
                              const isSelected = currentSiteIds.includes(site.id);
                              return (
                                <button
                                  key={site.id}
                                  onClick={() => {
                                    const updated = isSelected
                                      ? currentSiteIds.filter(id => id !== site.id)
                                      : [...currentSiteIds, site.id];
                                    setForemanSiteSelections(prev => ({ ...prev, [foreman.id]: updated }));
                                  }}
                                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-[#5F7151] text-white'
                                      : 'bg-[#334155] text-[#94A3B8] hover:bg-[#3D4F63]'
                                  }`}
                                  data-testid={`foreman-site-${foreman.id}-${site.id}`}
                                >
                                  {site.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                          onClick={async () => {
                            const siteIds = foremanSiteSelections[foreman.id] ?? foreman.assigned_sites ?? [];
                            try {
                              await api.post(`/foremen/${foreman.id}/sites`, { site_ids: siteIds });
                              toast.success(`Budowy przypisane do ${foreman.full_name}`);
                              fetchData();
                            } catch (err) {
                              toast.error('Nie udalo sie przypisac budow');
                            }
                          }}
                          size="sm"
                          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                          data-testid={`save-foreman-${foreman.id}`}
                        >
                          Zapisz przypisanie
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!window.confirm(`Czy na pewno chcesz usunac brygadziste ${foreman.full_name}?`)) return;
                            try {
                              await api.delete(`/foremen/${foreman.id}`);
                              toast.success(`Brygadzista ${foreman.full_name} usuniety`);
                              fetchData();
                            } catch (err) {
                              toast.error('Nie udalo sie usunac brygadzisty');
                            }
                          }}
                          size="sm"
                          variant="outline"
                          className="border-[#6B4444] text-[#E8836A] hover:bg-[#6B4444] hover:text-white"
                          data-testid={`delete-foreman-${foreman.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Usun
                        </Button>
                        </div>
                      </div>
                    );
                  })}
                  {foremen.length === 0 && (
                    <div className="text-center p-8 text-[#94A3B8]">
                      Brak zarejestrowanych brygadzistow
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4 bg-[#1E293B]">
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1]">Prośby o uzupełnienie godzin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {requests.map((request) => {
                    const employee = employees.find(e => e.id === request.employee_id);
                    const site = sites.find(s => s.id === request.site_id);
                    
                    return (
                      <div key={request.id} className="border rounded-lg p-4 bg-[#2A384C] border-[#334155]">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Clock className="h-5 w-5 text-[#5F7151] shrink-0" />
                              <span className="font-semibold text-[#CBD5E1] truncate">{employee?.full_name || 'Nieznany pracownik'}</span>
                            </div>
                            <div className="text-sm text-[#94A3B8] space-y-1">
                              <p><strong className="text-[#CBD5E1]">Budowa:</strong> {site?.name || 'Nieznana'}</p>
                              <p><strong className="text-[#CBD5E1]">Data:</strong> {request.work_date}</p>
                              <p><strong className="text-[#CBD5E1]">Godziny:</strong> {request.hours_worked}h</p>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              onClick={() => handleApproveRequest(request.id)}
                              size="sm"
                              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                              data-testid={`approve-request-${request.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Zatwierdź
                            </Button>
                            <Button
                              onClick={() => handleRejectRequest(request.id)}
                              size="sm"
                              variant="outline"
                              className="border-red-600 text-red-600 hover:bg-red-900"
                              data-testid={`reject-request-${request.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Odrzuć
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {requests.length === 0 && (
                    <div className="text-center p-8 text-[#94A3B8]">
                      Brak oczekujacych prosb
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* >10h Notifications */}
            {notifications.length > 0 && (
              <Card className="bg-[#2A384C] border-[#334155]">
                <CardHeader>
                  <CardTitle className="text-[#E8836A] flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Godziny powyzej 10h — do akceptacji ({notifications.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {notifications.map(notif => (
                      <div key={notif.id} className="p-4 bg-[#1E293B] rounded-lg border border-[#E8836A]/30">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[#CBD5E1] font-semibold">{notif.employee_name}</p>
                            <p className="text-sm text-[#94A3B8]">
                              Data: <strong className="text-[#CBD5E1]">{notif.work_date}</strong> | 
                              Godziny: <strong className="text-[#E8836A]">{notif.hours_worked}h</strong>
                            </p>
                            <p className="text-xs text-[#64748B] mt-1">
                              Wpisal: {notif.created_by_name} | {new Date(notif.created_at).toLocaleString('pl-PL')}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={async () => {
                                try {
                                  await api.post(`/notifications/${notif.id}/approve`);
                                  toast.success('Zatwierdzono');
                                  fetchData();
                                } catch { toast.error('Blad'); }
                              }}
                              size="sm"
                              className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                              data-testid={`approve-notif-${notif.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={async () => {
                                try {
                                  await api.post(`/notifications/${notif.id}/reject`);
                                  toast.success('Odrzucono');
                                  fetchData();
                                } catch { toast.error('Blad'); }
                              }}
                              size="sm"
                              variant="outline"
                              className="border-red-600 text-red-600 hover:bg-red-900"
                              data-testid={`reject-notif-${notif.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Absence Requests */}
            {absenceRequests.length > 0 && (
              <Card className="bg-[#2A384C] border-[#334155]">
                <CardContent className="pt-4">
                  <h3 className="text-[#CBD5E1] font-bold mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-[#E8836A]" />
                    Nieobecnosci — do akceptacji ({absenceRequests.length})
                  </h3>
                  <div className="space-y-3">
                    {absenceRequests.map(absence => (
                      <div key={absence.id} className="p-4 bg-[#1E293B] rounded-lg border-2 border-[#7F2D2D]">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-[#CBD5E1] font-semibold text-base">{absence.employee_name || 'Pracownik'}</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await api.put(`/absences/${absence.id}/review`, { status: 'approved' });
                                    toast.success('Nieobecnosc zatwierdzona');
                                    setAbsenceRequests(prev => prev.filter(a => a.id !== absence.id));
                                  } catch { toast.error('Blad'); }
                                }}
                                className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                                data-testid={`approve-absence-${absence.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Zatwierdz
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await api.put(`/absences/${absence.id}/review`, { status: 'rejected' });
                                    toast.success('Nieobecnosc odrzucona');
                                    setAbsenceRequests(prev => prev.filter(a => a.id !== absence.id));
                                  } catch { toast.error('Blad'); }
                                }}
                                className="border-red-600 text-red-600 hover:bg-red-900"
                                data-testid={`reject-absence-${absence.id}`}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Odrzuc
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {absence.dates.map(d => (
                              <span key={d} className="px-2 py-1 rounded bg-[#7F2D2D]/40 border border-[#7F2D2D] text-[#FCA5A5] text-sm font-medium">
                                {d}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-[#64748B]">
                            Zgloszone: {absence.created_at ? new Date(absence.created_at).toLocaleString('pl-PL') : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-4 bg-[#1E293B]">
            <EquipmentAdmin />
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-4 bg-[#1E293B]">
            {/* OneDrive Excel Sync */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-[#5F7151]" />
                  Synchronizacja Excel (OneDrive)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#94A3B8] mb-4">
                  Pobierz liste pracownikow i budow z pliku "Wyplaty glowny.xlsx" na OneDrive.
                  Wybierz miesiac odpowiadajacy arkuszowi w Excelu.
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <select
                    id="sync-month"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getMonth() + 1}
                    data-testid="sync-month-select"
                  >
                    {[
                      'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
                      'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'
                    ].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select
                    id="sync-year"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getFullYear()}
                    data-testid="sync-year-select"
                  >
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={async () => {
                      setSyncing(true);
                      const month = document.getElementById('sync-month').value;
                      const year = document.getElementById('sync-year').value;
                      try {
                        await api.post(`/sync/excel?month=${month}&year=${year}`);
                        toast.success('Synchronizacja rozpoczeta');
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad synchronizacji');
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                    disabled={syncing}
                    data-testid="sync-excel-btn"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Synchronizacja...' : 'Pobierz z Excela'}
                  </Button>
                </div>

                {/* Sync logs */}
                {syncLogs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-[#94A3B8]">Ostatnie synchronizacje:</p>
                    {syncLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="flex items-center gap-2 text-xs p-2 bg-[#1E293B] rounded border border-[#334155]">
                        <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-[#5F7151]' : log.status === 'local_only' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <span className="text-[#94A3B8]">{log.type}</span>
                        <span className="text-[#CBD5E1] font-medium">{log.file_name || '-'}</span>
                        {log.new_employees > 0 && <span className="text-[#5F7151]">+{log.new_employees} nowych prac.</span>}
                        {log.new_sites > 0 && <span className="text-[#5F7151]">+{log.new_sites} nowych budow</span>}
                        {log.written > 0 && <span className="text-[#5F7151]">{log.written} komorek zapisanych</span>}
                        {log.skipped > 0 && <span className="text-yellow-400">{log.skipped} pominieto</span>}
                        {log.error && <span className="text-red-400 truncate max-w-[200px]">{log.error}</span>}
                        <span className="ml-auto text-[#64748B]">{new Date(log.synced_at).toLocaleString('pl-PL')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Write Hours to Excel */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#5F7151]" />
                  Zapisz godziny do Excela
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#94A3B8] mb-4">
                  Zapisz sumy godzin pracownikow (per budowa) do kolumn S-Z lub zaliczki do kolumny G w pliku Excel na OneDrive.
                </p>
                <div className="bg-[#92400E]/20 border border-[#F59E0B] rounded-lg p-3 mb-4 flex items-start gap-2" data-testid="excel-warning-banner">
                  <AlertTriangle className="h-5 w-5 text-[#F59E0B] shrink-0 mt-0.5" />
                  <p className="text-[#FCD34D] text-sm">
                    <strong>Zamknij plik Excel przed zapisem!</strong> Jesli plik "Wyplaty glowny.xlsx" jest otwarty na komputerze, zamknij go przed kliknieciem przycisku zapisu. W przeciwnym razie OneDrive zglosi konflikt.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <select
                    id="write-month"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getMonth() + 1}
                    data-testid="write-month-select"
                  >
                    {[
                      'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
                      'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'
                    ].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select
                    id="write-year"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getFullYear()}
                    data-testid="write-year-select"
                  >
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={async () => {
                      const month = document.getElementById('write-month').value;
                      const year = document.getElementById('write-year').value;
                      try {
                        const res = await api.post(`/sync/write-hours?month=${month}&year=${year}`);
                        toast.success(res.data.message);
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad zapisu do Excela');
                      }
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white w-full sm:w-auto"
                    data-testid="write-hours-btn"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Zapisz sumy do Excela
                  </Button>
                  <Button
                    onClick={async () => {
                      const month = document.getElementById('write-month').value;
                      const year = document.getElementById('write-year').value;
                      try {
                        const res = await api.post(`/advances/sync-excel?month=${month}&year=${year}`);
                        toast.success(res.data.message);
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad zapisu zaliczek do Excela');
                      }
                    }}
                    className="bg-[#E8836A] hover:bg-[#D06B52] text-white w-full sm:w-auto"
                    data-testid="write-advances-btn"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Zaliczki do Excela
                  </Button>
                  <Button
                    onClick={async () => {
                      const month = document.getElementById('write-month').value;
                      const year = document.getElementById('write-year').value;
                      try {
                        const res = await api.post(`/penalties/sync-excel?month=${month}&year=${year}`);
                        toast.success(res.data.message);
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad zapisu kar do Excela');
                      }
                    }}
                    className="bg-[#DC2626] hover:bg-[#B91C1C] text-white w-full sm:w-auto"
                    data-testid="write-penalties-btn"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Kary do Excela
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* PDF Generation */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <Download className="h-5 w-5 text-[#5F7151]" />
                  Raport PDF
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#94A3B8] mb-4">
                  Wygeneruj raport godzin za wybrany miesiac. PDF zostanie zapisany w folderze "Archiwizacja" na OneDrive.
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <select
                    id="pdf-month"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getMonth() + 1}
                    data-testid="pdf-month-select"
                  >
                    {[
                      'Styczen', 'Luty', 'Marzec', 'Kwiecien', 'Maj', 'Czerwiec',
                      'Lipiec', 'Sierpien', 'Wrzesien', 'Pazdziernik', 'Listopad', 'Grudzien'
                    ].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select
                    id="pdf-year"
                    className="bg-[#1E293B] border border-[#334155] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                    defaultValue={new Date().getFullYear()}
                    data-testid="pdf-year-select"
                  >
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={async () => {
                      setGeneratingPdf(true);
                      const month = document.getElementById('pdf-month').value;
                      const year = document.getElementById('pdf-year').value;
                      try {
                        await api.post(`/reports/pdf?month=${month}&year=${year}`);
                        toast.success('PDF generowany i wysylany na OneDrive');
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad generowania PDF');
                      } finally {
                        setGeneratingPdf(false);
                      }
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white w-full sm:w-auto"
                    disabled={generatingPdf}
                    data-testid="generate-pdf-btn"
                  >
                    {generatingPdf ? 'Generowanie...' : 'Generuj i wyslij na OneDrive'}
                  </Button>
                  <Button
                    onClick={async () => {
                      const month = document.getElementById('pdf-month').value;
                      const year = document.getElementById('pdf-year').value;
                      try {
                        const response = await api.get(`/reports/pdf/download?month=${month}&year=${year}`, {
                          responseType: 'blob'
                        });
                        const url = window.URL.createObjectURL(new Blob([response.data]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `Raport_${month}_${year}.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        toast.success('PDF pobrany');
                      } catch (err) {
                        toast.error('Blad pobierania PDF');
                      }
                    }}
                    variant="outline"
                    className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155] w-full sm:w-auto"
                    data-testid="download-pdf-btn"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Pobierz lokalnie
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Public Links for Employees */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <Link className="h-5 w-5 text-[#5F7151]" />
                  Linki publiczne dla pracownikow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#94A3B8] mb-4">
                  Wygeneruj stale linki do wgladu godzin. Wyslij link raz — pracownik ma dostep do swoich godzin na zawsze, z nawigacja po miesiacach.
                </p>
                <Button
                  onClick={async () => {
                    setGeneratingLinks(true);
                    try {
                      const res = await api.post('/employees/generate-all-links');
                      setPublicLinks(res.data);
                      toast.success(`Wygenerowano ${res.data.length} linkow`);
                    } catch (err) {
                      toast.error('Blad generowania linkow');
                    } finally {
                      setGeneratingLinks(false);
                    }
                  }}
                  className="bg-[#5F7151] hover:bg-[#4A5A41] text-white mb-4"
                  disabled={generatingLinks}
                  data-testid="generate-links-btn"
                >
                  <Link className="h-4 w-4 mr-2" />
                  {generatingLinks ? 'Generowanie...' : 'Generuj linki dla wszystkich'}
                </Button>

                {publicLinks.length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    <div className="flex justify-end mb-2">
                      <Button
                        onClick={() => {
                          const baseUrl = window.location.origin;
                          const text = publicLinks.map(p => 
                            `${p.full_name}${p.phone_number ? ' (' + p.phone_number + ')' : ''}: ${baseUrl}/hours/${p.token}`
                          ).join('\n');
                          navigator.clipboard.writeText(text);
                          toast.success('Skopiowano wszystkie linki');
                        }}
                        variant="outline"
                        size="sm"
                        className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                        data-testid="copy-all-links-btn"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Kopiuj wszystkie
                      </Button>
                    </div>
                    {publicLinks.map((link) => {
                      const url = `${window.location.origin}/hours/${link.token}`;
                      return (
                        <div key={link.employee_id} className="flex items-center justify-between bg-[#1E293B] rounded-lg px-3 py-2 border border-[#334155]">
                          <div className="flex-1 min-w-0">
                            <span className="text-[#CBD5E1] text-sm font-medium block truncate">{link.full_name}</span>
                            {link.phone_number && (
                              <span className="text-[#64748B] text-xs">{link.phone_number}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              onClick={() => {
                                navigator.clipboard.writeText(url);
                                toast.success(`Skopiowano link: ${link.full_name}`);
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-[#94A3B8] hover:text-white hover:bg-[#334155] h-8 w-8 p-0"
                              data-testid={`copy-link-${link.employee_id}`}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              onClick={() => window.open(url, '_blank')}
                              variant="ghost"
                              size="sm"
                              className="text-[#94A3B8] hover:text-white hover:bg-[#334155] h-8 w-8 p-0"
                              data-testid={`open-link-${link.employee_id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Automatic Cron Status */}
            <Card className="bg-[#2A384C] border-[#334155]">
              <CardHeader>
                <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#5F7151]" />
                  Automatyczny zapis (Cron)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#94A3B8] mb-4">
                  Harmonogram automatyczny:<br/>
                  - Codzienny sync pracownikow i budow z Excela o 06:00<br/>
                  - Zapis godzin do Excela 2. dnia kazdego miesiaca o 02:00
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 flex-wrap">
                  <Button
                    onClick={async () => {
                      try {
                        const res = await api.get('/cron/status');
                        const d = res.data;
                        if (d.active && d.jobs) {
                          const msgs = d.jobs.map(j => 
                            `${j.description}: ${new Date(j.next_run).toLocaleString('pl-PL')}`
                          ).join('\n');
                          toast.success(msgs, { duration: 6000 });
                        } else {
                          toast.error('Cron nie jest aktywny');
                        }
                      } catch (err) {
                        toast.error('Nie mozna sprawdzic statusu crona');
                      }
                    }}
                    variant="outline"
                    className="border-[#334155] text-[#CBD5E1] hover:bg-[#334155]"
                    data-testid="cron-status-btn"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Sprawdz status
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const res = await api.post('/cron/trigger');
                        toast.success(res.data.message);
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad uruchomienia crona');
                      }
                    }}
                    className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
                    data-testid="cron-trigger-btn"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Wymus zapis godzin
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const month = document.getElementById('write-month').value;
                        const year = document.getElementById('write-year').value;
                        await api.post(`/sync/excel?month=${month}&year=${year}`);
                        toast.success('Sync pracownikow i budow uruchomiony');
                        setTimeout(() => fetchData(), 5000);
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad synca');
                      }
                    }}
                    variant="outline"
                    className="border-[#5F7151] text-[#5F7151] hover:bg-[#5F7151] hover:text-white"
                    data-testid="cron-sync-btn"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Wymus sync pracownikow
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
