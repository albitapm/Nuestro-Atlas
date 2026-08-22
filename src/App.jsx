import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Home, MapPin, PiggyBank, Plane, BarChart3, Plus, X, Heart,
  Camera, Check, ChevronDown, Trash2, Pencil, Sparkles, Star,
  ArrowRight, Calendar, Compass, RotateCw, Menu, AlertCircle,
  Map as MapIcon, StickyNote,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ============================================================
   UTILIDADES
============================================================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const eur = (n) =>
  (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};
const monthYear = (d) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);
function resizeImage(file, maxDim = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim && width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}
const flagEmoji = (pais) => {
  const map = {
    Italia: "🇮🇹", "Reino Unido": "🇬🇧", Portugal: "🇵🇹", Francia: "🇫🇷", España: "🇪🇸",
    "República Checa": "🇨🇿", Alemania: "🇩🇪", Grecia: "🇬🇷", Japón: "🇯🇵", "Países Bajos": "🇳🇱",
    Marruecos: "🇲🇦", Austria: "🇦🇹", Croacia: "🇭🇷", Islandia: "🇮🇸", "Estados Unidos": "🇺🇸",
  };
  return map[pais] || "🌍";
};

const DEMO_CITIES = [
  { ciudad: "Roma", pais: "Italia", imagen: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80", dentroPeninsula: false, presupuesto: 750, duracion: 4, favorito: true, lat: 41.9028, lng: 12.4964 },
  { ciudad: "Londres", pais: "Reino Unido", imagen: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80", dentroPeninsula: false, presupuesto: 900, duracion: 5, favorito: false, lat: 51.5074, lng: -0.1278 },
  { ciudad: "Lisboa", pais: "Portugal", imagen: "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&q=80", dentroPeninsula: true, presupuesto: 420, duracion: 3, favorito: false, lat: 38.7223, lng: -9.1393 },
  { ciudad: "París", pais: "Francia", imagen: "https://images.unsplash.com/photo-1502602898формат?w=800&q=80", dentroPeninsula: false, presupuesto: 820, duracion: 4, favorito: true, lat: 48.8566, lng: 2.3522 },
  { ciudad: "Sevilla", pais: "España", imagen: "https://images.unsplash.com/photo-1558642084-fd07fae5282e?w=800&q=80", dentroPeninsula: true, presupuesto: 300, duracion: 3, favorito: false, lat: 37.3891, lng: -5.9845 },
  { ciudad: "Asturias", pais: "España", imagen: "https://images.unsplash.com/photo-1567016526105-22da7c13161a?w=800&q=80", dentroPeninsula: true, presupuesto: 350, duracion: 4, favorito: false, lat: 43.3603, lng: -5.8448 },
  { ciudad: "Praga", pais: "República Checa", imagen: "https://images.unsplash.com/photo-1541849546-216549ae216d?w=800&q=80", dentroPeninsula: false, presupuesto: 480, duracion: 4, favorito: false, lat: 50.0755, lng: 14.4378 },
  { ciudad: "Oporto", pais: "Portugal", imagen: "https://images.unsplash.com/photo-1555881980-58c37e9e5a3d?w=800&q=80", dentroPeninsula: true, presupuesto: 380, duracion: 3, favorito: false, lat: 41.1579, lng: -8.6291 },
];
// fix accidental typo url
DEMO_CITIES[3].imagen = "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80";

// Geocodifica una ciudad+país usando Nominatim (OpenStreetMap). Sin API key.
// Solo se llama al crear/editar un destino, o manualmente desde "Nuestro mapa" — nunca en bucle automático.
async function geocodeCiudad(ciudad, pais) {
  try {
    const q = encodeURIComponent(`${ciudad}, ${pais}`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
    if (!res.ok) return null;
    const arr = await res.json();
    if (Array.isArray(arr) && arr[0]) {
      return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
    }
  } catch (e) {
    console.error("Error de geocodificación", e);
  }
  return null;
}

// Migra datos guardados antes de que existieran coordenadas (versión 1 -> 2).
function migrateData(d) {
  d.destinos = (d.destinos || []).map((dest) => ({ ...dest, recomendaciones: Array.isArray(dest.recomendaciones) ? dest.recomendaciones : [] }));
  if (!d.version || d.version < 2) {
    d.destinos = (d.destinos || []).map((dest) => {
      if (dest.lat != null && dest.lng != null) return dest;
      const demo = DEMO_CITIES.find((c) => c.ciudad === dest.ciudad && c.pais === dest.pais);
      return demo ? { ...dest, lat: demo.lat, lng: demo.lng } : dest;
    });
    d.version = 2;
  }
  return d;
}

function buildDemoData() {
  const year = new Date().getFullYear();
  const destinos = DEMO_CITIES.map((c) => ({
    id: uid(), ...c, estado: "pendiente", fechaCreacion: todayISO(), recomendaciones: [],
  }));
  destinos[0].recomendaciones = [
    { id: uid(), titulo: "Trastevere al atardecer", categoria: "Visitar", recomendadoPor: "Sergio", nota: "Nos dijeron que merece mucho la pena pasear por la zona y cenar allí.", estado: "pendiente", ubicacion: "Trastevere, Roma" },
    { id: uid(), titulo: "Carbonara auténtica", categoria: "Comer", recomendadoPor: "", nota: "Buscar una trattoria pequeña y evitar las zonas demasiado turísticas.", estado: "pendiente", ubicacion: "", },
  ];
  destinos[2].recomendaciones = [
    { id: uid(), titulo: "Miradores de Lisboa", categoria: "Visitar", recomendadoPor: "", nota: "Apuntarnos un paseo por los miradores al atardecer.", estado: "visitado", ubicacion: "Lisboa" },
  ];
  destinos[0].estado = "objetivo"; // Roma
  destinos[2].estado = "realizado"; // Lisboa

  const aportaciones = [
    { id: uid(), destinoId: destinos[0].id, cantidad: 120, fecha: `${year}-05-15`, nota: "Aportación mensual" },
    { id: uid(), destinoId: destinos[0].id, cantidad: 100, fecha: `${year}-06-15`, nota: "Aportación mensual" },
    { id: uid(), destinoId: destinos[0].id, cantidad: 100, fecha: `${year}-07-15`, nota: "" },
  ];

  const viajes = [
    {
      id: uid(), destinoId: destinos[2].id, ciudad: "Lisboa", pais: "Portugal",
      imagen: destinos[2].imagen, fechaInicio: `${year}-03-10`, fechaFin: `${year}-03-13`,
      presupuestoEstimado: 420, gastoReal: 465, valoracion: 5,
      notas: "Nos encantó el barrio de Alfama y los miradores al atardecer.",
      fotos: [], year,
    },
  ];

  return {
    version: 2,
    objetivosAnuales: { [year]: 3 },
    destinos, aportaciones, viajes,
  };
}

/* ============================================================
   PERSISTENCIA
============================================================ */
const STORE_KEY = "travel-app-data";
async function loadData() {
  try {
    const res = await window.storage.get(STORE_KEY, true);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* not found yet */ }
  return null;
}
async function saveData(data) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(data), true);
    return true;
  } catch (e) {
    console.error("Error guardando datos", e);
    return false;
  }
}

