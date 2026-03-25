import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

// ── Loader idempotente — nunca duplica scripts ────────────────────────────────
let _lReady = false;
let _lQueue = [];
function loadLeaflet(cb) {
  if (_lReady && window.L?.Draw) { cb(window.L); return; }
  _lQueue.push(cb);
  if (document.getElementById('lf-js')) return;
  const addCss = (h, id) => { if (document.getElementById(id)) return; const l=document.createElement('link'); l.rel='stylesheet'; l.href=h; l.id=id; document.head.appendChild(l); };
  addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','lf-css');
  addCss('https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css','lfd-css');
  const s1=document.createElement('script'); s1.id='lf-js'; s1.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  s1.onload=()=>{
    const s2=document.createElement('script'); s2.id='lfd-js'; s2.src='https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js';
    s2.onload=()=>{ _lReady=true; _lQueue.forEach(f=>f(window.L)); _lQueue=[]; };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

const TIPOS = [
  { value:'cobertura', label:'✅ Cobertura ativa',       cor:'#00c896' },
  { value:'expansao',  label:'🔜 Expansão prevista',     cor:'#f59e0b' },
  { value:'sem_sinal', label:'❌ Sem sinal (bloqueada)', cor:'#ef4444' },
];
const NATAL = [-5.7945, -35.2110];
const LB = { fontSize:'.72rem', color:'var(--muted)', fontWeight:600, display:'block', marginBottom:4 };

export default function Cobertura() {
  const showToast = useStore(s => s.showToast);
  const mapDiv    = useRef(null);
  const mapInst   = useRef(null);
  const drawn     = useRef(null);
  const zLayers   = useRef({});
  const mapOk     = useRef(false);
  const [mapReady, setMapReady] = useState(false); // dispara re-render quando Leaflet inicia

  const [zonas,    setZonas]    = useState([]);
  const [cidades,  setCidades]  = useState([]);
  const [planos,   setPlanos]   = useState([]);
  const [consults, setConsults] = useState([]);
  const [loading,  setLoading]  = useState(true);  // só no 1º carregamento — desmonta UI
  const [saving,   setSaving]   = useState(false); // recargas após salvar — silencioso
  const [tab,      setTab]      = useState('mapa');
  const [modal,    setModal]    = useState(null);
  const [testQ,    setTestQ]    = useState('');
  const [testRes,  setTestRes]  = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [impBusy,  setImpBusy]  = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef(null);

  // ── Dados ─────────────────────────────────────────────────────────────────
  const _loaded = useRef(false);
  const load = useCallback(async (silent=false) => {
    // Só mostra skeleton no 1º carregamento — recargas após salvar são silenciosas
    if (!silent && !_loaded.current) setLoading(true);
    if (silent) setSaving(true);
    try {
      const [z,ci,p,q] = await Promise.all([
        apiJson('/api/zonas'),
        apiJson('/api/cidades'),
        apiJson('/api/planos'),
        apiJson('/api/zonas/consultas?dias=30').catch(()=>[]),
      ]);
      setZonas(Array.isArray(z)?z:[]);
      setCidades(Array.isArray(ci)?ci:[]);
      setPlanos(Array.isArray(p)?p:[]);
      setConsults(Array.isArray(q)?q:[]);
      _loaded.current = true;
    } catch { showToast('Erro ao carregar dados',true); }
    setLoading(false);
    setSaving(false);
  }, []);

  useEffect(()=>{ load(); },[load]);

  // ── Inicializa mapa ───────────────────────────────────────────────────────
  const initMap = useCallback((L) => {
    if (mapInst.current || !mapDiv.current) return;
    const map = L.map(mapDiv.current,{ zoomControl:true, scrollWheelZoom:true, preferCanvas:true });
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom:19, crossOrigin: true,
    }).addTo(map);
    // Fallback: se OSM falhar, tenta Carto
    tileLayer.on('tileerror', () => {
      if (map._fallbackTile) return;
      map._fallbackTile = true;
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
        attribution:'© OpenStreetMap © CARTO', maxZoom:19,
      }).addTo(map);
    });
    map.setView(NATAL,12);

    const di = new L.FeatureGroup().addTo(map);
    drawn.current = di;

    const dc = new L.Control.Draw({
      edit:{ featureGroup:di },
      draw:{
        polygon:{ shapeOptions:{ color:'#00c896', fillOpacity:0.3 }, allowIntersection:false, showArea:true },
        polyline:false, circle:false, circlemarker:false, marker:false, rectangle:false,
      },
    });
    map.addControl(dc);

    map.on(L.Draw.Event.CREATED, e=>{
      di.clearLayers(); di.addLayer(e.layer);
      const gj = { type:'FeatureCollection', features:[e.layer.toGeoJSON()] };
      setModal(prev => prev
        ? { ...prev, geojson:gj, _ok:true }
        : { mode:'new', nome:'', cidade_id:'', cor:'#00c896', tipo:'cobertura', descricao:'', ativo:true, planos:[], geojson:gj, _ok:true }
      );
    });
    map.on(L.Draw.Event.EDITED, e=>{
      const fs=[]; e.layers.eachLayer(l=>fs.push(l.toGeoJSON()));
      if(fs.length) setModal(prev=>prev?{ ...prev, geojson:{ type:'FeatureCollection', features:fs } }:prev);
    });

    mapInst.current = map;
    mapOk.current = true;
    setMapReady(true); // dispara re-render → renderiza zonas
  }, []);

  // ── Monta mapa quando aba mapa está visível ───────────────────────────────
  useEffect(()=>{
    if(tab!=='mapa') return;
    const t = setTimeout(()=>{
      loadLeaflet(initMap);
      if(mapInst.current) {
        mapInst.current.invalidateSize();
        if(mapOk.current) setMapReady(r => !r ? true : r);
      }
    },150);
    return ()=>clearTimeout(t);
  },[tab,initMap]);

  // ── Cleanup ao desmontar componente ──────────────────────────────────────
  useEffect(()=>()=>{
    if(mapInst.current){ try{ mapInst.current.remove(); }catch{} mapInst.current=null; mapOk.current=false; zLayers.current={}; drawn.current=null; }
  },[]);

  // ── Renderiza zonas no mapa ───────────────────────────────────────────────
  useEffect(()=>{
    const L=window.L; const map=mapInst.current;
    if(!L||!map||!mapOk.current) return;
    Object.values(zLayers.current).forEach(l=>{ try{ map.removeLayer(l); }catch{} });
    zLayers.current={};
    zonas.forEach(zona=>{
      let gj=zona.geojson;
      if(typeof gj==='string'){ try{ gj=JSON.parse(gj); }catch{ return; } }
      if(!gj) return;
      try{
        const layer=L.geoJSON(gj,{
          style:{ color:zona.cor||'#00c896', fillColor:zona.cor||'#00c896',
                  fillOpacity:zona.ativo?0.22:0.06, weight:2,
                  dashArray:zona.tipo==='expansao'?'8,5':null, opacity:zona.ativo?1:0.4 },
        }).addTo(map);
        const pls=(zona.planos||[]).map(p=>`<span style="background:#00c89622;color:#00c896;padding:1px 6px;border-radius:4px;font-size:10px;margin:1px;display:inline-block">${p.nome}</span>`).join('');
        layer.bindPopup(`<div style="font-family:sans-serif;min-width:190px">
          <div style="font-weight:700;font-size:13px">${zona.nome}</div>
          <div style="font-size:11px;color:#888;margin:2px 0 6px">${zona.cidade_nome||''} · ${TIPOS.find(t=>t.value===zona.tipo)?.label||zona.tipo}</div>
          ${zona.descricao?`<div style="font-size:11px;color:#555;margin-bottom:6px">${zona.descricao}</div>`:''}
          ${pls?`<div style="margin-bottom:8px">${pls}</div>`:''}
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="window._ez(${zona.id})" style="font-size:11px;padding:4px 10px;border:1px solid #ccc;border-radius:5px;cursor:pointer;background:#f9f9f9">✏️ Informações</button>
            <button onclick="window._editPoly(${zona.id})" style="font-size:11px;padding:4px 10px;border:1px solid #00c896;border-radius:5px;cursor:pointer;background:#e8faf5;color:#007a5e">🗺️ Editar polígono</button>
            <button onclick="window._dz(${zona.id},'${zona.nome.replace(/'/g,"\\'")}',this)" style="font-size:11px;padding:4px 10px;border:1px solid #fca;border-radius:5px;cursor:pointer;background:#fff8f0;color:#c05">🗑️ Excluir</button>
          </div></div>`);
        zLayers.current[zona.id]=layer;
      }catch(e){ console.warn('zona render',zona.id,e); }
    });
  },[zonas, mapReady]);

  // Renderiza pontos de consulta
  useEffect(()=>{
    const L=window.L; const map=mapInst.current;
    if(!L||!map||!mapOk.current) return;
    consults.forEach(c=>{
      if(!c.lat||!c.lng) return;
      try{
        const cor=c.resultado==='com_cobertura'?'#16a34a':'#dc2626';
        L.circleMarker([c.lat,c.lng],{ radius:5, color:cor, fillColor:cor, fillOpacity:0.7, weight:1 }).addTo(map)
          .bindPopup(`<div style="font-size:11px">${c.resultado==='com_cobertura'?'✅':'❌'} ${c.endereco||c.cep||'Consulta'}<br><span style="color:#888">${new Date(c.criado_em).toLocaleString('pt-BR')}</span></div>`);
      }catch{}
    });
  },[consults, mapReady]);

  // Funções globais para popups
  useEffect(()=>{
    window._ez=(id)=>{ const z=zonas.find(z=>z.id===id); if(!z) return; setModal({ mode:'edit', ...z, planos:(z.planos||[]).map(p=>p.plano_id||p.id), _ok:!!z.geojson }); };

    window._editPoly=(id)=>{
      const z=zonas.find(z=>z.id===id);
      if(!z || !z.geojson || !drawn.current || !mapInst.current) return;
      const map = mapInst.current;
      const di = drawn.current;

      // Fecha popup
      map.closePopup();

      // Limpa camadas de desenho existentes
      di.clearLayers();

      // Carrega o polígono da zona no FeatureGroup editável
      try {
        const gj = typeof z.geojson === 'string' ? JSON.parse(z.geojson) : z.geojson;
        const layer = L.geoJSON(gj, {
          style: { color: z.cor || '#00c896', fillOpacity: 0.3, weight: 2 }
        });
        layer.eachLayer(l => di.addLayer(l));

        // Centraliza no polígono
        map.fitBounds(di.getBounds(), { padding: [30, 30] });

        // Abre modal de info com zona carregada para salvar depois
        setModal({ mode:'edit', ...z, planos:(z.planos||[]).map(p=>p.plano_id||p.id), _ok:true, _editandoPoli:true });

        // Mostra instrução
        const info = document.createElement('div');
        info.id = 'edit-poly-hint';
        info.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(0,200,150,.95);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;pointer-events:none';
        info.textContent = '✏️ Use o ícone de edição (lápis) na barra do mapa para mover os vértices';
        document.body.appendChild(info);
        setTimeout(()=>info.remove(), 5000);
      } catch(e) { console.error('editPoly:', e); }
    };
    window._dz=async(id,nome)=>{
      if(!confirm(`Remover a zona "${nome}"?`)) return;
      const r=await api(`/api/zonas/${id}`,{ method:'DELETE' });
      if(r.ok){ showToast('✅ Zona removida'); load(true); } else showToast('Erro ao remover',true);
    };
    return()=>{ delete window._ez; delete window._dz; };
  },[zonas,load]);

  // ── Salvar ────────────────────────────────────────────────────────────────
  const salvar = async()=>{
    if(!modal?.nome?.trim()){ showToast('Nome obrigatório',true); return; }
    if(!modal.geojson?.features?.length){ showToast('Desenhe o polígono no mapa antes de salvar',true); return; }
    const body={ nome:modal.nome.trim(), cidade_id:modal.cidade_id||null, geojson:modal.geojson,
      cor:modal.cor||'#00c896', tipo:modal.tipo||'cobertura', descricao:modal.descricao||'',
      ativo:modal.ativo!==false, planos:(modal.planos||[]).map(Number).filter(Boolean) };
    const isEdit=modal.mode==='edit';
    const res=await api(`/api/zonas${isEdit?'/'+modal.id:''}`,{ method:isEdit?'PUT':'POST', body:JSON.stringify(body) });
    const json=await res.json().catch(()=>({}));
    if(!res.ok){ showToast('Erro: '+(json.error||res.status),true); return; }
    showToast(isEdit?'✅ Zona atualizada':'✅ Zona criada');
    drawn.current?.clearLayers(); setModal(null); load(true);
  };

  // ── Import KMZ ────────────────────────────────────────────────────────────
  const importar=async(file)=>{
    if(!file) return;
    setImpBusy(true);
    try{
      const buf=await file.arrayBuffer();
      const b64=btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res=await api('/api/zonas/import-kmz',{ method:'POST', body:JSON.stringify({ arquivo:b64, tipo_arquivo:file.name.toLowerCase().endsWith('.kml')?'kml':'kmz', cidade_id:null, cor:'#00c896' }) });
      const json=await res.json().catch(()=>({}));
      if(!res.ok) showToast('Erro: '+(json.error||'Falha'),true);
      else{ showToast(`✅ ${json.total} zona(s) importada(s)`); load(true); }
    }catch(e){ showToast('Erro: '+e.message,true); }
    setImpBusy(false); if(fileRef.current) fileRef.current.value='';
  };

  // ── Reimportar GeoJSON do site ──────────────────────────────────────────────
  const reimportarURL = async () => {
    if (!confirm('Reimportar zonas de https://citmax.com.br/cobertura/mapa.geojson?\n\nAs zonas existentes criadas a partir desse arquivo serão substituídas.')) return;
    setImpBusy(true);
    try {
      const res = await api('/api/zonas/import-geojson-url', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://citmax.com.br/cobertura/mapa.geojson', substituir: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) showToast('Erro: ' + (json.error || 'Falha'), true);
      else { showToast(`✅ ${json.total} zona(s) importada(s) do citmax.com.br`); load(true); }
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setImpBusy(false);
  };

  // ── Testar endereço ───────────────────────────────────────────────────────
  const testar=async()=>{
    const v=testQ.trim(); if(!v) return;
    setTestBusy(true); setTestRes(null);
    try{
      const isCEP=/^\d{5}-?\d{3}$/.test(v);
      const url=isCEP?`/api/public/cobertura/endereco?cep=${v.replace(/\D/g,'')}`:`/api/public/cobertura/endereco?q=${encodeURIComponent(v)}`;
      const r=await apiJson(url); setTestRes(r);
      const L=window.L; const map=mapInst.current;
      if(L&&map){
        let lt,lg;
        if(r.enderecoResolvido?.lat){ lt=r.enderecoResolvido.lat; lg=r.enderecoResolvido.lng; }
        else if(r.sugestoes?.[0]){ lt=r.sugestoes[0].lat; lg=r.sugestoes[0].lng; }
        if(lt&&lg){
          const cor=r.cobertura?'#16a34a':'#dc2626';
          L.circleMarker([lt,lg],{ radius:12, color:cor, fillColor:cor, fillOpacity:0.85, weight:2 }).addTo(map)
            .bindPopup(`<strong>${r.cobertura?'✅ TEM cobertura':'❌ SEM cobertura'}</strong><br>${r.enderecoResolvido?.endereco||''}`).openPopup();
          map.setView([lt,lg],15);
        }
      }
    }catch(e){ showToast('Erro: '+e.message,true); }
    setTestBusy(false);
  };

  const confirmarSug=async(s)=>{
    setTestBusy(true);
    try{
      const r=await apiJson(`/api/public/cobertura/check?lat=${s.lat}&lng=${s.lng}`);
      setTestRes({ ...r, enderecoResolvido:s });
      const L=window.L; const map=mapInst.current;
      if(L&&map){
        const cor=r.cobertura?'#16a34a':'#dc2626';
        L.circleMarker([s.lat,s.lng],{ radius:12, color:cor, fillColor:cor, fillOpacity:0.85, weight:2 }).addTo(map)
          .bindPopup(`<strong>${r.cobertura?'✅ TEM cobertura':'❌ SEM cobertura'}</strong><br>${s.endereco}`).openPopup();
        map.setView([s.lat,s.lng],15);
      }
    }catch{}
    setTestBusy(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if(loading) return <div className="skeleton" style={{ height:500, margin:24, borderRadius:12 }} />;
  // saving=true: recarregar silencioso — NÃO desmonta o mapa, apenas mostra badge

  const cc=consults.filter(c=>c.resultado==='com_cobertura').length;
  const sc=consults.filter(c=>c.resultado==='sem_cobertura').length;

  return (
    <div style={{ animation:'fadeIn .35s ease' }}>

      {/* Cabeçalho */}
      <div className="page-head">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <h1>🗺️ Mapa de Cobertura</h1>
          {saving && <span style={{ fontSize:'.72rem', color:'var(--g1)', opacity:.8 }}>↻ atualizando...</span>}
          <p>Desenhe zonas, importe KMZ e consulte disponibilidade por endereço ou GPS</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <button className={`btn btn-sm ${tab==='mapa'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('mapa')}>🗺️ Mapa ({zonas.length})</button>
          <button className={`btn btn-sm ${tab==='lista'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('lista')}>📋 Zonas</button>
          <button className={`btn btn-sm ${tab==='consultas'?'btn-primary':'btn-outline'}`} onClick={()=>setTab('consultas')}>📊 Consultas ({consults.length})</button>
          <button className="btn btn-sm btn-outline" onClick={()=>setShowHelp(h=>!h)}>❓ {showHelp?'Fechar ajuda':'Como usar'}</button>
        </div>
      </div>

      {/* ── Painel de instruções ── */}
      {showHelp && (
        <div style={{ marginBottom:16, background:'rgba(0,200,150,.06)', border:'1px solid rgba(0,200,150,.2)', borderRadius:12, padding:20 }}>
          <div style={{ fontWeight:700, fontSize:'.95rem', color:'var(--g1)', marginBottom:14 }}>📖 Como montar e usar o mapa de cobertura</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:12, fontSize:'.82rem', lineHeight:1.75 }}>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>✏️ Opção 1 — Desenhar no mapa</div>
              <ol style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Clique no ícone <strong style={{color:'var(--text)'}}>⬠ polígono</strong> na barra do lado esquerdo do mapa</li>
                <li>Clique no mapa para adicionar cada ponto do contorno da cobertura</li>
                <li>Para fechar o polígono, clique no <strong style={{color:'var(--text)'}}>primeiro ponto</strong> novamente</li>
                <li>O formulário abre automaticamente — preencha e clique em <strong style={{color:'var(--g1)'}}>Criar zona</strong></li>
              </ol>
            </div>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>📁 Opção 2 — Importar KMZ/KML</div>
              <ol style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Crie o mapa no <strong style={{color:'var(--text)'}}>Google Earth Pro</strong> ou <strong style={{color:'var(--text)'}}>Google My Maps</strong></li>
                <li>Desenhe os polígonos de cobertura lá</li>
                <li>Exporte como <code style={{background:'rgba(255,255,255,.08)',padding:'0 4px',borderRadius:3}}>.kmz</code> ou <code style={{background:'rgba(255,255,255,.08)',padding:'0 4px',borderRadius:3}}>.kml</code></li>
                <li>Clique em <strong style={{color:'var(--g1)'}}>📁 Importar KMZ/KML</strong> no painel lateral — as zonas são criadas automaticamente</li>
              </ol>
            </div>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>✏️ Editar zona existente</div>
              <ol style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Clique em qualquer zona colorida no mapa</li>
                <li>No popup, clique em <strong style={{color:'var(--text)'}}>✏️ Editar</strong></li>
                <li>Para redesenhar, use o ícone <strong style={{color:'var(--text)'}}>✎ editar</strong> na barra do mapa e arraste os pontos</li>
                <li>Clique em <strong style={{color:'var(--text)'}}>Salvar</strong> na barra preta para confirmar</li>
              </ol>
            </div>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>🔍 Testar cobertura</div>
              <ol style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Use o campo <strong style={{color:'var(--text)'}}>Testar Cobertura</strong> no painel direito</li>
                <li>Digite um endereço completo, CEP (59064-625) ou bairro</li>
                <li>O sistema marca o ponto no mapa e mostra o resultado</li>
                <li>Se ambíguo, escolha o endereço correto nas sugestões</li>
              </ol>
            </div>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>🤖 Como o bot usa o mapa</div>
              <ul style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Cliente envia <strong style={{color:'var(--text)'}}>localização GPS</strong> pelo WhatsApp → bot verifica e responde instantaneamente</li>
                <li>Cliente digita <strong style={{color:'var(--text)'}}>CEP</strong> (ex: 59064-625) → sistema resolve e verifica</li>
                <li>Cliente digita o endereço → bot geocodifica e verifica o polígono</li>
                <li style={{color:'#16a34a'}}>✅ Com cobertura → exibe planos da zona e inicia cadastro</li>
                <li style={{color:'#dc2626'}}>❌ Sem cobertura → oferece lista de espera</li>
              </ul>
            </div>

            <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:14 }}>
              <div style={{ fontWeight:700, color:'var(--g1)', marginBottom:8 }}>💡 Configurações importantes</div>
              <ul style={{ paddingLeft:18, color:'var(--muted)', margin:0 }}>
                <li>Vincule cada zona a uma <strong style={{color:'var(--text)'}}>cidade</strong> para o bot usar o pop_id e portador_id corretos</li>
                <li>Selecione os <strong style={{color:'var(--text)'}}>planos disponíveis</strong> em cada zona — o bot vai exibi-los ao cliente</li>
                <li>Use <strong style={{color:'#f59e0b'}}>Expansão prevista</strong> para áreas futuras — já coleta leads interessados</li>
                <li>Uma cidade pode ter <strong style={{color:'var(--text)'}}>múltiplas zonas</strong> com planos diferentes por bairro</li>
                <li>Os pontos coloridos no mapa são consultas reais dos seus clientes</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MAPA — o div NUNCA é desmontado, apenas hidden ═══ */}
      <div style={{ display:'flex', visibility:tab==='mapa'?'visible':'hidden', maxHeight:tab==='mapa'?'none':'0', overflow:'hidden', gap:12, flexWrap:'wrap' }}>

        <div style={{ flex:'1 1 480px', minWidth:0 }}>
          <div style={{ background:'#1a2035', borderRadius:12, overflow:'hidden', border:'1px solid rgba(255,255,255,.08)', height:560, position:'relative' }}>
            <div ref={mapDiv} style={{ width:'100%', height:'100%' }} />
          </div>
          <p style={{ fontSize:'.68rem', color:'var(--dim)', marginTop:6 }}>
            Tiles: OpenStreetMap · Geocodificação: Nominatim OSM + ViaCEP · Sem Google Maps, sem custos
          </p>
        </div>

        {/* Painel lateral */}
        <div style={{ flex:'0 0 270px', display:'flex', flexDirection:'column', gap:10 }}>

          <div className="card">
            <div style={{ fontSize:'.7rem', fontWeight:700, marginBottom:10, color:'var(--g1)', textTransform:'uppercase', letterSpacing:1 }}>Nova Zona</div>
            <button className="btn btn-primary btn-sm" style={{ width:'100%', marginBottom:6 }}
              onClick={()=>{ drawn.current?.clearLayers(); setModal({ mode:'new', nome:'', cidade_id:'', cor:'#00c896', tipo:'cobertura', descricao:'', ativo:true, planos:[], geojson:null, _ok:false }); }}>
              ✏️ Desenhar polígono no mapa
            </button>
            <p style={{ fontSize:'.7rem', color:'var(--dim)', marginBottom:10, textAlign:'center' }}>Use o ícone ⬠ que aparece no lado esquerdo do mapa</p>
            <div style={{ height:1, background:'rgba(255,255,255,.07)', marginBottom:10 }} />
            <input type="file" ref={fileRef} accept=".kmz,.kml" style={{ display:'none' }} onChange={e=>importar(e.target.files[0])} />
            <button className="btn btn-outline btn-sm" style={{ width:'100%' }} onClick={()=>fileRef.current?.click()} disabled={impBusy}>
              {impBusy?'⏳ Importando...':'📁 Importar KMZ / KML'}
            </button>
            <p style={{ fontSize:'.7rem', color:'var(--dim)', marginTop:6, textAlign:'center' }}>Exportado do Google Earth ou My Maps</p>
            <div style={{ height:1, background:'rgba(255,255,255,.07)', marginTop:10, marginBottom:10 }} />
            <button className="btn btn-outline btn-sm" style={{ width:'100%', fontSize:'.72rem' }}
              onClick={reimportarURL} disabled={impBusy} title="Busca o GeoJSON de https://citmax.com.br/cobertura/mapa.geojson">
              🔄 Reimportar citmax.com.br/cobertura
            </button>
          </div>

          <div className="card">
            <div style={{ fontSize:'.7rem', fontWeight:700, marginBottom:10, color:'var(--g1)', textTransform:'uppercase', letterSpacing:1 }}>Testar Cobertura</div>
            <input className="input" style={{ marginBottom:8 }} placeholder="Endereço, CEP ou bairro..." value={testQ} onChange={e=>setTestQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&testar()} />
            <button className="btn btn-primary btn-sm" style={{ width:'100%' }} onClick={testar} disabled={testBusy}>
              {testBusy?'⏳ Consultando...':'🔍 Verificar cobertura'}
            </button>

            {testRes && (
              <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8, fontSize:'.78rem',
                background:testRes.cobertura?'rgba(0,200,150,.1)':testRes.precisaConfirmar?'rgba(59,130,246,.08)':'rgba(239,68,68,.08)',
                border:`1px solid ${testRes.cobertura?'rgba(0,200,150,.3)':testRes.precisaConfirmar?'rgba(59,130,246,.25)':'rgba(239,68,68,.2)'}` }}>
                {testRes.erro ? <span style={{ color:'var(--red)' }}>⚠️ {testRes.erro}</span>
                : testRes.precisaConfirmar ? <>
                    <div style={{ fontWeight:600, marginBottom:6 }}>Selecione o endereço correto:</div>
                    {testRes.sugestoes?.map((s,i)=>(
                      <div key={i} style={{ cursor:'pointer', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,.06)', fontSize:'.72rem', color:'var(--muted)' }} onClick={()=>confirmarSug(s)}>
                        📍 {s.endereco?.slice(0,65)}{s.endereco?.length>65?'...':''}
                      </div>
                    ))}
                  </>
                : <>
                    <div style={{ fontWeight:700, fontSize:'.85rem', marginBottom:5 }}>
                      {testRes.cobertura?'✅ TEM cobertura!':'❌ Sem cobertura'}
                    </div>
                    {testRes.enderecoResolvido?.endereco && <div style={{ color:'var(--muted)', fontSize:'.7rem', marginBottom:5 }}>📍 {testRes.enderecoResolvido.endereco.slice(0,70)}</div>}
                    {testRes.cobertura&&testRes.zona && <div style={{ marginBottom:4 }}>🗺️ <strong>{testRes.zona.nome}</strong></div>}
                    {testRes.cobertura&&testRes.planos?.length>0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
                        {testRes.planos.map((p,i)=>(
                          <span key={i} style={{ fontSize:'.68rem', background:'rgba(0,200,150,.15)', color:'var(--g1)', padding:'2px 6px', borderRadius:4 }}>{p.nome} {p.velocidade}M</span>
                        ))}
                      </div>
                    )}
                    {!testRes.cobertura&&testRes.zonaMaisProxima && <div style={{ color:'var(--dim)', fontSize:'.7rem', marginTop:4 }}>Mais próxima: {testRes.zonaMaisProxima.nome} (~{testRes.zonaMaisProxima.distanciaKm} km)</div>}
                    {testRes.avisoForaArea && <div style={{ color:'var(--color-text-warning)', fontSize:'.7rem', marginTop:6, padding:'4px 8px', background:'var(--color-background-warning)', borderRadius:4 }}>⚠️ Endereço localizado fora da área RN — tente com CEP para maior precisão</div>}
                    {testRes.sugerirCEP && <div style={{ color:'var(--color-text-info)', fontSize:'.7rem', marginTop:6 }}>💡 Tente pesquisar pelo CEP (ex: 59064-625)</div>}
                  </>
                }
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontSize:'.7rem', fontWeight:700, marginBottom:8, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Legenda</div>
            {TIPOS.map(t=>(
              <div key={t.value} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0', fontSize:'.78rem' }}>
                <div style={{ width:14, height:14, borderRadius:3, background:t.cor, flexShrink:0 }} />{t.label}
              </div>
            ))}
            <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', marginTop:8, paddingTop:8 }}>
              {[['#16a34a','Consulta com cobertura'],['#dc2626','Consulta sem cobertura']].map(([cor,l])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0', fontSize:'.72rem', color:'var(--muted)' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:cor, flexShrink:0 }} />{l}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div style={{ background:'rgba(0,200,150,.08)', border:'1px solid rgba(0,200,150,.2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:'1.5rem', fontWeight:700, color:'var(--g1)', lineHeight:1 }}>{zonas.filter(z=>z.ativo).length}</div>
              <div style={{ fontSize:'.67rem', color:'var(--muted)', marginTop:3 }}>zonas ativas</div>
            </div>
            <div style={{ background:'rgba(0,0,0,.15)', border:'1px solid rgba(255,255,255,.07)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:'1.5rem', fontWeight:700, lineHeight:1 }}>{consults.length}</div>
              <div style={{ fontSize:'.67rem', color:'var(--muted)', marginTop:3 }}>consultas/30d</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LISTA ═══ */}
      {tab==='lista' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong style={{ fontSize:'.85rem' }}>{zonas.length} zona(s)</strong>
            <button className="btn btn-primary btn-sm" onClick={()=>setTab('mapa')}>+ Nova zona</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.82rem' }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Zona','Cidade','Tipo','Planos','Status','Ações'].map(h=>(
                <th key={h} style={{ textAlign:'left', padding:'10px 14px', color:'var(--muted)', fontSize:'.68rem', textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {zonas.map(z=>(
                <tr key={z.id} style={{ borderBottom:'1px solid rgba(255,255,255,.03)' }}>
                  <td style={{ padding:'10px 14px' }}><div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:12, height:12, borderRadius:3, background:z.cor||'#00c896', flexShrink:0 }} />
                    <strong>{z.nome}</strong>
                  </div></td>
                  <td style={{ padding:'10px 14px', color:'var(--muted)' }}>{z.cidade_nome||'—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:'.72rem' }}>{TIPOS.find(t=>t.value===z.tipo)?.label||z.tipo}</td>
                  <td style={{ padding:'10px 14px' }}>{(z.planos||[]).length>0?(z.planos||[]).map((p,i)=><span key={i} className="badge badge-blue" style={{ fontSize:'.6rem', marginRight:3 }}>{p.nome}</span>):<span style={{ color:'var(--dim)', fontSize:'.7rem' }}>—</span>}</td>
                  <td style={{ padding:'10px 14px' }}><span className={`badge ${z.ativo?'badge-green':'badge-red'}`} style={{ fontSize:'.6rem' }}>{z.ativo?'● Ativo':'○ Inativo'}</span></td>
                  <td style={{ padding:'10px 14px' }}><div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-outline btn-xs" onClick={()=>{ setTab('mapa'); setTimeout(()=>window._ez?.(z.id),200); }}>✏️</button>
                    <button className="btn btn-danger btn-xs" onClick={()=>window._dz?.(z.id,z.nome)}>🗑️</button>
                  </div></td>
                </tr>
              ))}
              {zonas.length===0&&<tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--dim)' }}>
                <div style={{ fontSize:'2rem', marginBottom:8 }}>🗺️</div>
                Nenhuma zona ainda. Vá para Mapa e desenhe a primeira zona de cobertura.
              </td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ CONSULTAS ═══ */}
      {tab==='consultas' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10, marginBottom:14 }}>
            {[['Total',consults.length,'var(--text)'],['Com cobertura',cc,'#16a34a'],['Sem cobertura',sc,'#dc2626'],['Taxa',consults.length?Math.round(cc/consults.length*100)+'%':'—','var(--g1)']].map(([l,v,c])=>(
              <div key={l} style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                <div style={{ fontSize:'1.6rem', fontWeight:700, color:c, lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
              <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Data','Telefone','Endereço / CEP','Resultado','Zona'].map(h=>(
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:'var(--muted)', fontSize:'.65rem', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {consults.slice(0,100).map(c=>(
                  <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,.03)' }}>
                    <td style={{ padding:'8px 12px', color:'var(--dim)', whiteSpace:'nowrap' }}>{new Date(c.criado_em).toLocaleString('pt-BR',{ day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                    <td style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:'.72rem' }}>{c.telefone||'—'}</td>
                    <td style={{ padding:'8px 12px', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.cep?<span style={{ fontFamily:'monospace', marginRight:4 }}>{c.cep}</span>:''}{c.endereco||'—'}</td>
                    <td style={{ padding:'8px 12px' }}><span style={{ color:c.resultado==='com_cobertura'?'#16a34a':'#dc2626', fontSize:'.72rem', fontWeight:600 }}>{c.resultado==='com_cobertura'?'✅ Com cobertura':'❌ Sem cobertura'}</span></td>
                    <td style={{ padding:'8px 12px', color:'var(--muted)' }}>{c.zona_nome||'—'}</td>
                  </tr>
                ))}
                {consults.length===0&&<tr><td colSpan={5} style={{ textAlign:'center', padding:30, color:'var(--dim)' }}>Nenhuma consulta ainda</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ MODAL ═══ */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, backdropFilter:'blur(6px)' }}
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={{ background:'rgba(2,55,65,.97)', border:'1px solid rgba(0,200,150,.2)', borderRadius:16, padding:28, width:560, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', marginBottom:20 }}>
              {modal.mode==='edit'?'✏️ Editar Zona':'➕ Nova Zona de Cobertura'}
            </h3>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={LB}>Nome da zona *</label>
                <input className="input" value={modal.nome||''} placeholder="Ex: Natal — Lagoa Nova, Macaíba Norte..."
                  onChange={e=>setModal({ ...modal, nome:e.target.value })} />
              </div>
              <div>
                <label style={LB}>Cidade vinculada</label>
                <select className="input" value={modal.cidade_id||''} onChange={e=>setModal({ ...modal, cidade_id:e.target.value })}>
                  <option value="">— Selecione —</option>
                  {cidades.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={LB}>Tipo</label>
                <select className="input" value={modal.tipo||'cobertura'}
                  onChange={e=>setModal({ ...modal, tipo:e.target.value, cor:TIPOS.find(t=>t.value===e.target.value)?.cor||modal.cor })}>
                  {TIPOS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LB}>Cor</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="color" value={modal.cor||'#00c896'} onChange={e=>setModal({ ...modal, cor:e.target.value })}
                    style={{ width:40, height:36, border:'none', background:'none', cursor:'pointer', borderRadius:6, padding:2 }} />
                  <span style={{ fontSize:'.78rem', fontFamily:'monospace', color:'var(--muted)' }}>{modal.cor}</span>
                </div>
              </div>
              <div>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:'.85rem', marginTop:22 }}>
                  <input type="checkbox" checked={modal.ativo!==false} onChange={e=>setModal({ ...modal, ativo:e.target.checked })} style={{ accentColor:'var(--g1)' }} />
                  Zona ativa
                </label>
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={LB}>Descrição (o bot usa nas respostas)</label>
              <input className="input" value={modal.descricao||''} placeholder="Ex: Cobertura em Lagoa Nova, Tirol, Petrópolis e adjacências"
                onChange={e=>setModal({ ...modal, descricao:e.target.value })} />
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={LB}>Planos disponíveis nesta zona</label>
              <div style={{ background:'rgba(0,0,0,.15)', borderRadius:8, padding:10, display:'flex', flexWrap:'wrap', gap:6 }}>
                {planos.filter(p=>p.ativo!==false).map(p=>{
                  const on=(modal.planos||[]).map(Number).includes(p.id);
                  return <button key={p.id} className={`btn btn-xs ${on?'btn-primary':'btn-outline'}`} style={{ fontSize:'.72rem' }}
                    onClick={()=>{ const arr=(modal.planos||[]).map(Number); setModal({ ...modal, planos:on?arr.filter(x=>x!==p.id):[...arr,p.id] }); }}>
                    {p.nome} {p.velocidade}{p.unidade==='Giga'?'G':'M'}
                  </button>;
                })}
                {planos.filter(p=>p.ativo!==false).length===0 && <span style={{ fontSize:'.75rem', color:'var(--dim)' }}>Cadastre planos em Cidades & Planos primeiro</span>}
              </div>
            </div>

            <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, fontSize:'.78rem',
              background:modal.geojson?.features?.length?'rgba(0,200,150,.08)':'rgba(245,158,11,.08)',
              border:`1px solid ${modal.geojson?.features?.length?'rgba(0,200,150,.2)':'rgba(245,158,11,.2)'}` }}>
              {modal.geojson?.features?.length
                ? `✅ ${modal.geojson.features.length} polígono(s) — pronto para salvar`
                : '⚠️ Nenhum polígono ainda. Feche este modal, use o ícone ⬠ no mapa para desenhar e o formulário abrirá automaticamente.'}
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:14, borderTop:'1px solid var(--border)' }}>
              <button className="btn btn-outline" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}>{modal.mode==='edit'?'💾 Atualizar':'💾 Criar zona'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
