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
    <Card className="bg-[#2A384C] border-[#334155]">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#CBD5E1]">Brygadzisci</CardTitle>
        <Button
          onClick={async () => {
            const name = window.prompt('Imie i nazwisko nowego brygadzisty:');
            if (!name || !name.trim()) return;
            const pwd = window.prompt(`Haslo dla ${name.trim()} (min. 4 znaki):`);
            if (!pwd || pwd.length < 4) { toast.error('Haslo za krotkie'); return; }
            try {
              await api.post('/foremen', { full_name: name.trim(), password: pwd });
              toast.success(`Brygadzista ${name.trim()} dodany`);
              fetchData();
            } catch (err) {
              toast.error(err.response?.data?.detail || 'Blad');
            }
          }}
          className="bg-[#5F7151] hover:bg-[#4A5A41] text-white"
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
                className={`p-4 rounded-lg border ${isPending ? 'border-[#E8836A]/50 bg-[#1E293B]' : 'border-[#334155] bg-[#1E293B]'}`}
                data-testid={`foreman-${foreman.id}`}
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <span className="text-[#CBD5E1] font-semibold text-lg">{foreman.full_name}</span>
                    {isPending && (
                      <span className="ml-2 text-xs bg-[#E8836A]/20 text-[#E8836A] px-2 py-0.5 rounded font-semibold">NOWY</span>
                    )}
                    {!isPending && (
                      <span className="ml-2 text-xs bg-[#5F7151]/20 text-[#6B8E4E] px-2 py-0.5 rounded font-semibold">Aktywny</span>
                    )}
                    {!hasPassword && (
                      <span className="ml-2 text-xs bg-[#E8B76A]/20 text-[#E8B76A] px-2 py-0.5 rounded font-semibold">BRAK HASLA</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const pwd = window.prompt(`${hasPassword ? 'Zmien' : 'Ustaw'} haslo dla ${foreman.full_name} (min. 4 znaki):`);
                      if (!pwd || pwd.length < 4) return;
                      try {
                        await api.post(`/foremen/${foreman.id}/password`, { password: pwd });
                        toast.success('Haslo zaktualizowane');
                        fetchData();
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Blad');
                      }
                    }}
                    className={hasPassword ? 'bg-[#334155] hover:bg-[#475569] text-[#CBD5E1] text-xs h-8' : 'bg-[#E8B76A] hover:bg-[#C79B58] text-[#1E293B] text-xs h-8 font-bold'}
                    data-testid={`set-foreman-password-${foreman.id}`}
                  >
                    {hasPassword ? 'Zmien haslo' : 'Ustaw haslo'}
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
                      const result = await impersonateForeman(foreman.id);
                      if (result.success) {
                        toast.success(`Wcielony jako ${foreman.full_name}`);
                        window.location.href = '/worker/dashboard';
                      } else {
                        toast.error(result.error || 'Blad');
                      }
                    }}
                    size="sm"
                    variant="outline"
                    className="border-[#5F7151] text-[#6B8E4E] hover:bg-[#5F7151] hover:text-white"
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
            <div className="text-center p-8 text-[#94A3B8]">Brak zarejestrowanych brygadzistow</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ForemenTab;
