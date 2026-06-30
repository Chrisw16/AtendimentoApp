---
title: Abas de Operações e Infraestrutura
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Telas e Navegação]]", "[[Integração SGP]]", "[[Abas de Atendimento]]", "[[Modelo de Dados]]", "[[API Backend Maxxi]]", "[[Achados de código (2026-06-30)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Abas de Operações e Infraestrutura", "Clientes", "Ocorrências", "Ordens de Serviço", "Cobertura", "Monitor de Rede", "Tarefas", "Financeiro"]
tags: [frontend, telas, operacoes, infraestrutura]
---

# Abas de Operações e Infraestrutura

Grupos "Operações" (**Clientes**, **Ocorrências**, **Ordens de Serviço**, **Cobertura**) e "Infraestrutura" (**Monitor de Rede**), mais as telas implementadas sem rota e os stubs. Visão geral em [[Telas e Navegação]].

## Clientes (`/clientes`)

Busca e visualização de clientes integrada ao ERP. `GET /api/clientes?q=` tenta o **[[Integração SGP|SGP]]** primeiro e cai para `conversas` locais. Drawer com Contato/Contrato/Financeiro/CPEs. **Integração:** mesmo SGP que a IA usa; o painel ConversaInfo do [[Abas de Atendimento|Chat]] aponta para cá via `contrato_id`. ⚠️ A busca está quebrada (`useDebounce` mal implementado) e o link de ERP usa `process.env` em vez de `import.meta.env` (ver [[Achados de código (2026-06-30)]]).

## Ocorrências (`/ocorrencias`)

Tickets internos com lista filtrável e timeline. `GET/POST /api/ocorrencias`, `/:id/fechar`, `/:id/notas`. **Integração:** vincula-se a `conversa_id` (do [[Abas de Atendimento|Chat]]), `contrato_id` e `agente_id`. **Distinção importante:** estas são ocorrências **locais** (tabela `ocorrencias`); o nó `abrir_chamado` e a tool `criar_chamado` abrem chamados **no SGP** (`/api/ura/chamado/`) — são registros separados. ⚠️ Mass-assignment no PUT e a rota de notas cria nota órfã.

## Ordens de Serviço (`/ordens`)

OS de campo (instalação/manutenção) com máquina de estados aberta→agendada→em_campo→concluída. `GET/POST/PUT /api/ordens` + `GET /api/agentes` (técnicos). Tem endereço, lat/lng, agendamento. **Integração:** `conversa_id`, `contrato_id`, técnico de [[Abas de Configuração|Agentes]]. ⚠️ `numero` por `COUNT(*)+1` (race condition) e mass-assignment no PUT.

## Cobertura (`/cobertura`)

Mapa de zonas de cobertura (Leaflet/OpenStreetMap). `GET/DELETE /api/cobertura/zonas` + geocoding Nominatim. Hoje **só visualiza e deleta** zonas — falta a ferramenta de desenho/criação. **Integração:** tabela `zonas_cobertura` + `geoUtils.pointInPolygon`; existe um `GET /api/cobertura/check` **público** (consulta de cobertura por lat/lng) pensado para o site/widget.

## Monitor de Rede (`/rede`) — Infraestrutura

NOC: KPIs de equipamentos (online/offline/degradado) e alertas. `GET /api/monitor/status`, auto-refresh 30s. `POST /api/monitor/ping` recebe pings. **Integração / fragilidade:** `equipamentos_rede` é criada **em runtime** pelo `/ping` (DDL fora de migration) e `alertas_rede` nunca é criada → a seção de alertas fica sempre vazia. É uma fonte de status **distinta** do `status_rede`/manutenção do [[Integração SGP|SGP]] usado pela IA.

## Telas implementadas sem rota

- **Tarefas** — quadro Kanban (`/api/tarefas` existe; filtra por agente). **Sem rota em App.jsx** → inacessível pela navegação, apesar de existir a permissão `tarefas`.
- **Financeiro** — KPIs + cobranças + régua de cobrança (`/api/financeiro/*`; régua real, resumo/cobranças dependem de `ERP_URL`). **Sem rota** → inacessível. Botão "Exportar" sem handler.

## Stubs (placeholders vazios)

**Analytics** (única roteada, em Configuração), **Dispositivos** (CPE/TR-069), **Email**, **VoIP**, **Frota** — telas vazias aguardando implementação.

## See Also

- [[Telas e Navegação]] · [[Abas de Atendimento]] · [[Abas de Configuração]]
