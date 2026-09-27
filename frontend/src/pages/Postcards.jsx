import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { Search, MapPin, LocateFixed, Trash2, X } from "lucide-react";
import { api, apiError } from "../lib/api";

const NOMINATIM = "https://nominatim.openstreetmap.org";

function pinIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.6)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22],
  });
}

export default function Postcards() {
  const mapRef = useRef(null);
  const mapEl = useRef(null);
  const layerRef = useRef(null);
  const gpsRef = useRef(null);
  const clickRef = useRef(null);

  const [markers, setMarkers] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [gps, setGps] = useState(null);

  const loadMarkers = useCallback(async () => {
    const { data } = await api.get("/markers");
    setMarkers(data);
  }, []);

  const addMarker = useCallback(async (lat, lng, place, geojson) => {
    try {
      await api.post("/markers", { lat, lng, place: place || "", geojson: geojson || null });
      toast.success(`Markierung gesetzt: ${place || `${lat.toFixed(3)}, ${lng.toFixed(3)}`}`);
      loadMarkers();
    } catch (e) { toast.error(apiError(e)); }
  }, [loadMarkers]);

  const reverseAndAdd = useCallback(async (lat, lng) => {
    let place = ""; let geojson = null;
    try {
      const r = await fetch(`${NOMINATIM}/reverse?format=json&polygon_geojson=1&lat=${lat}&lon=${lng}`, { headers: { "Accept-Language": "de" } });
      const d = await r.json();
      place = d.display_name || "";
      geojson = d.geojson || null;
    } catch {}
    addMarker(lat, lng, place, geojson);
  }, [addMarker]);

  // init map once
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const map = L.map(mapEl.current, { zoomControl: true }).setView([53.63, 11.41], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => { clickRef.current && clickRef.current(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    loadMarkers();
    const iv = setInterval(loadMarkers, 6000);
    return () => { clearInterval(iv); map.remove(); mapRef.current = null; };
  }, [loadMarkers]);

  useEffect(() => { clickRef.current = reverseAndAdd; }, [reverseAndAdd]);

  // render markers
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markers.forEach((m) => {
      if (m.geojson) {
        try { L.geoJSON(m.geojson, { style: { color: "#10B981", weight: 2, fillColor: "#10B981", fillOpacity: 0.2 } }).addTo(layer); } catch {}
      }
      L.marker([m.lat, m.lng], { icon: pinIcon("#10B981") })
        .bindPopup(`<b>${m.place || "Ort"}</b>`)
        .addTo(layer);
    });
    if (gpsRef.current) { gpsRef.current.remove(); gpsRef.current = null; }
    if (gps) {
      gpsRef.current = L.circleMarker([gps.lat, gps.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#3B82F6", fillOpacity: 1 }).addTo(layerRef.current);
    }
  }, [markers, gps]);

  // search autocomplete
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${NOMINATIM}/search?format=json&polygon_geojson=1&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`, { headers: { "Accept-Language": "de" } });
        setResults(await r.json());
      } catch { setResults([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const selectResult = (r) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    mapRef.current?.setView([lat, lng], 12);
    setResults([]); setQuery("");
    addMarker(lat, lng, r.display_name, r.geojson || null);
  };

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error("GPS nicht verfügbar");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGps({ lat: latitude, lng: longitude });
        mapRef.current?.setView([latitude, longitude], 13);
        toast.success("Standort gefunden");
      },
      () => toast.error("Standort konnte nicht ermittelt werden"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const del = async (id) => { await api.delete(`/markers/${id}`); loadMarkers(); };
  const clearAll = async () => {
    if (!window.confirm("Alle Markierungen löschen?")) return;
    await api.delete("/markers"); loadMarkers(); toast.success("Alle Markierungen gelöscht");
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Postkarten-Karte</h1>
        <button data-testid="clear-markers-button" onClick={clearAll} className="rounded-xl px-4 py-2 text-sm font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 flex items-center gap-2"><Trash2 className="h-4 w-4" /> Alle löschen</button>
      </div>

      {/* search + gps */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input data-testid="place-search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ort suchen (z. B. Schwerin)…" className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-9 py-3 text-sm outline-none focus:border-amber-500/50" />
          {query && <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
          {results.length > 0 && (
            <div className="absolute z-[500] mt-1 w-full rounded-xl glass border border-white/10 shadow-2xl overflow-hidden">
              {results.map((r, i) => (
                <button key={i} data-testid={`search-result-${i}`} onClick={() => selectResult(r)} className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 border-b border-white/5 last:border-0 flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button data-testid="locate-me-button" onClick={locateMe} className="rounded-xl px-4 py-3 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><LocateFixed className="h-4 w-4" /> Mein Standort</button>
        {gps && <button data-testid="mark-here-button" onClick={() => reverseAndAdd(gps.lat, gps.lng)} className="rounded-xl px-4 py-3 text-sm font-medium bg-blue-500 text-white flex items-center gap-2"><MapPin className="h-4 w-4" /> Hier markieren</button>}
      </div>

      <p className="text-xs text-slate-500">Tipp: Auf die Karte tippen, um einen Ort zu markieren (Adresse wird automatisch erkannt).</p>

      {/* map */}
      <div ref={mapEl} data-testid="postcards-map" className="rounded-2xl overflow-hidden border border-white/10 z-0" style={{ height: "min(60vh, 520px)" }} />

      {/* marker list */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Markierungen ({markers.length})</div>
        {markers.length === 0 && <p className="text-slate-500 text-sm py-2">Noch keine Markierungen.</p>}
        {markers.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/50 px-4 py-3" data-testid={`marker-${m.id}`}>
            <span className="h-8 w-1.5 rounded-full" style={{ background: m.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 truncate">{m.place || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`}</div>
              <div className="text-[11px] text-slate-500">{new Date(m.created_at).toLocaleDateString("de-DE")}</div>
            </div>
            <button onClick={() => { mapRef.current?.setView([m.lat, m.lng], 13); }} className="text-slate-400 hover:text-amber-400"><MapPin className="h-4 w-4" /></button>
            <button onClick={() => del(m.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
