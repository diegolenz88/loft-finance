# Deploy no Cloudflare (Worker próprio)

Como o Loft Finance roda fora da plataforma Sites: Worker + D1 + R2 na sua conta Cloudflare.

## Situação atual do deploy

| Item | Valor |
| --- | --- |
| URL | <https://loft-finance.ddiieeggoolleennzz.workers.dev> |
| Worker | `loft-finance` |
| Banco D1 | `loft-finance-db` (`d8f75d27-4308-4741-b0f0-25cb8f318a4a`, região ENAM) |
| Migração | aplicada (`finance_project`, `finance_files`) |
| Segredos | publicados |
| R2 | ativo — bucket `loft-finance-files`, upload de comprovantes validado |
| Dados | migrados do ambiente local: 8 lançamentos, 4 movimentações, 49 registros de auditoria, 9 linhas de orçamento, 2 contatos |

## Autenticação

O app aceita dois provedores de identidade, nesta ordem:

1. **Headers de plataforma** (`oai-authenticated-user-*`) — usado no Sites, sem alteração.
2. **Cookie de sessão assinado** — usado quando não há headers. Implementado em `lib/identity.ts`.

Sem identidade, a raiz redireciona para `/api/session` (tela de senha) e as APIs respondem `401`.

Segredos necessários:

| Nome | Função |
| --- | --- |
| `AUTH_SECRET` | chave HMAC do cookie (mínimo 32 caracteres) |
| `APP_PASSWORD` | senha única de acesso |
| `AUTH_OWNER_EMAIL` | e-mail do proprietário |
| `AUTH_OWNER_ID` | vira `finance_project.owner` e concede papel admin |

> `AUTH_OWNER_ID` **não pode mudar** depois do primeiro cadastro, ou o acesso de administrador é perdido.

As credenciais geradas ficam em `.deploy-secrets.txt` (ignorado pelo Git). Guarde esse arquivo: sem ele não há como recuperar a senha.

## Comandos

```powershell
# 1. autenticar
npx wrangler login

# 2. criar recursos (uma vez)
npx wrangler d1 create loft-finance-db
npx wrangler r2 bucket create loft-finance-files   # exige R2 ativado no painel

# 3. compilar, injetar IDs e publicar
$env:D1_ID = "<database_id>"
pnpm deploy

# 4. migrar o banco remoto (uma vez, após o primeiro build)
npx wrangler d1 execute loft-finance-db --remote `
  --config dist/server/wrangler.json `
  --file drizzle/0000_conscious_captain_cross.sql

# 5. publicar segredos (uma vez)
node scripts/provision-secrets.mjs

# 6. validar
node scripts/prod-smoke.mjs https://loft-finance.<subdominio>.workers.dev
```

### Por que existe `scripts/deploy.mjs`

`pnpm build` **regenera** `dist/server/wrangler.json` com valores de exemplo (`database_id` zerado, nomes `site-creator-*`). Publicar esse arquivo cria um Worker ligado a um banco inexistente. O script faz build → injeta os IDs reais → publica, na ordem correta.

Variáveis aceitas:

| Variável | Efeito |
| --- | --- |
| `D1_ID` | obrigatória; id real do banco |
| `WORKER_NAME` | padrão `loft-finance` |
| `D1_NAME` / `R2_NAME` | nomes dos recursos |
| `SKIP_R2=1` | publica sem binding R2 |
| `DRY_RUN=1` | valida a configuração sem publicar |

## Ativar comprovantes (R2)

R2 já está ativado nesta conta e o bucket existe. O deploy atual inclui os dois bindings:

```text
env.DB (loft-finance-db)         D1 Database
env.BUCKET (loft-finance-files)  R2 Bucket
```

Se o R2 ainda não estivesse ativo, o procedimento seria:

1. Abra <https://dash.cloudflare.com> → **R2** → **Enable R2** (o plano gratuito pede cartão, sem cobrança dentro da cota).
2. Crie o bucket: `npx wrangler r2 bucket create loft-finance-files`.
3. Publique sem `SKIP_R2`:

```powershell
$env:D1_ID = "d8f75d27-4308-4741-b0f0-25cb8f318a4a"
pnpm deploy
```

Sem o binding, anexar ou baixar comprovantes retorna uma mensagem clara em vez de erro genérico.

## Primeiro acesso

1. Abra a URL do Worker e informe `APP_PASSWORD`.
2. O app abre em modo de configuração; cadastre o empreendimento, sócios e unidades.
3. Confirme que os dados persistem recarregando a página.

## Migrar dados do ambiente local

O ledger fica em `finance_project.data` como JSON, então a cópia não exige migração de schema.

```powershell
node scripts/migrate-data.mjs --check   # compara origem e destino, sem gravar
node scripts/migrate-data.mjs           # aborta se produção já tiver dados
node scripts/migrate-data.mjs --force   # substitui o ledger de produção
node scripts/compare-data.mjs           # confere digest e totais agregados
```

O script:

- lê o ledger da API local (`http://127.0.0.1:5174`) usando a identidade simulada do modo dev;
- grava um backup em `.wrangler/backup/ledger-<data>.json` antes de tocar em produção;
- regrava a coluna `owner` com o `AUTH_OWNER_ID` de produção — sem isso a conta perde o papel de administrador;
- aplica um `INSERT ... ON CONFLICT DO UPDATE` idempotente e verifica o resultado pela API.

Comprovantes ficam no R2, não no D1. Se houver anexos, eles precisam ser copiados separadamente; a migração atual não os transporta.

## Limitações conhecidas

- **Senha única = acesso total de admin.** Não há papéis distintos no login standalone. Para separar sócios (`editor`/`viewer`) sem compartilhar a senha, use Cloudflare Access com JWT e adapte `currentIdentity` para ler o e-mail do IdP.
- **Dados do Sites não migram automaticamente.** A exportação CSV não reconstrói movimentos nem comprovantes. Este deploy começa vazio.
- **`dist/` é descartado em cada build.** Sempre publique via `pnpm deploy`.
- **O build troca o banco local.** `pnpm deploy` grava os nomes reais no `wrangler.json`, então um `pnpm start` seguinte aponta para outro banco local (sem tabelas) e a interface falha até rodar a migração `--local` de novo. Alternativa: rode `pnpm build` sem `deploy` antes de testar localmente.
- **`vinext 1.0.0-beta.5`** roda no Workers, mas é versão beta fora da plataforma original.
- O Worker não faz backup automático. Configure exportação periódica do D1 e cópia do bucket R2 antes de registrar dados reais.

## Ferramentas de verificação

| Script | Função |
| --- | --- |
| `node scripts/verify.mjs` | 10 testes financeiros + `tsc --noEmit` |
| `node scripts/auth-smoke.mjs <url>` | login no Worker **local** (`pnpm start`) |
| `node scripts/prod-smoke.mjs <url>` | login e acesso autenticado em **produção** |
| `node scripts/r2-smoke.mjs <url> full` | upload + download de comprovante (use `SEED=1` em base local vazia) |
| `node scripts/r2-smoke.mjs <url> probe` | confirma que o binding R2 responde, sem gravar dados |
| `node scripts/migrate-data.mjs` | copia o ledger local para o D1 de produção |
| `node scripts/compare-data.mjs` | compara digests e totais entre local e produção |
| `node scripts/dev-vars.mjs` | copia `.dev.vars` para `dist/server` (usado pelo `pnpm start`) |