/* ============================================================
   APP RAÍZ
============================================================ */
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("inicio");
  const [toast, setToast] = useState(null);
  // Cuando llegamos a la ruleta desde “¿A dónde nos podemos escapar?”,
  // guardamos temporalmente los IDs que cumplen ese filtro.
  const [rouletteOverrideIds, setRouletteOverrideIds] = useState(null);
  const dataRef = useRef(null);

  useEffect(() => {
    (async () => {
      let d = await loadData();
      if (!d) {
        d = buildDemoData();
        await saveData(d);
      } else {
        const migrated = migrateData(d);
        if (migrated !== d || migrated.version !== d.version) await saveData(migrated);
        d = migrated;
      }
      dataRef.current = d;
      setData(d);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dataRef.current = next;
      saveData(next);
      return next;
    });
  }, []);

  const showToast = useCallback((msg, kind = "ok") => {
    setToast({ msg, kind, key: uid() });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const [mapFocusId, setMapFocusId] = useState(null);
  const [destinoFocusId, setDestinoFocusId] = useState(null);
  const verEnMapa = useCallback((destino) => { setMapFocusId(destino.id); setTab("mapa"); }, []);
  const verDestino = useCallback((destinoId) => { setDestinoFocusId(destinoId); setTab("destinos"); }, []);

  if (loading || !data) {
    return (
      <div style={styles.loadingScreen}>
        <Compass className="spin-slow" size={40} color="#DD9A3C" />
        <p style={{ fontFamily: "Fraunces, serif", color: "#F7F2E8", marginTop: 14, fontSize: 18 }}>
          Preparando el mapa…
        </p>
      </div>
    );
  }

  const year = new Date().getFullYear();

  const nav = [
    { id: "inicio", label: "Inicio", icon: Home },
    { id: "ruleta", label: "Ruleta", icon: Sparkles },
    { id: "destinos", label: "Destinos", icon: MapPin },
    { id: "mapa", label: "Nuestro mapa", short: "Mapa", icon: MapIcon },
    { id: "ahorro", label: "Ahorro", icon: PiggyBank },
    { id: "viajes", label: "Viajes", icon: Plane },
    { id: "stats", label: "Nuestro año", short: "Año", icon: BarChart3 },
  ];

  return (
    <div style={styles.app}>
      <GlobalStyle />
      <div style={styles.shell}>
        {/* Sidebar desktop */}
        <aside style={styles.sidebar} className="sidebar-desktop">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 28px" }}>
            <Compass size={26} color="#DD9A3C" />
            <span style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: "#F7F2E8" }}>
              Nuestro atlas
            </span>
          </div>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => { if (n.id === "ruleta") setRouletteOverrideIds(null); setTab(n.id); }}
              style={{ ...styles.navBtn, ...(tab === n.id ? styles.navBtnActive : {}) }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "16px 14px", fontSize: 12, color: "rgba(247,242,232,0.45)", lineHeight: 1.5 }}>
            Los datos se guardan automáticamente y son visibles para cualquiera que abra este mismo enlace.
          </div>
        </aside>

        {/* Contenido */}
        <main style={styles.main}>
          {tab === "inicio" && (
            <Inicio
              data={data}
              persist={persist}
              setTab={setTab}
              year={year}
              onRuletaFiltrada={(ids) => { setRouletteOverrideIds(ids); setTab("ruleta"); }}
            />
          )}
          {tab === "ruleta" && (
            <RuletaPage
              data={data}
              persist={persist}
              showToast={showToast}
              setTab={setTab}
              overrideIds={rouletteOverrideIds}
              clearOverride={() => setRouletteOverrideIds(null)}
            />
          )}
          {tab === "destinos" && (
            <Destinos
              data={data} persist={persist} showToast={showToast}
              onVerEnMapa={verEnMapa} focusId={destinoFocusId} onFocusHandled={() => setDestinoFocusId(null)}
            />
          )}
          {tab === "mapa" && (
            <MapaPage
              data={data} persist={persist} showToast={showToast}
              focusId={mapFocusId} onFocusHandled={() => setMapFocusId(null)} onVerDestino={verDestino}
            />
          )}
          {tab === "ahorro" && <Ahorro data={data} persist={persist} showToast={showToast} setTab={setTab} />}
          {tab === "viajes" && <ViajesRealizados data={data} persist={persist} showToast={showToast} />}
          {tab === "stats" && <Stats data={data} />}
        </main>
      </div>

      {/* Nav móvil */}
      <nav style={styles.bottomNav} className="nav-mobile">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)} style={styles.bottomNavBtn}>
            <n.icon size={20} color={tab === n.id ? "#DD9A3C" : "rgba(247,242,232,0.55)"} />
            <span style={{ fontSize: 10, color: tab === n.id ? "#DD9A3C" : "rgba(247,242,232,0.55)" }}>{n.short || n.label}</span>
          </button>
        ))}
      </nav>

      {toast && (
        <div key={toast.key} style={{ ...styles.toast, ...(toast.kind === "err" ? { background: "#8B3A2B" } : {}) }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ESTILOS BASE / GLOBAL
============================================================ */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; }
      .spin-slow { animation: spin 3s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(10px);} to { opacity:1; transform:translateY(0);} }
      .fade-up { animation: fadeUp .45s ease both; }
      @keyframes pop { 0%{transform:scale(.85);opacity:0;} 60%{transform:scale(1.04);opacity:1;} 100%{transform:scale(1);} }
      .pop { animation: pop .5s cubic-bezier(.2,.9,.3,1.2) both; }
      @keyframes confetti-fall { to { transform: translateY(110vh) rotate(400deg); opacity: 0; } }
      @keyframes mapPulse { 0% { transform: scale(0.6); opacity: .5; } 100% { transform: scale(2.1); opacity: 0; } }
      .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 14px 34px rgba(34,50,44,0.25); }
      .leaflet-popup-content { margin: 12px; }
      .leaflet-popup-tip { box-shadow: 0 4px 10px rgba(34,50,44,0.15); }
      .leaflet-container { font-family: 'Inter', sans-serif; background: #EFE7D6; }
      .card-hover { transition: transform .25s ease, box-shadow .25s ease; }
      .card-hover:hover { transform: translateY(-4px); box-shadow: 0 18px 34px rgba(34,50,44,0.18); }
      input, select, textarea { font-family: 'Inter', sans-serif; }
      input:focus, select:focus, textarea:focus, button:focus-visible {
        outline: 2px solid #DD9A3C; outline-offset: 2px;
      }
      button { cursor: pointer; font-family: 'Inter', sans-serif; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: rgba(43,110,104,0.3); border-radius: 8px; }

      .range-overlay { position: relative; height: 34px; }
      .range-overlay input[type=range] {
        position:absolute; left:0; right:0; top:12px; width:100%; height:10px;
        -webkit-appearance:none; appearance:none; background:transparent; pointer-events:none; margin:0;
      }
      .range-overlay input[type=range]::-webkit-slider-thumb {
        -webkit-appearance:none; pointer-events:auto; width:18px; height:18px; border-radius:50%;
        background:#2B6E68; border:3px solid #F7F2E8; box-shadow:0 1px 4px rgba(0,0,0,.3); cursor:pointer; margin-top:-4px;
      }
      .range-overlay input[type=range]::-moz-range-thumb {
        pointer-events:auto; width:18px; height:18px; border-radius:50%;
        background:#2B6E68; border:3px solid #F7F2E8; box-shadow:0 1px 4px rgba(0,0,0,.3); cursor:pointer;
      }
      .range-overlay input[type=range]::-webkit-slider-runnable-track { height:2px; background:transparent; }

      @media (max-width: 860px) {
        .sidebar-desktop { display:none !important; }
      }
      @media (min-width: 861px) {
        .nav-mobile { display:none !important; }
      }
    `}</style>
  );
}

const C = {
  paper: "#F7F2E8", paperAlt: "#EFE7D6", ink: "#22322C", inkSoft: "#5B675F",
  teal: "#2B6E68", tealDark: "#1E4F4B", amber: "#DD9A3C", clay: "#BE5A3B",
  line: "rgba(34,50,44,0.12)", night: "#1B2A26",
};

const styles = {
  app: { height: "100vh", overflow: "hidden", background: C.paper, fontFamily: "Inter, sans-serif", color: C.ink },
  shell: { display: "flex", height: "100%", overflow: "hidden" },
  sidebar: {
    width: 224, background: C.night, display: "flex", flexDirection: "column",
    padding: "22px 12px", height: "100%", flexShrink: 0, overflowY: "auto",
  },
  navBtn: {
    display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12,
    background: "transparent", border: "none", color: "rgba(247,242,232,0.65)", fontSize: 14.5,
    fontWeight: 500, textAlign: "left", marginBottom: 3, transition: "all .15s",
  },
  navBtnActive: { background: "rgba(221,154,60,0.14)", color: "#F7F2E8" },
  main: { flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: "28px 20px 90px", maxWidth: 1180, margin: "0 auto", width: "100%" },
  bottomNav: {
    position: "fixed", bottom: 0, left: 0, right: 0, background: C.night, display: "flex",
    justifyContent: "space-around", padding: "8px 4px 10px", borderTop: "1px solid rgba(247,242,232,0.08)", zIndex: 40,
  },
  bottomNavBtn: { background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 6px" },
  loadingScreen: { minHeight: "100vh", background: C.night, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  toast: {
    position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: C.teal,
    color: "#fff", padding: "11px 20px", borderRadius: 30, fontSize: 14, fontWeight: 500,
    boxShadow: "0 10px 30px rgba(0,0,0,.25)", zIndex: 60, maxWidth: "90vw", textAlign: "center",
  },
  h1: { fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 600, margin: "0 0 4px", color: C.ink },
  h2: { fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, margin: "0 0 14px", color: C.ink },
  sub: { color: C.inkSoft, fontSize: 14.5, margin: 0 },
  card: { background: "#fff", borderRadius: 18, border: `1px solid ${C.line}`, padding: 20 },
  btnPrimary: {
    background: C.teal, color: "#fff", border: "none", borderRadius: 30, padding: "12px 22px",
    fontSize: 14.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8,
  },
  btnGhost: {
    background: "transparent", color: C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 30,
    padding: "10px 18px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8,
  },
  input: {
    width: "100%", padding: "10px 13px", borderRadius: 10, border: `1.5px solid ${C.line}`,
    fontSize: 14.5, background: "#fff", color: C.ink,
  },
  label: { fontSize: 12.5, fontWeight: 600, color: C.inkSoft, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: 0.4 },
  badge: (bg, fg) => ({ background: bg, color: fg, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4 }),
};

function EstadoBadge({ estado }) {
  const map = {
    pendiente: styles.badge("#EFE7D6", C.inkSoft),
    objetivo: styles.badge("#FCEBD2", "#9A6317"),
    realizado: styles.badge("#DCEEE9", C.tealDark),
  };
  const label = { pendiente: "💭 Pendiente", objetivo: "🎯 Objetivo", realizado: "✈️ Realizado" };
  return <span style={map[estado]}>{label[estado]}</span>;
}

function EmptyState({ icon: Icon, title, text, actionLabel, onAction }) {
  return (
    <div style={{ ...styles.card, textAlign: "center", padding: "48px 24px" }} className="fade-up">
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.paperAlt, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Icon size={26} color={C.teal} />
      </div>
      <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 18, margin: "0 0 8px" }}>{title}</h3>
      <p style={{ color: C.inkSoft, fontSize: 14, maxWidth: 360, margin: "0 auto 18px", lineHeight: 1.5 }}>{text}</p>
      {actionLabel && (
        <button style={styles.btnPrimary} onClick={onAction}><Plus size={16} /> {actionLabel}</button>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, width = 520, inline = false }) {
  const content = (
    <div
      className="pop"
      style={inline
        ? { background: "#fff", width: "100%", maxWidth: width, maxHeight: "none", overflow: "visible", borderRadius: 22, padding: 24, position: "relative", border: `1px solid ${C.line}`, boxShadow: "0 12px 34px rgba(34,50,44,.12)" }
        : { background: "#fff", width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", borderRadius: "22px 22px 0 0", padding: 24, position: "relative" }
      }
      onClick={(e) => !inline && e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ ...styles.h2, margin: 0 }}>{title}</h2>
        <button onClick={onClose} style={{ background: C.paperAlt, border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={17} />
        </button>
      </div>
      {children}
    </div>
  );

  if (inline) return content;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(27,42,38,0.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      {content}
    </div>
  );
}

function Confirm({ text, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(27,42,38,0.55)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="pop" style={{ background: "#fff", borderRadius: 18, padding: 24, maxWidth: 360, textAlign: "center" }}>
        <AlertCircle size={30} color={C.clay} style={{ marginBottom: 10 }} />
        <p style={{ fontSize: 15, color: C.ink, marginBottom: 20 }}>{text}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ ...styles.btnGhost }}>Cancelar</button>
          <button onClick={onConfirm} style={{ ...styles.btnPrimary, background: C.clay }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   INICIO / DASHBOARD
============================================================ */
function Inicio({ data, persist, setTab, year, onRuletaFiltrada }) {
  const objetivoAnual = data.objetivosAnuales[year] ?? 3;
  const viajesEsteAnio = data.viajes.filter((v) => v.year === year);
  const pct = Math.min(100, Math.round((viajesEsteAnio.length / objetivoAnual) * 100));
  const cumplido = viajesEsteAnio.length >= objetivoAnual;

  const destinoObjetivo = data.destinos.find((d) => d.estado === "objetivo");
  const ahorrado = destinoObjetivo
    ? data.aportaciones.filter((a) => a.destinoId === destinoObjetivo.id).reduce((s, a) => s + a.cantidad, 0)
    : 0;
  const gastoEsteAnio = viajesEsteAnio.reduce((s, v) => s + (Number(v.gastoReal) || 0), 0);
  const pendientes = data.destinos.filter((d) => d.estado === "pendiente").length;

  const [editObjetivo, setEditObjetivo] = useState(false);
  const [nuevoObjetivo, setNuevoObjetivo] = useState(objetivoAnual);

  const guardarObjetivo = () => {
    const n = Math.max(1, Number(nuevoObjetivo) || 1);
    persist((prev) => ({ ...prev, objetivosAnuales: { ...prev.objetivosAnuales, [year]: n } }));
    setEditObjetivo(false);
  };

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 26 }}>
        <p style={{ ...styles.sub, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, color: C.teal, marginBottom: 6 }}>
          Nuestros viajes · {year}
        </p>
        <h1 style={styles.h1}>¿A dónde nos vamos este año? ✈️</h1>
      </div>

      {/* Objetivo anual */}
      <div style={{ ...styles.card, background: `linear-gradient(135deg, ${C.tealDark}, ${C.teal})`, color: "#fff", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: 1, opacity: 0.8, margin: "0 0 6px" }}>Objetivo anual</p>
            <p style={{ fontFamily: "Fraunces, serif", fontSize: 26, margin: 0, fontWeight: 600 }}>
              {viajesEsteAnio.length} / {objetivoAnual} viajes realizados
            </p>
          </div>
          {!editObjetivo ? (
            <button onClick={() => { setEditObjetivo(true); setNuevoObjetivo(objetivoAnual); }} style={{ background: "rgba(255,255,255,0.16)", border: "none", color: "#fff", borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>
              Cambiar objetivo
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="number" min={1} value={nuevoObjetivo} onChange={(e) => setNuevoObjetivo(e.target.value)} style={{ width: 60, padding: "6px 8px", borderRadius: 8, border: "none", fontSize: 14 }} />
              <button onClick={guardarObjetivo} style={{ background: C.amber, border: "none", borderRadius: 16, padding: "7px 12px", color: "#3A2A0E", fontWeight: 700, fontSize: 12.5 }}>Guardar</button>
            </div>
          )}
        </div>
        <div style={{ height: 12, background: "rgba(255,255,255,0.2)", borderRadius: 20, marginTop: 16, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.amber, borderRadius: 20, transition: "width .6s ease" }} />
        </div>
        <p style={{ fontSize: 13, marginTop: 8, opacity: 0.9 }}>
          {cumplido ? "🎉 ¡Objetivo cumplido! Sois una máquina de viajar." : `${pct}% completado`}
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: 22 }}>
        <StatCard icon="✈️" label="Viajes" value={`${viajesEsteAnio.length} / ${objetivoAnual}`} />
        <StatCard icon="💰" label="Ahorrado" value={eur(ahorrado)} />
        <StatCard icon="🌍" label="Destinos pendientes" value={pendientes} />
        <StatCard icon="🎯" label="Próximo objetivo" value={destinoObjetivo ? destinoObjetivo.ciudad : "—"} />
        <StatCard icon="💸" label="Gastado este año" value={eur(gastoEsteAnio)} />
      </div>

      <QueViajePodemosPermitirmos data={data} onRuletaFiltrada={onRuletaFiltrada} />

      {/* Objetivo activo */}
      <h2 style={styles.h2}>Nuestro próximo viaje</h2>
      {destinoObjetivo ? (
        <ObjetivoActivoCard destino={destinoObjetivo} ahorrado={ahorrado} onIr={() => setTab("ahorro")} />
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Todavía no tenemos ningún viaje como objetivo"
          text="Gira la ruleta o elige un destino y empieza a ahorrar para él."
          actionLabel="Ir a la ruleta"
          onAction={() => setTab("ruleta")}
        />
      )}
    </div>
  );
}

function QueViajePodemosPermitirmos({ data, onRuletaFiltrada }) {
  const destinosDisponibles = data.destinos.filter((d) => d.estado !== "realizado");
  const presupuestos = destinosDisponibles.map((d) => Number(d.presupuesto) || 0).filter(Boolean);
  const maxPresupuesto = presupuestos.length ? Math.max(...presupuestos) : 1000;
  const [presupuesto, setPresupuesto] = useState(maxPresupuesto);
  const [dias, setDias] = useState(4);
  const [geo, setGeo] = useState("todos");
  const [buscado, setBuscado] = useState(false);

  useEffect(() => {
    setPresupuesto(maxPresupuesto);
  }, [maxPresupuesto]);

  const resultados = useMemo(() => {
    if (!buscado) return [];
    const presupuestoMax = Number(presupuesto) || 0;
    const diasMax = Number(dias) || 0;
    return destinosDisponibles
      .filter((d) => {
        if ((Number(d.presupuesto) || 0) > presupuestoMax) return false;
        if (diasMax > 0 && (Number(d.duracion) || 0) > diasMax) return false;
        if (geo === "peninsula" && !d.dentroPeninsula) return false;
        if (geo === "fuera" && d.dentroPeninsula) return false;
        return true;
      })
      .map((d) => {
        const coste = Number(d.presupuesto) || 0;
        const ahorro = presupuestoMax > 0 ? Math.max(0, Math.round(((presupuestoMax - coste) / presupuestoMax) * 100)) : 0;
        const margenDias = diasMax > 0 ? Math.max(0, Math.round(((diasMax - (Number(d.duracion) || 0)) / diasMax) * 100)) : 0;
        const compatibilidad = Math.min(100, Math.round(60 + ahorro * 0.25 + margenDias * 0.15));
        return { ...d, compatibilidad };
      })
      .sort((a, b) => b.compatibilidad - a.compatibilidad || a.presupuesto - b.presupuesto);
  }, [buscado, destinosDisponibles, presupuesto, dias, geo]);

  return (
    <section style={{ ...styles.card, marginBottom: 22, background: "linear-gradient(145deg, #fff, #FBF7EE)", border: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: C.teal, fontSize: 12.5, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>✨ Para nuestra próxima escapada</p>
          <h2 style={{ ...styles.h2, margin: "5px 0 4px" }}>¿A dónde nos podemos escapar?</h2>
          <p style={{ ...styles.sub, margin: 0 }}>Dinos presupuesto, días y zona. Buscaremos entre vuestros destinos.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
        <label style={styles.label}>
          💶 Presupuesto máximo
          <div style={{ position: "relative", marginTop: 6 }}>
            <input type="number" min="0" step="50" value={presupuesto} onChange={(e) => { setPresupuesto(e.target.value); setBuscado(false); }} style={{ ...styles.input, paddingRight: 36 }} />
            <span style={{ position: "absolute", right: 11, top: 11, color: C.inkSoft, fontSize: 13 }}>€</span>
          </div>
        </label>
        <label style={styles.label}>
          🗓️ Días disponibles
          <div style={{ position: "relative", marginTop: 6 }}>
            <input type="number" min="1" step="1" value={dias} onChange={(e) => { setDias(e.target.value); setBuscado(false); }} style={{ ...styles.input, paddingRight: 48 }} />
            <span style={{ position: "absolute", right: 11, top: 11, color: C.inkSoft, fontSize: 13 }}>días</span>
          </div>
        </label>
        <label style={styles.label}>
          🌍 ¿Dónde?
          <select value={geo} onChange={(e) => { setGeo(e.target.value); setBuscado(false); }} style={{ ...styles.input, marginTop: 6 }}>
            <option value="todos">Me da igual</option>
            <option value="peninsula">Dentro de la península</option>
            <option value="fuera">Fuera de la península</option>
          </select>
        </label>
      </div>

      <button onClick={() => setBuscado(true)} style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center", marginTop: 15 }}>
        <Sparkles size={16} /> Encontrar nuestro viaje
      </button>

      {buscado && (
        <div style={{ marginTop: 18 }} className="fade-up">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600 }}>
                {resultados.length ? `✨ ${resultados.length} destino${resultados.length !== 1 ? "s" : ""} encaja${resultados.length !== 1 ? "n" : ""}` : "😕 No encontramos un destino"}
              </p>
              <p style={{ margin: "3px 0 0", color: C.inkSoft, fontSize: 12.5 }}>
                {resultados.length ? "Estos son los destinos que cumplen vuestro filtro." : "Prueba a aumentar el presupuesto o los días."}
              </p>
            </div>
            {resultados.length > 0 && (
              <button
                onClick={() => onRuletaFiltrada(resultados.map((d) => d.id))}
                style={{ ...styles.btnPrimary, background: C.amber, color: "#3A2A0E" }}
              >
                🎰 Que decida la ruleta
              </button>
            )}
          </div>

          {resultados.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {resultados.map((d, index) => (
                <div key={d.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, border: `1px solid ${C.line}`, borderRadius: 14, background: "#fff" }}>
                  <img src={d.imagen} alt="" style={{ width: 58, height: 58, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} onError={(e) => (e.target.style.display = "none")} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <strong style={{ fontFamily: "Fraunces, serif", fontSize: 17 }}>{index === 0 ? "🏆 " : ""}{flagEmoji(d.pais)} {d.ciudad}</strong>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.teal, background: "#E9F3EF", borderRadius: 12, padding: "3px 7px" }}>{d.compatibilidad}% encaja</span>
                    </div>
                    <div style={{ color: C.inkSoft, fontSize: 12.5, marginTop: 3 }}>{eur(d.presupuesto)} · {d.duracion} días · {d.dentroPeninsula ? "Península" : "Fuera"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div style={{ ...styles.card, padding: "16px 18px" }} className="card-hover">
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ObjetivoActivoCard({ destino, ahorrado, onIr }) {
  const pct = Math.min(100, Math.round((ahorrado / destino.presupuesto) * 100));
  return (
    <div style={{ ...styles.card, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }} className="card-hover">
      <img src={destino.imagen} alt={destino.ciudad} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 14, flexShrink: 0 }} onError={(e) => (e.target.style.display = "none")} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontFamily: "Fraunces, serif", fontSize: 21, margin: "0 0 2px" }}>{flagEmoji(destino.pais)} {destino.ciudad}</p>
        <p style={{ color: C.inkSoft, fontSize: 13.5, margin: "0 0 10px" }}>{eur(destino.presupuesto)} objetivo</p>
        <div style={{ height: 10, background: C.paperAlt, borderRadius: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.amber, borderRadius: 20, transition: "width .5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6, color: C.inkSoft }}>
          <span>{eur(ahorrado)} / {eur(destino.presupuesto)}</span>
          <span>{ahorrado >= destino.presupuesto ? "🎉 ¡Conseguido!" : `Faltan ${eur(destino.presupuesto - ahorrado)}`}</span>
        </div>
        <button onClick={onIr} style={{ ...styles.btnPrimary, marginTop: 14 }}>Añadir ahorro <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

/* ============================================================
   RULETA + SORPRÉNDENOS
============================================================ */
const WHEEL_COLORS = ["#2B6E68", "#DD9A3C", "#BE5A3B", "#1E4F4B", "#C9A24B", "#4B7A6E", "#8C4A34", "#3E6E9B"];

function useFilters(destinos, { includeObjetivo = true } = {}) {
  const disponibles = destinos.filter((d) => d.estado !== "realizado" && (includeObjetivo || d.estado !== "objetivo"));
  const presupuestos = disponibles.map((d) => d.presupuesto);
  const minGlobal = presupuestos.length ? Math.min(...presupuestos) : 0;
  const maxGlobal = presupuestos.length ? Math.max(...presupuestos) : 1500;
  return { disponibles, minGlobal, maxGlobal };
}

function RuletaPage({ data, persist, showToast, setTab, overrideIds, clearOverride }) {
  const [sub, setSub] = useState("ruleta");
  return (
    <div className="fade-up">
      <h1 style={styles.h1}>🎡 ¿Dónde nos vamos?</h1>
      <p style={styles.sub}>Filtra vuestros destinos guardados y dejad que la suerte decida.</p>
      <div style={{ display: "flex", gap: 8, margin: "18px 0 22px" }}>
        <TabPill active={sub === "ruleta"} onClick={() => setSub("ruleta")} label="🎡 Ruleta" />
        <TabPill active={sub === "sorpresa"} onClick={() => setSub("sorpresa")} label="✨ Sorpréndenos" />
      </div>
      {sub === "ruleta"
        ? <Ruleta data={data} persist={persist} showToast={showToast} setTab={setTab} overrideIds={overrideIds} clearOverride={clearOverride} />
        : <Sorprendenos data={data} persist={persist} showToast={showToast} setTab={setTab} />}
    </div>
  );
}

function TabPill({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      border: "none", borderRadius: 24, padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
      background: active ? C.teal : "#fff", color: active ? "#fff" : C.inkSoft, border: `1.5px solid ${active ? C.teal : C.line}`,
    }}>
      {label}
    </button>
  );
}

function Ruleta({ data, persist, showToast, setTab, overrideIds, clearOverride }) {
  const { disponibles: todosDisponibles, minGlobal: allMinGlobal, maxGlobal: allMaxGlobal } = useFilters(data.destinos);
  const disponibles = overrideIds ? todosDisponibles.filter((d) => overrideIds.includes(d.id)) : todosDisponibles;
  const minGlobal = disponibles.length ? Math.min(...disponibles.map((d) => Number(d.presupuesto) || 0)) : allMinGlobal;
  const maxGlobal = disponibles.length ? Math.max(...disponibles.map((d) => Number(d.presupuesto) || 0)) : allMaxGlobal;
  const [minB, setMinB] = useState(minGlobal);
  const [maxB, setMaxB] = useState(maxGlobal);
  const [geo, setGeo] = useState("todos");
  const [soloFav, setSoloFav] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);

  useEffect(() => { setMinB(minGlobal); setMaxB(maxGlobal); }, [minGlobal, maxGlobal]);

  const filtrados = useMemo(() => disponibles.filter((d) => {
    if (d.presupuesto < minB || d.presupuesto > maxB) return false;
    if (geo === "peninsula" && !d.dentroPeninsula) return false;
    if (geo === "fuera" && d.dentroPeninsula) return false;
    if (soloFav && !d.favorito) return false;
    if (soloPendientes && d.estado !== "pendiente") return false;
    return true;
  }), [disponibles, minB, maxB, geo, soloFav, soloPendientes]);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [ganador, setGanador] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const girar = () => {
    if (!filtrados.length || spinning) return;
    setGanador(null);
    setSpinning(true);
    const idx = Math.floor(Math.random() * filtrados.length);
    const seg = 360 / filtrados.length;
    const targetCenter = idx * seg + seg / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const finalRotation = rotation + extraSpins * 360 + (360 - (targetCenter + rotation) % 360);
    setRotation(finalRotation);
    window.setTimeout(() => {
      setSpinning(false);
      setGanador(filtrados[idx]);
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 1600);
    }, 3600);
  };

  const convertirObjetivo = (destino) => {
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.map((d) => {
        if (d.id === destino.id) return { ...d, estado: "objetivo" };
        if (d.estado === "objetivo") return { ...d, estado: "pendiente" };
        return d;
      }),
    }));
    showToast(`🎯 ${destino.ciudad} es ahora vuestro objetivo de ahorro`);
    setTab("ahorro");
  };

  return (
    <div>
      {overrideIds && (
        <div style={{ ...styles.card, marginBottom: 14, background: "#FFF8E8", border: `1px solid ${C.amber}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <strong style={{ fontFamily: "Fraunces, serif", fontSize: 17 }}>💰 Ruleta con vuestro filtro</strong>
            <p style={{ margin: "3px 0 0", color: C.inkSoft, fontSize: 12.5 }}>Solo participan los destinos que encajaron en “¿A dónde nos podemos escapar?”.</p>
          </div>
          <button onClick={clearOverride} style={{ ...styles.btnGhost, whiteSpace: "nowrap" }}>Ver todos los destinos</button>
        </div>
      )}
      <FiltrosPanel {...{ minB, setMinB, maxB, setMaxB, minGlobal, maxGlobal, geo, setGeo, soloFav, setSoloFav, soloPendientes, setSoloPendientes }} />

      <p style={{ textAlign: "center", color: C.inkSoft, fontSize: 14, margin: "18px 0 4px" }}>
        La ruleta tiene <strong style={{ color: C.ink }}>{filtrados.length}</strong> destino{filtrados.length !== 1 ? "s" : ""}
      </p>

      {filtrados.length === 0 ? (
        <EmptyState icon={Compass} title="Ningún destino cumple estos filtros" text="Amplía el rango de presupuesto o cambia el filtro geográfico para ver más opciones." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 0 10px", position: "relative" }}>
          {showConfetti && <Confetti />}
          <div style={{ position: "relative", width: "min(320px, 82vw)", height: "min(320px, 82vw)" }}>
            <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", zIndex: 5, fontSize: 30 }}>📍</div>
            <div
              style={{
                width: "100%", height: "100%", borderRadius: "50%", position: "relative",
                background: conicWheel(filtrados),
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? "transform 3.6s cubic-bezier(.17,.67,.16,1)" : "none",
                border: "6px solid #fff", boxShadow: "0 14px 40px rgba(34,50,44,0.28)",
              }}
            >
              {filtrados.map((d, i) => {
                const seg = 360 / filtrados.length;
                const angle = i * seg + seg / 2;
                return (
                  <div key={d.id} style={{ position: "absolute", inset: 0, transform: `rotate(${angle}deg)` }}>
                    <span style={{
                      position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
                      color: "#fff", fontSize: filtrados.length > 8 ? 9.5 : 11.5, fontWeight: 700,
                      whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,.4)",
                      maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
                    }}>
                      {d.ciudad}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              width: 54, height: 54, borderRadius: "50%", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,.2)",
            }}>
              <Sparkles size={22} color={C.amber} />
            </div>
          </div>

          <button onClick={girar} disabled={spinning} style={{ ...styles.btnPrimary, marginTop: 30, padding: "15px 34px", fontSize: 16, opacity: spinning ? 0.7 : 1 }}>
            <RotateCw size={18} className={spinning ? "spin-slow" : ""} /> {spinning ? "Girando…" : "GIRAR LA RULETA"}
          </button>

          {ganador && (
            <div className="pop" style={{ ...styles.card, marginTop: 26, width: "100%", maxWidth: 380, textAlign: "center" }}>
              <img src={ganador.imagen} alt={ganador.ciudad} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 14 }} onError={(e) => (e.target.style.display = "none")} />
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 24, margin: "14px 0 2px" }}>{flagEmoji(ganador.pais)} {ganador.ciudad.toUpperCase()}</p>
              <p style={{ color: C.inkSoft, fontSize: 14, margin: "0 0 4px" }}>{eur(ganador.presupuesto)} · {ganador.duracion} días</p>
              <EstadoBadge estado={ganador.dentroPeninsula ? "pendiente" : "pendiente"} />
              <p style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 6 }}>{ganador.dentroPeninsula ? "Dentro de península" : "Fuera de península"}</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                <button style={styles.btnPrimary} onClick={() => convertirObjetivo(ganador)}>🎯 Convertir en objetivo</button>
                <button style={styles.btnGhost} onClick={girar}>🔄 Volver a girar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function conicWheel(items) {
  const seg = 360 / items.length;
  const stops = items.map((_, i) => {
    const c = WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
  });
  return `conic-gradient(${stops.join(",")})`;
}

