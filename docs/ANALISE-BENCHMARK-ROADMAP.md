# Loft Finance: análise de produto, benchmark e roadmap

Data: 22/10/2026  
Base analisada: commit `3e870c6`, branch `main`  
Público: responsáveis pela obra, sócios e equipe de desenvolvimento  
Natureza: diagnóstico e recomendações; não representa implementação ou compromisso de prazo.

## 1. Recomendação executiva

Evoluir o Loft Finance como um **controle financeiro de obras com prestação de contas aos sócios**, mantendo a simplicidade para um empreendimento pequeno. Não tentar reproduzir um ERP completo neste momento.

O produto já resolve problemas específicos relevantes: rateios por unidade e sócio, aportes identificados, pagamentos diretos, recebimentos, parcelas, orçamento vinculado e comprovantes. Sua oportunidade está em responder com confiança a três perguntas:

1. Quanto a obra deve custar até terminar, e quanto mudou desde o orçamento original?
2. Quando faltará caixa e qual aporte será necessário?
3. Quem alterou ou autorizou cada valor, e qual era a informação anterior?

**Sequência recomendada:** proteger histórico e recuperação de dados; estabilizar vínculos de orçamento; adicionar previsão de caixa e custo final; depois reduzir trabalho manual com conciliação e compras.

Não priorizar agora aplicativo nativo, inteligência artificial autônoma, emissão fiscal própria ou um módulo completo de locação. Essas frentes aumentam custo e dependências antes de resolver os principais riscos financeiros.

## 2. Método e limites

- Revisão estática dos modelos, regras financeiras, API, permissões, telas e documentação indicados na seção 11.
- Benchmark documental de páginas oficiais de três fornecedores, consultadas em 22/10/2026. Não foram contratados produtos nem executados testes comparativos nas plataformas.
- Capacidades anunciadas pelos fornecedores não comprovam qualidade, desempenho, disponibilidade em todos os planos ou aderência ao fluxo específico de sócios do Loft Finance.
- Ausência de evidência é marcada como **NC**, não como ausência da funcionalidade no concorrente.
- Não foram comparados preços: módulos, usuários, implantação, integrações e suporte precisam de propostas equivalentes. Também não se adotaram promessas comerciais de economia como resultados comprovados.
- Não houve entrevistas com usuários, auditoria de segurança completa, teste de carga, inspeção de produção ou análise jurídica/contábil.
- Testes financeiros e TypeScript passaram na etapa anterior desta sessão. O lint apresentou pendências. Esses resultados são histórico de validação, não uma nova execução neste diagnóstico.
- A impressão do orçamento foi verificada anteriormente por emulação de mídia de impressão; o arquivo PDF real e a paginação física não foram validados. Não confundir melhoria visual com certificação da exportação.
- Valores reais de lançamentos, nomes de sócios e documentos financeiros foram deliberadamente excluídos deste relatório.

Hipótese de produto: melhorar previsibilidade e confiança oferece mais valor imediato que ampliar o número de módulos. Para contestá-la, observar o fechamento semanal com os responsáveis e registrar onde gastam mais tempo: conferir extratos, explicar alterações, buscar comprovantes ou prever aportes. Se outro problema dominar, reordenar o roadmap.

## 3. Diagnóstico do produto atual

