import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  MarkerType, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { fluxosApi } from '../lib/api';
import { useStore } from '../store';
import { NODE_TYPES, NODE_GROUPS } from '../lib/nodeTypes';
import FlowNode from '../components/fluxo/FlowNode';
import PropsPanel from '../components/fluxo/PropsPanel';
import {
  ArrowLeft, Save, Zap, ZapOff, LayoutGrid,
  ChevronDown, ChevronRight,
} from 'lucide-react';

// Registra tipo de nó customizado
const nodeTypes = { fluxo: FlowNode };

// ── SIDEBAR DE NÓS ────────────────────────────────────────────────
function NodeSidebar() {
  const [collapsed, setCollapsed] = useState({});

  const toggleGroup = (g) => setCollapsed(s => ({ ...s, [g]: !s[g] }));

  // Agrupa nós por grupo
  const groups = {};
  Object.entries(NODE_TYPES).forEach(([tipo, def]) => {
    if (!groups[def.group]) groups[def.group] = [];
    groups[def.group].push({ tipo, ...def });
  });

  const onDragStart = (e, tipo) => {
    e.dataTransfer.setData('application/reactflow', tipo);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      width: 210, background: 'rgba(8,12,18,.98)',
      borderRight: '1px solid rgba(255,255,255,.08)',
      overflowY: 'auto', flexShrink: 0,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
        Nós
      </div>

      {Object.entries(NODE_GROUPS).map(([groupId, groupDef]) => {
        const items = groups[groupId] || [];
        if (!items.length) return null;
        const isOpen = !collapsed[groupId];

        return (
          <div key={groupId}>
            <button
              onClick={() => toggleGroup(groupId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '5px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: groupDef.color, fontSize: 10, fontWeight: 700,
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}
            >
              {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {groupDef.label}
            </button>

            {isOpen && items.map(({ tipo, label, color }) => (
              <div
                key={tipo}
                draggable
                onDragStart={e => onDragStart(e, tipo)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px 5px 22px',
                  cursor: 'grab', userSelect: 'none',
                  borderRadius: 6, margin: '1px 6px',
                  transition: 'background .1s',
                  fontSize: 12, color: 'rgba(255,255,255,.75)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}

            <div style={{ height: 4 }} />
          </div>
        );
      })}
    </div>
  );
}

// ── FLUXO EDITOR ──────────────────────────────────────────────────
export default function FluxoEditor() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const toast      = useStore(s => s.toast);
  const qc         = useQueryClient();
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode]  = useState(null);
  const [fluxoNome,    setFluxoNome]     = useState('Novo fluxo');
  const [fluxoAtivo,   setFluxoAtivo]    = useState(false);
  const [dirty,        setDirty]         = useState(false);

  // Carrega fluxo existente
  const { isLoading } = useQuery({
    queryKey: ['fluxo', id],
    queryFn:  () => id !== 'novo' ? fluxosApi.get(id) : null,
    enabled:  id !== 'novo',
    onSuccess: (f) => {
      if (!f) return;
      setFluxoNome(f.nome);
      setFluxoAtivo(f.ativo);
      const dados = typeof f.dados === 'string' ? JSON.parse(f.dados || '{"nodes":[],"edges":[]}') : (f.dados || { nodes: [], edges: [] });
      setNodes(dados.nodes || []);
      setEdges(dados.edges || []);
    },
  });

  const saveMut = useMutation({
    mutationFn: (payload) => id === 'novo' ? fluxosApi.create(payload) : fluxosApi.update(id, payload),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['fluxos'] });
      toast('Fluxo salvo!', 'success');
      setDirty(false);
      if (id === 'novo') navigate(`/fluxos/${saved.id}`, { replace: true });
    },
    onError: e => toast(e.message, 'error'),
  });

  const handleSave = useCallback(() => {
    const dados = rfInstance?.toObject() || { nodes, edges };
    saveMut.mutate({
      nome:    fluxoNome,
      ativo:   fluxoAtivo,
      gatilho: 'nova_conversa',
      dados:   JSON.stringify(dados),
      nos:     nodes,
      conexoes:edges,
    });
  }, [rfInstance, nodes, edges, fluxoNome, fluxoAtivo]);

  // Ctrl+S
  const onKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    if (e.key === 'Delete' && selectedNode) deleteNode(selectedNode.id);
  }, [handleSave, selectedNode]);

  // Drop de nó novo no canvas
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/reactflow');
    if (!tipo || !rfInstance) return;

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pos    = rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });

    const newNode = {
      id:       `${tipo}_${Date.now()}`,
      type:     'fluxo',
      position: pos,
      data:     { tipo, config: {} },
    };

    setNodes(ns => [...ns, newNode]);
    setDirty(true);
  }, [rfInstance]);

  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  // Conectar nós
  const onConnect = useCallback((params) => {
    setEdges(es => addEdge({
      ...params,
      markerEnd:   { type: MarkerType.ArrowClosed, color: '#555' },
      style:       { stroke: '#444', strokeWidth: 1.5 },
      animated:    false,
    }, es));
    setDirty(true);
  }, []);

  // Selecionar nó
  const onNodeClick = useCallback((_, node) => setSelectedNode(node), []);
  const onPaneClick  = useCallback(() => setSelectedNode(null), []);

  // Atualizar configuração do nó
  const updateNode = useCallback((data) => {
    setNodes(ns => ns.map(n => n.id === selectedNode?.id ? { ...n, data } : n));
    setSelectedNode(prev => prev ? { ...prev, data } : prev);
    setDirty(true);
  }, [selectedNode]);

  // Deletar nó
  const deleteNode = useCallback((nodeId) => {
    setNodes(ns => ns.filter(n => n.id !== nodeId));
    setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode?.id === nodeId) setSelectedNode(null);
    setDirty(true);
  }, [selectedNode]);

  // Auto-organizar
  const organizar = useCallback(() => {
    const SPACING_X = 280;
    const SPACING_Y = 120;
    let col = 0;
    const novoNodes = nodes.map((n, i) => ({
      ...n,
      position: { x: (i % 4) * SPACING_X + 60, y: Math.floor(i / 4) * SPACING_Y + 60 },
    }));
    setNodes(novoNodes);
    setDirty(true);
  }, [nodes]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#060a0f', color: 'rgba(255,255,255,.4)' }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#060a0f' }} onKeyDown={onKeyDown} tabIndex={-1}>
      {/* ── TOPBAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 48,
        background: 'rgba(8,12,18,.98)', borderBottom: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0,
      }}>
        <button onClick={() => navigate('/fluxos')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          <ArrowLeft size={14} /> Fluxos
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)' }} />

        <input
          value={fluxoNome}
          onChange={e => { setFluxoNome(e.target.value); setDirty(true); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, outline: 'none', minWidth: 180, fontFamily: 'Syne, sans-serif' }}
          placeholder="Nome do fluxo"
        />

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: fluxoAtivo ? 'rgba(0,229,160,.12)' : 'rgba(255,255,255,.06)', border: `1px solid ${fluxoAtivo ? 'rgba(0,229,160,.3)' : 'rgba(255,255,255,.1)'}`, fontSize: 11, color: fluxoAtivo ? '#00E5A0' : 'rgba(255,255,255,.4)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: fluxoAtivo ? '#00E5A0' : '#555' }} />
          {fluxoAtivo ? 'Ativo' : 'Rascunho'}
          <span style={{ fontSize: 10, opacity: .6 }}>· {nodes.length} nós</span>
        </div>

        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginLeft: 4 }}>
          Ctrl+S salvar · Del excluir
        </span>

        <div style={{ flex: 1 }} />

        {/* Botões ação */}
        <button onClick={organizar} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 12 }}>
          <LayoutGrid size={13} /> Organizar
        </button>

        <button onClick={() => { setFluxoAtivo(v => !v); setDirty(true); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 12 }}>
          {fluxoAtivo ? <ZapOff size={13} /> : <Zap size={13} />}
          {fluxoAtivo ? 'Desativar' : 'Ativar'}
        </button>

        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 6, border: 'none', background: dirty ? '#00E5A0' : 'rgba(0,229,160,.3)', color: dirty ? '#000' : 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all .15s' }}>
          <Save size={13} />
          {saveMut.isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* ── CANVAS ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <NodeSidebar />

        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            style={{ background: '#060a0f' }}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, color: '#444' },
              style: { stroke: '#444', strokeWidth: 1.5 },
            }}
          >
            <Background color="#1a1f28" gap={24} size={1} />
            <Controls style={{ background: 'rgba(8,12,18,.9)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }} />
            <MiniMap
              style={{ background: 'rgba(8,12,18,.9)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }}
              nodeColor={n => NODE_TYPES[n.data?.tipo]?.color || '#444'}
              maskColor="rgba(6,10,15,.7)"
            />

            {/* Canvas vazio */}
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div style={{ marginTop: 120, textAlign: 'center', color: 'rgba(255,255,255,.25)', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                  <p style={{ fontSize: 13 }}>Arraste nós do painel esquerdo para começar</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>Comece com o nó <strong style={{ color: '#00E5A0' }}>Início</strong></p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Painel de propriedades */}
        {selectedNode && (
          <div style={{ padding: 12, background: 'rgba(6,10,15,.98)', borderLeft: '1px solid rgba(255,255,255,.08)', overflowY: 'auto' }}>
            <PropsPanel
              node={selectedNode}
              onChange={updateNode}
              onDelete={deleteNode}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
