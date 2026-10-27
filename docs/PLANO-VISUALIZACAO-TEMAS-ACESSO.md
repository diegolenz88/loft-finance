# Plano: visualizar arquivos, temas e controle de acesso

Data: 26/10/2026  
Escopo: planejamento; nenhuma implementação ou configuração foi alterada.

> **Status: implementado.** A prévia inline, a preferência de tema e a validação
> individual via Cloudflare Access estão no código. A ativação do modo
> obrigatório depende de configurar a aplicação no Zero Trust e publicar os
> segredos `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ACCESS_REQUIRED`; ver
> `docs/DEPLOY-CLOUDFLARE.md`.

## Objetivo

Permitir que usuários autorizados abram comprovantes dentro do Loft Finance, sem baixar o arquivo para inspecioná-lo; ofereça escolha persistente entre tema claro e escuro; e estabeleça login e permissões individuais adequadas aos sócios e colaboradores.

## Estado observado

- Arquivos permitidos hoje: PDF, JPG, PNG e WebP, até 10 MB, gravados no R2; metadados estão em `finance_files`.
- `GET /api/files?id=...` já verifica identidade e responde `Cache-Control: private, no-store` e `X-Content-Type-Options: nosniff`, mas envia `Content-Disposition: attachment`, forçando download.
- O upload agora distingue `kind: expense | payment` e comprovante de pagamento pode apontar para a movimentação (`move`).
- O layout define `<html className="dark">` fixamente.
- Há dois modos de identidade: cabeçalhos confiáveis da hospedagem Sites ou cookie de sessão HMAC no Worker próprio.
- O login standalone usa uma única senha/identidade de administrador; o modelo já prevê papéis `admin`, `editor` e `viewer`, identificados pelo e-mail do participante.

## Etapa 1 — Visualização inline dos comprovantes

### Experiência de visualização

- Transformar o nome do arquivo em ação **Visualizar**, com ícone/ícone de abertura, mantendo **Baixar** como ação distinta e explícita.
- Abrir em diálogo/folha lateral autenticada, sem sair do lançamento; manter contexto do tipo do anexo:
  - **Documento da despesa** para nota fiscal, orçamento ou contrato.
  - **Comprovante do pagamento** junto à movimentação correspondente.
- PDF: visualizar incorporado no navegador com toolbar nativa e opção de abrir em nova aba.
- Imagem: `<img>` responsiva, limitada ao painel, com zoom básico opcional.
- Tipos não suportados inline: oferecer download explícito, sem tentar renderizar conteúdo arbitrário.
- Mostrar carregamento, erro, nome, tipo e ação de baixar; no celular, usar visualizador em tela cheia.

### API e segurança

- Manter rota protegida por `access()`; nenhuma URL pública ou URL assinada longa persistente.
- Selecionar o `Content-Type` pelo MIME validado no upload e responder inline apenas para PDF/JPEG/PNG/WebP. Usar `Content-Disposition: inline` para preview e parâmetro/rota explícita para download.
- Verificar no servidor que o arquivo pertence ao lançamento solicitado e ao empreendimento; validar também o vínculo `move` para comprovantes de pagamento.
- Preservar `private, no-store`, `X-Content-Type-Options: nosniff` e política CSP apropriada para PDF/iframe. Não injetar HTML/SVG nem usar `dangerouslySetInnerHTML`.
- Não registrar conteúdo nem bytes dos documentos em logs. Exibir mensagem útil para arquivos ausentes e falhas do R2.

### Critérios de aceite da prévia

- PDF abre no painel sem iniciar download; JPG/PNG/WebP aparecem na prévia.
- Download continua disponível e entrega bytes idênticos ao arquivo enviado.
- Visitante sem sessão recebe 401; arquivo de outro lançamento não pode ser lido por trocar o ID.
- Um comprovante de pagamento é apresentado com a movimentação certa; documento fiscal permanece na seção da despesa.
- Prévia testada em desktop e celular, sem conteúdo sobreposto ou expansão da página.

## Etapa 2 — Tema claro/escuro persistente

### Experiência de temas

- Adicionar controle Claro/Escuro nas configurações (toggle/segmented control), acessível também pelo menu do usuário.
- Respeitar preferência do sistema no primeiro acesso; a escolha manual passa a prevalecer.
- Persistir preferência por usuário e dispositivo sem incluir o tema no ledger financeiro nem gravar alterações de configuração/auditoria da obra.
- Aplicar tema a login, diálogos, gráficos, tabelas, impressão e visualizador de comprovantes.
- Evitar flash do tema oposto na hidratação; usar atributo `data-theme`/classe inicial e variáveis CSS existentes.

### Critérios de aceite dos temas

- Claro, escuro e automático ficam visualmente completos e legíveis.
- Preferência sobrevive recarga e navegação; modo automático acompanha o sistema.
- Não há hydration mismatch causado pela preferência nem alteração de dados financeiros.
- Contraste de controles, texto secundário, foco e estados de erro validado em ambos os temas.

## Etapa 3 — Login individual e controle de acesso

