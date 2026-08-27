---
title: Abas de Operações
type: component
created: 2026-06-30
last_updated: 2026-08-26
status: active
related: ["[[Telas e Navegação]]", "[[Integração SGP]]", "[[Abas de Atendimento]]", "[[Modelo de Dados]]", "[[API Backend Maxxi]]", "[[Cliente 360 e Copiloto]]", "[[Remoção dos módulos de ERP + Clientes como histórico]]"]
sources: ["2026-06-30_estudo-codigo-maxxi", "2026-08-26_remocao-erp-e-clientes-historico"]
aliases: ["Abas de Operações", "Abas de Operações e Infraestrutura", "Clientes", "Cobertura", "Tarefas", "Financeiro", "Ocorrências", "Ordens de Serviço", "Monitor de Rede"]
tags: [frontend, telas, operacoes]
---

# Abas de Operações

Grupo "Operações" (**Clientes**, **Cobertura**), mais as telas implementadas sem rota e os stubs. Visão geral em [[Telas e Navegação]].

> ### ⚠️ 2026-08-26 — o grupo encolheu, e o de Infraestrutura sumiu
>
> Saíram do produto **Ocorrências**, **Ordens de Serviço** e **Monitor de Rede**
> (migration **027** dropa `ocorrencias`, `ordens_servico`, `equipamentos_rede`,
> `alertas_rede`). Com o Monitor foi o grupo "Infraestrutura" inteiro — sobrava só
> **Saúde do Sistema**, que subiu para **Configuração**. E **Clientes** deixou de ser
> proxy de busca no SGP: virou o **histórico de contato**. Detalhe e tetos em
> [[Remoção dos módulos de ERP + Clientes como histórico]].

## Por que os três saíram

**O ERP desta operação é o SGP.** Ocorrências e Ordens de Serviço eram um ERP em miniatura mantido ao lado dele: o mesmo chamado passava a existir em duas bases e **nada as conciliava**. Não é duplicação de esforço, é duas verdades para o mesmo fato — no dia em que discordassem (e discordariam, porque o técnico fecha a OS no SGP, não aqui), ninguém saberia qual está certa. A IA já abre chamado no lugar certo (`criar_chamado` → `/api/ura/chamado/`) e lê histórico de lá (`historico_ocorrencias`).

O **Monitor de Rede** tinha o mesmo problema com um agravante: era um NMS que ninguém alimentava. `equipamentos_rede` nascia **em runtime** pelo `POST /api/monitor/ping` (`createTableIfNotExists`, DDL fora de migration — o último do código) e `alertas_rede` nunca era escrita, então a seção de alertas ficava eternamente vazia. E era uma fonte de status **distinta** da manutenção do [[Integração SGP|SGP]] que a IA consulta.

**Nenhuma tool da IA foi afetada.** `criar_chamado`, `historico_ocorrencias` e `status_rede` sempre falaram com o SGP por HTTP — nunca com estas quatro tabelas. Nenhum nó do motor e nenhum item do catálogo do editor as tocava. A remoção não muda uma linha do que a IA sabe fazer.

O que **não** saiu junto, apesar de nascer nas mesmas migrations 001/002: `notas` (é a tabela das notas internas do chat), `zonas_cobertura` e `consultas_cobertura` (Cobertura continua no produto).

## Clientes (`/clientes`) — histórico de contato

A pergunta que esta tela responde é a única que **só nós** sabemos responder: *"este número já falou com a gente? quantas vezes? e nós já sabemos quem é?"*. Não é cadastro — o cadastro do assinante é do SGP.

- **Onde mora:** a view **`clientes_contato`** (migration 028), que agrupa `conversas` por `COALESCE(telefone, id::text)`. **Nenhuma tabela nova** — os fatos já estavam ali.
- **O vínculo telefone↔CPF/contrato** aparece porque a IA o gravou em `conversas.cpf`/`contrato_id` na conversa em que identificou o assinante (FASE 6). A view só o lê de volta, pegando o **último valor conhecido** — é isso que faz um número que volta meses depois já aparecer identificado, sem copiar dado para lugar nenhum.
- **O selo "identificado" é `cpf || contrato_id`, não `nome`.** O cliente diz o nome dele no primeiro "oi", e isso não identifica ninguém; confundir os dois faria a tela prometer uma ficha do assinante que não existe.
- **Rotas:** `GET /api/clientes?q=` (lista, busca por nome/telefone/CPF/contrato) e `GET /api/clientes/:conversaId` (o contato e suas últimas 20 conversas). O `:id` é o **uuid da última conversa**, nunca a chave de agrupamento: aceitar o telefone como parâmetro deixaria qualquer agente listar o histórico de um número arbitrário digitando-o na URL.
- **PII é mascarada no servidor** (`mascarar.js`), e a lista exige a capacidade `cliente360`; CPF/telefone inteiros só com `ver_dados_completos`. Ver [[Cliente 360 e Copiloto]].
- **A busca ao vivo no SGP saiu de propósito.** Consultar o ERP por CPF arbitrário é o que o Cliente 360 faz **dentro** de uma conversa, com `contratosPermitidos` limitando o contrato. Um segundo caminho até o SGP sem essa allowlist é exatamente a "integração paralela" que a FASE 6 proibiu. Daqui se chega à ficha por um clique na conversa, não por uma segunda consulta.
- ⚠️ **O bug antigo da lista:** sem `q`, a rota caía num `groupBy(['id', ...])` que — por incluir o `id` — **não agrupava nada**: cinco conversas do mesmo cliente viravam cinco "clientes". O `useDebounce` quebrado (`useState` no lugar de `useEffect`) foi corrigido em 2026-08-21.

## Cobertura (`/cobertura`)

Mapa de zonas de cobertura (Leaflet/OpenStreetMap). `GET/DELETE /api/cobertura/zonas` + geocoding Nominatim. Hoje **só visualiza e deleta** zonas — falta a ferramenta de desenho/criação. **Integração:** tabela `zonas_cobertura` + `geoUtils.pointInPolygon`; existe um `GET /api/cobertura/check` **público** (consulta de cobertura por lat/lng) pensado para o site/widget.

## Telas implementadas sem rota

- **Tarefas** — quadro Kanban (`/api/tarefas` existe; filtra por agente). **Sem rota em App.jsx** → inacessível pela navegação.
- **Financeiro** — KPIs + cobranças + régua de cobrança (`/api/financeiro/*`; régua real, resumo/cobranças dependem de `ERP_URL`). **Sem rota** → inacessível. Botão "Exportar" sem handler.

## Stubs (placeholders vazios)

**Dispositivos** (CPE/TR-069), **Email**, **VoIP**, **Frota** — telas vazias aguardando implementação.

## See Also

- [[Telas e Navegação]] · [[Abas de Atendimento]] · [[Abas de Configuração]] · [[Remoção dos módulos de ERP + Clientes como histórico]]