function Confetti() {
  const pieces = Array.from({ length: 26 });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 20 }}>
      {pieces.map((_, i) => (
        <span key={i} style={{
          position: "absolute", top: -10, left: `${Math.random() * 100}%`,
          width: 8, height: 8, background: WHEEL_COLORS[i % WHEEL_COLORS.length],
          animation: `confetti-fall ${1 + Math.random()}s ease-in ${Math.random() * 0.3}s forwards`,
          borderRadius: i % 2 ? "50%" : 2,
        }} />
      ))}
    </div>
  );
}

function FiltrosPanel({ minB, setMinB, maxB, setMaxB, minGlobal, maxGlobal, geo, setGeo, soloFav, setSoloFav, soloPendientes, setSoloPendientes }) {
  return (
    <div style={styles.card}>
      <label style={styles.label}>Presupuesto</label>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>
        <span>{eur(minB)}</span><span>{eur(maxB)}</span>
      </div>
      <div className="range-overlay">
        <input type="range" min={minGlobal} max={maxGlobal} value={minB} onChange={(e) => setMinB(Math.min(Number(e.target.value), maxB))} />
        <input type="range" min={minGlobal} max={maxGlobal} value={maxB} onChange={(e) => setMaxB(Math.max(Number(e.target.value), minB))} />
        <div style={{ position: "absolute", top: 16, left: 9, right: 9, height: 4, background: C.paperAlt, borderRadius: 4 }}>
          <div style={{
            position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: C.teal,
            left: `${((minB - minGlobal) / Math.max(1, maxGlobal - minGlobal)) * 100}%`,
            right: `${100 - ((maxB - minGlobal) / Math.max(1, maxGlobal - minGlobal)) * 100}%`,
          }} />
        </div>
      </div>

      <label style={{ ...styles.label, marginTop: 16 }}>Ubicación</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[["todos", "Todos"], ["peninsula", "Península"], ["fuera", "Fuera de península"]].map(([v, l]) => (
          <TabPill key={v} active={geo === v} onClick={() => setGeo(v)} label={l} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
        <Checkbox label="Solo favoritos" checked={soloFav} onChange={setSoloFav} />
        <Checkbox label="Solo destinos pendientes" checked={soloPendientes} onChange={setSoloPendientes} />
      </div>
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: C.inkSoft, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 17, height: 17, accentColor: C.teal }} />
      {label}
    </label>
  );
}

