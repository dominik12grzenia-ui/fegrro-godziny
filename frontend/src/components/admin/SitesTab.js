import React from 'react';
import { api } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SitesMap } from '../SitesMap';

const CAT_LABELS = { budowa: 'Budowa', sklep: 'Sklep', magazyn: 'Magazyn', inne: 'Inne' };
const CAT_COLORS = {
  budowa: 'bg-[#4F6343] text-white',
  sklep: 'bg-[#92400E] text-[#FED7AA]',
  magazyn: 'bg-[#1E40AF] text-[#BFDBFE]',
  inne: 'bg-[#2A3B59] text-[#CBD5E1]',
};

export const SitesTab = ({ sites, employees, assignments, geocoding, setGeocoding, fetchData }) => {
  const manualSites = sites.filter((s) => !s.excel_column);

  return (
    <div className="space-y-4">
      {/* Map */}
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#4F6343]" />
            Mapa lokalizacji
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] rounded-b-lg overflow-hidden" data-testid="sites-map">
            <SitesMap sites={manualSites} employees={employees} assignments={assignments} />
          </div>
        </CardContent>
      </Card>

      {/* Add Location Form */}
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#4F6343]" />
            Dodaj nowa lokalizacje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="text"
              id="new-site-name"
              placeholder="Nazwa (np. Budowa Krakow, Sklep Castorama)"
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] text-sm rounded px-3 py-2 placeholder:text-[#64748B] md:col-span-2"
              data-testid="new-site-name"
            />
            <select
              id="new-site-category"
              defaultValue="sklep"
              className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] text-sm rounded px-3 py-2"
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
                  toast.error(err.response?.data?.detail || 'Błąd');
                }
              }}
              className="bg-[#4F6343] hover:bg-[#3F5235] text-white"
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
      <Card className="bg-[#19243C] border-[#2A3B59]">
        <CardHeader>
          <CardTitle className="text-[#CBD5E1]">Lokalizacje</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {manualSites.map((site) => {
              const cat = site.category || 'budowa';
              const catLabel = CAT_LABELS[cat] || cat;
              const catColor = CAT_COLORS[cat] || CAT_COLORS.inne;
              return (
                <Card key={site.id} className="bg-[#131C2F] border-[#2A3B59]" data-testid={`site-card-${site.id}`}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-base text-[#CBD5E1] flex-1">{site.name}</h3>
                      <select
                        value={cat}
                        onChange={async (e) => {
                          try {
                            await api.put(`/sites/${site.id}`, { category: e.target.value });
                            toast.success('Kategoria zaktualizowana');
                            fetchData();
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Błąd');
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold border-0 cursor-pointer ${catColor}`}
                        data-testid={`site-category-select-${site.id}`}
                      >
                        <option value="budowa">Budowa</option>
                        <option value="sklep">Sklep</option>
                        <option value="magazyn">Magazyn</option>
                        <option value="inne">Inne</option>
                      </select>
                    </div>
                    {site.location_lat && site.location_lng ? (
                      <p className="text-xs text-[#4F6343]">
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
                            className="flex-1 bg-[#0B1120] border border-[#2A3B59] text-[#CBD5E1] text-xs rounded px-2 py-1.5 placeholder:text-[#64748B]"
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
                                  address: res.data.formatted_address,
                                });
                                toast.success(`Lokalizacja ustawiona: ${res.data.formatted_address}`);
                                fetchData();
                              } catch (err) {
                                toast.error(err.response?.data?.detail || 'Błąd geokodowania');
                              } finally {
                                setGeocoding(null);
                              }
                            }}
                            size="sm"
                            disabled={geocoding === site.id}
                            className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs"
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
                    <div className="flex items-center justify-between pt-2 border-t border-[#2A3B59]">
                      <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={site.visible_to_foremen !== false}
                          onChange={async (e) => {
                            try {
                              await api.put(`/sites/${site.id}`, { visible_to_foremen: e.target.checked });
                              toast.success(e.target.checked ? 'Widoczna dla brygadzistow' : 'Ukryta');
                              fetchData();
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Błąd');
                            }
                          }}
                          data-testid={`visible-toggle-${site.id}`}
                        />
                        <span>Widoczna dla brygadzistow</span>
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm(`Usunac na stałe "${site.name}"? Tej operacji nie można cofnac.`)) return;
                          try {
                            await api.delete(`/sites/${site.id}?permanent=true`);
                            toast.success('Usunieto');
                            fetchData();
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Błąd');
                          }
                        }}
                        className="text-[#DC4A3A] hover:bg-[#9B2C2C]/30 text-xs h-7"
                        data-testid={`delete-site-${site.id}`}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Usuń
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {manualSites.length === 0 && (
              <div className="col-span-full text-center p-8 text-[#94A3B8]">
                Brak lokalizacji - dodaj pierwsza powyzej.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SitesTab;