| Área | Evidência atual | Limite ou oportunidade |
| --- | --- | --- |
| Despesas e receitas | Lançamentos, vencimentos, baixas parciais, cancelamentos e despesas parceladas | Acrescentar recorrência, conciliação e aprovação de despesas |
| Orçamento | Categoria, etapa, descrição, rateio por unidade e vínculo opcional do lançamento | Sem entidade explícita de revisão aprovada ou baseline histórico no modelo inspecionado |
| Custos | Comparação de aprovado, contratado e pago; utilização do orçamento | Contratado financeiro não é contrato formal nem avanço físico |
| Receitas vinculadas | Receita pode guardar vínculo com orçamento | Indicadores atuais de consumo do orçamento são orientados a despesas; vínculo não equivale a planejamento de receitas |
| Sócios | Aportes, adiantamentos, custódia, pagamentos diretos, devoluções e distribuições | Consolidar extrato individual e previsão de chamadas de capital |
| Rateios | Regras por vigência, preservação das regras históricas e validações de percentuais | Tornar exceções e revisões mais fáceis de consultar |
| Contatos e documentos | Fornecedores/clientes e comprovantes em armazenamento separado | Acrescentar fila de documentação pendente e conferência de duplicidades |
| Caixa | Contas, transferências e tela de fluxo de caixa | Evoluir a visão existente para projeção explícita de 13 semanas e cenários |
| Relatórios | CSV, posição consolidada e orçamento via impressão do navegador | Fechamento por período, exportações reproduzíveis e testes de PDF real |
| Acesso | Administrador, editor e leitor; validações no servidor | Segregar permissão de lançar, aprovar, pagar, corrigir e reabrir período |
| Histórico | Autor, data, ação e descrição de atividades | Não é um registro completo de antes/depois nem evidência de armazenamento imutável |
| Persistência | Ledger JSON em D1, comprovantes em R2, versão otimista e IDs de ação | Validar restauração e medir crescimento antes de ampliar concorrência |

### Forças a preservar

- Valores em centavos e rateio determinístico evitam cálculos financeiros com arredondamento livre.
- Invariantes impedem pagamentos acima do lançamento e saldos negativos em contas, custódia e origens de aporte.
- Aportes não são tratados como receita operacional. Esse cuidado deve sobreviver às futuras integrações bancárias.
- Regras de participação e unidades inativas preservam histórico.
- Versão otimista e IDs de ação reduzem sobrescrita concorrente e repetição de operações. Não eliminam a necessidade de testes de concorrência.
- As funcionalidades recentes têm testes específicos, incluindo vínculo orçamentário e correção de pagamentos.

## 4. Benchmark de mercado

### Referências selecionadas

**Sienge Plataforma [S1]:** referência de integração entre orçamento, custos e suprimentos na construção. A página oficial descreve composição orçamentária, acompanhamento de orçado/realizado/comprometido e jornada de compras até a nota fiscal. Usar como referência de processo, sem presumir que a complexidade de um ERP seja adequada ao porte atual.

**Obra Prima [S2]:** referência de gestão operacional da obra. A página oficial lista orçamento, curva ABC, cronograma, medições, diário, previsto versus realizado, compras e portal do cliente. Ajuda a identificar a conexão hoje limitada entre dinheiro e execução física.

**Conta Azul [S3, S4]:** referência de automação financeira para empresas. As páginas descrevem conciliação bancária, importação de extratos, compras/fornecedores, contratos recorrentes, relatórios e cobrança. É um comparador financeiro, não evidência de suporte à mesma estrutura de rateio de sócios ou orçamento de obras.

### Matriz comparativa

Legenda: **Existe** = observado no código do Loft Finance; **Parcial** = cobertura limitada; **NI** = não identificado no recorte inspecionado; **D** = divulgado em fonte oficial; **NC** = não confirmado pelas fontes consultadas. Cada coluna externa usa as fontes indicadas no cabeçalho.

| Capacidade | Loft Finance | Sienge [S1] | Obra Prima [S2] | Conta Azul [S3, S4] |
| --- | --- | --- | --- | --- |
| Orçamento específico de obra | Existe | D | D | NC |
| Comparação orçado/custos realizados | Existe, com recorte financeiro | D | D | NC para obras |
| Compras conectadas ao financeiro | NI como fluxo de pedidos | D | D | D |
| Cronograma ou medição física | NI | NC na página específica | D | NC |
| Curva ABC de orçamento | NI | NC | D | NC |
| Conciliação e importação bancária | NI | NC | NC | D |
| Contratos recorrentes | NI; parcelas não são recorrência | NC | NC | D |
| Relatórios e indicadores | Existe | D | D | D |
| Portal do cliente | NI; leitor é acesso ao empreendimento | NC | D | NC |
| Rateio societário com custódia e lotes de aporte | Existe | NC para o mesmo fluxo | NC para o mesmo fluxo | NC para o mesmo fluxo |
| Revisões orçamentárias com histórico antes/depois | Parcial: edição e log descritivo | NC | NC | NC |

