import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Crosshair,
  Flame,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { CivicAppeal } from '../shared/types.ts';
import { Language, translations } from '../i18n/translations.ts';

interface CivicMapViewProps {
  reports: CivicAppeal[];
  selectedReport: CivicAppeal | null;
  onSelectReport: (report: CivicAppeal) => void;
  lang: Language;
}

export const CivicMapView: React.FC<CivicMapViewProps> = ({
  reports,
  selectedReport,
  onSelectReport,
  lang,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);

  const [mapStyle, setMapStyle] = useState<'dark' | 'osm' | 'satellite'>('dark');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const t = translations[lang];

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center on Astana/Almaty region
    const initialLat = reports.length > 0 ? reports[0].context.location.lat : 51.1300;
    const initialLng = reports.length > 0 ? reports[0].context.location.lng : 71.4300;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 13,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    heatLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layers when mapStyle changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove existing tile layers
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap &copy; CARTO';

    if (mapStyle === 'osm') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
    } else if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri World Imagery';
    }

    L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);
  }, [mapStyle]);

  // Update Markers & Heatmap Circles
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !heatLayerRef.current) return;

    const markersLayer = markersLayerRef.current;
    const heatLayer = heatLayerRef.current;

    markersLayer.clearLayers();
    heatLayer.clearLayers();

    // 1. Render Heatmap density halos if enabled
    if (showHeatmap) {
      reports.forEach(r => {
        const radius = r.priority.level === 'CRITICAL' ? 380 : r.priority.level === 'HIGH' ? 260 : 160;
        const color = r.priority.level === 'CRITICAL' ? '#f43f5e' : r.priority.level === 'HIGH' ? '#f97316' : '#eab308';

        L.circle([r.context.location.lat, r.context.location.lng], {
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.28,
          weight: 0,
        }).addTo(heatLayer);
      });
    }

    // 2. Render Markers
    reports.forEach(r => {
      const isCritical = r.priority.level === 'CRITICAL';
      const isHigh = r.priority.level === 'HIGH';
      const isResolved = r.status === 'RESOLVED' || r.status === 'CONFIRMED_BY_CITIZEN';

      const bgClass = isResolved
        ? 'bg-emerald-500 text-slate-950 border-emerald-300'
        : isCritical
        ? 'bg-rose-500 text-white border-rose-300 animate-pulse ring-4 ring-rose-500/30'
        : isHigh
        ? 'bg-amber-500 text-slate-950 border-amber-300'
        : 'bg-cyan-500 text-slate-950 border-cyan-300';

      const customIcon = L.divIcon({
        className: 'custom-civic-marker',
        html: `
          <div class="relative group cursor-pointer">
            <div class="w-8 h-8 rounded-full border-2 ${bgClass} flex items-center justify-center font-black text-xs shadow-xl transition-transform hover:scale-125">
              ${r.priority.score}
            </div>
            ${isCritical ? '<span class="absolute -top-1 -right-1 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span></span>' : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([r.context.location.lat, r.context.location.lng], { icon: customIcon });

      marker.on('click', () => {
        onSelectReport(r);
      });

      marker.addTo(markersLayer);
    });
  }, [reports, showHeatmap, onSelectReport]);

  // Center on Selected Report
  useEffect(() => {
    if (selectedReport && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        [selectedReport.context.location.lat, selectedReport.context.location.lng],
        16,
        { duration: 1.2 }
      );
    }
  }, [selectedReport]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([coords.lat, coords.lng], 15);
          L.circleMarker([coords.lat, coords.lng], {
            radius: 8,
            color: '#38bdf8',
            fillColor: '#0284c7',
            fillOpacity: 0.9,
          }).addTo(mapInstanceRef.current);
        }
      },
      err => console.warn('Geolocation failed:', err),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="relative w-full h-[520px] lg:h-[620px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Controls Top-Right */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {/* Layer style selector */}
        <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-1 shadow-lg flex items-center gap-1">
          <button
            onClick={() => setMapStyle('dark')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              mapStyle === 'dark' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setMapStyle('osm')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              mapStyle === 'osm' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            OSM
          </button>
          <button
            onClick={() => setMapStyle('satellite')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              mapStyle === 'satellite' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Спутник
          </button>
        </div>

        {/* Heatmap Toggle */}
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border shadow-lg transition-all ${
            showHeatmap
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-rose-500/20'
              : 'bg-slate-950/85 text-slate-300 border-slate-800 hover:bg-slate-900'
          }`}
        >
          <Flame className={`w-3.5 h-3.5 ${showHeatmap ? 'text-rose-400 animate-bounce' : 'text-slate-400'}`} />
          <span>Тепловая карта</span>
        </button>

        {/* Locate Me */}
        <button
          onClick={handleLocateMe}
          className="p-2.5 rounded-xl bg-slate-950/85 text-slate-300 hover:text-cyan-400 border border-slate-800 shadow-lg backdrop-blur-md self-end transition-all"
          title="Мое местоположение"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Legend Bottom-Left */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl text-xs flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-slate-300 font-medium">Критический (≥85)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-slate-300 font-medium">Высокий (65–84)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-cyan-500" />
          <span className="text-slate-300 font-medium">Обычный (&lt;65)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-slate-300 font-medium">Устранено</span>
        </div>
      </div>
    </div>
  );
};
