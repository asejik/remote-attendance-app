import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

interface SiteMapProps {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  onPick: (latitude: number, longitude: number) => void;
}

const NIGERIA_CENTRE: [number, number] = [9.08, 8.68];

const ClickToPick = ({ onPick }: { onPick: SiteMapProps['onPick'] }) => {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
};

// Keeps the view on the pin when coordinates change from outside the map
// (typed in, or "use my current location").
const FollowPin = ({ position }: { position: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 16));
  }, [map, position]);
  return null;
};

// Map for placing a site: tap to drop the pin; the circle shows the radius.
// OpenStreetMap tiles (free, attribution required; light use only).
// Loaded lazily so the worker app never downloads Leaflet.
const SiteMap = ({ latitude, longitude, radiusM, onPick }: SiteMapProps) => {
  const position: [number, number] | null = latitude !== null && longitude !== null ? [latitude, longitude] : null;
  return (
    <MapContainer center={position ?? NIGERIA_CENTRE} zoom={position ? 16 : 6} className="h-72 w-full rounded-lg z-0" aria-label="Map: tap to place the site">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
      <ClickToPick onPick={onPick} />
      <FollowPin position={position} />
      {position && (
        <>
          <Circle center={position} radius={radiusM} pathOptions={{ color: '#2563eb', fillOpacity: 0.15 }} />
          <CircleMarker center={position} radius={7} pathOptions={{ color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1 }} />
        </>
      )}
    </MapContainer>
  );
};

export default SiteMap;
