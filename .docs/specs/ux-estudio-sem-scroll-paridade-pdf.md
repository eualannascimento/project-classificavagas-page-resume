# Estúdio sem scroll, paridade total de página/PDF e catálogo de 8 modelos

**Status:** Em Desenvolvimento
**Data:** 2026-11-24

## 1. Resumo e Objetivo
Reestruturar o gerador de currículo como um estúdio de viewport controlada (`100dvh` em telas amplas e gaveta/dock responsivos em mobile e tablet), eliminando rolagem desnecessária de página e unificando a experiência de personalização. Corrigir a aplicação real de margens e espaçamento no PDF exportado e ampliar o catálogo validado de 5 para 8 famílias estruturais de layout.

## 2. User Stories (Requisitos Funcionais)
* **US01:** Como pessoa candidata em desktop ou tablet horizontal, quero visualizar formulário/revisão, controles visuais e folha A4 inteira sem precisar rolar a página inteira, para editar e revisar com conforto visual.
* **US02:** Como pessoa candidata em celular ou tablet vertical, quero acessar modelo, margens, espaçamento, extensão e prévia A4 real por uma barra inferior e gaveta interativa sem zonas mortas de resolução, para personalizar tudo com uma mão.
* **US03:** Como pessoa candidata, quero que qualquer alteração de margens (`Estreita`, `Padrão`, `Confortável`) e espaçamento (`Compacto`, `Normal`, `Amplo`) apareça de forma idêntica na prévia em tela, na impressão nativa e no arquivo PDF baixado.
* **US04:** Como pessoa candidata, quero escolher entre 8 modelos estruturalmente distintos (`Clássico`, `Minimalista`, `Petróleo`, `Marinho`, `Criativo`, `Editorial`, `Executivo`, `Moderno`), todos com indicação clara sobre leitura por ATS.

## 3. Regras de Negócio e Casos de Falha (Edge Cases)
* **Regra 01 (Paridade de medidas):** `EuGeroConfig` centraliza `PAGE_MARGINS` (`12mm`, `16mm`, `20mm`), `PAGE_DENSITIES` (`condensado` `10pt`/`1.2`, `normal` `10.5pt`/`1.35`, `amplo` `11pt`/`1.45`) e `PAGE_MODES` (`compact`, `detailed`). `EuGeroPdfExport.generatePdf` lê `state.margin` e `state.density` por padrão e multiplica todos os avanços verticais por `density.spaceMult`.
* **Regra 02 (Sangria e bordas):** Layouts com áreas de cor (`banner`, `sidebar`, `topbar`, `splitheader`) compensam `--doc-padding` no CSS e aplicam o recuo interno equivalente no PDF, sem molduras brancas divergentes.
* **Regra 03 (Corte único responsivo em 1024px):** Abaixo de `1024px`, `.cv-aside` cede lugar ao dock inferior e à gaveta `#preview-overlay` com `.preview-a4-wrap` escalada e controles integrados; a partir de `1024px`, o app opera em estúdio dividido de altura contida (`100dvh`) com escala 2D da folha A4.
* **Regra 04 (Catálogo sem duplicação estrutural):** Cada um dos 8 templates possui `layout` único, miniatura dedicada, renderização HTML e função vetorial em `jsPDF`.
* **Limite 01 (Guardrails tipográficos):** Fonte base nunca inferior a `10pt`, entrelinha nunca inferior a `1.2` e margem nunca inferior a `12mm`.
* **Falha 01 (Estouro de páginas):** O medidor real em `jsPDF` recalcula páginas sempre que modelo, margem, espaçamento ou extensão mudam e bloqueia o download acima do limite configurado (1 ou 2 páginas).

## 4. Estrutura de Dados e Componentes
* **Modelos de Estado:** `state.template` aceita os 8 IDs de `TEMPLATE_IDS`; `state.margin` aceita `estreita | padrao | confortavel`; `state.density` aceita `condensado | normal | amplo`; `state.pageMode` aceita `compact | detailed`.
* **Arquitetura:** `js/config.js`, `js/storage.js`, `js/scoring.js`, `js/preview.js`, `js/pdf-export.js`, `js/app.js`, `js/screens/start.js`, `js/screens/wizard.js`, `js/screens/review.js`, `index.html`, `css/base.css`, `css/layout.css`, `css/templates.css`, `css/print-preview.css`, `css/screens.css`, `css/responsive.css`.

## 5. Critérios de Aceite (verificáveis por teste)
* [x] CA01: Dado qualquer um dos 8 templates, quando exportado em PDF com margens `estreita`, `padrao` e `confortavel` ou densidades `condensado`, `normal` e `amplo`, então as coordenadas `x` e `y` do PDF refletem as medidas selecionadas.
* [x] CA02: Dado viewport desktop (`1440x900` e `1366x768`), quando o usuário navega por `characters`, `start`, `wizard` e `review`, então a altura do documento não ultrapassa a janela (`scrollHeight <= innerHeight`).
* [x] CA03: Dado viewport tablet (`768x1024` e `820x1180`) ou mobile (`320x800` e `390x844`), quando o usuário abre a prévia ou troca modelo/margem/espaçamento, então todos os controles têm alvo mínimo de `44x44px` sem travamento de scroll.
* [x] CA04: `npm run lint` termina com 0 erros e 0 avisos, `npm run smoke` e `npm run e2e` passam integralmente, mantendo CSP `style-src 'self'` sem atributos `style` inline.

## 6. Fora de Escopo
* Recursos de inteligência artificial generativa, exportação Word/DOCX, contas remotas ou banco de dados externo.