function Sorprendenos({ data, persist, showToast, setTab }) {
  const { disponibles } = useFilters(data.destinos);
  const [maxB, setMaxB] = useState(1500);
  const [geo, setGeo] = useState("todos");
  const [durMin, setDurMin] = useState(1);
  const [durMax, setDurMax] = useState(14);
  const [soloFav, setSoloFav] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [resultado, setResultado] = useState(null);

  const filtrados = useMemo(() => disponibles.filter((d) =>
    d.presupuesto <= maxB &&
    (geo === "todos" || (geo === "peninsula" ? d.dentroPeninsula : !d.dentroPeninsula)) &&
    d.duracion >= durMin && d.duracion <= durMax &&
    (!soloFav || d.favorito)
  ), [disponibles, maxB, geo, durMin, durMax, soloFav]);

  const sorprender = () => {
    if (!filtrados.length) return;
    setResultado(null);
    setRevealing(true);
    window.setTimeout(() => {
      const pick = filtrados[Math.floor(Math.random() * filtrados.length)];
      setResultado(pick);
      setRevealing(false);
    }, 1100);
  };

  const convertirObjetivo = (destino) => {
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.map((d) => {
        if (d.id === destino.id) return { ...d, estado: "objetivo" };
        if (d.estado === "objetivo") return { ...d, estado: "pendiente" };
        return d;
      }),
    }));
    showToast(`🎯 ${destino.ciudad} es ahora vuestro objetivo de ahorro`);
    setTab("ahorro");
  };

  return (
    <div>
      <div style={styles.card}>
        <label style={styles.label}>Presupuesto máximo: {eur(maxB)}</label>
        <input type="range" min={100} max={2000} step={50} value={maxB} onChange={(e) => setMaxB(Number(e.target.value))} style={{ width: "100%", accentColor: C.teal }} />
        <label style={{ ...styles.label, marginTop: 14 }}>Ubicación</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["todos", "Todos"], ["peninsula", "Península"], ["fuera", "Fuera"]].map(([v, l]) => (
            <TabPill key={v} active={geo === v} onClick={() => setGeo(v)} label={l} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <label style={styles.label}>Duración mín. (días)</label>
            <input type="number" min={1} value={durMin} onChange={(e) => setDurMin(Number(e.target.value))} style={{ ...styles.input, width: 100 }} />
          </div>
          <div>
            <label style={styles.label}>Duración máx. (días)</label>
            <input type="number" min={1} value={durMax} onChange={(e) => setDurMax(Number(e.target.value))} style={{ ...styles.input, width: 100 }} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Checkbox label="Solo favoritos" checked={soloFav} onChange={setSoloFav} />
        </div>
      </div>

      <p style={{ textAlign: "center", color: C.inkSoft, fontSize: 14, margin: "18px 0" }}>
        {filtrados.length} destino{filtrados.length !== 1 ? "s" : ""} compatible{filtrados.length !== 1 ? "s" : ""}
      </p>

      {filtrados.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nada encaja con estos filtros" text="Prueba a ampliar el presupuesto o la duración." />
      ) : (
        <div style={{ textAlign: "center" }}>
          <button onClick={sorprender} disabled={revealing} style={{ ...styles.btnPrimary, padding: "15px 34px", fontSize: 16, background: C.clay }}>
            <Sparkles size={18} /> SORPRÉNDENOS
          </button>
          {revealing && (
            <div className="fade-up" style={{ marginTop: 24, fontFamily: "Fraunces, serif", fontSize: 18, color: C.inkSoft }}>
              Descubriendo un lugar para vosotros… 🧭
            </div>
          )}
          {resultado && !revealing && (
            <div className="pop" style={{ ...styles.card, marginTop: 24, maxWidth: 380, margin: "24px auto 0", textAlign: "center" }}>
              <img src={resultado.imagen} alt={resultado.ciudad} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 14 }} onError={(e) => (e.target.style.display = "none")} />
              <p style={{ fontFamily: "Fraunces, serif", fontSize: 24, margin: "14px 0 2px" }}>{flagEmoji(resultado.pais)} {resultado.ciudad}</p>
              <p style={{ color: C.inkSoft, fontSize: 14 }}>{eur(resultado.presupuesto)} · {resultado.duracion} días</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                <button style={styles.btnPrimary} onClick={() => convertirObjetivo(resultado)}>🎯 Convertir en objetivo</button>
                <button style={styles.btnGhost} onClick={sorprender}>🔄 Otra vez</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DESTINOS
============================================================ */
const emptyForm = { ciudad: "", pais: "", imagen: "", presupuesto: "", duracion: "", dentroPeninsula: false, favorito: false };

function Destinos({ data, persist, showToast, onVerEnMapa, focusId, onFocusHandled }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [marcarViaje, setMarcarViaje] = useState(null);
  const [recomendacionesDestinoId, setRecomendacionesDestinoId] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const recomendacionesRef = useRef(null);

  const visibles = data.destinos.filter((d) => filtroEstado === "todos" || d.estado === filtroEstado);

  useEffect(() => {
    if (!focusId) return;
    const d = data.destinos.find((x) => x.id === focusId);
    if (d) { setEditing(d); setShowForm(true); }
    onFocusHandled && onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!showForm) return;
    const id = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [showForm, editing?.id]);

  useEffect(() => {
    if (!recomendacionesDestinoId) return;
    const id = window.setTimeout(() => {
      recomendacionesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [recomendacionesDestinoId]);

  const guardar = async (form) => {
    const needsGeocode = !editing || editing.ciudad !== form.ciudad || editing.pais !== form.pais || editing.lat == null;
    let coords = editing ? { lat: editing.lat, lng: editing.lng } : {};
    if (needsGeocode) {
      setSaving(true);
      const found = await geocodeCiudad(form.ciudad, form.pais);
      coords = found || {};
    }
    if (editing) {
      persist((prev) => ({ ...prev, destinos: prev.destinos.map((d) => (d.id === editing.id ? { ...d, ...form, ...coords } : d)) }));
      showToast("Destino actualizado");
    } else {
      const nuevo = { id: uid(), ...form, ...coords, estado: "pendiente", fechaCreacion: todayISO() };
      persist((prev) => ({ ...prev, destinos: [nuevo, ...prev.destinos] }));
      showToast(coords.lat != null ? "Destino añadido 🌍" : "Destino añadido (sin ubicación en el mapa) 🌍");
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
  };

  const eliminar = () => {
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.filter((d) => d.id !== toDelete.id),
      aportaciones: prev.aportaciones.filter((a) => a.destinoId !== toDelete.id),
    }));
    showToast("Destino eliminado");
    setToDelete(null);
  };

  const toggleFav = (d) => persist((prev) => ({ ...prev, destinos: prev.destinos.map((x) => (x.id === d.id ? { ...x, favorito: !x.favorito } : x)) }));

  const resetDemo = () => {
    persist(() => buildDemoData());
    showToast("Datos de ejemplo restaurados");
  };

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={styles.h1}>Destinos</h1>
          <p style={styles.sub}>Todas las ciudades que queréis conocer.</p>
        </div>
        <button style={styles.btnPrimary} onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={17} /> Añadir destino</button>
      </div>

      {/* Al añadir, el formulario aparece inmediatamente debajo del encabezado, no al final de la página. */}
      {showForm && !editing && (
        <div ref={formRef} style={{ marginBottom: 20 }}>
          <DestinoForm
            initial={emptyForm}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onSave={guardar}
            isEdit={false}
            saving={saving}
            inline
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {[['todos', 'Todos'], ['pendiente', 'Pendientes'], ['objetivo', 'Objetivo'], ['realizado', 'Realizados']].map(([v, l]) => (
          <TabPill key={v} active={filtroEstado === v} onClick={() => setFiltroEstado(v)} label={l} />
        ))}
      </div>

      {visibles.length === 0 ? (
        <EmptyState icon={MapPin} title="Todavía no tenemos destinos guardados" text="Añadamos algunos lugares que nos gustaría conocer." actionLabel="Añadir destino" onAction={() => { setEditing(null); setShowForm(true); }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 16 }}>
          {visibles.map((d) => (
            <React.Fragment key={d.id}>
              {showForm && editing?.id === d.id && (
                <div ref={formRef} style={{ gridColumn: "1 / -1" }}>
                  <DestinoForm
                    initial={editing}
                    onCancel={() => { setShowForm(false); setEditing(null); }}
                    onSave={guardar}
                    isEdit
                    saving={saving}
                    inline
                  />
                </div>
              )}

              {recomendacionesDestinoId === d.id && (
                <div ref={recomendacionesRef} style={{ gridColumn: "1 / -1", scrollMarginTop: 20 }}>
                  <RecomendacionesModal
                    destino={d}
                    persist={persist}
                    showToast={showToast}
                    onClose={() => setRecomendacionesDestinoId(null)}
                    inline
                  />
                </div>
              )}

              <div style={{ ...styles.card, padding: 0, overflow: "hidden" }} className="card-hover">
                <div style={{ position: "relative", height: 140 }}>
                  <img src={d.imagen} alt={d.ciudad} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => (e.target.style.background = C.paperAlt)} />
                  <button onClick={() => toggleFav(d)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.85)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Heart size={16} fill={d.favorito ? C.clay : "none"} color={C.clay} />
                  </button>
                  <div style={{ position: "absolute", top: 10, left: 10 }}><EstadoBadge estado={d.estado} /></div>
                </div>
                <div style={{ padding: 16 }}>
                  <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, margin: "0 0 2px" }}>{flagEmoji(d.pais)} {d.ciudad}</p>
                  <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 10px" }}>{d.pais} · {d.dentroPeninsula ? "Dentro de península" : "Fuera de península"}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 12 }}>
                    <span>💶 {eur(d.presupuesto)}</span>
                    <span>🗓️ {d.duracion} días</span>
                  </div>
                  {d.lat == null && (
                    <p style={{ fontSize: 11.5, color: C.clay, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 5 }}>
                      <AlertCircle size={13} /> Sin ubicación en el mapa
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={{ ...styles.btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={() => { setEditing(d); setShowForm(true); }}><Pencil size={13} /> Editar</button>
                    <button style={{ ...styles.btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={() => setRecomendacionesDestinoId(d.id)}><StickyNote size={13} /> Recomendaciones {d.recomendaciones?.length ? `(${d.recomendaciones.length})` : ""}</button>
                    {d.lat != null && (
                      <button style={{ ...styles.btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={() => onVerEnMapa && onVerEnMapa(d)}><MapIcon size={13} /> Ver en el mapa</button>
                    )}
                    {d.estado !== "realizado" && (
                      <button style={{ ...styles.btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={() => setMarcarViaje(d)}><Plane size={13} /> Marcar viajado</button>
                    )}
                    <button style={{ ...styles.btnGhost, padding: "7px 12px", fontSize: 12.5, borderColor: C.clay, color: C.clay }} onClick={() => setToDelete(d)}><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ marginTop: 30, textAlign: "center" }}>
        <button onClick={resetDemo} style={{ background: "none", border: "none", color: C.inkSoft, fontSize: 12.5, textDecoration: "underline" }}>
          Restaurar datos de ejemplo (elimina todo lo actual)
        </button>
      </div>

      {toDelete && <Confirm text={`¿Eliminar ${toDelete.ciudad}? Esta acción no se puede deshacer.`} onConfirm={eliminar} onCancel={() => setToDelete(null)} />}
      {marcarViaje && <MarcarViajeModal destino={marcarViaje} persist={persist} showToast={showToast} onClose={() => setMarcarViaje(null)} />}
    </div>
  );
}

function RecomendacionesModal({ destino, persist, showToast, onClose, inline = false }) {
  const recomendaciones = destino.recomendaciones || [];
  const [form, setForm] = useState({ titulo: "", categoria: "Visitar", recomendadoPor: "", nota: "", ubicacion: "" });
  const [adding, setAdding] = useState(false);

  const categorias = ["Visitar", "Comer", "Café", "Copas", "Naturaleza", "Compras", "Alojamiento", "Actividad", "Otro"];

  const guardar = () => {
    if (!form.titulo.trim()) return;
    const nueva = { id: uid(), ...form, estado: "pendiente" };
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.map((d) => d.id === destino.id
        ? { ...d, recomendaciones: [...(d.recomendaciones || []), nueva] }
        : d),
    }));
    setForm({ titulo: "", categoria: "Visitar", recomendadoPor: "", nota: "", ubicacion: "" });
    setAdding(false);
    showToast("Recomendación guardada 💌");
  };

  const cambiarEstado = (recId, estado) => {
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.map((d) => d.id === destino.id
        ? { ...d, recomendaciones: (d.recomendaciones || []).map((r) => r.id === recId ? { ...r, estado } : r) }
        : d),
    }));
  };

  const eliminar = (recId) => {
    persist((prev) => ({
      ...prev,
      destinos: prev.destinos.map((d) => d.id === destino.id
        ? { ...d, recomendaciones: (d.recomendaciones || []).filter((r) => r.id !== recId) }
        : d),
    }));
    showToast("Recomendación eliminada");
  };

  return (
    <Modal title={`💌 Recomendaciones · ${destino.ciudad}`} onClose={onClose} width={620} inline={inline}>
      <p style={{ ...styles.sub, marginTop: -8, marginBottom: 18 }}>
        Guardad aquí restaurantes, sitios, actividades o consejos que os hayan recomendado para este destino.
      </p>

      {!adding && (
        <button style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center", marginBottom: 18 }} onClick={() => setAdding(true)}>
          <Plus size={16} /> Añadir recomendación
        </button>
      )}

      {adding && (
        <div style={{ background: C.paperAlt, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <Field label="¿Qué os han recomendado?">
            <input autoFocus style={styles.input} value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Trattoria, mirador, playa…" />
          </Field>
          <Field label="Categoría">
            <select style={styles.input} value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="¿Quién os lo recomendó? (opcional)">
            <input style={styles.input} value={form.recomendadoPor} onChange={(e) => setForm((f) => ({ ...f, recomendadoPor: e.target.value }))} placeholder="Sergio, Ana, TikTok…" />
          </Field>
          <Field label="Ubicación o dirección (opcional)">
            <input style={styles.input} value={form.ubicacion} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} placeholder="Trastevere, Roma" />
          </Field>
          <Field label="Notas">
            <textarea style={{ ...styles.input, minHeight: 86, resize: "vertical" }} value={form.nota} onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))} placeholder="¿Qué os dijeron? ¿Qué no debemos olvidar?" />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={styles.btnGhost} onClick={() => setAdding(false)}>Cancelar</button>
            <button style={styles.btnPrimary} onClick={guardar} disabled={!form.titulo.trim()}><Check size={15} /> Guardar</button>
          </div>
        </div>
      )}

      {recomendaciones.length === 0 ? (
        <div style={{ textAlign: "center", padding: "22px 10px", color: C.inkSoft }}>
          <StickyNote size={30} style={{ marginBottom: 8, opacity: 0.55 }} />
          <p style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 18, color: C.ink }}>Todavía no tenéis recomendaciones</p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>Cuando alguien os recomiende un sitio, guardadlo aquí 💌</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {recomendaciones.map((r) => (
            <div key={r.id} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>{r.estado === "visitado" ? "🟢" : r.estado === "no" ? "🔴" : "🟡"} {r.titulo}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.inkSoft }}>{r.categoria}{r.recomendadoPor ? ` · Recomendado por ${r.recomendadoPor}` : ""}</p>
                </div>
                <button onClick={() => eliminar(r.id)} style={{ background: "none", border: "none", color: C.clay, padding: 3 }} title="Eliminar"><Trash2 size={15} /></button>
              </div>
              {r.ubicacion && <p style={{ margin: "9px 0 0", fontSize: 12.5, color: C.teal }}>📍 {r.ubicacion}</p>}
              {r.nota && <p style={{ margin: "9px 0 0", fontSize: 13.5, lineHeight: 1.5, color: C.inkSoft }}>{r.nota}</p>}
              <div style={{ display: "flex", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
                <button onClick={() => cambiarEstado(r.id, "pendiente")} style={{ ...styles.btnGhost, padding: "5px 9px", fontSize: 11.5, opacity: r.estado === "pendiente" ? 1 : 0.65 }}>🟡 Pendiente</button>
                <button onClick={() => cambiarEstado(r.id, "visitado")} style={{ ...styles.btnGhost, padding: "5px 9px", fontSize: 11.5, opacity: r.estado === "visitado" ? 1 : 0.65 }}>🟢 Visitado</button>
                <button onClick={() => cambiarEstado(r.id, "no")} style={{ ...styles.btnGhost, padding: "5px 9px", fontSize: 11.5, opacity: r.estado === "no" ? 1 : 0.65 }}>🔴 No nos gustó</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function DestinoForm({ initial, onSave, onCancel, isEdit, saving, inline = false }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validar = () => {
    const e = {};
    if (!form.ciudad.trim()) e.ciudad = "Indica la ciudad";
    if (!form.pais.trim()) e.pais = "Indica el país";
    if (!form.presupuesto || Number(form.presupuesto) <= 0) e.presupuesto = "Presupuesto no válido";
    if (!form.duracion || Number(form.duracion) <= 0) e.duracion = "Duración no válida";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      set("imagen", dataUrl);
    } catch (err) {
      console.error(err);
      setUploadError("No se pudo cargar esa imagen. Prueba con otra foto.");
    }
    setUploading(false);
  };

  return (
    <Modal title={isEdit ? "Editar destino" : "Añadir destino"} onClose={onCancel} inline={inline}>
      <Field label="Ciudad" error={errors.ciudad}>
        <input style={styles.input} value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Roma" />
      </Field>
      <Field label="País" error={errors.pais}>
        <input style={styles.input} value={form.pais} onChange={(e) => set("pais", e.target.value)} placeholder="Italia" />
      </Field>
      <Field label="Imagen">
        <input
          id="destino-imagen-input"
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
        />
        {form.imagen && (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <img src={form.imagen} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12 }} />
            <button type="button" onClick={() => set("imagen", "")} style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          </div>
        )}
        <label htmlFor="destino-imagen-input" style={{ ...styles.btnGhost, width: "100%", justifyContent: "center", opacity: uploading ? 0.7 : 1, pointerEvents: uploading ? "none" : "auto" }}>
          <Camera size={16} /> {uploading ? "Cargando…" : form.imagen ? "Cambiar foto" : "Subir foto"}
        </label>
        {uploadError && <p style={{ color: C.clay, fontSize: 12, marginTop: 6 }}>{uploadError}</p>}
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Presupuesto mínimo (€)" error={errors.presupuesto} grow>
          <input type="number" style={styles.input} value={form.presupuesto} onChange={(e) => set("presupuesto", e.target.value)} placeholder="750" />
        </Field>
        <Field label="Duración (días)" error={errors.duracion} grow>
          <input type="number" style={styles.input} value={form.duracion} onChange={(e) => set("duracion", e.target.value)} placeholder="4" />
        </Field>
      </div>
      <Field label="Ubicación">
        <div style={{ display: "flex", gap: 10 }}>
          <TabPill active={!form.dentroPeninsula} onClick={() => set("dentroPeninsula", false)} label="Fuera de la península" />
          <TabPill active={form.dentroPeninsula} onClick={() => set("dentroPeninsula", true)} label="Dentro de la península" />
        </div>
      </Field>
      <div style={{ margin: "14px 0" }}>
        <Checkbox label="Marcar como favorito ♡" checked={form.favorito} onChange={(v) => set("favorito", v)} />
      </div>
      <button disabled={saving} style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center", marginTop: 6, opacity: saving ? 0.75 : 1 }} onClick={() => validar() && onSave({
        ...form, presupuesto: Number(form.presupuesto), duracion: Number(form.duracion),
      })}>
        {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Añadir destino"}
      </button>
    </Modal>
  );
}

function Field({ label, error, children, grow }) {
  return (
    <div style={{ marginBottom: 14, flex: grow ? 1 : undefined }}>
      <label style={styles.label}>{label}</label>
      {children}
      {error && <p style={{ color: C.clay, fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function MarcarViajeModal({ destino, persist, showToast, onClose }) {
  const [form, setForm] = useState({ fechaInicio: todayISO(), fechaFin: todayISO(), gastoReal: destino.presupuesto, valoracion: 5, notas: "", fotos: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = () => {
    const year = new Date(form.fechaInicio).getFullYear();
    const viaje = {
      id: uid(), destinoId: destino.id, ciudad: destino.ciudad, pais: destino.pais, imagen: destino.imagen,
      fechaInicio: form.fechaInicio, fechaFin: form.fechaFin, presupuestoEstimado: destino.presupuesto,
      gastoReal: Number(form.gastoReal) || 0, valoracion: Number(form.valoracion),
      notas: form.notas, fotos: form.fotos.split(",").map((s) => s.trim()).filter(Boolean), year,
    };
    persist((prev) => ({
      ...prev,
      viajes: [viaje, ...prev.viajes],
      destinos: prev.destinos.map((d) => (d.id === destino.id ? { ...d, estado: "realizado" } : d)),
    }));
    showToast(`✈️ ¡${destino.ciudad} marcado como realizado!`);
    onClose();
  };

  return (
    <Modal title={`Marcar ${destino.ciudad} como viajado`} onClose={onClose}>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Fecha de inicio" grow><input type="date" style={styles.input} value={form.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} /></Field>
        <Field label="Fecha de fin" grow><input type="date" style={styles.input} value={form.fechaFin} onChange={(e) => set("fechaFin", e.target.value)} /></Field>
      </div>
      <Field label="Gasto real (€)"><input type="number" style={styles.input} value={form.gastoReal} onChange={(e) => set("gastoReal", e.target.value)} /></Field>
      <Field label="Valoración">
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => set("valoracion", n)} style={{ background: "none", border: "none", padding: 2 }}>
              <Star size={24} fill={n <= form.valoracion ? C.amber : "none"} color={C.amber} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Notas del viaje"><textarea style={{ ...styles.input, minHeight: 80 }} value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="¿Qué tal fue?" /></Field>
      <Field label="Fotos (URLs separadas por comas)"><input style={styles.input} value={form.fotos} onChange={(e) => set("fotos", e.target.value)} placeholder="https://…, https://…" /></Field>
      <button style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center", marginTop: 6 }} onClick={guardar}>Guardar viaje realizado</button>
    </Modal>
  );
}

/* ============================================================
   NUESTRO MAPA
============================================================ */
function destinoIcon(estado) {
  const color = estado === "objetivo" ? C.amber : estado === "realizado" ? C.teal : C.clay;
  const emoji = estado === "realizado" ? "✈️" : estado === "objetivo" ? "🎯" : "💭";
  const pulse = estado === "objetivo"
    ? `<span style="position:absolute;inset:-6px;border-radius:50%;background:${color};opacity:.4;animation:mapPulse 1.8s ease-out infinite;"></span>`
    : "";
  const html = `
    <div style="position:relative;width:30px;height:30px;">
      ${pulse}
      <div style="position:relative;width:30px;height:30px;border-radius:50% 50% 50% 0;background:${color};border:2.5px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(34,50,44,.35);display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:13px;">${emoji}</span>
      </div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [30, 30], iconAnchor: [15, 29], popupAnchor: [0, -26] });
}

function FitBounds({ destinos }) {
  const map = useMap();
  const key = destinos.map((d) => d.id).join(",");
  useEffect(() => {
    if (!destinos.length) { map.setView([40.4168, -3.7038], 4); return; }
    if (destinos.length === 1) { map.setView([destinos[0].lat, destinos[0].lng], 11); return; }
    map.fitBounds(destinos.map((d) => [d.lat, d.lng]), { padding: [42, 42], maxZoom: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function FlyToFocus({ focusId, destinos, markerRefs, onDone }) {
  const map = useMap();
  useEffect(() => {
    if (!focusId) return;
    const d = destinos.find((x) => x.id === focusId);
    if (d && d.lat != null) {
      map.flyTo([d.lat, d.lng], 13, { duration: 0.9 });
      window.setTimeout(() => {
        const marker = markerRefs.current[d.id];
        if (marker) marker.openPopup();
      }, 950);
    }
    onDone && onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  return null;
}

function LeyendaItem({ emoji, label }) {
  return (
    <span style={{ fontSize: 12.5, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 15 }}>{emoji}</span>{label}
    </span>
  );
}

function MapaPage({ data, persist, showToast, focusId, onFocusHandled, onVerDestino }) {
  const destinos = data.destinos;
  const { minGlobal, maxGlobal } = useMemo(() => {
    const p = destinos.map((d) => d.presupuesto);
    return { minGlobal: p.length ? Math.min(...p) : 0, maxGlobal: p.length ? Math.max(...p) : 1500 };
  }, [destinos]);

  const [minB, setMinB] = useState(minGlobal);
  const [maxB, setMaxB] = useState(maxGlobal);
  useEffect(() => { setMinB(minGlobal); setMaxB(maxGlobal); }, [minGlobal, maxGlobal]);
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [geo, setGeo] = useState("todos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const markerRefs = useRef({});

  const filtrados = useMemo(() => destinos.filter((d) => {
    if (estadoFiltro !== "todos" && d.estado !== estadoFiltro) return false;
    if (geo === "peninsula" && !d.dentroPeninsula) return false;
    if (geo === "fuera" && d.dentroPeninsula) return false;
    if (d.presupuesto < minB || d.presupuesto > maxB) return false;
    return true;
  }), [destinos, estadoFiltro, geo, minB, maxB]);

  const conCoords = filtrados.filter((d) => d.lat != null && d.lng != null);
  const sinCoords = destinos.filter((d) => d.lat == null || d.lng == null);
  const paisesVisitados = useMemo(() => new Set(data.viajes.map((v) => v.pais)).size, [data.viajes]);

  const buscarFaltantes = async () => {
    setBuscando(true);
    let actualizados = 0;
    for (const d of sinCoords) {
      const found = await geocodeCiudad(d.ciudad, d.pais);
      if (found) {
        persist((prev) => ({ ...prev, destinos: prev.destinos.map((x) => (x.id === d.id ? { ...x, ...found } : x)) }));
        actualizados++;
      }
      await new Promise((r) => window.setTimeout(r, 1100)); // respeta el límite de peticiones de Nominatim
    }
    setBuscando(false);
    showToast(actualizados ? `📍 Ubicación añadida a ${actualizados} destino${actualizados !== 1 ? "s" : ""}` : "No se encontraron ubicaciones nuevas");
  };

  return (
    <div className="fade-up">
      <h1 style={styles.h1}>🗺️ Nuestro mapa</h1>
      <p style={{ ...styles.sub, marginBottom: 18 }}>Todos vuestros destinos, de un vistazo.</p>

      <p style={{ ...styles.sub, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 12.5, marginBottom: 8 }}>
        Nuestro mundo 🌍
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard icon="🌍" label="Destinos guardados" value={destinos.length} />
        <StatCard icon="🧭" label="Países visitados" value={paisesVisitados} />
        <StatCard icon="💭" label="Pendientes" value={destinos.filter((d) => d.estado === "pendiente").length} />
        <StatCard icon="✈️" label="Realizados" value={destinos.filter((d) => d.estado === "realizado").length} />
      </div>

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ ...styles.label, marginBottom: 0 }}>Filtros</label>
          <button onClick={() => setFiltersOpen((v) => !v)} style={{ background: "none", border: "none", color: C.teal, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            {filtersOpen ? "Ocultar" : "Mostrar"} <ChevronDown size={14} style={{ transform: filtersOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
        </div>
        {filtersOpen && (
          <div style={{ marginTop: 14 }} className="fade-up">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[["todos", "Todos"], ["pendiente", "💭 Pendientes"], ["objetivo", "🎯 Objetivo"], ["realizado", "✈️ Realizados"]].map(([v, l]) => (
                <TabPill key={v} active={estadoFiltro === v} onClick={() => setEstadoFiltro(v)} label={l} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {[["todos", "Todos"], ["peninsula", "Península"], ["fuera", "Fuera de península"]].map(([v, l]) => (
                <TabPill key={v} active={geo === v} onClick={() => setGeo(v)} label={l} />
              ))}
            </div>
            <label style={styles.label}>Presupuesto</label>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>
              <span>{eur(minB)}</span><span>{eur(maxB)}</span>
            </div>
            <div className="range-overlay">
              <input type="range" min={minGlobal} max={maxGlobal} value={minB} onChange={(e) => setMinB(Math.min(Number(e.target.value), maxB))} />
              <input type="range" min={minGlobal} max={maxGlobal} value={maxB} onChange={(e) => setMaxB(Math.max(Number(e.target.value), minB))} />
              <div style={{ position: "absolute", top: 16, left: 9, right: 9, height: 4, background: C.paperAlt, borderRadius: 4 }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: C.teal,
                  left: `${((minB - minGlobal) / Math.max(1, maxGlobal - minGlobal)) * 100}%`,
                  right: `${100 - ((maxB - minGlobal) / Math.max(1, maxGlobal - minGlobal)) * 100}%`,
                }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", color: C.inkSoft, fontSize: 14, margin: "16px 0 10px" }}>
        🌍 {filtrados.length} destino{filtrados.length !== 1 ? "s" : ""}
      </p>

      <div style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${C.line}`, height: "min(60vh, 500px)" }}>
        <MapContainer center={[40.4168, -3.7038]} zoom={4} style={{ width: "100%", height: "100%" }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds destinos={conCoords} />
          <FlyToFocus focusId={focusId} destinos={conCoords} markerRefs={markerRefs} onDone={onFocusHandled} />
          {conCoords.map((d) => (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              icon={destinoIcon(d.estado)}
              ref={(ref) => { if (ref) markerRefs.current[d.id] = ref; }}
            >
              <Popup minWidth={220} maxWidth={240}>
                {d.imagen ? (
                  <img src={d.imagen} alt={d.ciudad} style={{ width: "100%", height: 105, objectFit: "cover", borderRadius: 10, marginBottom: 8, display: "block" }} onError={(e) => (e.target.style.display = "none")} />
                ) : (
                  <div style={{ width: "100%", height: 90, borderRadius: 10, marginBottom: 8, background: C.paperAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🌍</div>
                )}
                <p style={{ margin: "0 0 2px", fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 600 }}>{flagEmoji(d.pais)} {d.ciudad}</p>
                <p style={{ margin: "0 0 6px", fontSize: 12.5, color: C.inkSoft }}>{d.pais}</p>
                <p style={{ margin: "0 0 2px", fontSize: 13 }}>💰 Desde {eur(d.presupuesto)}</p>
                <p style={{ margin: "0 0 8px", fontSize: 13 }}>🗓️ {d.duracion} días</p>
                <div style={{ marginBottom: 10 }}><EstadoBadge estado={d.estado} /></div>
                <button onClick={() => onVerDestino(d.id)} style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center", padding: "8px 14px", fontSize: 13 }}>
                  Ver destino <ArrowRight size={14} />
                </button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
        <LeyendaItem emoji="💭" label="Pendiente" />
        <LeyendaItem emoji="🎯" label="Objetivo" />
        <LeyendaItem emoji="✈️" label="Realizado" />
      </div>

      {sinCoords.length > 0 && (
        <div style={{ ...styles.card, marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 13.5, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={16} color={C.clay} /> {sinCoords.length} destino{sinCoords.length !== 1 ? "s" : ""} todavía no {sinCoords.length !== 1 ? "tienen" : "tiene"} ubicación en el mapa.
          </p>
          <button onClick={buscarFaltantes} disabled={buscando} style={{ ...styles.btnGhost, opacity: buscando ? 0.7 : 1 }}>
            {buscando ? "Buscando…" : "Buscar ubicaciones"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   AHORRO
============================================================ */
function Ahorro({ data, persist, showToast, setTab }) {
  const destino = data.destinos.find((d) => d.estado === "objetivo");
  const [showForm, setShowForm] = useState(false);

  if (!destino) {
    return (
      <div className="fade-up">
        <h1 style={styles.h1}>💰 Ahorro</h1>
        <p style={{ ...styles.sub, marginBottom: 20 }}>Vuestro fondo compartido para el próximo viaje.</p>
        <EmptyState icon={PiggyBank} title="Todavía no tenemos ningún viaje como objetivo" text="Elige un destino y empieza a ahorrar para él." actionLabel="Ir a la ruleta" onAction={() => setTab("ruleta")} />
      </div>
    );
  }

  const aportaciones = data.aportaciones.filter((a) => a.destinoId === destino.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = aportaciones.reduce((s, a) => s + a.cantidad, 0);
  const restante = Math.max(0, destino.presupuesto - total);
  const pct = Math.min(100, (total / destino.presupuesto) * 100);
  const conseguido = total >= destino.presupuesto;

  const proyeccion = useMemo(() => {
    if (aportaciones.length < 2) return null;
    const ordenadas = [...aportaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const first = new Date(ordenadas[0].fecha);
    const last = new Date();
    const meses = Math.max(1, (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1);
    const media = total / meses;
    if (media <= 0) return null;
    const mesesRestantes = Math.ceil(restante / media);
    const fechaObjetivo = new Date(last.getFullYear(), last.getMonth() + mesesRestantes, 1);
    return { media, fechaObjetivo };
  }, [aportaciones, total, restante]);

  const añadir = (form) => {
    const ap = { id: uid(), destinoId: destino.id, cantidad: Number(form.cantidad), fecha: form.fecha, nota: form.nota };
    persist((prev) => ({ ...prev, aportaciones: [ap, ...prev.aportaciones] }));
    showToast(`+ ${eur(ap.cantidad)} añadidos al ahorro 🎉`);
    setShowForm(false);
  };

  const marcarListo = () => showToast("¡Genial! Ve a Destinos y pulsa \"Marcar viajado\" cuando volváis 🧳");

  return (
    <div className="fade-up">
      <h1 style={styles.h1}>💰 Ahorro</h1>
      <p style={{ ...styles.sub, marginBottom: 20 }}>Vuestro fondo compartido para el próximo viaje.</p>

      <div style={{ ...styles.card, background: `linear-gradient(135deg, ${C.tealDark}, ${C.teal})`, color: "#fff" }}>
        <p style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: 1, opacity: 0.8, margin: "0 0 6px" }}>🎯 Objetivo</p>
        <p style={{ fontFamily: "Fraunces, serif", fontSize: 26, margin: "0 0 2px" }}>{flagEmoji(destino.pais)} {destino.ciudad}</p>
        <p style={{ fontSize: 14, opacity: 0.85, margin: "0 0 14px" }}>Presupuesto objetivo: {eur(destino.presupuesto)}</p>
        <div style={{ height: 14, background: "rgba(255,255,255,0.2)", borderRadius: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.amber, borderRadius: 20, transition: "width .6s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginTop: 8 }}>
          <span>Ahorrado: {eur(total)}</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        {conseguido ? (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 14 }} className="pop">
            <p style={{ margin: 0, fontWeight: 700 }}>🎉 ¡Objetivo de ahorro conseguido!</p>
            <button onClick={marcarListo} style={{ ...styles.btnPrimary, background: C.amber, color: "#3A2A0E", marginTop: 10 }}>Listo para viajar ✈️</button>
          </div>
        ) : (
          <p style={{ fontSize: 13.5, marginTop: 10, opacity: 0.9 }}>Faltan {eur(restante)}</p>
        )}
        <button onClick={() => setShowForm(true)} style={{ ...styles.btnPrimary, background: "#fff", color: C.teal, marginTop: 16 }}><Plus size={16} /> Añadir aportación</button>
      </div>

      {proyeccion && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <p style={{ fontSize: 13.5, color: C.inkSoft, margin: 0 }}>
            Si mantenéis vuestro ritmo actual de ahorro, alcanzaréis el objetivo aproximadamente en{" "}
            <strong style={{ color: C.ink }}>{monthYear(proyeccion.fechaObjetivo)}</strong>.
          </p>
          <p style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 6 }}>Media mensual: {eur(proyeccion.media)} · estimación orientativa</p>
        </div>
      )}

      <h2 style={{ ...styles.h2, marginTop: 26 }}>Historial de ahorro</h2>
      {aportaciones.length === 0 ? (
        <p style={{ color: C.inkSoft, fontSize: 14 }}>Todavía no hay aportaciones registradas.</p>
      ) : (
        <div style={styles.card}>
          {aportaciones.map((a, i) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < aportaciones.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{fmtDate(a.fecha)}</p>
                {a.nota && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: C.inkSoft }}>{a.nota}</p>}
              </div>
              <p style={{ margin: 0, fontWeight: 700, color: C.teal, fontSize: 15 }}>+ {eur(a.cantidad)}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Añadir aportación" onClose={() => setShowForm(false)} width={420}>
          <AportacionForm onSave={añadir} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}

function AportacionForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ cantidad: "", fecha: todayISO(), nota: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState("");
  return (
    <div>
      <Field label="Cantidad (€)" error={error}>
        <input type="number" style={styles.input} value={form.cantidad} onChange={(e) => set("cantidad", e.target.value)} placeholder="100" />
      </Field>
      <Field label="Fecha"><input type="date" style={styles.input} value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
      <Field label="Nota (opcional)"><input style={styles.input} value={form.nota} onChange={(e) => set("nota", e.target.value)} placeholder="Aportación mensual" /></Field>
      <button style={{ ...styles.btnPrimary, width: "100%", justifyContent: "center" }} onClick={() => {
        if (!form.cantidad || Number(form.cantidad) <= 0) return setError("Introduce una cantidad válida");
        onSave(form);
      }}>Guardar aportación</button>
    </div>
  );
}

/* ============================================================
   VIAJES REALIZADOS
============================================================ */
function ViajesRealizados({ data, showToast }) {
  const [detalle, setDetalle] = useState(null);
  const porAnio = useMemo(() => {
    const m = {};
    data.viajes.forEach((v) => { (m[v.year] = m[v.year] || []).push(v); });
    return Object.entries(m).sort((a, b) => b[0] - a[0]);
  }, [data.viajes]);

  return (
    <div className="fade-up">
      <h1 style={styles.h1}>✈️ Nuestros viajes</h1>
      <p style={{ ...styles.sub, marginBottom: 20 }}>El álbum de todo lo que ya habéis vivido juntos.</p>

      {data.viajes.length === 0 ? (
        <EmptyState icon={Plane} title="Todavía no habéis registrado ningún viaje" text="Cuando volváis de un viaje, marcadlo como realizado desde Destinos para guardarlo aquí." />
      ) : (
        porAnio.map(([year, viajes]) => (
          <div key={year} style={{ marginBottom: 26 }}>
            <h2 style={styles.h2}>{year}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 16 }}>
              {viajes.map((v) => (
                <div key={v.id} style={{ ...styles.card, padding: 0, overflow: "hidden", cursor: "pointer" }} className="card-hover" onClick={() => setDetalle(v)}>
                  <img src={v.imagen} alt={v.ciudad} style={{ width: "100%", height: 140, objectFit: "cover" }} onError={(e) => (e.target.style.display = "none")} />
                  <div style={{ padding: 16 }}>
                    <p style={{ fontFamily: "Fraunces, serif", fontSize: 18, margin: "0 0 2px" }}>{flagEmoji(v.pais)} {v.ciudad}</p>
                    <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 8px" }}>{fmtDate(v.fechaInicio)} — {fmtDate(v.fechaFin)}</p>
                    <p style={{ fontSize: 13, margin: "0 0 6px" }}>Presupuesto estimado: {eur(v.presupuestoEstimado)}</p>
                    <p style={{ fontSize: 13, margin: "0 0 8px" }}>Gasto real: {eur(v.gastoReal)}</p>
                    <div>{"⭐️".repeat(v.valoracion)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {detalle && <ViajeDetalle viaje={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function ViajeDetalle({ viaje, onClose }) {
  return (
    <Modal title={`${flagEmoji(viaje.pais)} ${viaje.ciudad}`} onClose={onClose} width={600}>
      <p style={{ color: C.inkSoft, fontSize: 13.5, marginTop: -8, marginBottom: 16 }}>
        {fmtDate(viaje.fechaInicio)} — {fmtDate(viaje.fechaFin)} · {"⭐️".repeat(viaje.valoracion)}
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
        <div><p style={styles.label}>Presupuesto estimado</p><p style={{ fontWeight: 700 }}>{eur(viaje.presupuestoEstimado)}</p></div>
        <div><p style={styles.label}>Gasto real</p><p style={{ fontWeight: 700 }}>{eur(viaje.gastoReal)}</p></div>
      </div>
      <p style={styles.label}>📝 Notas del viaje</p>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.ink, background: C.paperAlt, padding: 14, borderRadius: 12 }}>
        {viaje.notas || "Sin notas todavía."}
      </p>
      <p style={{ ...styles.label, marginTop: 16 }}>📸 Nuestros recuerdos</p>
      {viaje.fotos && viaje.fotos.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 8 }}>
          {viaje.fotos.map((f, i) => (
            <img key={i} src={f} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10 }} onError={(e) => (e.target.style.display = "none")} />
          ))}
        </div>
      ) : (
        <p style={{ color: C.inkSoft, fontSize: 13.5 }}>No se añadieron fotos a este viaje.</p>
      )}
    </Modal>
  );
}

/* ============================================================
   ESTADÍSTICAS / NUESTRO AÑO
============================================================ */
function Stats({ data }) {
  const years = useMemo(() => {
    const s = new Set(data.viajes.map((v) => v.year));
    s.add(new Date().getFullYear());
    return Array.from(s).sort((a, b) => b - a);
  }, [data.viajes]);

  const [year, setYear] = useState(years[0]);
  const viajes = data.viajes.filter((v) => v.year === year);
  const objetivoAnual = data.objetivosAnuales[year] ?? 3;

  const presupuestoTotal = viajes.reduce((s, v) => s + v.presupuestoEstimado, 0);
  const gastoTotal = viajes.reduce((s, v) => s + v.gastoReal, 0);
  const media = viajes.length ? gastoTotal / viajes.length : 0;
  const dias = viajes.reduce((s, v) => {
    const d = (new Date(v.fechaFin) - new Date(v.fechaInicio)) / 86400000 + 1;
    return s + Math.max(1, d);
  }, 0);
  const masCaro = viajes.length ? viajes.reduce((a, b) => (b.gastoReal > a.gastoReal ? b : a)) : null;
  const masBarato = viajes.length ? viajes.reduce((a, b) => (b.gastoReal < a.gastoReal ? b : a)) : null;
  const pctObjetivo = Math.min(100, Math.round((viajes.length / objetivoAnual) * 100));

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={styles.h1}>📊 Nuestro año</h1>
          <p style={styles.sub}>Estadísticas e historial de vuestros viajes.</p>
        </div>
        <div style={{ position: "relative" }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...styles.input, paddingRight: 30, appearance: "none", fontWeight: 700, width: 120 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown size={16} style={{ position: "absolute", right: 10, top: 12, pointerEvents: "none" }} />
        </div>
      </div>

      {viajes.length === 0 ? (
        <EmptyState icon={BarChart3} title={`Sin viajes registrados en ${year}`} text="Cuando completéis un viaje este año, aparecerá aquí con sus estadísticas." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard icon="✈️" label="Viajes" value={viajes.length} />
            <StatCard icon="💰" label="Gastado" value={eur(gastoTotal)} />
            <StatCard icon="📐" label="Presupuestado" value={eur(presupuestoTotal)} />
            <StatCard icon="📊" label="Media por viaje" value={eur(media)} />
            <StatCard icon="🌍" label="Días viajando" value={Math.round(dias)} />
            <StatCard icon="🎯" label="Objetivo anual" value={`${pctObjetivo}%`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
            {masCaro && (
              <div style={styles.card}>
                <p style={styles.label}>Destino más caro</p>
                <p style={{ fontFamily: "Fraunces, serif", fontSize: 19 }}>{flagEmoji(masCaro.pais)} {masCaro.ciudad} — {eur(masCaro.gastoReal)}</p>
              </div>
            )}
            {masBarato && (
              <div style={styles.card}>
                <p style={styles.label}>Destino más económico</p>
                <p style={{ fontFamily: "Fraunces, serif", fontSize: 19 }}>{flagEmoji(masBarato.pais)} {masBarato.ciudad} — {eur(masBarato.gastoReal)}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
