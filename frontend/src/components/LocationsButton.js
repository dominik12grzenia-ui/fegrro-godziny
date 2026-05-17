import React, { useState, useEffect } from 'react';
import { api } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { MapPin, Navigation, Copy, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';

const CATEGORY_LABEL = {
  budowa: 'Budowa',
  sklep: 'Sklep',
  magazyn: 'Magazyn',
  inne: 'Inne',
};

const CATEGORY_COLOR = {
  budowa: 'bg-[#4F6343] text-white',
  sklep: 'bg-[#92400E] text-[#FED7AA]',
  magazyn: 'bg-[#1E40AF] text-[#BFDBFE]',
  inne: 'bg-[#2A3B59] text-[#CBD5E1]',
};

const buildMapsLink = (site) => {
  if (site.location_lat && site.location_lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${site.location_lat},${site.location_lng}`;
  }
  if (site.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.name)}`;
};

export const LocationsButton = () => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get('/sites?active_only=true')
      .then((r) => setSites(r.data || []))
      .catch(() => toast.error(t('loc.fetch_error')))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = sites.filter((s) => {
    // Lokalizacje button shows only manual sites (no excel_column) — Excel-synced budowy live in hours table
    if (s.excel_column) return false;
    if (s.visible_to_foremen === false) return false;
    const matchText = !filter || s.name.toLowerCase().includes(filter.toLowerCase());
    const matchCat = categoryFilter === 'all' || (s.category || 'budowa') === categoryFilter;
    return matchText && matchCat;
  });

  const handleNavigate = (site) => {
    const url = buildMapsLink(site);
    window.open(url, '_blank', 'noopener');
  };

  const handleCopy = (site) => {
    const url = buildMapsLink(site);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast.success('Link skopiowany - mozesz go wyslac'),
        () => fallbackCopy(url)
      );
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast.success('Link skopiowany');
    } catch {
      toast.error('Nie udalo sie skopiowac');
    }
    document.body.removeChild(ta);
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white"
        data-testid="locations-btn"
      >
        <MapPin className="h-4 w-4 mr-1" /> Lokalizacja
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#19243C] border-[#2A3B59] w-full max-w-2xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#CBD5E1] flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#4F6343]" /> Lokalizacje
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} data-testid="close-locations-modal">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-3">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px] relative">
                  <Search className="h-4 w-4 absolute left-2 top-2.5 text-[#64748B]" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Szukaj lokalizacji..."
                    className="bg-[#131C2F] border-[#2A3B59] text-[#CBD5E1] pl-8"
                    data-testid="locations-search"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-[#131C2F] border border-[#2A3B59] text-[#CBD5E1] rounded px-3 py-2 text-sm"
                  data-testid="locations-category-filter"
                >
                  <option value="all">{t('common.all')}</option>
                  <option value="budowa">{t('loc.site')}</option>
                  <option value="sklep">{t('loc.shop')}</option>
                  <option value="magazyn">{t('loc.warehouse_label')}</option>
                  <option value="inne">Inne</option>
                </select>
              </div>

              {loading && <p className="text-[#94A3B8] text-center py-4">{t('common.loading_dots')}</p>}

              {!loading && filtered.length === 0 && (
                <p className="text-[#94A3B8] text-center py-6">{t('loc.no_matching')}</p>
              )}

              <div className="space-y-2" data-testid="locations-list">
                {filtered.map((site) => {
                  const cat = site.category || 'budowa';
                  return (
                    <div
                      key={site.id}
                      className="flex items-start justify-between gap-2 p-3 bg-[#131C2F] rounded border border-[#2A3B59]"
                      data-testid={`location-item-${site.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#CBD5E1] text-sm">{site.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${CATEGORY_COLOR[cat]}`}>
                            {CATEGORY_LABEL[cat] || cat}
                          </span>
                        </div>
                        {site.address && (
                          <p className="text-xs text-[#94A3B8] mt-1 truncate">{site.address}</p>
                        )}
                        {!site.address && site.google_maps_url && (
                          <p className="text-xs text-[#94A3B8] mt-1 truncate">{site.google_maps_url}</p>
                        )}
                        {!site.location_lat && !site.address && (
                          <p className="text-xs text-[#DC4A3A] mt-1">{t('common.no_location_set')}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleNavigate(site)}
                          className="bg-[#4F6343] hover:bg-[#3F5235] text-white text-xs h-7"
                          data-testid={`navigate-btn-${site.id}`}
                        >
                          <Navigation className="h-3 w-3 mr-1" /> Nawiguj
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(site)}
                          className="text-[#94A3B8] hover:bg-[#2A3B59] text-xs h-7"
                          data-testid={`copy-link-btn-${site.id}`}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Kopiuj link
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-[#64748B] text-center pt-2">
                Klik "Nawiguj" otwiera Google Maps z trasa od Twojej pozycji.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
