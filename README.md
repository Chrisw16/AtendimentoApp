# Maxxi Admin — CITmax v7.4.15

Painel de atendimento com IA para a CITmax Fibra.

## Novidades v7.4.15

- **Fluxo comercial completo:** agente agora pergunta o dia de vencimento preferido (busca do ERP via `listar_vencimentos`), inclui no resumo de confirmação e envia para o `cadastrarCliente`. `pop_id` e `portador_id` já vinham da tabela `cidades`.

## Novidades v7.5.8

- **Fix mapa preto após salvar zona:** `load()` chamava `setLoading(true)` → componente inteiro desmontava (skeleton) → Leaflet era destruído. Separado em dois modos: `load()` com skeleton apenas no 1º carregamento, `load(true)` silencioso em todas as recargas após salvar/editar/deletar/importar — o mapa nunca é desmontado
- Indicador sutil "↻ atualizando..." no header durante recargas silenciosas

## Novidades v7.5.7

- **Fix geocodificação por endereço:** Nominatim agora recebe `viewbox` da área RN + `bounded=0` — prioriza resultados em Natal/RN e evita retornar cidades homônimas de outros estados
- **Sufixo automático:** endereços sem cidade/UF recebem `, Natal, RN, Brasil` antes de geocodificar
- **Filtro pós-geocodificação:** resultados fora do bounding box RN são descartados; só entra no point-in-polygon pontos geograficamente válidos
- **Resolução automática de sugestões similares:** se as N sugestões são do mesmo bairro, usa a primeira direto sem pedir confirmação
- **Mensagem inteligente:** quando endereço não localizado em RN, bot sugere CEP como alternativa mais precisa

## Novidades v7.5.6

- **`map_ll` no cadastro ERP:** coordenadas GPS/CEP enviadas para o SGP no campo `map_ll` no formato `-lat,-lng` ao cadastrar novo cliente
- 3 origens capturadas: localização GPS (WhatsApp), CEP verificado e endereço confirmado por sugestão

## Novidades v7.5.5

- **Fix mapa preto:** `display:none` substituído por `visibility:hidden` — Leaflet não carrega tiles quando o container tem `display:none`; agora o div permanece no layout mesmo nas outras abas
- **Fallback de tiles:** se OSM falhar, troca automaticamente para Carto
- **Bot verifica cobertura antes do cadastro:** estado `comercial_cep` — pede CEP ou endereço, chama point-in-polygon, responde com cobertura/sem cobertura antes de oferecer planos
- **Múltiplas sugestões de endereço:** estado `comercial_cep_confirm` — se endereço for ambíguo, exibe lista para confirmar
- **Lista de espera:** cliente sem cobertura pode entrar na lista, salvo em `consultas_cobertura`
- **CEP detectado em qualquer estado** redireciona automaticamente para verificação de cobertura

## Novidades v7.5.4

- **Fix zonas não apareciam no mapa:** `useEffect` das zonas dependia de `mapOk.current` (ref), que não dispara re-render — adicionado state `mapReady` que vira `true` quando Leaflet inicializa, forçando re-render e renderizando os polígonos

## Novidades v7.5.3

- **Seed hardcoded:** 58 zonas de cobertura do `citmax.com.br/cobertura/mapa.geojson` embutidas diretamente no `db.js` — aparecem no mapa automaticamente no primeiro startup, sem depender de fetch externo
- Cidades cobertas: Natal, Macaíba, São Gonçalo do Amarante, São Miguel do Gostoso

## Novidades v7.5.2

- **Seed automático:** no primeiro startup sem zonas, o sistema busca `citmax.com.br/cobertura/mapa.geojson` e importa automaticamente
- **Botão "🔄 Reimportar citmax.com.br/cobertura"** no painel do mapa para atualizar a qualquer momento
- **Endpoint `POST /api/zonas/import-geojson-url`** — importa qualquer GeoJSON por URL, com opção de substituir

## Novidades v7.5.1

- **Fix mapa de cobertura:** reescrito com loader idempotente (nunca duplica scripts Leaflet), div do mapa nunca desmonta (apenas `display:none` nas outras abas), cleanup correto no unmount
- **Painel de instruções** — botão "❓ Como usar" com guia completo em 6 cards: desenhar, importar KMZ, editar, testar, como o bot usa, dicas de configuração

## Novidades v7.5.0

