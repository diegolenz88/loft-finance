# Loft Finance — código-fonte

Exportação de 13/10/2026, correspondente à versão 5 publicada no Sites.
Commit: `982bdd99d57b8bafef2c02af0c63c454f129cef4`.

## O que está incluído

- Interface React/TypeScript e estilos responsivos.
- API, regras financeiras, controle de sócios, fornecedores e clientes.
- Entrada e parcelas nas despesas.
- Oito studios ativos (Lofts 01 a 08) e preservação das unidades inativas.
- Modelagem D1, migração SQL, suporte a comprovantes em R2 e testes.
- Dependências e versões no `package.json` e `pnpm-lock.yaml`.

Esta é uma exportação do código. Os lançamentos financeiros cadastrados e os
comprovantes do ambiente publicado não integram este ZIP. A base local começa vazia;
a demonstração é gerada pelo código. Nenhum registro do sistema publicado foi alterado.

## Executar no computador

Pré-requisitos: Node.js 24 e pnpm 11.25.0. Os comandos abaixo podem ser executados
em um terminal na pasta `loft-finance` extraída do ZIP, inclusive no PowerShell.

1. Instale o gerenciador de pacotes e as dependências:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

Use `pnpm install` para a instalação local. O script `install:ci` do projeto foi
preparado para o ambiente Linux do Sites e depende de utilitários desse ambiente.

2. Compile para gerar a configuração local do Worker:

```sh
pnpm build
```

3. Inicialize o banco de dados local, apenas na primeira configuração de uma base vazia:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_conscious_captain_cross.sql
```

A opção `--local` cria as tabelas somente no computador. Não reaplique essa migração
em uma base que já contém as tabelas. O banco e os arquivos locais ficam em `.wrangler/`.

4. Inicie o servidor de desenvolvimento:

```sh
pnpm dev
```

Abra a URL exibida no terminal, normalmente `http://localhost:5173`.
Para entrar no ambiente local, abra no navegador:

```text
http://localhost:5173/signin-with-chatgpt?return_to=/
```

Se o terminal indicar outra porta, use essa mesma porta no link. O modo de desenvolvimento
local inclui a identidade de teste `Seedy` (`seedy@sites.test`). Esse mecanismo é
restrito ao computador local e não integra a autenticação de produção.
Depois de entrar, use “Configurar empreendimento” para cadastrar os dados locais.
Não é necessário copiar cookies ou credenciais do site publicado.

## Verificar as regras financeiras

Na raiz do projeto, execute:

```sh
node --experimental-strip-types tests/finance.test.mjs
node --experimental-strip-types tests/installments.test.mjs
node --experimental-strip-types tests/contacts-expenses.test.mjs
node --experimental-strip-types tests/finance-client.test.mjs
node --experimental-strip-types tests/unit-activity.test.mjs
node --experimental-strip-types tests/budget-rateio.test.mjs
node --experimental-strip-types tests/budget-units.test.mjs
node --experimental-strip-types tests/budget-edit.test.mjs
node --experimental-strip-types tests/budget-link.test.mjs
node --experimental-strip-types tests/expense-payment-edit.test.mjs
node --experimental-strip-types tests/expense-plan-edit.test.mjs
node --experimental-strip-types tests/attachments.test.mjs
node --experimental-strip-types tests/theme.test.mjs
node --experimental-strip-types tests/profile.test.mjs
pnpm exec tsc --noEmit
```

Os testes e a compilação da versão exportada passaram no ambiente do projeto antes
da publicação. A instalação e a interface no seu computador não foram verificadas
nesta exportação.

## Organização

| Pasta/arquivo | Conteúdo |
| --- | --- |
| `app/finance-app.tsx` | Telas financeiras e formulários |
| `app/unit-settings.tsx` | Ativação e inativação das unidades |
| `app/contacts.tsx` | Fornecedores e clientes |
| `app/api/` | Endpoints financeiros, anexos e diagnóstico |
| `lib/finance.ts` | Regras, rateios e validações |
| `lib/server.ts` | Persistência e permissões |
| `db/` e `drizzle/` | Modelagem e migração do banco |
| `tests/` | Testes das regras e do cliente da API |
| `vite.config.ts` e `build/` | Integração Vinext/Cloudflare |

## Unidades ativas

O cadastro mantém todos os lofts. `config.inactiveUnits` controla a disponibilidade
para novos lançamentos. Configurações antigas sem esse campo são lidas com os Lofts
09 a 12 inativos; a lista explícita é persistida na próxima gravação normal.
Uma configuração explícita prevalece, permitindo reativar unidades.
Histórico, rateios, parcelas e comprovantes existentes permanecem vinculados às
unidades originais. As áreas comuns continuam ativas.

## Hospedagem

O projeto usa Cloudflare Workers, D1 (`DB`) e R2 (`BUCKET`), com autenticação gerenciada
pelo Sites no ambiente publicado. A execução em outro provedor exige configurar esses
serviços ou adaptar persistência e autenticação. Não é um aplicativo composto somente
por arquivos estáticos.

A configuração `.openai/hosting.json` foi preservada por fazer parte do projeto
existente. Ela identifica o Site original; não é uma credencial. Para criar outro
Site independente, use o fluxo de criação da plataforma, sem reaproveitar a identidade
de publicação do Site original.

O arquivo `README.md` contém a documentação técnica original do projeto.

## Publicar em um Worker próprio

O projeto também pode ser publicado diretamente em uma conta Cloudflare, sem a
plataforma Sites, usando login por senha. O passo a passo, os recursos criados e
as limitações estão em `docs/DEPLOY-CLOUDFLARE.md`.