### Direção recomendada

Para uso por sócios diferentes, substituir a senha compartilhada por **Cloudflare Access/Zero Trust com um IdP** (Google/Microsoft/e-mail corporativo) e validar no Worker o JWT `Cf-Access-Jwt-Assertion`, incluindo assinatura/audience e e-mail verificado. O `email` validado deve mapear para participante ativo; a aplicação já resolve os papéis `admin`, `editor` e `viewer` por e-mail.

Não confiar somente em `Cf-Access-Authenticated-User-Email` enviado pelo cliente: o Worker deve validar o JWT assinado no servidor e exigir a audiência da aplicação. Configurar políticas do Access para restringir grupos/e-mails e proteger rotas, mantendo a verificação de autorização dentro de cada API.

### Alternativa de transição

Manter o login por senha atual apenas para proprietário e permitir Cloudflare Access como provedor adicional, com precedência e fallback claramente definidos. Não aceitar cabeçalhos de identidade arbitrários em produção. Para sessões próprias, acrescentar rate limiting, expiração/revogação e proteção contra tentativas de senha; evitar enviar segredos por interface de chat ou persistir senha em texto claro fora do cofre local.

### Matriz de autorização a formalizar

| Ação | Admin | Editor | Viewer |
| --- | --- | --- | --- |
| Ver ledger e prévias autorizadas | Sim | Sim | Sim |
| Criar/editar lançamentos e enviar arquivos | Sim | Sim | Não |
| Corrigir movimentação | Definir explicitamente | Definir explicitamente | Não |
| Aprovar distribuições, estornar ou alterar regras | Sim | Não por padrão | Não |
| Convidar/inativar usuários e alterar papéis | Sim | Não | Não |

A matriz final deve corresponder às regras de negócio aprovadas; esta tabela é uma proposta, não uma descrição garantida de todas as regras atuais. Verificar se `viewer` pode abrir e baixar documentos (proposta: sim, pois já pode consultar o lançamento), e testar a política pelo endpoint, não apenas esconder botões.

### Migração de identidade

1. Inventariar sócios e e-mails no D1 sem exportar dados financeiros desnecessários.
2. Corrigir/confirmar e-mails e papéis antes de ativar o mapeamento; não usar nome como identificador.
3. Configurar Access, audience e política de grupo; validar JWT no Worker.
4. Testar proprietário, admin adicional, editor, viewer, e-mail desconhecido, conta desativada, JWT expirado/alterado e chamada direta de API.
5. Preservar `AUTH_OWNER_ID=owner` durante a transição para não perder a propriedade atual do registro.
6. Só depois desativar a senha compartilhada; manter procedimento documentado de recuperação do proprietário.

### Critérios de aceite do acesso

- Cada usuário entra com a própria identidade e é mapeado ao papel aprovado.
- JWT inválido, expirado, audiência incorreta e identidade não cadastrada são rejeitados.
- APIs de ledger, arquivos, diagnóstico e mutações verificam sessão e autorização no servidor.
- Leitor não grava nem chama rotas de mutação diretamente; editor não executa ações restritas a admin.
- Cookies de sessão não são aceitos como substitutos de identidade Access quando o modo Access está obrigatório.
- Recuperação de administrador testada sem compartilhamento da senha entre usuários.

## Sequência de entrega

1. **Pré-requisito:** backup/restauração comprovados e política de permissões acordada.
2. **Prévia inline:** mudança pequena e isolada em rota de arquivos e detalhe da despesa; não altera o ledger existente.
3. **Temas:** centralizar tokens claro/escuro, persistir preferência no cliente e validar todas as telas.
4. **Access:** desenvolver e testar autenticação individual em staging; depois habilitar em produção e revogar senha compartilhada.
5. **Verificação final:** suíte financeira, TypeScript, upload/preview/download R2 em ambiente descartável, testes de autorização por papel e smoke test de produção.

Não combinar migração de identidade com migração de dados financeiros ou esquema na mesma publicação. Fazer rollout atrás de configuração temporária, monitorar 401/403 e falhas de preview e manter plano de retorno.

## Arquivos/camadas prováveis

- Preview e autorização: `app/api/files/route.ts`, `lib/server.ts`, `lib/identity.ts`, `app/finance-app.tsx`.
- Temas: `app/layout.tsx`, `app/globals.css`, `app/finance-app.tsx` e persistência de preferência no cliente.
- Identidade/papéis: `lib/identity.ts`, `lib/server.ts`, `app/api/session/route.ts`, rotas API e configuração Cloudflare Access.
- Testes: `tests/attachments.test.mjs`, novo teste de preview/autorização e scripts de smoke, sem incluir arquivos ou valores financeiros reais.

## Fora do escopo deste plano

- Fazer OCR/classificação automática dos documentos.
- Armazenar as parcelas pessoais do cartão de crédito dentro do ledger da obra.
- Expor links públicos de R2 ou permitir que um `move` seja alterado por parâmetro do navegador sem verificação no servidor.
- Implementar MFA ou gestão completa de contas local antes de validar Cloudflare Access.