- **Mapa de Cobertura completo** — nova página `/admin/cobertura` com mapa Leaflet + OpenStreetMap
- **Editor visual de polígonos** — desenhe zonas direto no mapa via Leaflet.draw
- **Import KMZ/KML** — importe arquivos do Google Earth, converte para GeoJSON automaticamente
- **Geocodificação gratuita** — Nominatim (OSM) + ViaCEP + BrasilAPI, sem chave de API, sem custo
- **Consulta por GPS** — cliente manda localização no WhatsApp, bot verifica cobertura em tempo real
- **Consulta por CEP** — detecta CEP na conversa, resolve endereço e verifica polígono
- **Tool `verificar_cobertura`** — agente IA pode consultar cobertura durante atendimento
- **API pública** — `/api/public/cobertura/check`, `/api/public/cep/:cep`, `/api/public/geocode`
- **Log de consultas** — heatmap de onde os clientes consultaram (com e sem cobertura)
- **Zona por tipo** — cobertura ativa, expansão prevista, sem sinal
- **Planos por zona** — cada zona vincula planos específicos disponíveis naquela região
- **Dep:** `jszip` adicionado para import KMZ

## Novidades v7.4.14

- **Fix migration:** `ALTER TABLE cidade_planos DROP COLUMN IF EXISTS sgp_id` — banco antigo tinha coluna sgp_id NOT NULL em cidade_planos causando erro ao salvar vínculo.

## Novidades v7.4.13

- **Fix migration:** `ALTER TABLE planos ADD COLUMN IF NOT EXISTS sgp_id` — banco de produção criado sem a coluna; agora é adicionada automaticamente no startup.

## Novidades v7.4.12

- **Fix definitivo sgp_id planos:** PUT reescrito com `parseInt(String(sgp_id), 10)` + `RETURNING *`; IDs de rota e cidade agora convertidos explicitamente para inteiro antes de qualquer query.


- **Fix definitivo sgp_id planos** — CidadesPlanos.jsx reescrito do zero: body limpo (sem spread de campos sujos), vinculados como array simples de IDs, sgp_id via parseInt sem || falsy, modal isolado do objeto do banco

- **Fix real: sgp_id dos planos não aparecia na listagem** — `SELECT p.*` com LEFT JOIN fazia `cp.id` sobrescrever `p.id`; query reescrita com colunas explícitas `p.id, p.sgp_id, ...`

- **Fix: ID ERP (SGP) dos planos não salvava corretamente** — `parseInt() || ''` derrubava o valor; substituído por `Number()` com checagem `=== ''`. Backend (`PUT /api/planos/:id`) passou a validar e coerçar `sgp_id` como inteiro antes do UPDATE.

- **Command Palette (Ctrl+K)** — navegação rápida por teclado entre todas as páginas e ações
- **Sidebar colapsável** — botão toggle, estado persistido, ícones SVG (Lucide React)
- **KPI Cards com sparklines** — mini-gráfico de tendência + badge de variação percentual  
- **Painel de notificações** — sino com histórico de até 50 alertas por tipo em tempo real
- **Editor de Prompt melhorado** — numeração de linhas, Ctrl+S para salvar, barra de status
- **Skeleton screens** — substituição de spinners por placeholders animados contextuais
- **Acessibilidade (WCAG 2.1)** — labels em todos os inputs, focus-visible, aria-labels, role="alert"
- **EmptyState component** — estados vazios com ícone SVG e CTA reutilizável
- **Topbar redesenhada** — avatar com inicial, hint de busca, botão de logout com ícone

## Stack

- React 18 + Vite + React Router 6
- Zustand (estado global)
- Chart.js + react-chartjs-2
- Lucide React (ícones)
- DM Sans + Bebas Neue + JetBrains Mono

## Deploy

```bash
cd admin-ui
npm install
npm run build
# Output: admin-ui/dist/
```

## Estrutura de Componentes

```
src/
  components/
    Sidebar.jsx          # Nav colapsável com ícones Lucide
    Topbar.jsx           # Header com busca, notificações e usuário
    CommandPalette.jsx   # Ctrl+K palette global
    NotificationPanel.jsx # Sino + drawer de notificações
    KpiCard.jsx          # Card com sparkline e trend
    EmptyState.jsx       # Estado vazio reutilizável
    Skeleton.jsx         # Skeleton screens (Kpi, Card, Table, Chat)
    Toast.jsx            # Feedback momentâneo
    Antigravity.jsx      # Partículas do login
    ErrorBoundary.jsx    # Captura de erros React
  pages/
    Dashboard.jsx        # ERP + IA metrics
    Prompt.jsx           # Editor com numeração de linhas
    Chat.jsx             # Chat interno multi-canal
    Login.jsx            # Login acessível com labels
    ...demais páginas
  hooks/
    useNotifications.js  # SSE + sons + notif store
  store.js               # Zustand store (auth, toast, notif, sidebar)
  styles/
    global.css           # Design system completo (1092 linhas)
```
