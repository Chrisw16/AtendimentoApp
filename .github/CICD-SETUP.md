# CI/CD — Guia de Configuração

## Visão geral

O pipeline tem 4 jobs executados em sequência:

```
push na main
    │
    ├─ build-frontend    (build React + Vite)
    ├─ check-backend     (verificação de sintaxe e arquivos)
    │
    └─ build-docker      (constrói e publica imagem no GHCR)
        │
        └─ deploy        (dispara redeploy no Coolify)
```

PRs rodam apenas `build-frontend`, `check-backend` e verificações de integridade — sem push de imagem.

---

## 1. Configurar secrets no GitHub

Acesse: **Settings → Secrets and variables → Actions → Secrets**

| Secret | Descrição | Obrigatório |
|---|---|---|
| `COOLIFY_WEBHOOK_URL` | URL do webhook de deploy do Coolify | ✅ |
| `COOLIFY_TOKEN` | Bearer token do Coolify | ✅ |

> O `GITHUB_TOKEN` é gerado automaticamente pelo Actions — não precisa criar.

---

## 2. Configurar variáveis no GitHub

Acesse: **Settings → Secrets and variables → Actions → Variables**

| Variável | Valor padrão | Descrição |
|---|---|---|
| `HEALTH_CHECK_URL` | `https://app.maxxi.ai/health` | URL para verificar após deploy |

---

## 3. Configurar o Coolify

### 3.1 Criar a application

1. Coolify → **New Resource → Docker Image**
2. Image: `ghcr.io/SEU_USUARIO/maxxi-saas:latest`
3. Port: `3000`
4. Domains: seu domínio

### 3.2 Configurar variáveis de ambiente no Coolify

Cole todas as variáveis do `.env.example` com os valores reais.  
As mais críticas:

```
DATABASE_URL=postgres://...
JWT_SECRET=<gere com: openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

### 3.3 Pegar o Webhook URL

Coolify → Application → **Deploy** → **Webhook** → copiar a URL

Cole em `COOLIFY_WEBHOOK_URL` nos secrets do GitHub.

### 3.4 Pegar o Bearer Token

Coolify → **Settings** → **API** → **Token** → copiar

Cole em `COOLIFY_TOKEN` nos secrets do GitHub.

---

## 4. Configurar o GitHub Container Registry (GHCR)

O workflow usa `GITHUB_TOKEN` para autenticar no GHCR — não precisa criar nada.  
Mas a imagem precisa ser pública ou o Coolify precisa de credenciais:

**Se for imagem privada:**
1. Gere um token em GitHub → **Settings → Developer settings → Personal access tokens**
2. Permissões: `read:packages`
3. No Coolify: **Docker Registry → New → GitHub Container Registry** → cole o token

**Se for imagem pública** (mais simples):
1. Após o primeiro push, acesse: `github.com/SEU_USUARIO?tab=packages`
2. Clique na imagem → **Package settings → Change visibility → Public**

---

## 5. Primeiro deploy manual

Antes do CI rodar pela primeira vez, faça o deploy manual:

```bash
# 1. Clone e configure o .env
cp .env.example .env
# Edite .env com os valores reais

# 2. Build local (opcional — teste antes do CI)
docker build -t maxxi-saas:local .
docker run -p 3000:3000 --env-file .env maxxi-saas:local

# 3. Ou suba direto com PM2
npm install
cd admin-ui && npm install && npm run build && cd ..
node migrate-saas-tenancy.js   # rodada UMA vez no banco
node server.js
```

---

## 6. Criar o super-admin (primeiro acesso)

Após o primeiro deploy, acesse via API:

```bash
curl -X POST https://app.maxxi.ai/admin/api/super-admin/setup \
  -H "Content-Type: application/json" \
  -d '{"senha": "SUA_SENHA_SEGURA"}'
```

Resposta esperada:
```json
{ "ok": true, "mensagem": "Super-admin criado. Faça login em /api/login com login=superadmin." }
```

Depois, faça login normalmente no painel com `login=superadmin`.

---

## 7. Fluxo de trabalho diário

```bash
# Desenvolver
git checkout -b feat/minha-feature
# ... código ...
git push origin feat/minha-feature
# → Abre PR → PR Check roda automaticamente

# Merge para main
git checkout main && git merge feat/minha-feature
git push origin main
# → CI/CD completo: build → Docker → deploy
```

---

## 8. Troubleshooting

**Build falha no GitHub Actions:**
- Verifique os logs em Actions → workflow → job
- Mais comum: `npm ci` falha → delete `package-lock.json` e regenere

**Deploy falha no Coolify:**
- Verifique `COOLIFY_WEBHOOK_URL` e `COOLIFY_TOKEN`
- Acesse Coolify → Application → Logs

**Health check não responde:**
- O serviço pode demorar até 2min para subir pela primeira vez
- Verifique `DATABASE_URL` — o servidor não sobe sem banco

**Imagem não encontrada no Coolify:**
- Verifique se a imagem é pública ou se as credenciais do GHCR estão corretas
- Confirme que o push foi para `ghcr.io/SEU_USUARIO/maxxi-saas:latest`