**Leitura:** há espaço para conservar a especialização do Loft Finance em prestação de contas e incorporar práticas selecionadas de planejamento e automação. A matriz não sustenta declarar o produto superior aos concorrentes, nem afirmar que os recursos marcados NC não existem neles.

### Desenvolver, integrar ou contratar

| Decisão | Recomendação | Motivo |
| --- | --- | --- |
| Rateios, aportes e prestação de contas | Desenvolver no núcleo atual | São regras específicas já implementadas e testadas |
| Orçamento versionado e projeções | Desenvolver de forma incremental | Dependem diretamente do modelo financeiro existente |
| Extratos bancários | Começar por importação assistida; avaliar integração depois | Permite validar conciliação sem iniciar com credenciais bancárias e contratos externos |
| Emissão fiscal e pagamentos bancários | Preferir integração com fornecedor especializado | Envolvem requisitos operacionais, fiscais e de segurança fora do núcleo atual |
| Gestão completa de canteiro, estoque e BIM | Avaliar produto especializado antes de construir | Escopo amplo, ainda sem demanda comprovada nesta análise |

Antes de contratar, pedir demonstração com o mesmo roteiro: aporte de sócio, pagamento direto, despesa parcelada, revisão de orçamento, conciliação, fechamento e exportação de histórico. Comparar custo total de 12 meses, incluindo implantação, migração, usuários, suporte, integrações e saída dos dados. Nenhum ROI foi calculado sem essas entradas.

## 5. Riscos e melhorias prioritárias

### 5.1. Histórico incompleto de correções

