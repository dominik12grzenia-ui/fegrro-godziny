import React from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export const ForemenTab = ({
  foremen,
  sites,
  foremanSiteSelections,
  setForemanSiteSelections,
  fetchData,
  impersonateForeman,
}) => {
  return (
    <Card className="bg-[#19243C] border-[#2A3B59]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#CBD5E1]">Brygadziści</CardTitle>
        <Button
          onClick={async () => {
            const name = window.prompt('Imię i nazwisko nowego brygadzisty:');
            if (!name || !name.trim()) return;
            const pwd = window.prompt(`Hasło dla ${name.trim()} (min. 4 znaki):`);
            if (!pwd || pwd.length < 4) { toast.error('Hasło za krotkie'); return; }
            try {
              await api.post('/foremen', { full_name: name.trim(), password: pwd });
              toast.success(`Brygadzista ${name.trim()} dodany`);
              fetchData();
            } catch (err) {
              toast.error(err.response?.data?.detail || 'Błąd');
            }
          }}
          className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
          data-testid="add-foreman-btn"
        >
          + Dodaj brygadziste
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {foremen.map((foreman) => {
            const currentSiteIds = foremanSiteSelections[foreman.id] ?? foreman.assigned_sites ?? [];
            const isPending = foreman.status === 'pending';
            const hasPassword = foreman.has_password !== false;

            return (
              <div
                key={foreman.id}
                className={`p-4 rounded-lg border ${isPending ? 'border-[#DC4A3A]/50 bg-[#131C2F]' : 'border-[#2A3B59] bg-[#131C2F]'}`}
                data-testid={`foreman-${foreman.id}`}
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <span className="text-[#CBD5E1] font-semibold text-lg">{foreman.full_name}</span>
                    {isPending && (
                      <span className="ml-2 text-xs bg-[#DC4A3A]/20 text-[#DC4A3A] px-2 py-0.5 rounded font-semibold">NOWY</span>
                    )}
                    {!isPending && (
                      <span className="ml-2 text-xs bg-[#4F6343]/20 text-[#5F7552] px-2 py-0.5 rounded font-semibold">Aktywny</span>
                    )}
                    {!hasPassword && (
                      <span className="ml-2 text-xs bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded font-semibold">BRAK HASLA</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const pwd = window.prompt(`${hasPassword ? 'Zmien' : 'Ustaw'} hasło dla ${foreman.full_name} (min. 4 znaki):`);
                      if (!pwd || pwd.length < 4) return;
                      try {
                        await api.post(`/foremen/${foreman.id}/password`, { password: pwd });
                        toast.success('Hasło zaktualizowane');
                        fetchData();
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Błąd');
                      }
                    }}
                    className={hasPassword ? 'bg-[#2A3B59] hover:bg-[#2A3B59] text-[#CBD5E1] text-xs h-8' : 'bg-[#D4AF37] hover:bg-[#B8941F] text-[#131C2F] text-xs h-8 font-bold'}
                    data-testid={`set-foreman-password-${foreman.id}`}
                  >
                    {hasPassword ? 'Zmien hasło' : 'Ustaw hasło'}
                  </Button>
                </div>
                <div className="mb-3">
                  <p className="text-xs text-[#94A3B8] mb-2">Przypisane budowy:</p>
                  <div className="flex flex-wrap gap-2">
                    {sites.filter((s) => s.excel_column).map((site) => {
                      const isSelected = currentSiteIds.includes(site.id);
                      return (
                        <button
                          key={site.id}
                          onClick={() => {
                            const updated = isSelected
                              ? currentSiteIds.filter((id) => id !== site.id)
                              : [...currentSiteIds, site.id];
                            setForemanSiteSelections((prev) => ({ ...prev, [foreman.id]: updated }));
                          }}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-[#4F6343] text-white'
                              : 'bg-[#2A3B59] text-[#94A3B8] hover:bg-[#3D4F63]'
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
                    className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
                    data-testid={`save-foreman-${foreman.id}`}
                  >
                    Zapisz przypisanie
                  </Button>
                  <Button
                    onClick={async () => {
                      const result = await impersonateForeman(foreman.id);
                      if (result.success) {
                        toast.success(`Wcielony jako ${foreman.full_name}`);
                        window.location.href = '/worker/dashboard';
                      } else {
                        toast.error(result.error || 'Błąd');
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="border-[#4F6343] text-[#5F7552] hover:bg-[#4F6343] hover:text-white"
                    data-testid={`impersonate-foreman-${foreman.id}`}
                  >
                    Wejdz jako
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
                    className="border-[#6B4444] text-[#DC4A3A] hover:bg-[#6B4444] hover:text-white"
                    data-testid={`delete-foreman-${foreman.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Usuń
                  </Button>
                </div>
              </div>
            );
          })}
          {foremen.length === 0 && (
            <div className="text-center p-8 text-[#94A3B8]">Brak zarejestrowanych brygadzistow</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ForemenTab;
