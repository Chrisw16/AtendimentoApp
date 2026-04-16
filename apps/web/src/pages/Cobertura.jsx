import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import { MapPin, Plus, Trash2, Search, Layers } from 'lucide-react';
import Button from '../components/ui/Button';
import styles from './Cobertura.module.css';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const TIPO_META = {
  cobertura:    { cor: '#00E5A0', label: 'Cobertura ativa' },
  expansao:     { cor: '#3B9EFF', label: 'Expansão prevista' },
  sem_sinal:    { cor: '#FF4D4D', label: 'Sem sinal' },
};

// ── CARREGA LEAFLET DINAMICAMENTE ─────────────────────────────────
async function loadLeaflet() {
  if (window.L) return window.L;

  // CSS
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel   = 'stylesheet';
    link.href  = LEAFLET_CSS;
    document.head.appendChild(link);
  }

  // JS
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src   = LEAFLET_JS;
    script.onload  = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.L;
}

// ── COBERTURA PAGE ────────────────────────────────────────────────
export default function Cobertura() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const layersRef   = useRef([]);
  const [mapReady,  setMapReady]  = useState(false);
  const [selecionada,setSelecionada]= useState(null);
  const [busca,     setBusca]     = useState('');
  const [buscaResult, setBuscaResult] = useState(null);

  // ── FETCH ZONAS ──────────────────────────────────────────────────
  const { data: zonas = [] } = useQuery({
    queryKey: ['zonas-cobertura'],
    queryFn:  () => api.get('/cobertura/zonas'),
    select:   d => d.zonas || d,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/cobertura/zonas/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['zonas-cobertura'] }); toast('Zona removida', 'info'); setSelecionada(null); },
    onError:    e  => toast(e.message, 'error'),
  });

  // ── INICIALIZA MAPA ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    loadLeaflet().then(L => {
      if (!mounted || !mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current, {
        center:  [-5.8, -35.2],   // Centro RN
        zoom:    11,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      mapInstance.current = map;
      setMapReady(true);
    }).catch(e => console.error('[Mapa] Erro ao carregar Leaflet:', e));

    return () => { mounted = false; };
  }, []);

  // ── RENDERIZA ZONAS NO MAPA ───────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !window.L) return;
    const L   = window.L;
    const map = mapInstance.current;

    // Remove layers anteriores
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    zonas.forEach(zona => {
      if (!zona.geojson) return;
      const meta = TIPO_META[zona.tipo] || TIPO_META.cobertura;
      const geoJSON = typeof zona.geojson === 'string' ? JSON.parse(zona.geojson) : zona.geojson;

      const layer = L.geoJSON(geoJSON, {
        style: {
          color:       meta.cor,
          fillColor:   meta.cor,
          fillOpacity: selecionada?.id === zona.id ? 0.45 : 0.20,
          weight:      selecionada?.id === zona.id ? 2.5  : 1.5,
        },
      }).addTo(map);

      layer.on('click', () => setSelecionada(zona));
      layersRef.current.push(layer);
    });
  }, [zonas, mapReady, selecionada?.id]);

  // ── BUSCA DE ENDEREÇO ─────────────────────────────────────────────
  const buscarEndereco = async () => {
    if (!busca.trim()) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(busca + ', RN, Brasil')}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      const [resultado] = await res.json();
      if (resultado) {
        const { lat, lon, display_name } = resultado;
        setBuscaResult({ lat: parseFloat(lat), lon: parseFloat(lon), nome: display_name });
        mapInstance.current?.setView([lat, lon], 14);

        // Pino temporário
        const L = window.L;
        if (L && mapInstance.current) {
          L.marker([lat, lon]).addTo(mapInstance.current)
            .bindPopup(display_name.split(',')[0])
            .openPopup();
        }
      } else {
        toast('Endereço não encontrado', 'warning');
      }
    } catch {
      toast('Erro ao buscar endereço', 'error');
    }
  };

  const zonasFiltradas = busca
    ? zonas.filter(z => z.nome?.toLowerCase().includes(busca.toLowerCase()))
    : zonas;

  return (
    <div className={styles.root}>
      {/* ── SIDEBAR ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Zonas de cobertura</h2>
          <span className={styles.zonaCount}>{zonas.length} zona{zonas.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Busca de endereço */}
        <div className={styles.buscaWrap}>
          <div className={styles.buscaInput}>
            <Search size={12} className={styles.buscaIcon} />
            <input
              type="text"
              className={styles.buscaField}
              placeholder="Verificar endereço..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarEndereco()}
            />
          </div>
          <Button variant="accent" size="sm" onClick={buscarEndereco} icon={Search} aria-label="Buscar" />
        </div>

        {/* Lista de zonas */}
        <div className={styles.zonaLista}>
          {zonas.length === 0 ? (
            <div className={styles.zonaEmpty}>
              <MapPin size={24} className={styles.zonaEmptyIcon} />
              <p>Nenhuma zona cadastrada</p>
              <p className={styles.zonaEmptyHint}>Desenhe zonas no mapa</p>
            </div>
          ) : zonas.map(zona => {
            const meta = TIPO_META[zona.tipo] || TIPO_META.cobertura;
            return (
              <button
                key={zona.id}
                className={[styles.zonaItem, selecionada?.id === zona.id && styles.zonaItemSel].join(' ')}
                onClick={() => setSelecionada(zona.id === selecionada?.id ? null : zona)}
              >
                <span className={styles.zonaDot} style={{ background: meta.cor }} />
                <div className={styles.zonaInfo}>
                  <p className={styles.zonaNome}>{zona.nome}</p>
                  <p className={styles.zonaTipo}>{meta.label}</p>
                </div>
                {selecionada?.id === zona.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={e => { e.stopPropagation(); if (confirm('Remover zona?')) deleteMut.mutate(zona.id); }}
                    aria-label="Remover zona"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legenda */}
        <div className={styles.legenda}>
          <p className={styles.legendaTitle}>Legenda</p>
          {Object.entries(TIPO_META).map(([tipo, meta]) => (
            <div key={tipo} className={styles.legendaItem}>
              <span className={styles.legendaDot} style={{ background: meta.cor }} />
              <span className={styles.legendaLabel}>{meta.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── MAPA ── */}
      <div className={styles.mapWrap}>
        <div ref={mapRef} className={styles.map} />
        {!mapReady && (
          <div className={styles.mapLoading}>
            <span className="spinner spinner-lg" />
            <p>Carregando mapa...</p>
          </div>
        )}
      </div>
    </div>
  );
}
