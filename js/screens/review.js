/**
 * Tela de revisão: pontuação, galeria de templates e exportação.
 * Recebe o contexto compartilhado do app via init(ctx).
 */
const EuGeroReviewScreen = (function () {
  'use strict';

  const { TEMPLATES, TEMPLATE_IDS, ACTION_VERBS } = EuGeroConfig;

  let ctx = null;
  let reviewGalleryIndex = 0;
  let pageMeasurementRequest = 0;
  let activeReviewTab = 'sections';

  function init(context) {
    ctx = context;
  }

  function getReviewValidationErrors(state, sections) {
    return EuGeroValidation.validateResume(state, sections).issues;
  }

  function renderValidationSummary(errors) {
    if (errors.length === 0) return '';
    return `
      <section class="review-validation-summary" role="alert" aria-labelledby="review-validation-title">
        <h2 id="review-validation-title" class="review-validation-title">Há campos obrigatórios para revisar</h2>
        <ul class="review-validation-list">
          ${errors.map((error, index) => `
            <li><a class="review-validation-link" href="#" data-error-index="${index}">${ctx.escapeHtml(error.sectionTitle)}: ${ctx.escapeHtml(error.message)}</a></li>
          `).join('')}
        </ul>
      </section>`;
  }

  function renderReview() {
    const state = ctx.getState();
    const sections = ctx.activeSections();
    const results = EuGeroScoring.scoreState(state, sections, ACTION_VERBS);
    const pageFit = EuGeroScoring.scorePageFit(state, sections);
    const aggregate = EuGeroScoring.aggregateScore(results, pageFit);
    const validationErrors = getReviewValidationErrors(state, sections);

    const pct = aggregate.overall;
    let scoreLabel = 'Em andamento';
    let scoreMsg = 'Algumas seções ainda podem ser preenchidas ou revisadas.';
    if (pct >= 80) {
      scoreLabel = 'Muito bem preenchido';
      scoreMsg = 'As principais seções estão preenchidas. Faça uma última revisão antes de enviar.';
    } else if (pct >= 55) {
      scoreLabel = 'Bem preenchido';
      scoreMsg = 'O currículo está organizado. Revise os pontos indicados antes de finalizar.';
    }

    let html = renderValidationSummary(validationErrors) + `
      <div class="review-score-row">
        <div>
          <div class="review-score-value">${ctx.escapeHtml(scoreLabel)}</div>
          <div class="review-score-caption">Nível de preenchimento</div>
        </div>
        <div class="review-score-bar-wrap">
          <div class="review-progress-track">
            <div class="review-progress-fill" data-pct="${pct}"></div>
          </div>
          <p class="review-score-text">${ctx.escapeHtml(scoreMsg)}</p>
        </div>
      </div>
      <div class="review-measure-banner">
        <span class="review-measure-dot" aria-hidden="true"></span>
        <p class="review-measure-text" data-pdf-page-measure>Calculando páginas do PDF...</p>
      </div>`;

    const feedback = EuGeroScoring.buildSectionFeedback(state, sections, ACTION_VERBS);
    const STATUS_META = {
      otimo: { label: 'Bem preenchida', cls: 'rf-otimo' },
      bom: { label: 'Parcialmente preenchida', cls: 'rf-bom' },
      fraco: { label: 'Pouco preenchida', cls: 'rf-fraco' },
      vazio: { label: 'Sem conteúdo', cls: 'rf-vazio' }
    };

    const currentTemplate = TEMPLATES[state.template];
    const pageLimit = state.pageMode === 'detailed' ? 2 : 1;
    const pageTitle = pageFit.level === 'ok'
      ? 'Cabe em uma página'
      : pageFit.level === 'detailed' && pageLimit === 2
        ? 'Modo detalhado: até duas páginas'
        : 'Revise a extensão';
    const pageText = pageFit.level === 'ok'
      ? 'O conteúdo está em uma extensão adequada para uma página.'
      : pageFit.level === 'detailed'
        ? 'Duas páginas são aceitáveis quando a experiência e os resultados forem relevantes para a vaga. O PDF será bloqueado acima desse limite.'
        : pageLimit === 1
          ? 'Prefira cortar repetições e conteúdo pouco relevante. Se tudo for necessário, escolha "Até 2 páginas".'
          : 'Reduza repetições e conteúdo pouco relevante. O PDF será bloqueado acima de duas páginas.';
    const reductionLabels = {
      summary: 'Reduzir resumo',
      experiences: 'Revisar experiências',
      education: 'Revisar formação',
      skills: 'Revisar habilidades',
      languages: 'Revisar idiomas',
      certifications: 'Revisar certificações',
      projects: 'Revisar projetos'
    };
    const reductionActions = sections
      .filter((section) => reductionLabels[section.id])
      .map((section) => {
        const stepIndex = sections.findIndex((item) => item.id === section.id);
        return `<button type="button" class="rf-tip link-btn" data-step="${stepIndex}">${reductionLabels[section.id]}</button>`;
      }).join('');
    const checklist = [
      state.personal.email ? 'E-mail preenchido' : 'Revise o e-mail de contato',
      state.personal.location ? 'Cidade informada sem endereço completo' : 'Informe cidade e estado',
      currentTemplate?.atsFriendly ? 'Modelo com estrutura favorável a ATS' : 'Considere um modelo de uma coluna para ATS',
      state.summary ? 'Resumo incluído' : 'Inclua um resumo curto e específico',
      pageTitle
    ];

    const atsStatusLabel = currentTemplate?.atsFriendly ? 'Estrutura favorável' : 'Revise a estrutura';
    const atsStatusDesc = currentTemplate?.atsFriendly
      ? 'O modelo escolhido usa uma organização simples, que costuma facilitar a leitura automática.'
      : 'Para plataformas de recrutamento, um modelo de uma coluna e sem elementos gráficos costuma ser mais seguro.';
    const atsChecklist = [
      'Use títulos claros para cada seção.',
      'Mantenha as datas no formato mês e ano.',
      'Use o mesmo idioma da vaga.',
      'Evite foto e informações importantes dentro de imagens.',
      'Confirme se o texto do PDF pode ser selecionado e copiado.',
      'Depois do envio, revise os dados importados pela plataforma.'
    ];

    html += `
      <div class="review-tabs" role="tablist" aria-label="Detalhes da revisão">
        <button type="button" role="tab" class="review-tab${activeReviewTab === 'sections' ? ' active' : ''}" data-review-tab="sections" aria-selected="${activeReviewTab === 'sections'}">Seções</button>
        <button type="button" role="tab" class="review-tab${activeReviewTab === 'checks' ? ' active' : ''}" data-review-tab="checks" aria-selected="${activeReviewTab === 'checks'}">Extensão</button>
        <button type="button" role="tab" class="review-tab${activeReviewTab === 'ats' ? ' active' : ''}" data-review-tab="ats" aria-selected="${activeReviewTab === 'ats'}">Leitura ATS</button>
      </div>

      <div class="review-tab-panel" data-review-panel="sections"${activeReviewTab !== 'sections' ? ' hidden' : ''}>
        <p class="review-intro">Clique em qualquer seção ou dica para ir direto ao ponto de edição.</p>
        <div class="review-feedback">
          ${feedback.map((f) => {
            const meta = STATUS_META[f.status] || STATUS_META.bom;
            const stepIndex = sections.findIndex((s) => s.id === f.sectionId);
            const tips = f.tips.map((t) =>
              `<button type="button" class="rf-tip link-btn" data-step="${stepIndex}">${ctx.escapeHtml(t.label)}: ${ctx.escapeHtml(t.advice)}</button>`
            ).join('');
            return `
              <div class="review-feedback-row">
                <button type="button" class="rf-head link-btn" data-step="${stepIndex}">
                  <span class="rf-badge ${meta.cls}">${meta.label}</span>
                  <span class="rf-title">${ctx.escapeHtml(f.title)}</span>
                </button>
                ${tips ? `<div class="rf-tips">${tips}</div>` : ''}
              </div>`;
          }).join('')}
        </div>
        ${reductionActions ? `<div class="rf-tips review-reduction-inline" data-page-reduction-actions${pageFit.level === 'ok' ? ' hidden' : ''}>${reductionActions}</div>` : ''}
      </div>

      <div class="review-tab-panel" data-review-panel="checks"${activeReviewTab !== 'checks' ? ' hidden' : ''}>
        <p class="review-block-text">${ctx.escapeHtml(pageText)}</p>
        <ul class="review-block-list">${checklist.map((item) => `<li>${ctx.escapeHtml(item)}</li>`).join('')}</ul>
      </div>

      <div class="review-tab-panel" data-review-panel="ats"${activeReviewTab !== 'ats' ? ' hidden' : ''}>
        <p class="review-block-note">Esta verificação considera apenas a estrutura e a organização do currículo. Ela não garante aprovação nem substitui o preenchimento dos campos da plataforma.</p>
        <div class="review-ats-row">
          <span class="rf-badge ${currentTemplate?.atsFriendly ? 'rf-otimo' : 'rf-fraco'}">${ctx.escapeHtml(atsStatusLabel)}</span>
          <span class="review-ats-desc">${ctx.escapeHtml(atsStatusDesc)}</span>
        </div>
        <p class="review-ats-title">Antes de enviar</p>
        <ul class="review-block-list">
          ${atsChecklist.map((item) => `<li>${ctx.escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>`;

    ctx.els.reviewContent.innerHTML = html;
    ctx.els.reviewContent.querySelectorAll('[data-pct]').forEach((barra) => {
      barra.style.width = `${barra.dataset.pct}%`;
    });

    ctx.els.reviewContent.querySelectorAll('[data-review-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        activeReviewTab = tabBtn.dataset.reviewTab;
        ctx.els.reviewContent.querySelectorAll('[data-review-tab]').forEach((b) => {
          const on = b.dataset.reviewTab === activeReviewTab;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        ctx.els.reviewContent.querySelectorAll('[data-review-panel]').forEach((panel) => {
          panel.hidden = panel.dataset.reviewPanel !== activeReviewTab;
        });
      });
    });

    ctx.els.reviewContent.querySelectorAll('.link-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.goToWizard(parseInt(btn.dataset.step, 10));
      });
    });
    ctx.els.reviewContent.querySelectorAll('.review-validation-link').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const error = validationErrors[parseInt(link.dataset.errorIndex, 10)];
        if (!error) return;
        ctx.goToWizard(error.stepIndex);
        EuGeroWizardScreen.revealValidationError(error.sectionId, error);
      });
    });

    measureReviewExport(state);
    renderReviewGallery();
    syncPrintCv();
  }

  function measureReviewExport(state) {
    const request = ++pageMeasurementRequest;
    const status = ctx.els.reviewContent?.querySelector('[data-pdf-page-measure]');
    if (!status) return;

    loadPdfVendor().then(() => {
      if (request !== pageMeasurementRequest) return;
      const measurement = EuGeroPdfExport.measureExport(state);
      const currentStatus = ctx.els.reviewContent?.querySelector('[data-pdf-page-measure]');
      if (!currentStatus) return;
      if (measurement.issues.length > 0) {
        currentStatus.textContent = measurement.issues[0];
        currentStatus.setAttribute('role', 'alert');
        const actions = ctx.els.reviewContent.querySelector('[data-page-reduction-actions]');
        if (actions) actions.hidden = false;
        return;
      }
      const pageLabel = measurement.pages === 1 ? 'página' : 'páginas';
      currentStatus.textContent = `PDF confirmado com ${measurement.pages} ${pageLabel}.`;
    }).catch(() => {
      if (request !== pageMeasurementRequest) return;
      const currentStatus = ctx.els.reviewContent?.querySelector('[data-pdf-page-measure]');
      if (!currentStatus) return;
      currentStatus.textContent = 'Não foi possível confirmar as páginas agora. O limite será verificado antes do download.';
    });
  }

  /** Mantém a área de impressão idêntica ao conteúdo da prévia. */
  function syncPrintCv() {
    const el = document.getElementById('print-cv');
    if (!el) return;
    const state = ctx.getState();
    el.innerHTML = EuGeroPreview.render(state, state.template, ctx.activeSections(), 'export');
    el.className = `preview-content template-${state.template} cv-margin-${state.margin || 'padrao'} cv-density-${state.density || 'normal'}`;
    EuGeroPreview.applyTemplateAccent(el, state.template);
  }

  function renderReviewGallery() {
    const state = ctx.getState();
    const sections = ctx.activeSections();
    const total = TEMPLATE_IDS.length;
    reviewGalleryIndex = ((reviewGalleryIndex % total) + total) % total;
    const galId = TEMPLATE_IDS[reviewGalleryIndex];
    const galMeta = TEMPLATES[galId];
    const isSelected = state.template === galId;

    const preview = document.getElementById('review-gallery-preview');
    if (preview) EuGeroPreview.updatePreview(preview, state, galId, sections);
    const frame = document.getElementById('review-gallery-frame');
    if (frame) frame.style.outline = isSelected ? '2px solid var(--color-accent)' : '2px solid transparent';
    const labelEl = document.getElementById('review-gallery-label');
    if (labelEl) labelEl.textContent = galMeta.name;
    const counterEl = document.getElementById('review-gallery-counter');
    if (counterEl) counterEl.textContent = `${reviewGalleryIndex + 1} de ${total}`;
  }

  /** Nome-base do arquivo: CV_<NOME>_<CARGO>, sem acento nem simbolo. */

  function cvFileBaseName(stateOverride) {
    const state = stateOverride || ctx.getState();
    const clean = (t) => (t || '')
      .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const nome = clean(state.personal?.fullName) || 'Curriculo';
    const cargo = clean(state.personal?.headline);
    return cargo ? `CV_${nome}_${cargo}` : `CV_${nome}`;
  }

  function printCv() {
    syncPrintCv();
    window.print();
  }

  let pdfVendorPromise = null;
  const ownScriptQuery = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
    ? (new URL(document.currentScript.src, 'https://local.invalid').search || '')
    : '';

  function versionedScriptUrl(src) {
    return ownScriptQuery && !src.includes('?') ? `${src}${ownScriptQuery}` : src;
  }

  function loadScriptOnce(src) {
    const resolvedSrc = versionedScriptUrl(src);
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${resolvedSrc}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = resolvedSrc;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadPdfVendor() {
    if (!pdfVendorPromise) {
      pdfVendorPromise = Promise.all([
        loadScriptOnce('js/vendor/jspdf.umd.min.js'),
        loadScriptOnce('js/vendor/fonts-barlow.js')
      ]).then(() => loadScriptOnce('js/pdf-export.js'))
        .catch((err) => { pdfVendorPromise = null; throw err; });
    }
    return pdfVendorPromise;
  }

  async function downloadPdf(stateOverride) {
    const hasStateOverride = stateOverride && typeof stateOverride === 'object' && stateOverride.personal;
    const state = hasStateOverride ? stateOverride : ctx.getState();
    const sections = hasStateOverride
      ? EuGeroConfig.getActiveSections(state.enabledSections)
      : ctx.activeSections();
    const validationErrors = getReviewValidationErrors(state, sections);
    if (validationErrors.length > 0) {
      const firstError = validationErrors[0];
      ctx.goToWizard(firstError.stepIndex);
      EuGeroWizardScreen.revealValidationError(firstError.sectionId, firstError);
      ctx.showToast?.('Revise os campos obrigatórios antes de baixar o PDF.', { error: true });
      return false;
    }

    const btn = document.getElementById('btn-export-pdf');
    const rotuloOriginal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando PDF...'; }
    try {
      await loadPdfVendor();
      const measurement = EuGeroPdfExport.measureExport(state);
      if (measurement.issues.length > 0) {
        ctx.showToast?.(measurement.issues[0], { error: true });
        return false;
      }
      const doc = EuGeroPdfExport.generatePdf(
        state,
        sections,
        state.template,
        state.margin || 'padrao',
        state.density || 'normal',
        state.pageMode || 'compact'
      );
      doc.save(`${cvFileBaseName(state)}.pdf`);
      return true;
    } catch {
      ctx.showToast?.('Não foi possível gerar o PDF. Tente novamente.', { error: true });
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = rotuloOriginal; }
    }
  }

  function syncGalleryToTemplate() {
    const state = ctx.getState();
    const idx = TEMPLATE_IDS.indexOf(state.template);
    reviewGalleryIndex = idx >= 0 ? idx : 0;
  }

  function galleryStep(dir) {
    const state = ctx.getState();
    const total = TEMPLATE_IDS.length;
    reviewGalleryIndex = ((reviewGalleryIndex + dir) % total + total) % total;
    state.template = TEMPLATE_IDS[reviewGalleryIndex];
    ctx.saveState();
    ctx.updateTemplateIndicators();
    renderReview();
  }
  return {
    init,
    syncGalleryToTemplate,
    galleryStep,
    renderReview,
    renderReviewGallery,
    syncPrintCv,
    cvFileBaseName,
    printCv,
    downloadPdf
  };
})();
