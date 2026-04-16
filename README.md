# Maxxi v2

Sistema de atendimento omnichannel com IA para provedores de internet.  
Reconstruído do zero com arquitetura limpa, migrations formais e design system próprio.

---

## Stack

| Camada     | Tecnologia                                      |
|------------|-------------------------------------------------|
| Frontend   | React 19 + Vite + React Router 6                |
| Estado     | Zustand + TanStack Query                        |
| Backend    | Node.js + Express                               |
| Banco      | PostgreSQL 16 + Knex (migrations formais)       |
| Realtime   | SSE + Redis Pub/Sub                             |
| Auth       | JWT (7 dias) + bcrypt                           |
| IA         | Anthropic Claude + OpenAI                       |

---

## Estrutura

```
maxxi-v2/
├── apps/
│   ├── web/                  ← Frontend React
│   │   └── src/
│   │       ├── components/
│   │       │   ├── ui/       ← Button, Input, Toast
│   │       │   ├── layout/   ← Sidebar, Topbar
│   │       │   └── chat/     ← ConversaList, ConversaView, ConversaInfo
│   │       ├── pages/        ← Uma página por módulo
│   │       ├── hooks/        ← useChat, etc.
│   │       ├── store/        ← Zustand stores
│   │       ├── lib/          ← api.js (cliente HTTP centralizado)
│   │       └── styles/       ← tokens.css, global.css
│   │
│   └── api/                  ← Backend Express
│       └── src/
│           ├── config/       ← db.js (Knex)
│           ├── middlewares/  ← auth.js, errorHandler.js
│           ├── migrations/   ← run.js + versions/
│           ├── repositories/ ← conversaRepository, mensagemRepository
│           ├── routes/       ← auth, chat, agentes, fluxos, ...
│           └── services/
│               ├── sseManager.js
│               └── webhooks/ ← meta.js, evolution.js, telegram.js
│
└── docker-compose.yml
```

---

## Início rápido

### Com Docker (recomendado)

```bash
# 1. Clone e configure
cp apps/api/.env.example apps/api/.env
# Edite apps/api/.env com suas chaves

# 2. Suba os serviços
docker-compose up -d

# 3. Rode as migrations e seed
docker-compose exec api npm run seed

# 4. Acesse
# Frontend: http://localhost:3000
# API:      http://localhost:4000
```

### Sem Docker

```bash
# Pré-requisitos: PostgreSQL 16, Redis 7, Node.js 20+

# Backend
cd apps/api
cp .env.example .env
npm install
npm run seed    # migrations + dados iniciais
npm run dev

# Frontend (outro terminal)
cd apps/web
npm install
npm run dev
```

---

## Credenciais padrão (desenvolvimento)

| Usuário | Login      | Senha      |
|---------|------------|------------|
| Admin   | `admin`    | `admin123` |
| Agente  | `agente01` | `agente123`|

⚠️ **Troque as senhas antes de ir para produção.**

---

## Canais suportados

| Canal       | Provider             | Configuração               |
|-------------|----------------------|----------------------------|
| WhatsApp    | Meta Cloud API       | `META_ACCESS_TOKEN`        |
| WhatsApp    | Evolution API        | `EVOLUTION_URL` + `KEY`    |
| Telegram    | Bot API              | `TELEGRAM_BOT_TOKEN`       |
| Widget Web  | Nativo               | Embutido via `<script>`    |
| E-mail      | IMAP/SMTP            | Variáveis `IMAP_*`/`SMTP_*`|
| VoIP        | Asterisk ARI         | `ASTERISK_*`               |

---

## Migrations

Cada migration é um arquivo em `apps/api/src/migrations/versions/`.  
Nunca use `ALTER TABLE` diretamente — crie uma nova migration.

```bash
# Criar nova migration
touch apps/api/src/migrations/versions/002_minha_mudanca.js

# Rodar migrations pendentes
npm run migrate
```

Estrutura de uma migration:

```js
export async function up(db) {
  await db.schema.table('conversas', t => {
    t.string('novo_campo').nullable();
  });
}

export async function down(db) {
  await db.schema.table('conversas', t => {
    t.dropColumn('novo_campo');
  });
}
```

---

## Módulos implementados

| Módulo          | Status     |
|-----------------|------------|
| Auth / Login    | ✅ Completo |
| Chat (SSE)      | ✅ Completo |
| Histórico       | ✅ Completo |
| Dashboard       | ✅ Completo |
| Agentes         | ✅ Completo |
| Fluxos          | ✅ Completo |
| Monitor de Rede | ✅ Completo |
| Tarefas         | 🔲 Stub    |
| Satisfação/NPS  | 🔲 Stub    |
| Canais          | 🔲 Stub    |
| Clientes        | 🔲 Stub    |
| Ocorrências     | 🔲 Stub    |
| Ordens de Serviço| 🔲 Stub   |
| Frota           | 🔲 Stub    |
| Cobertura       | 🔲 Stub    |
| Dispositivos CPE| 🔲 Stub    |
| Financeiro      | 🔲 Stub    |
| E-mail          | 🔲 Stub    |
| VoIP            | 🔲 Stub    |
| Configurações   | 🔲 Stub    |

---

## Design System

Paleta **industrial refinada** — escuro, acento único `#00E5A0`.

Fontes: **Syne** (display) + **DM Sans** (corpo) + **Geist Mono** (código)

Tokens em `apps/web/src/styles/tokens.css`.  
Componentes base em `apps/web/src/components/ui/`.

---

## Variáveis de ambiente essenciais

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=chave-forte-aleatoria
```

Veja o arquivo completo em `apps/api/.env.example`.
