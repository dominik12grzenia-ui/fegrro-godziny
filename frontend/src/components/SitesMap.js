import React, { useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';

const SITE_COLORS_HEX = ['#3B4F5C', '#3F5235', '#5F4A3B', '#5A4F6C', '#6C5A4F', '#4F6C5A'];
const MARKER_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow'];

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 54.35, lng: 18.65 }; // Gdańsk area
const mapOptions = {
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#1E2A44' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1E2A44' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#CBD5E1' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3D5378' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#152033' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#243049' }] },
  ],
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

export const SitesMap = ({ sites, employees, assignments }) => {
  const [selectedSite, setSelectedSite] = useState(null);
  
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || '',
  });

  const onMapLoad = useCallback((map) => {
    if (sites.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      let hasBounds = false;
      sites.forEach(site => {
        if (site.location_lat && site.location_lng) {
          bounds.extend({ lat: site.location_lat, lng: site.location_lng });
          hasBounds = true;
        }
      });
      if (hasBounds) map.fitBounds(bounds, { padding: 50 });
    }
  }, [sites]);

  const getEmployeesForSite = (siteId) => {
    const empIds = new Set();
    assignments.forEach(a => {
      if (a.site_id === siteId && a.assigned_dates && a.assigned_dates.length > 0) {
        empIds.add(a.employee_id);
      }
    });
    return employees.filter(e => empIds.has(e.id));
  };

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1E2A44] text-red-400">
        Błąd ladowania mapy: {loadError.message}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1E2A44]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4F6343]" />
      </div>
    );
  }

  const sitesWithLocation = sites.filter(s => s.location_lat && s.location_lng);

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={sitesWithLocation.length > 0 
        ? { lat: sitesWithLocation[0].location_lat, lng: sitesWithLocation[0].location_lng }
        : defaultCenter
      }
      zoom={10}
      options={mapOptions}
      onLoad={onMapLoad}
    >
      {sitesWithLocation.map((site, idx) => (
        <Marker
          key={site.id}
          position={{ lat: site.location_lat, lng: site.location_lng }}
          onClick={() => setSelectedSite(site)}
          label={{
            text: site.name.substring(0, 3).toUpperCase(),
            color: '#fff',
            fontSize: '10px',
            fontWeight: 'bold'
          }}
        />
      ))}

      {selectedSite && (
        <InfoWindow
          position={{ lat: selectedSite.location_lat, lng: selectedSite.location_lng }}
          onCloseClick={() => setSelectedSite(null)}
        >
          <div style={{ backgroundColor: '#243049', color: '#F1F5F9', padding: '8px', borderRadius: '8px', minWidth: '180px' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 'bold', color: '#4F6343' }}>
              {selectedSite.name}
            </h3>
            {selectedSite.google_maps_url && (
              <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#CBD5E1' }}>
                {selectedSite.google_maps_url}
              </p>
            )}
            <div style={{ borderTop: '1px solid #3D5378', paddingTop: '6px', marginTop: '4px' }}>
              <p style={{ fontSize: '11px', color: '#CBD5E1', margin: '0 0 4px 0' }}>Pracownicy:</p>
              {getEmployeesForSite(selectedSite.id).map(emp => (
                <p key={emp.id} style={{ fontSize: '12px', margin: '2px 0', color: '#F1F5F9' }}>
                  {emp.full_name}
                </p>
              ))}
              {getEmployeesForSite(selectedSite.id).length === 0 && (
                <p style={{ fontSize: '11px', color: '#94A3B8' }}>Brak przypisanych</p>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
};
