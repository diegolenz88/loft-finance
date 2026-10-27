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

O app aceita três provedores de identidade, nesta ordem:

1. **Cloudflare Access** (JWT `Cf-Access-Jwt-Assertion` validado no servidor) — recomendado para vários sócios.
2. **Headers de plataforma** (`oai-authenticated-user-*`) — usado no Sites, sem alteração.
3. **Cookie de sessão assinado** — usado quando não há os anteriores.

Sem identidade, a raiz redireciona para `/api/session` e as APIs respondem `401`.

A tela de entrada fica em **`/api/session`** e pede **e-mail e senha**. Ela aceita
`?return_to=/caminho` para voltar ao ponto de origem depois do login, mostra
`?saiu=1` após o logout e segue o tema claro/escuro do sistema.
`/signin-with-chatgpt` existe apenas no modo de desenvolvimento local (mock do
plugin do Sites) e responde `404` aqui — por isso o app nunca redireciona para ela.

### Criar acesso para outro sócio

1. Em **Configurações → Sócios e permissões**, preencha o **e-mail de acesso** do
   sócio, escolha a permissão e salve as configurações.
2. Em **Configurações → Acessos ao sistema**, clique em **Criar acesso** na linha do
   sócio e defina a senha (mínimo 8 caracteres, com letra e número).
3. Envie o e-mail e a senha ao sócio. Ele entra em `/api/session` e recebe o papel
   cadastrado (`Administrador`, `Editor` ou `Somente leitura`).
4. Para revogar, clique em **Remover** na mesma tela; sessões já emitidas expiram em
   até 30 dias ou ao sair.

As senhas são gravadas como hash PBKDF2-SHA256 com sal individual na tabela
`finance_credentials` do D1, fora do ledger — portanto nunca trafegam para o
navegador nem aparecem na API financeira.

### Link mágico (entrar sem senha)

A tela de entrada tem duas abas: **Senha** e **Link mágico**. No modo link, a
pessoa informa o e-mail e recebe um endereço de uso único, válido por 15 minutos.

| Item | Detalhe |
| --- | --- |
| Tabela | `finance_login_links` (guarda só o SHA-256 do token) |
| Validade | 15 minutos, uso único, consumo atômico |
| Quem recebe | proprietário e sócios ativos com e-mail cadastrado |
| Resposta | sempre a mesma, para não revelar quem tem acesso |

Para o envio automático, escolha **um** provedor e informe a chave e o remetente.
Todos usam apenas chamadas HTTPS, sem binding extra:

| Provedor | Variável da chave | Observação |
| --- | --- | --- |
| Brevo | `BREVO_API_KEY` | Grátis 300/dia; basta verificar um e-mail remetente, sem domínio próprio |
| Resend | `RESEND_API_KEY` | Grátis 3.000/mês; exige domínio verificado para enviar a terceiros |
| MailerSend | `MAILERSEND_API_KEY` | Grátis 3.000/mês; exige domínio verificado |
| Cloudflare Email Sending | binding `EMAIL` | Nativo, em beta; exige domínio na Cloudflare |

Além da chave, defina o remetente:

| Variável | Exemplo |
| --- | --- |
| `MAGIC_LINK_FROM` | `Loft Finance <acesso@seudominio.com>` |
| `MAIL_PROVIDER` | opcional; força um provedor quando há mais de uma chave |

O caminho mais rápido (o script valida, publica os segredos e guarda no arquivo
local ignorado pelo Git):

```powershell
$env:MAIL_PROVIDER = "brevo"
$env:BREVO_API_KEY = "<chave do painel do Brevo>"
$env:MAGIC_LINK_FROM = "Loft Finance <acesso@seudominio.com>"
node scripts/setup-email.mjs
```

Depois do deploy, confirme em **Configurações → Acessos ao sistema**: o bloco
"Envio de e-mail configurado" mostra o provedor e o remetente, e o botão
**Enviar e-mail de teste** dispara uma mensagem real para o seu endereço. Se o
provedor recusar a chave ou o remetente, a tela diz exatamente isso (chave
recusada ou remetente não autorizado) em vez de falhar em silêncio.

Sem nenhuma chave o envio fica desativado e a tela avisa para pedir o link ao
administrador. O administrador pode gerar o link manualmente em
**Configurações → Acessos ao sistema → Gerar link** (copiado para a área de
transferência, válido por 15 minutos) e enviar por um canal seguro.

Para remover o acesso de alguém, clique em **Remover**: as senhas param de valer
imediatamente e os links pendentes continuam válidos por até 15 minutos.

O e-mail do proprietário (`AUTH_OWNER_EMAIL`) continua entrando com a senha mestra
`APP_PASSWORD`, que serve de recuperação caso alguma senha seja perdida.

Segredos necessários:

| Nome | Função |
| --- | --- |
| `AUTH_SECRET` | chave HMAC do cookie (mínimo 32 caracteres) |
| `APP_PASSWORD` | senha única de acesso (modo provisório) |
| `AUTH_OWNER_EMAIL` | e-mail do proprietário |
| `AUTH_OWNER_ID` | vira `finance_project.owner` e concede papel admin |

## Cloudflare Access (acesso individual)

O Worker valida a assinatura RS256 do JWT, `iss` (team domain), `aud` (AUD da aplicação) e a expiração antes de confiar no e-mail. O e-mail validado é comparado com os participantes ativos do ledger: proprietário → `admin`; demais encontram o papel cadastrado (`admin`, `editor` ou `viewer`). E-mail não cadastrado recebe `403`.

| Segredo | Valor |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | ex.: `minha-equipe.cloudflareaccess.com` |
| `ACCESS_AUD` | Application Audience (AUD) Tag da aplicação no Zero Trust |
| `ACCESS_REQUIRED` | `1` para exigir Access e desativar o fallback de senha |

Passo a passo:

1. No painel, **Zero Trust → Access controls → Applications**: crie uma aplicação self-hosted para o domínio do Worker.
2. Em **Additional settings**, copie o **Application Audience (AUD) Tag**.
3. Publique os segredos acima (`npx wrangler secret put ACCESS_TEAM_DOMAIN`, etc.).
4. Cadastre o e-mail de cada sócio em **Configurações → Sócios e permissões**, com o papel desejado.
5. Teste com `node scripts/access-smoke.mjs https://<worker>` antes de definir `ACCESS_REQUIRED=1`.
6. Só então ative `ACCESS_REQUIRED=1` e remova `APP_PASSWORD` se não precisar mais dele.

> Enquanto `ACCESS_REQUIRED` não for `1`, o login por senha continua funcionando como transição. Isso evita bloquear o proprietário antes da política do Access estar pronta.

O botão **Encerrar sessão neste dispositivo** limpa apenas o cookie da aplicação. A sessão global do Cloudflare Access é gerenciada pelo próprio Access.

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
| `node scripts/attachments-smoke.mjs <url>` | prévia inline, download e bloqueio anônimo dos comprovantes |
| `node scripts/access-smoke.mjs <url>` | confirma que JWTs forjados do Access são rejeitados |
| `node scripts/migrate-data.mjs` | copia o ledger local para o D1 de produção |
| `node scripts/compare-data.mjs` | compara digests e totais entre local e produção |
| `node scripts/dev-vars.mjs` | copia `.dev.vars` para `dist/server` (usado pelo `pnpm start`) |