Evidência: `move_edit` remove a movimentação original do estado usado para revalidar, cria a substituta, preserva seu ID e registra uma descrição de correção. O modelo de auditoria não tem campos estruturados de antes/depois. Edições de lançamentos também usam descrição resumida. Ver [lib/finance.ts](../lib/finance.ts#L129).

Impacto: o saldo pode estar correto, mas uma revisão posterior não consegue reconstruir integralmente a alteração apenas pelo histórico disponível. Não se trata de ausência total de auditoria.

Recomendação: registrar entidade, ID, valores anteriores e posteriores, motivo, autor e momento; proteger o evento contra alteração pelas operações normais. Acrescentar fechamento mensal e reabertura justificada. Definir retenção e acesso, pois o histórico conterá dados pessoais e financeiros.

### 5.2. Identidade de linhas do orçamento

Evidência: `budgetRateio` recria IDs das linhas substituídas; `budgetRemove` remove linhas; `entryBudgetLine` recorre à categoria/etapa quando o vínculo não é encontrado. Ver [lib/finance.ts](../lib/finance.ts#L89).

Impacto: o lançamento pode mostrar vínculo removido, enquanto a agregação o associa a outra linha por categoria/etapa. O fallback preserva compatibilidade, mas não a identidade histórica de uma revisão.

Recomendação: preservar IDs de linhas que continuam representando o mesmo escopo; separar identidade da linha e revisão do orçamento; arquivar linhas referenciadas em vez de apagá-las. Mostrar associação explícita, inferida ou pendente. Migrar dados existentes com relatório de ambiguidades, nunca remapear silenciosamente.

### 5.3. Recuperação e crescimento da base

Evidência: o projeto é carregado pelo identificador fixo `main`, e o ledger inteiro é serializado em cada gravação. Arquivos ficam em estrutura separada. Ver [lib/server.ts](../lib/server.ts#L5), [app/api/finance/route.ts](../app/api/finance/route.ts#L5) e [db/schema.ts](../db/schema.ts).

Impacto: cresce o custo de leitura/gravação e a concorrência disputa uma única versão. Não foi demonstrado gargalo no volume atual. Exportação CSV não substitui recuperação completa de dados e comprovantes; backups da infraestrutura, se existentes, não foram verificados.

Recomendação: estabelecer backup coordenado do ledger, metadados e arquivos, restauração em ambiente isolado e verificação de integridade. Medir tamanho do JSON, latência e conflitos antes de decidir normalização em tabelas. Multiempreendimento exige isolamento no servidor, não apenas um seletor na interface.

### 5.4. Permissões e fechamento

Existe bloqueio de escrita para leitores e restrições administrativas em operações específicas, como estornos e aprovação de distribuições. Isso não equivale a um fluxo de aprovação de despesas. A correção de pagamento reutiliza as regras do pagamento e não estabelece aprovação independente.

Recomendação: documentar matriz de ações por papel, aplicar no servidor e testar acesso direto à API. Para valores acima de uma alçada configurável, separar solicitante e aprovador. Alterações relevantes após aprovação devem invalidá-la. Revisar também o primeiro cadastro e o vínculo de colaboradores por e-mail antes de abrir acesso a equipes maiores, sem presumir uma vulnerabilidade explorável a partir deste recorte.

### 5.5. Qualidade de entrega e documentação

O componente financeiro e as regras concentram muitos fluxos em linhas extensas. O lint tem dívida conhecida; não há evidência nesta análise para atribuir cada diagnóstico à última alteração. O README ainda apresenta o projeto como starter e contém informação de schema vazio incompatível com a modelagem atual.

Recomendação: atualizar a documentação de operação; criar comando único de testes e integração contínua; reduzir dívida incrementalmente. Separar telas e formulários conforme forem alterados, preservando invariantes. Testar arquivos PDF reais com tabelas longas, valores grandes e múltiplas páginas antes de considerar a exportação estabilizada.

## 6. Backlog recomendado

Prioridades: **P0** = base de confiança antes de automações; **P1** = próximo ganho operacional; **P2** = expansão condicionada à demanda. Não são níveis de incidente.

Esforço relativo: **P** = alteração localizada; **M** = regras, interface e testes em vários pontos; **G** = novo fluxo, migração ou integração. São estimativas preliminares, não dias de trabalho. A ordem combina risco financeiro, impacto, dependências e esforço; não usa pontuação numérica sem dados de uso.

| ID | Proposta | Prioridade | Impacto esperado | Esforço | Dependências |
| --- | --- | --- | --- | --- | --- |
| F01 | Auditoria antes/depois e motivo obrigatório de correção | P0 | Reconstituir alterações e esclarecer divergências | M | Política de acesso e retenção |
| F02 | IDs estáveis, arquivamento e revisões de orçamento | P0 | Evitar perda de referência e explicar desvios | G | F01; plano de migração |
| F03 | Backup e restauração verificada, incluindo comprovantes | P0 | Recuperar a operação após erro ou perda | M | Acesso à infraestrutura e armazenamento protegido |
| F04 | Testes automatizados de entrega, PDF real e documentação | P0 | Reduzir regressões nas rotinas financeiras | M | Ambiente de CI e navegador compatível |
| F05 | Caixa projetado de 13 semanas e chamadas de aporte | P1 | Antecipar falta de recursos | M | Calendário e regras de projeção validados |
| F06 | Previsão do custo final e comparativo de revisões | P1 | Antecipar estouro de orçamento | M | F02; estimativa do escopo restante |
| F07 | Conciliação assistida por OFX/CSV | P1 | Reduzir conferência manual e duplicidades | G | F01, F03 e modelo de transação importada |
| F08 | Central de pendências e recorrências | P1 | Reduzir esquecimentos e retrabalho | M | Responsáveis, idempotência e política de alertas |
| F09 | Alçadas de despesas e fechamento mensal | P1 | Evitar alterações e pagamentos sem autorização | G | F01; matriz de permissões |
| F10 | Relatório mensal por sócio e unidade | P1 | Facilitar prestação de contas | M | F01 e F04; F09 para versão fechada |
| F11 | Compras, contratos, aditivos e medições | P2 | Conectar contratação e execução ao financeiro | G | F02 e F09 |
| F12 | Curva ABC, filtros salvos e anexação móvel mais simples | P2 | Priorizar custos e agilizar consultas | M | Validar tarefas com usuários |
| F13 | Multiempreendimento e consolidação de carteira | P2 | Reutilizar o produto em novas obras | G | Isolamento de acesso, arquivos e dados; F03 |
| F14 | Extração assistida de documentos e classificação sugerida | P2 | Reduzir digitação, se houver volume suficiente | G | Privacidade, amostra de avaliação e revisão humana |

F12 pode ser antecipada se entrevistas mostrarem alto custo de navegação. F13 só deve avançar quando houver uma segunda obra confirmada. F14 não deve autorizar pagamentos nem efetivar lançamentos automaticamente.

### Critérios de aceite das entregas principais

**F01 / F09: rastreabilidade e controle.** Toda edição financeira registra antes/depois, autor, data e motivo; um leitor não consegue escrever pela API; um editor não consegue executar ação fora de sua alçada; período fechado rejeita alterações retroativas, salvo reabertura autorizada e auditada. Preservar a idempotência existente.

**F02: orçamento versionado.** Uma revisão aprovada não é sobrescrita; todo lançamento vinculado continua apontando para uma linha identificável após edição ou rateio. Remover linha com uso exige arquivamento ou migração explícita. Total anterior, revisado e diferença são reproduzíveis. Testar especialmente vínculos antigos que dependem do fallback.

**F03: recuperação.** Restaurar uma cópia isolada com mesma contagem de registros, saldos e hashes dos anexos; documentar tempo e ponto recuperável. Proposta inicial a validar com o responsável: RPO de até 24 horas e RTO de até 4 horas. Esses são objetivos, não garantias atuais.

**F04: entrega verificável.** Executar os dez testes financeiros existentes e TypeScript automaticamente; registrar baseline de lint e impedir novos erros no código alterado. Gerar e inspecionar PDF real com 1, 20 e 100 linhas, descrições longas, valores altos e totais alinhados, sem sobreposição do rodapé. Validar também telas em desktop e celular, teclado e foco dos diálogos.

**F05: caixa previsto.** Projetar saldos semanais a partir de títulos em aberto e eventos planejados, sem descontar duas vezes valores já pagos. Separar cenários confirmado, base e conservador; vencidos entram como pendência de reprogramação. Aporte previsto não vira caixa realizado; pagamento direto de sócio não sai da conta bancária do empreendimento. Mostrar a origem de cada número.

**F06: custo final estimado.** Adotar, inicialmente, custo contratado total mais estimativa de escopo ainda não contratado, incluindo riscos identificados sem dupla contagem. Pagamentos já pertencem ao contratado e não devem ser somados novamente. Mostrar desvio contra orçamento original e vigente. Percentual pago não pode ser apresentado como percentual físico executado.

**F07: conciliação.** Importar extrato em área de conferência, permitir associação de uma ou várias transações e tratar tarifas, pagamentos parciais e transferências internas. Reimportar o mesmo extrato não duplica registros. Manter identificador externo ou impressão digital, origem e estado da conciliação. Sugestões não criam baixas sem confirmação; desfazer conciliação preserva auditoria. Classificar aporte como aporte, não receita.

**F08: pendências.** Agrupar vencidos, vencimentos próximos, despesas sem comprovante e orçamento excedido. Cada item tem responsável, ação e resolução. Recorrência cria títulos futuros, não pagamentos; admite encerramento e exceções e não repete títulos ao reexecutar. Alertas externos exigem preferências e não expõem valores sensíveis em canais indevidos.

**F10: prestação de contas.** Relatório por período mostra saldo inicial, aportes, adiantamentos, pagamentos diretos, custódia, devoluções, distribuições e saldo final, com acesso aos comprovantes. Diferenciar resultado econômico, direito de distribuição e caixa disponível. PDF e CSV usam a mesma base e identificam data de corte e revisão.

## 7. Roadmap indicativo de 90 dias

As janelas abaixo são uma sequência de planejamento, não promessa de entrega de todo o backlog. Pressupõem responsável de produto disponível, desenvolvimento com revisão e acesso a ambiente de testes. Após cada etapa, estimar capacidade e limitar o escopo; itens G podem exigir um ciclo adicional.

| Janela | Foco e entregas candidatas | Condição de saída |
| --- | --- | --- |
| Dias 1 a 15 | Observar fechamento semanal; definir métricas; F03; base de F04; especificar F01/F02 | Recuperação demonstrada, regressões automatizadas e decisões de histórico aprovadas |
| Dias 16 a 30 | F01 e núcleo de F02: identidade estável, arquivamento e migração assistida | Correções rastreáveis e vínculos preservados nos cenários existentes |
| Dias 31 a 60 | Revisões de F02; F05 e F06; pendências essenciais de F08 | Usuário consegue explicar custo final e próxima necessidade de aporte |
| Dias 61 a 90 | Piloto de F07; versão inicial de F10; especificar F09 | Extrato piloto conciliado sem duplicidade e prestação de contas reproduzível |
| Após validação | Completar F09 e escolher entre F11, F12 ou F13 | Demanda e benefício comprovados; nenhuma expansão apenas por paridade comercial |

Não migrar banco, implementar multiempreendimento e integrar bancos simultaneamente. Isolar mudanças reduz o risco de introduzir divergências difíceis de diagnosticar.

## 8. Métricas de sucesso

Coletar uma linha de base por duas semanas antes de prometer ganhos. As metas abaixo são propostas para o piloto, sujeitas a ajuste; não são resultados obtidos.

| Métrica | Como medir | Meta inicial proposta |
| --- | --- | --- |
| Tempo de conferência semanal | Minutos do início à aprovação, em ciclos comparáveis | Redução de 30% após conciliação assistida |
| Correções rastreáveis | Correções com antes/depois e motivo / total de correções | 100% após F01 |
| Integridade orçamentária | Vínculos explícitos sem linha identificável | Zero após migração validada de F02 |
| Documentação completa | Despesas que exigem comprovante com anexo / total exigível | Pelo menos 95% no fechamento |
| Diferença bancária sem explicação | Saldo do extrato menos saldo registrado, por conta e data | Zero no fechamento conciliado |
| Antecedência do alerta de caixa | Dias entre primeiro alerta e insuficiência projetada | Pelo menos 14 dias quando houver dados futuros suficientes |
| Acurácia da previsão de caixa | Erro absoluto entre saldo previsto e realizado em 4 semanas | Medir baseline e reduzir; não fixar percentual com saldo próximo de zero |
| Recuperação | Tempo de restauração e idade do backup recuperado | RTO/RPO acordados e exercício periódico aprovado |

Medir utilidade, não apenas acessos ao dashboard. Um bom indicador é conseguir fechar o mês e explicar divergências sem recorrer a planilhas paralelas.

## 9. Diretrizes técnicas e de experiência

- Preservar centavos inteiros, invariantes, IDs idempotentes e regras por vigência em todas as novas rotinas.
- Validar ações com schemas discriminados no servidor, evitando ampliar o uso de `any`. Testar entradas inválidas e chamadas diretas à API.
- Fazer migrações versionadas com backup, simulação, relatório de inconsistências e caminho de recuperação. Não reinterpretar silenciosamente histórico financeiro.
- Instrumentar latência, conflitos de versão, falhas de gravação e volume do ledger sem registrar dados financeiros sensíveis em logs.
- Antes de normalizar o banco, definir volume esperado e reproduzir concorrência realista. A arquitetura atual simplifica atomicidade para uma obra; o limite deve ser medido, não presumido.
- Manter o financeiro como registro de gestão, sem rotular relatórios como demonstrações contábeis oficiais sem validação profissional.
- Priorizar ações contextuais: de uma pendência, abrir lançamento, comprovante e histórico. Distinguir visualmente previsto, contratado, pago e conciliado.
- Tratar filtros persistentes, busca por documento e fornecedor, mensagens de conflito e uso por teclado como melhorias a validar com tarefas reais. Esta análise não é uma auditoria visual ou de acessibilidade.
- Separar permissões de usuário da participação societária antes de ampliar a equipe: um colaborador pode precisar operar sem ser sócio.
- Em integrações e eventual extração assistida de documentos, definir minimização de dados, retenção, consentimentos aplicáveis, revisão humana e contratos com fornecedores. Não enviar comprovantes a terceiros por padrão.

## 10. Próxima decisão recomendada

Aprovar um primeiro pacote limitado a **auditoria de correções, integridade dos vínculos orçamentários, restauração e testes de entrega**. Em paralelo, validar o protótipo de caixa projetado com o responsável pelo fechamento.

Antes de iniciar, esclarecer: haverá segunda obra nos próximos meses? Quem pode lançar, aprovar e pagar? Quais bancos e formatos de extrato são usados? Qual o volume mensal? Como se comprova hoje o fechamento? Quem define a estimativa do escopo restante? Qual perda de dados e tempo de indisponibilidade são toleráveis?

Essas respostas determinam a ordem entre conciliação, alçadas e expansão. O objetivo não é ter mais telas: é reduzir surpresas de caixa e tornar cada saldo explicável.

## 11. Evidências e fontes

### Evidências locais

| Referência | Fundamentação |
| --- | --- |
| [lib/finance.ts](../lib/finance.ts) | Tipos do ledger, rateios, orçamento, invariantes, edição e auditoria |
| [app/finance-app.tsx](../app/finance-app.tsx) | Navegação, formulários, indicadores, exportações e histórico |
| [app/globals.css](../app/globals.css) | Estilos de impressão e tratamento do total do orçamento |
| [app/api/finance/route.ts](../app/api/finance/route.ts) | Permissões de escrita, idempotência e controle de versão |
| [lib/server.ts](../lib/server.ts) | Identidade, papéis e seleção do empreendimento |
| [db/schema.ts](../db/schema.ts) | Ledger JSON e metadados de arquivos |
| [INICIAR-AQUI.md](../INICIAR-AQUI.md) | Operação local, hospedagem e comandos dos dez testes |
| [README.md](../README.md) | Documentação do starter e limitações de portabilidade |
| [package.json](../package.json) | Stack, versões e scripts disponíveis |
| [tests/budget-link.test.mjs](../tests/budget-link.test.mjs) | Cobertura de associação e fallback de orçamento |
| [tests/expense-payment-edit.test.mjs](../tests/expense-payment-edit.test.mjs) | Cobertura de edição e correção financeira |

### Fontes externas oficiais

Todas consultadas em 22/10/2026; páginas comerciais podem mudar. Os textos acima são sínteses, não reprodução de material promocional.

- **[S1] Sienge Plataforma:** <https://sienge.com.br/sienge-plataforma/>. Evidências: composição orçamentária, painel de compras, custo por nível e indicadores. Recursos do ecossistema não foram automaticamente atribuídos ao módulo Plataforma.
- **[S2] Obra Prima:** <https://obraprima.eng.br/>. Evidências: catálogo público de orçamento, curva ABC, cronograma, medições, previsto versus realizado, compras, portal e BI. A consulta ao domínio antigo redirecionou para este endereço, que foi consultado diretamente.
- **[S3] Conta Azul:** <https://www.contaazul.com/>. Evidências: catálogo público de financeiro, compras e fornecedores, contratos recorrentes, relatórios e cobranças.
- **[S4] Conta Azul, conciliação bancária:** <https://contaazul.com/funcionalidades/conciliacao-bancaria/>. Evidências: importação de extratos, integração bancária e associação de pagamentos e recebimentos.

Para uma decisão de compra, confirmar com cada fornecedor: plano aplicável, permissões, exportação completa, API, histórico de alterações, suporte aos bancos usados, custos de implantação e suporte ao cenário específico de rateio entre sócios.
