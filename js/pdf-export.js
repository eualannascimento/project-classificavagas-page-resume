/**
 * Geracao de PDF real (download direto, sem dialogo de impressao) via jsPDF
 * vendorizado (js/vendor/jspdf.umd.min.js + js/vendor/fonts-barlow.js).
 * Cobre as 5 familias estruturais de layout (Regra 02 do spec
 * feat-download-pdf-real.md): centered, left, sidebar, banner, creative.
 */
const EuGeroPdfExport = (function () {
  'use strict';

  const MARGIN_MM = { estreita: 12, padrao: 16, confortavel: 20 };
  const DENSITY = {
    condensado: { fontPt: 10, lineHeightMult: 1.2, spaceMult: 0.78 },
    normal: { fontPt: 10.5, lineHeightMult: 1.35, spaceMult: 1.0 },
    amplo: { fontPt: 11, lineHeightMult: 1.45, spaceMult: 1.2 }
  };
  const PAGE_W = 210;
  const PAGE_H = 297;
  const PT_TO_MM = 25.4 / 72;

  function getJsPDF() {
    const ns = (typeof window !== 'undefined' && window.jspdf)
      || (typeof globalThis !== 'undefined' && globalThis.jspdf);
    if (!ns || !ns.jsPDF) {
      throw new Error('jsPDF nao carregado. Inclua js/vendor/jspdf.umd.min.js antes de gerar o PDF.');
    }
    return ns.jsPDF;
  }

  function getPageLimit(state) {
    return state?.pageMode === 'detailed' ? 2 : 1;
  }

  // ---- Cor: deriva a familia de acento (accent/700/900/100) a partir do
  // thumbAccent do template (unica cor exposta em js/config.js). ----
  function accentPalette(hex) {
    return EuGeroConfig.accentPalette(hex);
  }

  function registerFonts(doc) {
    if (typeof EuGeroPdfFonts !== 'undefined' && EuGeroPdfFonts.register) {
      EuGeroPdfFonts.register(doc);
      return true;
    }
    return false;
  }

  // ---- Estrutura de dados do conteudo (independente de HTML), espelhando
  // as secoes que js/preview.js renderiza. ----
  function formatPeriod(start, end, isCurrent) {
    if (typeof EuGeroDates !== 'undefined') return EuGeroDates.formatPeriod(start, end, isCurrent);
    if (!start && !end) return '';
    return `${start || ''}${start && end ? ' - ' : ''}${isCurrent ? 'Atual' : (end || '')}`;
  }

  function textBlock(text, items) {
    if (!text) return [];
    const block = { type: 'text', text };
    if (Array.isArray(items)) block.items = items;
    return [block];
  }

  function itemBlocks(items, mapper) {
    return (items || []).map(mapper);
  }

  function buildSectionsData(state, enabledSections) {
    const p = state.personal || {};
    const enabled = enabledSections || EuGeroConfig.getActiveSections(state.enabledSections);
    const enabledSet = new Set(enabled.map((s) => s.id));
    const sections = [];

    if (enabledSet.has('summary') && state.summary?.trim()) {
      sections.push({ id: 'summary', title: 'Resumo', blocks: textBlock(state.summary.trim()) });
    }

    if (enabledSet.has('experiences') && (state.experiences || []).some((e) => e.company || e.title || e.description)) {
      const items = state.experiences.filter((e) => e.company || e.title);
      sections.push({
        id: 'experiences',
        title: 'Experiência',
        blocks: itemBlocks(items, (e) => ({
          type: 'item',
          title: e.title || 'Cargo',
          sub: e.company || '',
          period: e.period || formatPeriod(e.startDate, e.endDate, e.endCurrent),
          desc: e.description || ''
        }))
      });
    }

    if (enabledSet.has('education') && (state.education || []).some((e) => e.institution || e.degree)) {
      const items = state.education.filter((e) => e.institution || e.degree);
      sections.push({
        id: 'education',
        title: 'Formação',
        blocks: itemBlocks(items, (e) => ({
          type: 'item',
          title: e.degree || 'Curso',
          sub: e.institution || '',
          period: e.period || formatPeriod(e.startDate, e.endDate),
          desc: ''
        }))
      });
    }

    const skills = EuGeroConfig.getSkillsFromState(state);
    if (enabledSet.has('skills') && skills.length) {
      const skillItems = skills.map((s) => String(s.name || s).trim()).filter(Boolean);
      sections.push({ id: 'skills', title: 'Habilidades', blocks: textBlock(skillItems.join(' · '), skillItems) });
    }

    if (enabledSet.has('languages') && (state.languages || []).some((l) => l.language?.trim?.())) {
      const langItems = state.languages.filter((l) => l.language?.trim?.())
        .map((l) => `${l.language.trim()}${l.level ? ` (${l.level.trim()})` : ''}`);
      sections.push({ id: 'languages', title: 'Idiomas', blocks: textBlock(langItems.join(' · '), langItems) });
    }

    const listSection = (id, title, items, keys, mapper) => {
      const filtered = (items || []).filter((item) => keys.some((k) => item[k]?.trim?.()));
      if (enabledSet.has(id) && filtered.length) {
        sections.push({ id, title, blocks: itemBlocks(filtered, mapper) });
      }
    };

    listSection('certifications', 'Certificações', state.certifications, ['name'], (c) => ({
      type: 'item', title: c.name, sub: `${c.issuer || ''}${(c.year || c.date) ? ` · ${c.year || c.date}` : ''}`, period: '', desc: ''
    }));
    listSection('projects', 'Projetos', state.projects, ['name'], (p2) => ({
      type: 'item', title: p2.name, sub: '', period: '', desc: p2.description || ''
    }));
    listSection('volunteering', 'Voluntariado', state.volunteering, ['organization'], (v) => ({
      type: 'item', title: `${v.role || 'Função'} · ${v.organization}`, sub: '', period: formatPeriod(v.startDate, v.endDate, v.endCurrent), desc: ''
    }));
    listSection('publications', 'Publicações', state.publications, ['title'], (pub) => ({
      type: 'item', title: pub.title, sub: pub.publisher || '', period: '', desc: ''
    }));
    listSection('awards', 'Prêmios e Honrarias', state.awards, ['title'], (a) => ({
      type: 'item', title: `${a.title} · ${a.issuer || ''}`, sub: '', period: '', desc: ''
    }));
    listSection('organizations', 'Organizações', state.organizations, ['name'], (o) => ({
      type: 'item', title: `${o.name} · ${o.role || ''}`, sub: '', period: '', desc: ''
    }));
    listSection('courses', 'Cursos', state.courses, ['name'], (c) => ({
      type: 'item', title: c.name, sub: c.institution || '', period: '', desc: ''
    }));

    return { personal: p, sections };
  }

  // ---- Helpers de desenho (paginacao, texto, cabecalhos de secao) ----
  function makeCursor(doc, margin) {
    return { x: margin, y: margin, margin, colWidth: PAGE_W - margin * 2 };
  }

  function ensureSpace(doc, cursor, heightMm, onNewPage) {
    if (cursor.y + heightMm > PAGE_H - cursor.margin) {
      doc.addPage();
      cursor.y = cursor.margin;
      if (onNewPage) onNewPage();
    }
  }

  function setFont(doc, family, style, sizePt, hasFonts) {
    if (hasFonts && (family === 'Barlow' || family === 'BarlowCondensed')) {
      doc.setFont(family, style === 'bold' ? 'bold' : 'normal');
    } else {
      doc.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
    }
    doc.setFontSize(sizePt);
  }

  function lineMetrics(sizePt, lineHeightMult) {
    const emMm = sizePt * PT_TO_MM;
    const boxH = emMm * lineHeightMult;
    const baselineOffset = (boxH - emMm) / 2 + emMm * 0.78;
    return { emMm, boxH, baselineOffset };
  }

  function splitWithCharSpace(doc, text, width, charSpaceEm) {
    const safeWidth = charSpaceEm > 0
      ? Math.max(16, width / (1 + charSpaceEm * 1.65))
      : width;
    return doc.splitTextToSize(String(text || ''), safeWidth);
  }

  function drawBoxText(doc, cursor, text, x, width, opts) {
    const family = opts.family || 'Barlow';
    const style = opts.style || 'normal';
    const sizePt = opts.sizePt;
    const lh = opts.lineHeightMult || 1.25;
    const color = opts.color || [29, 31, 32];
    const align = opts.align || 'left';
    const charSpaceEm = opts.charSpaceEm || 0;
    const charSpaceMm = charSpaceEm * sizePt * PT_TO_MM;
    const { boxH, baselineOffset } = lineMetrics(sizePt, lh);

    setFont(doc, family, style, sizePt, opts.hasFonts);
    doc.setTextColor(color[0], color[1], color[2]);

    const paragraphs = String(text || '').split(/\r?\n/);
    paragraphs.forEach((para) => {
      const lines = splitWithCharSpace(doc, para, width, charSpaceEm);
      lines.forEach((line) => {
        ensureSpace(doc, cursor, boxH, opts.onNewPage);
        if (charSpaceMm > 0) doc.setCharSpace(charSpaceMm);
        const extraCharW = charSpaceMm > 0 ? Math.max(0, line.length - 1) * charSpaceMm : 0;
        if (align === 'center') {
          doc.text(line, x - extraCharW / 2, cursor.y + baselineOffset, { align: 'center' });
        } else if (align === 'right') {
          doc.text(line, x - extraCharW, cursor.y + baselineOffset, { align: 'right' });
        } else {
          doc.text(line, x, cursor.y + baselineOffset);
        }
        if (charSpaceMm > 0) doc.setCharSpace(0);
        cursor.y += boxH;
      });
    });
  }

  function measureBoxTextHeight(doc, text, width, sizePt, lh, family, style, hasFonts, charSpaceEm) {
    setFont(doc, family || 'Barlow', style || 'normal', sizePt, hasFonts);
    const { boxH } = lineMetrics(sizePt, lh);
    const paragraphs = String(text || '').split(/\r?\n/);
    let totalLines = 0;
    paragraphs.forEach((para) => {
      totalLines += splitWithCharSpace(doc, para, width, charSpaceEm || 0).length;
    });
    return totalLines * boxH;
  }

  function drawWrappedLines(doc, cursor, lines, x, sizePt, lineHeightMult, color, onNewPage) {
    doc.setTextColor(color[0], color[1], color[2]);
    const { boxH, baselineOffset } = lineMetrics(sizePt, lineHeightMult);
    lines.forEach((line) => {
      ensureSpace(doc, cursor, boxH, onNewPage);
      doc.text(line, x, cursor.y + baselineOffset);
      cursor.y += boxH;
    });
  }

  function drawWrappedText(doc, cursor, text, x, width, sizePt, lineHeightMult, color, onNewPage) {
    const paragraphs = String(text || '').split(/\r?\n/);
    paragraphs.forEach((para) => {
      const lines = doc.splitTextToSize(para, width);
      drawWrappedLines(doc, cursor, lines, x, sizePt, lineHeightMult, color, onNewPage);
    });
  }

  // Quebra lista inline ("Item A · Item B · Item C") colando " ·" na ultima
  // palavra de cada item (exceto o ultimo), impedindo ponto orfao no inicio de linha.
  function wrapInlineItems(doc, items, width) {
    const tokens = [];
    items.forEach((raw, itemIdx) => {
      const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      if (itemIdx < items.length - 1) {
        words[words.length - 1] = `${words[words.length - 1]} ·`;
      }
      tokens.push(...words);
    });
    const lines = [];
    let current = '';
    tokens.forEach((token) => {
      const candidate = current ? `${current} ${token}` : token;
      if (!current) {
        if (doc.getTextWidth(token) <= width) {
          current = token;
        } else {
          const split = doc.splitTextToSize(token, width);
          lines.push(...split.slice(0, -1));
          current = split[split.length - 1] || '';
        }
      } else if (doc.getTextWidth(candidate) <= width) {
        current = candidate;
      } else {
        lines.push(current);
        current = token;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function drawInlineItems(doc, cursor, items, x, width, sizePt, lineHeightMult, color, onNewPage) {
    const lines = wrapInlineItems(doc, items, width);
    drawWrappedLines(doc, cursor, lines, x, sizePt, lineHeightMult, color, onNewPage);
  }

  function drawSectionHeading(doc, cursor, title, x, width, palette, density, hasFonts, skipDivider, onNewPage, headingColor, opts) {
    const sp = density.spaceMult || 1;
    const sizePt = opts?.sizePt || (density.fontPt + 1.5);
    const charSpaceEm = opts?.charSpaceEm || 0.1;
    const bottomGap = opts?.bottomGapMm !== undefined ? opts.bottomGapMm : (1.8 * sp);
    const { boxH, baselineOffset, emMm } = lineMetrics(sizePt, 1.15);
    ensureSpace(doc, cursor, 10, onNewPage);

    setFont(doc, 'BarlowCondensed', 'bold', sizePt, hasFonts);
    const color = headingColor || palette.accent700;
    doc.setTextColor(color[0], color[1], color[2]);
    const baselineY = cursor.y + baselineOffset;
    const upper = title.toUpperCase();
    const charSpaceMm = sizePt * PT_TO_MM * charSpaceEm;

    if (skipDivider === 'creative') {
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(x, baselineY - emMm * 0.34, 5.8, 0.65, 'F');
      doc.setCharSpace(charSpaceMm);
      doc.text(upper, x + 8.2, baselineY);
      doc.setCharSpace(0);
      cursor.y += boxH + bottomGap;
    } else if (skipDivider === 'editorial') {
      doc.setCharSpace(charSpaceMm);
      doc.text(upper, x, baselineY);
      const titleW = doc.getTextWidth(upper) + upper.length * charSpaceMm;
      doc.setCharSpace(0);
      const ruleX = x + Math.min(width - 4, titleW + 3);
      if (ruleX < x + width) {
        doc.setDrawColor(224, 224, 227);
        doc.line(ruleX, baselineY - emMm * 0.3, x + width, baselineY - emMm * 0.3);
      }
      cursor.y += boxH + bottomGap;
    } else if (skipDivider === 'topbar') {
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(x, baselineY - emMm * 0.74, 0.9, emMm * 0.86, 'F');
      doc.setCharSpace(charSpaceMm);
      doc.text(upper, x + 3.4, baselineY);
      doc.setCharSpace(0);
      cursor.y += boxH + bottomGap;
    } else {
      doc.setCharSpace(charSpaceMm);
      doc.text(upper, x, baselineY);
      doc.setCharSpace(0);
      if (!skipDivider) {
        const lineY = cursor.y + boxH + 1.4;
        doc.setDrawColor(224, 224, 227);
        doc.line(x, lineY, x + width, lineY);
        cursor.y = lineY + 2.4 * sp;
      } else {
        cursor.y += boxH + bottomGap;
      }
    }
    setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
  }

  function drawBlocks(doc, cursor, blocks, x, width, palette, density, hasFonts, onNewPage) {
    const sp = density.spaceMult || 1;
    const lh = density.lineHeightMult || 1.35;
    blocks.forEach((block, idx) => {
      const isLast = idx === blocks.length - 1;
      if (block.type === 'text') {
        setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
        if (Array.isArray(block.items) && block.items.length) {
          drawInlineItems(doc, cursor, block.items, x, width, density.fontPt, lh, [58, 60, 62], onNewPage);
        } else {
          drawWrappedText(doc, cursor, block.text, x, width, density.fontPt, lh, [58, 60, 62], onNewPage);
        }
        if (!isLast) cursor.y += 2.2 * sp;
        return;
      }
      const titlePt = density.fontPt + 1.5;
      const titleM = lineMetrics(titlePt, 1.18);
      ensureSpace(doc, cursor, titleM.boxH + 4, onNewPage);
      setFont(doc, 'BarlowCondensed', 'bold', titlePt, hasFonts);
      doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
      const titleBaseline = cursor.y + titleM.baselineOffset;
      doc.text(block.title, x, titleBaseline);
      const larguraTitulo = doc.getTextWidth(block.title);
      if (block.period) {
        const periodPt = density.fontPt - 0.5;
        setFont(doc, 'Barlow', 'normal', periodPt, hasFonts);
        doc.setTextColor(107, 109, 111);
        const larguraPeriodo = doc.getTextWidth(block.period);
        const cabemNaMesmaLinha = (larguraTitulo + larguraPeriodo + 4) <= width;
        if (cabemNaMesmaLinha) {
          doc.text(block.period, x + width, titleBaseline, { align: 'right' });
          cursor.y += titleM.boxH;
        } else {
          cursor.y += titleM.boxH;
          const periodM = lineMetrics(periodPt, 1.2);
          doc.text(block.period, x, cursor.y + periodM.baselineOffset);
          cursor.y += periodM.boxH;
        }
      } else {
        cursor.y += titleM.boxH;
      }
      if (block.sub) {
        const subPt = density.fontPt;
        setFont(doc, 'Barlow', 'normal', subPt, hasFonts);
        doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
        const subLines = doc.splitTextToSize(block.sub, width);
        const subM = lineMetrics(subPt, 1.22);
        subLines.forEach((subLine) => {
          ensureSpace(doc, cursor, subM.boxH, onNewPage);
          doc.text(subLine, x, cursor.y + subM.baselineOffset);
          cursor.y += subM.boxH;
        });
      }
      if (block.desc) {
        cursor.y += 1.0 * sp;
        setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
        drawWrappedText(doc, cursor, block.desc, x, width, density.fontPt, lh, [58, 60, 62], onNewPage);
      }
      if (!isLast) cursor.y += 3.0 * sp;
    });
  }

  function renderSectionList(doc, cursor, sections, x, width, palette, density, hasFonts, skipDivider, onNewPage, headingColor, headingOpts) {
    const sp = density.spaceMult || 1;
    sections.forEach((s, idx) => {
      drawSectionHeading(doc, cursor, s.title, x, width, palette, density, hasFonts, skipDivider, onNewPage, headingColor, headingOpts);
      drawBlocks(doc, cursor, s.blocks, x, width, palette, density, hasFonts, onNewPage);
      if (idx < sections.length - 1) {
        cursor.y += 3.8 * sp;
      }
    });
  }

  function contactLineParts(personal) {
    return {
      base: [personal.email, personal.phone, personal.location].filter(Boolean).join(' · '),
      linkedinUrl: EuGeroUtils.safeUrl(personal.linkedinUrl)
    };
  }

  // Trunca apenas o texto EXIBIDO do link do LinkedIn (o href/url do
  // textWithLink continua completo). Evita que uma URL longa vaze da
  // margem ou da coluna da sidebar.
  function truncateLinkedinDisplay(url) {
    if (!url) return '';
    return url.length > 40 ? `${url.slice(0, 37)}...` : url;
  }

  function drawLinkWithUnderline(doc, display, x, y, url, linkColor, underline) {
    doc.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
    doc.textWithLink(display, x, y, { url });
    if (underline) {
      const w = doc.getTextWidth(display);
      doc.setFillColor(linkColor[0], linkColor[1], linkColor[2]);
      doc.rect(x, y + 0.5, w, 0.2, 'F');
    }
  }

  // Desenha a linha de contato (email/telefone/localizacao + LinkedIn
  // clicavel) compartilhada pelos layouts.
  function drawContactLine(doc, personal, palette, x, y, options) {
    const opts = options || {};
    const align = opts.align || 'left';
    const baseColor = opts.baseColor || [107, 109, 111];
    const linkColor = opts.linkColor || palette.accent700;
    const maxWidth = opts.maxWidth;
    const lineStep = opts.lineStepMm || 4.2;
    const underline = opts.underline === true;
    const fallbackText = opts.fallbackText !== undefined ? opts.fallbackText : '';
    const { base, linkedinUrl } = contactLineParts(personal);
    const linkedinDisplay = truncateLinkedinDisplay(linkedinUrl);

    if (linkedinUrl) {
      const sep = ' · ';
      const larguraBase = base ? doc.getTextWidth(`${base}${sep}`) : 0;
      const larguraLink = doc.getTextWidth(linkedinDisplay);
      if (align === 'center') {
        if (maxWidth && base && (larguraBase + larguraLink) > maxWidth) {
          doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
          doc.text(base, x, y, { align: 'center' });
          drawLinkWithUnderline(doc, linkedinDisplay, x - larguraLink / 2, y + lineStep, linkedinUrl, linkColor, underline);
          return lineStep;
        }
        const larguraTotal = doc.getTextWidth([base, linkedinDisplay].filter(Boolean).join(sep));
        const xInicio = x - larguraTotal / 2;
        doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
        if (base) doc.text(`${base}${sep}`, xInicio, y);
        drawLinkWithUnderline(doc, linkedinDisplay, xInicio + larguraBase, y, linkedinUrl, linkColor, underline);
        return 0;
      }
      if (maxWidth && base && (larguraBase + larguraLink) > maxWidth) {
        doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
        doc.text(base, x, y, { maxWidth });
        drawLinkWithUnderline(doc, linkedinDisplay, x, y + lineStep, linkedinUrl, linkColor, underline);
        return lineStep;
      }
      doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
      if (base) doc.text(`${base}${sep}`, x, y, maxWidth ? { maxWidth } : undefined);
      drawLinkWithUnderline(doc, linkedinDisplay, x + larguraBase, y, linkedinUrl, linkColor, underline);
      return 0;
    }

    const texto = base || fallbackText;
    const textOptions = {};
    if (align === 'center') textOptions.align = 'center';
    if (maxWidth) textOptions.maxWidth = maxWidth;
    doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
    doc.text(texto, x, y, Object.keys(textOptions).length ? textOptions : undefined);
    return 0;
  }

  function drawContactBox(doc, cursor, personal, palette, x, width, density, hasFonts, options) {
    const opts = options || {};
    const contactPt = density.fontPt - 1;
    const lh = density.lineHeightMult || 1.35;
    const { boxH, baselineOffset } = lineMetrics(contactPt, lh);
    setFont(doc, 'Barlow', 'normal', contactPt, hasFonts);
    const drawX = opts.align === 'center' ? x + width / 2 : x;
    const extraY = drawContactLine(doc, personal, palette, drawX, cursor.y + baselineOffset, {
      align: opts.align || 'left',
      maxWidth: width,
      baseColor: opts.baseColor,
      linkColor: opts.linkColor,
      fallbackText: opts.fallbackText,
      lineStepMm: boxH,
      underline: true
    });
    cursor.y += boxH + extraY;
  }

  function measureContactBoxHeight(doc, personal, width, density, hasFonts) {
    const contactPt = density.fontPt - 1;
    const lh = density.lineHeightMult || 1.35;
    const { boxH } = lineMetrics(contactPt, lh);
    setFont(doc, 'Barlow', 'normal', contactPt, hasFonts);
    const { base, linkedinUrl } = contactLineParts(personal);
    if (linkedinUrl && base) {
      const w = doc.getTextWidth(`${base} · `) + doc.getTextWidth(truncateLinkedinDisplay(linkedinUrl));
      if (w > width) return boxH * 2;
    }
    return boxH;
  }

  // ---- Layouts (8 familias estruturais em paridade 1:1 com css/templates.css) ----
  function layoutCentered(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;

    drawBoxText(doc, cursor, (personal.fullName || 'Seu Nome').toUpperCase(), PAGE_W / 2, cursor.colWidth, {
      family: 'BarlowCondensed', style: 'bold', sizePt: density.fontPt * 2.35,
      lineHeightMult: 1.08, color: [29, 31, 32], align: 'center', charSpaceEm: 0.04, hasFonts
    });
    cursor.y += 1.6 * sp;

    drawBoxText(doc, cursor, (personal.headline || 'Título profissional').toUpperCase(), PAGE_W / 2, cursor.colWidth, {
      family: 'Barlow', style: 'normal', sizePt: density.fontPt + 1,
      lineHeightMult: 1.25, color: palette.accent700, align: 'center', charSpaceEm: 0.12, hasFonts
    });
    cursor.y += 1.8 * sp;

    drawContactBox(doc, cursor, personal, palette, margin, cursor.colWidth, density, hasFonts, {
      align: 'center', fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 3.6 * sp;

    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, PAGE_W - margin, cursor.y);
    cursor.y += 4.4 * sp;

    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, true);
  }

  function layoutLeft(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;

    drawBoxText(doc, cursor, personal.fullName || 'Seu Nome', margin, cursor.colWidth, {
      family: 'BarlowCondensed', style: 'bold', sizePt: density.fontPt * 2.5,
      lineHeightMult: 1.08, color: [29, 31, 32], align: 'left', charSpaceEm: 0, hasFonts
    });
    cursor.y += 1.8 * sp;

    drawBoxText(doc, cursor, personal.headline || 'Título profissional', margin, cursor.colWidth, {
      family: 'Barlow', style: 'normal', sizePt: density.fontPt + 1,
      lineHeightMult: 1.25, color: [107, 109, 111], align: 'left', charSpaceEm: 0, hasFonts
    });
    cursor.y += 1.2 * sp;

    drawContactBox(doc, cursor, personal, palette, margin, cursor.colWidth, density, hasFonts, {
      align: 'left', baseColor: [107, 109, 111], fallbackText: 'contato@email.com · cidade'
    });
    cursor.y += 5.0 * sp;

    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, true, undefined, [29, 31, 32], { charSpaceEm: 0.08 });
  }

  function layoutBanner(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    const colW = PAGE_W - margin * 2;
    const padY = margin * 0.72 * sp;
    const nameText = (personal.fullName || 'Seu Nome').toUpperCase();
    const headText = (personal.headline || 'Título profissional').toUpperCase();
    const namePt = density.fontPt * 2.1;
    const headPt = density.fontPt + 0.5;

    const nameH = measureBoxTextHeight(doc, nameText, colW, namePt, 1.08, 'BarlowCondensed', 'bold', hasFonts, 0.04);
    const headH = measureBoxTextHeight(doc, headText, colW, headPt, 1.25, 'Barlow', 'normal', hasFonts, 0.1);
    const contactH = measureContactBoxHeight(doc, personal, colW, density, hasFonts);
    const bannerH = padY + nameH + 1.5 * sp + headH + 1.8 * sp + contactH + padY;

    doc.setFillColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    doc.rect(0, 0, PAGE_W, bannerH, 'F');

    const bannerCursor = { x: margin, y: padY, margin: 0, colWidth: colW };
    drawBoxText(doc, bannerCursor, nameText, margin, colW, {
      family: 'BarlowCondensed', style: 'bold', sizePt: namePt,
      lineHeightMult: 1.08, color: [238, 244, 250], charSpaceEm: 0.04, hasFonts
    });
    bannerCursor.y += 1.5 * sp;
    drawBoxText(doc, bannerCursor, headText, margin, colW, {
      family: 'Barlow', style: 'normal', sizePt: headPt,
      lineHeightMult: 1.25, color: [185, 205, 224], charSpaceEm: 0.1, hasFonts
    });
    bannerCursor.y += 1.8 * sp;
    drawContactBox(doc, bannerCursor, personal, palette, margin, colW, density, hasFonts, {
      align: 'left', baseColor: [159, 182, 205], linkColor: [238, 244, 250], fallbackText: 'e-mail · telefone · cidade'
    });

    const cursor = makeCursor(doc, margin);
    cursor.y = bannerH + 5.0 * sp;
    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, false, undefined, palette.accent900);
  }

  function layoutSidebar(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const lh = density.lineHeightMult || 1.35;
    const { personal } = data;
    const sidebarW = PAGE_W * 0.38;
    const desenharFundo = () => {
      doc.setFillColor(palette.accent100[0], palette.accent100[1], palette.accent100[2]);
      doc.rect(0, 0, sidebarW, PAGE_H, 'F');
      doc.setDrawColor(224, 224, 227);
      doc.line(sidebarW, 0, sidebarW, PAGE_H);
    };
    desenharFundo();

    const sidePadX = margin * 0.85;
    const sideCursor = { x: sidePadX, y: margin, margin, colWidth: sidebarW - sidePadX * 2 };
    const sideH3Opts = { sizePt: density.fontPt - 0.5, charSpaceEm: 0.1, bottomGapMm: 1.6 * sp };
    const itemPt = density.fontPt - 1;

    drawBoxText(doc, sideCursor, (personal.fullName || 'Seu Nome').toUpperCase(), sideCursor.x, sideCursor.colWidth, {
      family: 'BarlowCondensed', style: 'bold', sizePt: density.fontPt * 1.72,
      lineHeightMult: 1.08, color: palette.accent900, charSpaceEm: 0.03, hasFonts, onNewPage: desenharFundo
    });
    sideCursor.y += 1.6 * sp;

    drawBoxText(doc, sideCursor, (personal.headline || 'Título profissional').toUpperCase(), sideCursor.x, sideCursor.colWidth, {
      family: 'Barlow', style: 'normal', sizePt: density.fontPt - 0.5,
      lineHeightMult: lh, color: palette.accent700, charSpaceEm: 0.08, hasFonts, onNewPage: desenharFundo
    });
    sideCursor.y += 4.6 * sp;

    drawSectionHeading(doc, sideCursor, 'Contato', sideCursor.x, sideCursor.colWidth, palette, density, hasFonts, true, desenharFundo, palette.accent700, sideH3Opts);
    setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
    [personal.email, personal.phone, personal.location].filter(Boolean).forEach((line) => {
      drawWrappedText(doc, sideCursor, line, sideCursor.x, sideCursor.colWidth, itemPt, lh, [58, 60, 62], desenharFundo);
      sideCursor.y += 0.5;
    });
    const linkedinUrl = EuGeroUtils.safeUrl(personal.linkedinUrl);
    if (linkedinUrl) {
      const linkM = lineMetrics(itemPt, lh);
      setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
      const linkLines = doc.splitTextToSize(truncateLinkedinDisplay(linkedinUrl), sideCursor.colWidth);
      linkLines.forEach((linkLine) => {
        ensureSpace(doc, sideCursor, linkM.boxH, desenharFundo);
        drawLinkWithUnderline(doc, linkLine, sideCursor.x, sideCursor.y + linkM.baselineOffset, linkedinUrl, palette.accent700, true);
        sideCursor.y += linkM.boxH;
      });
    }

    const sidebarSectionIds = new Set(['skills', 'languages']);
    const mainSections = data.sections.filter((s) => !sidebarSectionIds.has(s.id));
    const sideSections = ['skills', 'languages']
      .map((id) => data.sections.find((s) => s.id === id))
      .filter(Boolean);

    sideSections.forEach((s) => {
      sideCursor.y += 4.6 * sp;
      drawSectionHeading(doc, sideCursor, s.title, sideCursor.x, sideCursor.colWidth, palette, density, hasFonts, true, desenharFundo, palette.accent700, sideH3Opts);
      setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
      s.blocks.forEach((b) => {
        const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
        list.forEach((entry) => {
          drawWrappedText(doc, sideCursor, entry, sideCursor.x, sideCursor.colWidth, itemPt, lh, [58, 60, 62], desenharFundo);
          sideCursor.y += 0.5;
        });
      });
    });

    const mainX = sidebarW + margin * 0.9;
    const mainCursor = { x: mainX, y: margin, margin, colWidth: PAGE_W - mainX - margin };
    renderSectionList(doc, mainCursor, mainSections, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts, true, desenharFundo);
  }

  function layoutCreative(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    const cursor = makeCursor(doc, margin);
    const badgeSize = 17;
    const gap = 5;
    const textX = margin + badgeSize + gap;
    const textW = cursor.colWidth - badgeSize - gap;

    const nameText = (personal.fullName || 'Seu Nome').toUpperCase();
    const headText = (personal.headline || 'Título profissional').toUpperCase();
    const namePt = density.fontPt * 1.95;
    const headPt = density.fontPt;

    const nameH = measureBoxTextHeight(doc, nameText, textW, namePt, 1.06, 'BarlowCondensed', 'bold', hasFonts, 0.04);
    const headH = measureBoxTextHeight(doc, headText, textW, headPt, 1.25, 'Barlow', 'normal', hasFonts, 0.1);
    const contactH = measureContactBoxHeight(doc, personal, textW, density, hasFonts);
    const idBlockH = nameH + 1.2 * sp + headH + 1.0 * sp + contactH;
    const headerH = Math.max(badgeSize, idBlockH);

    const badgeY = cursor.y + (headerH - badgeSize) / 2;
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, badgeY, badgeSize, badgeSize, 'F');
    const initials = (personal.fullName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SN';
    setFont(doc, 'BarlowCondensed', 'bold', 16, hasFonts);
    doc.setTextColor(255, 255, 255);
    doc.text(initials, margin + badgeSize / 2, badgeY + badgeSize / 2 + 2.1, { align: 'center' });

    const idCursor = { x: textX, y: cursor.y + (headerH - idBlockH) / 2, margin, colWidth: textW };
    drawBoxText(doc, idCursor, nameText, textX, textW, {
      family: 'BarlowCondensed', style: 'bold', sizePt: namePt,
      lineHeightMult: 1.06, color: [29, 31, 32], charSpaceEm: 0.04, hasFonts
    });
    idCursor.y += 1.2 * sp;
    drawBoxText(doc, idCursor, headText, textX, textW, {
      family: 'Barlow', style: 'normal', sizePt: headPt,
      lineHeightMult: 1.25, color: palette.accent700, charSpaceEm: 0.1, hasFonts
    });
    idCursor.y += 1.0 * sp;
    drawContactBox(doc, idCursor, personal, palette, textX, textW, density, hasFonts, {
      align: 'left', baseColor: [107, 109, 111], fallbackText: 'e-mail · telefone · cidade'
    });

    cursor.y += headerH + 5.2 * sp;
    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, 'creative');
  }

  function layoutEditorial(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;
    const leftW = cursor.colWidth * 0.58;
    const rightX = margin + cursor.colWidth;

    const nameText = (personal.fullName || 'Seu Nome').toUpperCase();
    const headText = (personal.headline || 'Título profissional').toUpperCase();
    const namePt = density.fontPt * 2.25;
    const headPt = density.fontPt;
    const metaPt = density.fontPt - 1;
    const metaM = lineMetrics(metaPt, 1.38);

    const nameH = measureBoxTextHeight(doc, nameText, leftW, namePt, 1.06, 'BarlowCondensed', 'bold', hasFonts, 0.03);
    const headH = measureBoxTextHeight(doc, headText, leftW, headPt, 1.25, 'Barlow', 'normal', hasFonts, 0.08);
    const leftBlockH = nameH + 1.4 * sp + headH;

    const linkedinUrl = EuGeroUtils.safeUrl(personal.linkedinUrl);
    const rightLinesCount = linkedinUrl ? 3 : 2;
    const rightBlockH = rightLinesCount * metaM.boxH;
    const headerH = Math.max(leftBlockH, rightBlockH);

    const leftCursor = { x: margin, y: cursor.y + (headerH - leftBlockH), margin, colWidth: leftW };
    drawBoxText(doc, leftCursor, nameText, margin, leftW, {
      family: 'BarlowCondensed', style: 'bold', sizePt: namePt,
      lineHeightMult: 1.06, color: palette.accent900, charSpaceEm: 0.03, hasFonts
    });
    leftCursor.y += 1.4 * sp;
    drawBoxText(doc, leftCursor, headText, margin, leftW, {
      family: 'Barlow', style: 'normal', sizePt: headPt,
      lineHeightMult: 1.25, color: palette.accent700, charSpaceEm: 0.08, hasFonts
    });

    setFont(doc, 'Barlow', 'normal', metaPt, hasFonts);
    doc.setTextColor(107, 109, 111);
    let rightTop = cursor.y + (headerH - rightBlockH);
    doc.text(personal.email || 'e-mail', rightX, rightTop + metaM.baselineOffset, { align: 'right' });
    rightTop += metaM.boxH;
    const phoneLoc = [personal.phone, personal.location].filter(Boolean).join(' · ') || 'telefone · cidade';
    doc.text(phoneLoc, rightX, rightTop + metaM.baselineOffset, { align: 'right' });
    if (linkedinUrl) {
      rightTop += metaM.boxH;
      const linkedinDisp = truncateLinkedinDisplay(linkedinUrl);
      const linkW = doc.getTextWidth(linkedinDisp);
      drawLinkWithUnderline(doc, linkedinDisp, rightX - linkW, rightTop + metaM.baselineOffset, linkedinUrl, palette.accent700, true);
    }

    cursor.y += headerH + 3.2 * sp;
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, cursor.y, cursor.colWidth, 0.7, 'F');
    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y + 1.6, margin + cursor.colWidth, cursor.y + 1.6);
    cursor.y += 1.6 + 4.5 * sp;

    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, 'editorial', undefined, palette.accent900);
  }

  function layoutTopbar(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(0, 0, PAGE_W, 4, 'F');

    const cursor = makeCursor(doc, margin);
    cursor.y = 4 + margin * 0.72;

    drawBoxText(doc, cursor, (personal.fullName || 'Seu Nome').toUpperCase(), margin, cursor.colWidth, {
      family: 'BarlowCondensed', style: 'bold', sizePt: density.fontPt * 2.25,
      lineHeightMult: 1.08, color: palette.accent900, charSpaceEm: 0.03, hasFonts
    });
    cursor.y += 1.4 * sp;

    drawBoxText(doc, cursor, (personal.headline || 'Título profissional').toUpperCase(), margin, cursor.colWidth, {
      family: 'Barlow', style: 'normal', sizePt: density.fontPt + 0.5,
      lineHeightMult: 1.25, color: palette.accent700, charSpaceEm: 0.08, hasFonts
    });
    cursor.y += 2.4 * sp;

    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, margin + cursor.colWidth, cursor.y);
    cursor.y += 1.8 * sp;
    drawContactBox(doc, cursor, personal, palette, margin, cursor.colWidth, density, hasFonts, {
      align: 'left', fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 1.8 * sp;
    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, margin + cursor.colWidth, cursor.y);
    cursor.y += 4.5 * sp;

    renderSectionList(doc, cursor, sections, margin, cursor.colWidth, palette, density, hasFonts, 'topbar', undefined, palette.accent900);
  }

  function layoutSplitHeader(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const lh = density.lineHeightMult || 1.35;
    const { personal } = data;
    const cursor = makeCursor(doc, margin);

    drawBoxText(doc, cursor, (personal.fullName || 'Seu Nome').toUpperCase(), margin, cursor.colWidth, {
      family: 'BarlowCondensed', style: 'bold', sizePt: density.fontPt * 2.25,
      lineHeightMult: 1.08, color: palette.accent900, charSpaceEm: 0.03, hasFonts
    });
    cursor.y += 1.4 * sp;

    drawBoxText(doc, cursor, (personal.headline || 'Título profissional').toUpperCase(), margin, cursor.colWidth, {
      family: 'Barlow', style: 'normal', sizePt: density.fontPt + 0.5,
      lineHeightMult: 1.25, color: palette.accent700, charSpaceEm: 0.08, hasFonts
    });
    cursor.y += 1.8 * sp;

    drawContactBox(doc, cursor, personal, palette, margin, cursor.colWidth, density, hasFonts, {
      align: 'left', fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 3.4 * sp;

    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, cursor.y, cursor.colWidth, 0.7, 'F');
    const splitTopY = cursor.y + 0.7 + 4.5 * sp;

    const gap = margin * 0.85;
    const mainW = (cursor.colWidth - gap) * (1.75 / 2.75);
    const railW = cursor.colWidth - gap - mainW;
    const railX = margin + mainW + gap;

    const railIds = new Set(['skills', 'languages']);
    const mainSections = data.sections.filter((s) => !railIds.has(s.id));
    const railSections = ['skills', 'languages']
      .map((id) => data.sections.find((s) => s.id === id))
      .filter(Boolean);

    if (railSections.length) {
      const itemPt = density.fontPt - 1;
      const itemM = lineMetrics(itemPt, lh);
      const railH3Pt = density.fontPt - 0.5;
      const railH3M = lineMetrics(railH3Pt, 1.15);
      const railPadY = 3.4 * sp;
      const railPadX = 3.6;
      const innerW = railW - railPadX * 2;
      setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);

      let estH = railPadY * 2;
      railSections.forEach((s, idx) => {
        estH += railH3M.boxH + 1.6 * sp;
        s.blocks.forEach((b) => {
          const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
          list.forEach((entry) => {
            estH += doc.splitTextToSize(String(entry || ''), innerW).length * itemM.boxH + 0.5;
          });
        });
        if (idx < railSections.length - 1) estH += 4.2 * sp;
      });

      doc.setFillColor(palette.accent100[0], palette.accent100[1], palette.accent100[2]);
      doc.rect(railX, splitTopY, railW, estH, 'F');
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(railX, splitTopY, 0.8, estH, 'F');

      const railCursor = { x: railX + railPadX, y: splitTopY + railPadY, margin, colWidth: innerW };
      const railH3Opts = { sizePt: railH3Pt, charSpaceEm: 0.1, bottomGapMm: 1.6 * sp };
      railSections.forEach((s, idx) => {
        drawSectionHeading(doc, railCursor, s.title, railCursor.x, railCursor.colWidth, palette, density, hasFonts, true, undefined, palette.accent900, railH3Opts);
        setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
        s.blocks.forEach((b) => {
          const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
          list.forEach((entry) => {
            drawWrappedText(doc, railCursor, entry, railCursor.x, railCursor.colWidth, itemPt, lh, [58, 60, 62]);
            railCursor.y += 0.5;
          });
        });
        if (idx < railSections.length - 1) railCursor.y += 4.2 * sp;
      });
    }

    const mainCursor = { x: margin, y: splitTopY, margin, colWidth: mainW };
    renderSectionList(doc, mainCursor, mainSections, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts, true, undefined, palette.accent900);
  }

  const LAYOUTS = {
    centered: layoutCentered,
    left: layoutLeft,
    banner: layoutBanner,
    sidebar: layoutSidebar,
    creative: layoutCreative,
    editorial: layoutEditorial,
    topbar: layoutTopbar,
    splitheader: layoutSplitHeader
  };

  function generatePdf(state, enabledSections, templateId, marginKey, densityKey, pageMode) {
    const exportState = { ...(state || {}), pageMode: pageMode || state?.pageMode || 'compact' };
    const JSPDF = getJsPDF();
    const doc = new JSPDF({ unit: 'mm', format: 'a4', compress: true });
    const hasFonts = registerFonts(doc);
    const resolvedMarginKey = marginKey || exportState.margin || 'padrao';
    const resolvedDensityKey = densityKey || exportState.density || 'normal';
    const margin = MARGIN_MM[resolvedMarginKey] || MARGIN_MM.padrao;
    const density = DENSITY[resolvedDensityKey] || DENSITY.normal;
    setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);

    const meta = EuGeroConfig.getTemplateMeta(templateId || exportState.template);
    const palette = accentPalette(meta.thumbAccent);
    const data = buildSectionsData(exportState, enabledSections);
    data.state = exportState;

    const layoutFn = LAYOUTS[meta.layout] || LAYOUTS.centered;
    layoutFn(doc, data, palette, margin, density, hasFonts);

    return doc;
  }

  function overflowIssue(pages, pageLimit) {
    if (pageLimit === 1) {
      return `O PDF tem ${pages} páginas e o limite atual é de 1. Escolha "Até 2 páginas" se o conteúdo for necessário ou reduza o resumo, as experiências e as seções opcionais.`;
    }
    return `O PDF tem ${pages} páginas e ultrapassa o limite de 2. Reduza o resumo, as experiências ou as seções opcionais antes de baixar.`;
  }

  function measureExport(state) {
    const exportState = { ...(state || {}), pageMode: state?.pageMode || 'compact' };
    const enabledSections = EuGeroConfig.getActiveSections(exportState.enabledSections);
    const doc = generatePdf(
      exportState,
      enabledSections,
      exportState.template,
      exportState.margin,
      exportState.density,
      exportState.pageMode
    );
    const pages = doc.getNumberOfPages();
    const pageLimit = getPageLimit(exportState);
    const issues = pages > pageLimit ? [overflowIssue(pages, pageLimit)] : [];
    return { pages, issues };
  }

  return {
    generatePdf,
    getPageLimit,
    measureExport,
    buildSectionsData,
    accentPalette,
    drawSectionHeading,
    drawBlocks,
    drawContactLine,
    truncateLinkedinDisplay,
    wrapInlineItems,
    LAYOUTS
  };
})();
