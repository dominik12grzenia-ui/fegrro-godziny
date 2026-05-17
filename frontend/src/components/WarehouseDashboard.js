import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../context/AuthContext';
import { prefetch } from '../context/apiCache';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Warehouse, LogOut, Wrench, Shirt, ShieldCheck, Box } from 'lucide-react';
import { toast } from 'sonner';
import PushNotificationButton from './PushNotificationButton';
import { WarehouseConfirmProvider } from '../context/WarehouseConfirmContext';

// Reuse existing admin sub-components — they automatically work for warehouse
// role because backend authorizes the relevant mutation endpoints for both.
const EquipmentAdmin = lazy(() => import('./EquipmentAdmin').then((m) => ({ default: m.EquipmentAdmin })));
const ClothingAdmin = lazy(() => import('./ClothingAdmin').then((m) => ({ default: m.ClothingAdmin })));
const BhpAdmin = lazy(() => import('./BhpAdmin').then((m) => ({ default: m.BhpAdmin })));
const WarehouseAdmin = lazy(() => import('./WarehouseAdmin').then((m) => ({ default: m.WarehouseAdmin })));

const TabSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-pulse text-[#94A3B8] text-sm">Wczytywanie...</div>
  </div>
);

export default function WarehouseDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('equipment');
  const [pendingCounts, setPendingCounts] = useState({
    electronics: 0, accessories: 0, formwork: 0, warehouse: 0, clothing: 0,
  });
  const userName = localStorage.getItem('user_name') || 'Magazynier';

  useEffect(() => {
    const role = localStorage.getItem('user_role');
    const token = localStorage.getItem('token');
    if (!token || role !== 'warehouse') {
      navigate('/magazynier', { replace: true });
      return;
    }
    // Warm the cache so tab clicks are instant
    const t = setTimeout(() => {
      prefetch('/equipment?category=electronics');
      prefetch('/equipment?category=accessories');
      prefetch('/equipment?category=formwork');
      prefetch('/equipment/assignments/all');
      prefetch('/foremen');
      prefetch('/warehouse/orders');
      prefetch('/warehouse/materials');
      prefetch('/clothing/orders');
      prefetch('/bhp/items');
    }, 100);
    return () => clearTimeout(t);
  }, [navigate]);

  useEffect(() => {
    // Load badges
    (async () => {
      try {
        const [eqPending, eqPartial, wh, cl] = await Promise.all([
          api.get('/equipment/orders?status=pending').catch(() => ({ data: [] })),
          api.get('/equipment/orders?status=partial').catch(() => ({ data: [] })),
          api.get('/warehouse/orders').catch(() => ({ data: [] })),
          api.get('/clothing/orders').catch(() => ({ data: [] })),
        ]);
        const cat = { electronics: 0, accessories: 0, formwork: 0 };
        [...(eqPending.data || []), ...(eqPartial.data || [])].forEach((o) => {
          const c = o.category || 'electronics';
          if (cat[c] !== undefined) cat[c] += 1;
        });
        const whCount = (wh.data || []).filter((o) => o.status === 'pending' || o.status === 'partial').length;
        const clCount = (cl.data || []).filter((o) => o.status !== 'issued').length;
        setPendingCounts({ ...cat, warehouse: whCount, clothing: clCount });
      } catch (_e) { /* ignore */ }
    })();
  }, [tab]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_role');
    navigate('/magazynier', { replace: true });
  };

  const Badge = ({ n }) => n > 0 ? (
    <span className="ml-1 bg-[#D4AF37] text-[#131C2F] text-xs rounded-full px-1.5 py-0.5 font-bold">{n}</span>
  ) : null;

  return (
    <WarehouseConfirmProvider>
      <div className="min-h-screen bg-[#0B1120]">
        {/* Header */}
        <div className="bg-[#131C2F] border-b border-[#2A3B59] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Warehouse className="h-6 w-6 text-[#D4AF37]" />
            <div>
              <p className="text-[#D4AF37] font-bold text-sm sm:text-base">FeGrro - Magazyn</p>
              <p className="text-[#94A3B8] text-xs">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PushNotificationButton compact />
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-[#CBD5E1] hover:bg-[#2A3B59]"
              data-testid="warehouse-logout-btn"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Banner */}
        <div className="bg-[#7C5C00]/20 border-b border-[#D4AF37]/40 px-4 py-2 text-center">
          <p className="text-[#D4AF37] text-xs">
            Tryb magazyniera: każde wydanie sprzętu / materiału / odzieży wymaga potwierdzenia.
          </p>
        </div>

        {/* Tabs */}
        <div className="p-3 sm:p-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-[#131C2F] flex flex-wrap h-auto justify-start gap-1">
              <TabsTrigger value="equipment" data-testid="wh-equipment-tab" className="whitespace-nowrap">
                <Wrench className="h-3.5 w-3.5 mr-1" /> Elektronarzędzia
                <Badge n={pendingCounts.electronics} />
              </TabsTrigger>
              <TabsTrigger value="accessories" data-testid="wh-accessories-tab" className="whitespace-nowrap">
                Akcesoria <Badge n={pendingCounts.accessories} />
              </TabsTrigger>
              <TabsTrigger value="formwork" data-testid="wh-formwork-tab" className="whitespace-nowrap">
                Szalunki <Badge n={pendingCounts.formwork} />
              </TabsTrigger>
              <TabsTrigger value="materials" data-testid="wh-materials-tab" className="whitespace-nowrap">
                <Box className="h-3.5 w-3.5 mr-1" /> Materiały <Badge n={pendingCounts.warehouse} />
              </TabsTrigger>
              <TabsTrigger value="clothing" data-testid="wh-clothing-tab" className="whitespace-nowrap">
                <Shirt className="h-3.5 w-3.5 mr-1" /> Odzież <Badge n={pendingCounts.clothing} />
              </TabsTrigger>
              <TabsTrigger value="bhp" data-testid="wh-bhp-tab" className="whitespace-nowrap">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> BHP
              </TabsTrigger>
            </TabsList>

            <TabsContent value="equipment" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <EquipmentAdmin category="electronics" title="Elektronarzędzia" />
              </Suspense>
            </TabsContent>
            <TabsContent value="accessories" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <EquipmentAdmin category="accessories" title="Akcesoria" />
              </Suspense>
            </TabsContent>
            <TabsContent value="formwork" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <EquipmentAdmin category="formwork" title="Szalunki" />
              </Suspense>
            </TabsContent>
            <TabsContent value="materials" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <WarehouseAdmin />
              </Suspense>
            </TabsContent>
            <TabsContent value="clothing" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <ClothingAdmin />
              </Suspense>
            </TabsContent>
            <TabsContent value="bhp" className="mt-3">
              <Suspense fallback={<TabSpinner />}>
                <BhpAdmin />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </WarehouseConfirmProvider>
  );
}
