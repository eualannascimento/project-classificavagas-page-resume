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

  function drawWrappedLines(doc, cursor, lines, x, sizePt, lineHeightMult, color, onNewPage) {
    doc.setTextColor(color[0], color[1], color[2]);
    const lineHeightMm = sizePt * PT_TO_MM * lineHeightMult;
    const ascentMm = sizePt * PT_TO_MM * 0.8;
    lines.forEach((line) => {
      ensureSpace(doc, cursor, lineHeightMm, onNewPage);
      doc.text(line, x, cursor.y + ascentMm);
      cursor.y += lineHeightMm;
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
        words[words.length - 1] = `${words[words.length - 1]}  · `;
      }
      tokens.push(...words);
    });
    const lines = [];
    let current = '';
    tokens.forEach((token) => {
      const sep = current.endsWith('· ') ? ' ' : (current ? ' ' : '');
      const candidate = current ? `${current}${sep}${token}` : token;
      if (!current) {
        if (doc.getTextWidth(token.trimEnd()) <= width) {
          current = token;
        } else {
          const split = doc.splitTextToSize(token.trimEnd(), width);
          lines.push(...split.slice(0, -1));
          current = split[split.length - 1] || '';
        }
      } else if (doc.getTextWidth(candidate.trimEnd()) <= width) {
        current = candidate;
      } else {
        lines.push(current.trimEnd());
        current = token;
      }
    });
    if (current) lines.push(current.trimEnd());
    return lines;
  }

  function drawInlineItems(doc, cursor, items, x, width, sizePt, lineHeightMult, color, onNewPage) {
    const lines = wrapInlineItems(doc, items, width);
    drawWrappedLines(doc, cursor, lines, x, sizePt, lineHeightMult, color, onNewPage);
  }

  function drawSectionHeading(doc, cursor, title, x, width, palette, density, hasFonts, skipDivider, onNewPage, headingColor) {
    const sp = density.spaceMult || 1;
    ensureSpace(doc, cursor, 10, onNewPage);
    cursor.y += 1.5 * sp;
    const sizePt = density.fontPt + 1.5;
    setFont(doc, 'BarlowCondensed', 'bold', sizePt, hasFonts);
    const color = headingColor || palette.accent700;
    doc.setTextColor(color[0], color[1], color[2]);
    const baselineY = cursor.y + sizePt * PT_TO_MM * 0.8;
    const upper = title.toUpperCase();

    if (skipDivider === 'creative') {
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(x, baselineY - 1.35, 5.8, 0.65, 'F');
      doc.setCharSpace(sizePt * PT_TO_MM * 0.08);
      doc.text(upper, x + 8.2, baselineY);
      doc.setCharSpace(0);
      cursor.y = baselineY + 2.2 * sp;
    } else if (skipDivider === 'editorial') {
      doc.setCharSpace(sizePt * PT_TO_MM * 0.08);
      doc.text(upper, x, baselineY);
      const titleW = doc.getTextWidth(upper) + upper.length * sizePt * PT_TO_MM * 0.08;
      doc.setCharSpace(0);
      const ruleX = x + Math.min(width - 4, titleW + 3);
      if (ruleX < x + width) {
        doc.setDrawColor(224, 224, 227);
        doc.line(ruleX, baselineY - 1.2, x + width, baselineY - 1.2);
      }
      cursor.y = baselineY + 2.2 * sp;
    } else if (skipDivider === 'topbar') {
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(x, baselineY - sizePt * PT_TO_MM * 0.72, 0.85, sizePt * PT_TO_MM * 0.82, 'F');
      doc.setCharSpace(sizePt * PT_TO_MM * 0.08);
      doc.text(upper, x + 2.8, baselineY);
      doc.setCharSpace(0);
      cursor.y = baselineY + 2.2 * sp;
    } else {
      doc.setCharSpace(sizePt * PT_TO_MM * 0.08);
      doc.text(upper, x, baselineY);
      doc.setCharSpace(0);
      if (!skipDivider) {
        const lineY = baselineY + 1.6 * sp;
        doc.setDrawColor(224, 224, 227);
        doc.line(x, lineY, x + width, lineY);
        cursor.y = lineY + 2.4 * sp;
      } else {
        cursor.y = baselineY + 2.2 * sp;
      }
    }
    setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
  }

  function drawBlocks(doc, cursor, blocks, x, width, palette, density, hasFonts, onNewPage) {
    const sp = density.spaceMult || 1;
    blocks.forEach((block) => {
      if (block.type === 'text') {
        setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
        if (Array.isArray(block.items) && block.items.length) {
          drawInlineItems(doc, cursor, block.items, x, width, density.fontPt, density.lineHeightMult, [58, 60, 62], onNewPage);
        } else {
          drawWrappedText(doc, cursor, block.text, x, width, density.fontPt, density.lineHeightMult, [58, 60, 62], onNewPage);
        }
        cursor.y += 2.4 * sp;
        return;
      }
      const titlePt = density.fontPt + 1.5;
      const titleLineH = titlePt * PT_TO_MM * Math.max(1.12, density.lineHeightMult * 0.9);
      ensureSpace(doc, cursor, titleLineH + 4, onNewPage);
      setFont(doc, 'BarlowCondensed', 'bold', titlePt, hasFonts);
      doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
      const titleBaseline = cursor.y + titlePt * PT_TO_MM * 0.8;
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
          cursor.y += titleLineH;
        } else {
          cursor.y += titleLineH;
          doc.text(block.period, x, cursor.y + periodPt * PT_TO_MM * 0.8);
          cursor.y += periodPt * PT_TO_MM * Math.max(1.15, density.lineHeightMult * 0.92);
        }
      } else {
        cursor.y += titleLineH;
      }
      if (block.sub) {
        const subPt = density.fontPt;
        setFont(doc, 'Barlow', 'normal', subPt, hasFonts);
        doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
        const subLines = doc.splitTextToSize(block.sub, width);
        const subLineH = subPt * PT_TO_MM * Math.max(1.15, density.lineHeightMult * 0.92);
        subLines.forEach((subLine) => {
          ensureSpace(doc, cursor, subLineH, onNewPage);
          doc.text(subLine, x, cursor.y + subPt * PT_TO_MM * 0.8);
          cursor.y += subLineH;
        });
      }
      if (block.desc) {
        cursor.y += 0.8 * sp;
        setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
        drawWrappedText(doc, cursor, block.desc, x, width, density.fontPt, density.lineHeightMult, [58, 60, 62], onNewPage);
      }
      cursor.y += 2.8 * sp;
    });
  }

  function contactLineParts(personal) {
    return {
      base: [personal.email, personal.phone, personal.location].filter(Boolean).join('  ·  '),
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

  // Desenha a linha de contato (email/telefone/localizacao + LinkedIn
  // clicavel) compartilhada pelos layouts centered/left/banner/creative.
  // options: { align: 'center'|'left' (padrao 'left'), baseColor, linkColor,
  // maxWidth, fallbackText }
  function drawContactLine(doc, personal, palette, x, y, options) {
    const opts = options || {};
    const align = opts.align || 'left';
    const baseColor = opts.baseColor || [107, 109, 111];
    const linkColor = opts.linkColor || palette.accent700;
    const maxWidth = opts.maxWidth;
    const fallbackText = opts.fallbackText !== undefined ? opts.fallbackText : '';
    const { base, linkedinUrl } = contactLineParts(personal);
    const linkedinDisplay = truncateLinkedinDisplay(linkedinUrl);

    if (linkedinUrl) {
      const sep = '  ·  ';
      const larguraBase = base ? doc.getTextWidth(`${base}${sep}`) : 0;
      const larguraLink = doc.getTextWidth(linkedinDisplay);
      if (align === 'center') {
        if (maxWidth && base && (larguraBase + larguraLink) > maxWidth) {
          doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
          doc.text(base, x, y, { align: 'center' });
          doc.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
          doc.textWithLink(linkedinDisplay, x - larguraLink / 2, y + 4.2, { url: linkedinUrl });
          return 4.2;
        }
        const larguraTotal = doc.getTextWidth([base, linkedinDisplay].filter(Boolean).join(sep));
        const xInicio = x - larguraTotal / 2;
        doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
        if (base) doc.text(`${base}${sep}`, xInicio, y);
        doc.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
        doc.textWithLink(linkedinDisplay, xInicio + larguraBase, y, { url: linkedinUrl });
        return 0;
      }
      if (maxWidth && base && (larguraBase + larguraLink) > maxWidth) {
        doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
        doc.text(base, x, y, { maxWidth });
        doc.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
        doc.textWithLink(linkedinDisplay, x, y + 4.2, { url: linkedinUrl });
        return 4.2;
      }
      doc.setTextColor(baseColor[0], baseColor[1], baseColor[2]);
      if (base) doc.text(`${base}${sep}`, x, y, maxWidth ? { maxWidth } : undefined);
      doc.setTextColor(linkColor[0], linkColor[1], linkColor[2]);
      doc.textWithLink(linkedinDisplay, x + larguraBase, y, { url: linkedinUrl });
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

  // ---- Layouts (8 familias estruturais) ----
  function layoutCentered(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;
    setFont(doc, 'BarlowCondensed', 'bold', 24, hasFonts);
    doc.setTextColor(29, 31, 32);
    const nameLines = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), cursor.colWidth - 4);
    doc.setCharSpace(24 * PT_TO_MM * 0.04);
    nameLines.forEach((line) => {
      doc.text(line, PAGE_W / 2, cursor.y + 7, { align: 'center' });
      cursor.y += 8 * sp;
    });
    doc.setCharSpace(0);
    cursor.y += 4.5 * sp;
    const headPt = density.fontPt + 1;
    setFont(doc, 'Barlow', 'normal', headPt, hasFonts);
    doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
    const headLines = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), cursor.colWidth - 6);
    doc.setCharSpace(headPt * PT_TO_MM * 0.12);
    headLines.forEach((line) => {
      doc.text(line, PAGE_W / 2, cursor.y, { align: 'center' });
      cursor.y += 4.8 * sp;
    });
    doc.setCharSpace(0);
    cursor.y += 0.8 * sp;
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    const extraContactY = drawContactLine(doc, personal, palette, PAGE_W / 2, cursor.y, {
      align: 'center', maxWidth: cursor.colWidth, fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 4.5 * sp + extraContactY;
    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, PAGE_W - margin, cursor.y);
    cursor.y += 3.8 * sp;

    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, true);
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutLeft(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;
    setFont(doc, 'BarlowCondensed', 'bold', 26, hasFonts);
    doc.setTextColor(29, 31, 32);
    const nameLines = doc.splitTextToSize(personal.fullName || 'Seu Nome', cursor.colWidth);
    nameLines.forEach((line) => {
      doc.text(line, margin, cursor.y + 7.5);
      cursor.y += 8.6 * sp;
    });
    cursor.y += 4.4 * sp;
    setFont(doc, 'Barlow', 'normal', density.fontPt + 1, hasFonts);
    doc.setTextColor(107, 109, 111);
    const headLines = doc.splitTextToSize(personal.headline || 'Título profissional', cursor.colWidth);
    headLines.forEach((line) => {
      doc.text(line, margin, cursor.y);
      cursor.y += 4.8 * sp;
    });
    cursor.y += 0.8 * sp;
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    const extraContactY = drawContactLine(doc, personal, palette, margin, cursor.y, {
      align: 'left', maxWidth: cursor.colWidth, baseColor: [107, 109, 111], fallbackText: 'contato@email.com · cidade'
    });
    cursor.y += 5.2 * sp + extraContactY;

    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, true, undefined, [29, 31, 32]);
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutBanner(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    const colW = PAGE_W - margin * 2;
    const topPad = margin * 0.65 * sp;
    const nameY = topPad + 7;
    const headY = nameY + 6.2 * sp;
    const contactY = headY + 5.6 * sp;
    const bannerH = contactY + topPad * 0.72;

    doc.setFillColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    doc.rect(0, 0, PAGE_W, bannerH, 'F');
    setFont(doc, 'BarlowCondensed', 'bold', 22, hasFonts);
    doc.setTextColor(238, 244, 250);
    doc.setCharSpace(22 * PT_TO_MM * 0.04);
    const nameLine = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), colW)[0] || '';
    doc.text(nameLine, margin, nameY);
    doc.setCharSpace(0);
    const headPt = density.fontPt + 0.5;
    setFont(doc, 'Barlow', 'normal', headPt, hasFonts);
    doc.setTextColor(185, 205, 224);
    doc.setCharSpace(headPt * PT_TO_MM * 0.1);
    const headLine = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), colW)[0] || '';
    doc.text(headLine, margin, headY);
    doc.setCharSpace(0);
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    drawContactLine(doc, personal, palette, margin, contactY, {
      align: 'left', maxWidth: colW, baseColor: [159, 182, 205], linkColor: [238, 244, 250], fallbackText: 'e-mail · telefone · cidade'
    });

    const cursor = makeCursor(doc, margin);
    cursor.y = bannerH + 5 * sp;
    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, false, undefined, palette.accent900);
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutSidebar(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
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
    setFont(doc, 'BarlowCondensed', 'bold', 18, hasFonts);
    doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    const nameLines = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), sideCursor.colWidth);
    const nameAscent = 18 * PT_TO_MM * 0.8;
    doc.setCharSpace(18 * PT_TO_MM * 0.04);
    nameLines.forEach((line) => {
      doc.text(line, sideCursor.x, sideCursor.y + nameAscent);
      sideCursor.y += 6.5 * sp;
    });
    doc.setCharSpace(0);
    sideCursor.y += 1.2 * sp;
    setFont(doc, 'Barlow', 'normal', density.fontPt - 0.5, hasFonts);
    drawWrappedText(doc, sideCursor, (personal.headline || 'Título profissional').toUpperCase(), sideCursor.x, sideCursor.colWidth, density.fontPt - 0.5, density.lineHeightMult, palette.accent700, desenharFundo);
    sideCursor.y += 3.2 * sp;

    drawSectionHeading(doc, sideCursor, 'Contato', sideCursor.x, sideCursor.colWidth, palette, density, hasFonts, true, desenharFundo);
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    [personal.email, personal.phone, personal.location].filter(Boolean).forEach((line) => {
      drawWrappedText(doc, sideCursor, line, sideCursor.x, sideCursor.colWidth, density.fontPt - 1, density.lineHeightMult, [58, 60, 62], desenharFundo);
    });
    const linkedinUrl = EuGeroUtils.safeUrl(personal.linkedinUrl);
    if (linkedinUrl) {
      ensureSpace(doc, sideCursor, 6, desenharFundo);
      setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
      doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
      doc.textWithLink(truncateLinkedinDisplay(linkedinUrl), sideCursor.x, sideCursor.y + (density.fontPt - 1) * PT_TO_MM * 0.8, { url: linkedinUrl });
      sideCursor.y += (density.fontPt - 1) * PT_TO_MM * density.lineHeightMult;
    }
    sideCursor.y += 3.2 * sp;

    const sidebarSectionIds = new Set(['skills', 'languages']);
    const mainSections = data.sections.filter((s) => !sidebarSectionIds.has(s.id));
    const skillsSection = data.sections.find((s) => s.id === 'skills');
    const languagesSection = data.sections.find((s) => s.id === 'languages');

    [skillsSection, languagesSection].filter(Boolean).forEach((s) => {
      drawSectionHeading(doc, sideCursor, s.title, sideCursor.x, sideCursor.colWidth, palette, density, hasFonts, true, desenharFundo);
      setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
      s.blocks.forEach((b) => {
        const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
        list.forEach((entry) => {
          drawWrappedText(doc, sideCursor, entry, sideCursor.x, sideCursor.colWidth, density.fontPt - 1, density.lineHeightMult, [58, 60, 62], desenharFundo);
        });
      });
      sideCursor.y += 3.2 * sp;
    });

    const mainX = sidebarW + margin * 0.9;
    const mainCursor = { x: mainX, y: margin - 1.5 * sp, margin, colWidth: PAGE_W - mainX - margin };
    mainSections.forEach((s) => {
      drawSectionHeading(doc, mainCursor, s.title, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts, true, desenharFundo);
      drawBlocks(doc, mainCursor, s.blocks, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts, desenharFundo);
    });
  }

  function layoutCreative(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    const cursor = makeCursor(doc, margin);
    const badgeSize = 16;
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, cursor.y, badgeSize, badgeSize, 'F');
    const initials = (personal.fullName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SN';
    setFont(doc, 'BarlowCondensed', 'bold', 16, hasFonts);
    doc.setTextColor(255, 255, 255);
    doc.text(initials, margin + badgeSize / 2, cursor.y + badgeSize / 2 + 2, { align: 'center' });

    const textX = margin + badgeSize + 5;
    const textW = cursor.colWidth - badgeSize - 5;
    setFont(doc, 'BarlowCondensed', 'bold', 20, hasFonts);
    doc.setTextColor(29, 31, 32);
    doc.setCharSpace(20 * PT_TO_MM * 0.04);
    const nameLine = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), textW)[0] || '';
    doc.text(nameLine, textX, cursor.y + 5.8);
    doc.setCharSpace(0);
    setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
    doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
    doc.setCharSpace(density.fontPt * PT_TO_MM * 0.1);
    const headLine = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), textW)[0] || '';
    doc.text(headLine, textX, cursor.y + 10.6);
    doc.setCharSpace(0);
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    const extraContactY = drawContactLine(doc, personal, palette, textX, cursor.y + 15.2, {
      align: 'left', maxWidth: textW, fallbackText: 'e-mail · telefone · cidade'
    });

    cursor.y += badgeSize + 4.5 * sp + extraContactY;
    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, 'creative');
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutEditorial(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const cursor = makeCursor(doc, margin);
    const { personal, sections } = data;
    const leftW = cursor.colWidth * 0.56;
    const rightX = margin + cursor.colWidth;

    setFont(doc, 'BarlowCondensed', 'bold', 23, hasFonts);
    doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    const nameLines = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), leftW - 4);
    doc.setCharSpace(23 * PT_TO_MM * 0.03);
    let leftY = cursor.y + 6.5;
    nameLines.forEach((line) => {
      doc.text(line, margin, leftY);
      leftY += 7 * sp;
    });
    doc.setCharSpace(0);

    setFont(doc, 'Barlow', 'normal', density.fontPt, hasFonts);
    doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
    const headLines = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), leftW - 8);
    doc.setCharSpace(density.fontPt * PT_TO_MM * 0.06);
    headLines.forEach((line) => {
      doc.text(line, margin, leftY - 1.5 * sp);
      leftY += 4.4 * sp;
    });
    doc.setCharSpace(0);

    setFont(doc, 'Barlow', 'normal', density.fontPt - 1.2, hasFonts);
    doc.setTextColor(107, 109, 111);
    let rightY = cursor.y + 4.8;
    doc.text(personal.email || 'e-mail', rightX, rightY, { align: 'right' });
    rightY += 4 * sp;
    const phoneLoc = [personal.phone, personal.location].filter(Boolean).join('  ·  ') || 'telefone · cidade';
    doc.text(phoneLoc, rightX, rightY, { align: 'right' });
    const linkedinUrl = EuGeroUtils.safeUrl(personal.linkedinUrl);
    if (linkedinUrl) {
      rightY += 4 * sp;
      const linkedinDisp = truncateLinkedinDisplay(linkedinUrl);
      const linkW = doc.getTextWidth(linkedinDisp);
      doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
      doc.textWithLink(linkedinDisp, rightX - linkW, rightY, { url: linkedinUrl });
    }

    cursor.y = Math.max(leftY - 2 * sp, rightY + 3 * sp);
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, cursor.y, cursor.colWidth, 0.7, 'F');
    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y + 1.5, margin + cursor.colWidth, cursor.y + 1.5);
    cursor.y += 4.2 * sp;

    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, 'editorial', undefined, palette.accent900);
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutTopbar(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal, sections } = data;
    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(0, 0, PAGE_W, 4, 'F');

    const cursor = makeCursor(doc, margin);
    cursor.y = 4 + margin * 0.7;
    setFont(doc, 'BarlowCondensed', 'bold', 23, hasFonts);
    doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    doc.setCharSpace(23 * PT_TO_MM * 0.03);
    const nameLine = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), cursor.colWidth)[0] || '';
    doc.text(nameLine, margin, cursor.y + 6.5);
    doc.setCharSpace(0);
    cursor.y += 11.5 * sp;

    setFont(doc, 'Barlow', 'normal', density.fontPt + 0.5, hasFonts);
    doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
    doc.setCharSpace((density.fontPt + 0.5) * PT_TO_MM * 0.08);
    const headLine = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), cursor.colWidth)[0] || '';
    doc.text(headLine, margin, cursor.y);
    doc.setCharSpace(0);
    cursor.y += 3.2 * sp;

    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, margin + cursor.colWidth, cursor.y);
    cursor.y += 4.2 * sp;
    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    const extraContactY = drawContactLine(doc, personal, palette, margin, cursor.y, {
      align: 'left', maxWidth: cursor.colWidth, fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 2.2 * sp + extraContactY;
    doc.setDrawColor(224, 224, 227);
    doc.line(margin, cursor.y, margin + cursor.colWidth, cursor.y);
    cursor.y += 4 * sp;

    sections.forEach((s) => {
      drawSectionHeading(doc, cursor, s.title, margin, cursor.colWidth, palette, density, hasFonts, 'topbar', undefined, palette.accent900);
      drawBlocks(doc, cursor, s.blocks, margin, cursor.colWidth, palette, density, hasFonts);
    });
  }

  function layoutSplitHeader(doc, data, palette, margin, density, hasFonts) {
    const sp = density.spaceMult || 1;
    const { personal } = data;
    const cursor = makeCursor(doc, margin);

    setFont(doc, 'BarlowCondensed', 'bold', 22.5, hasFonts);
    doc.setTextColor(palette.accent900[0], palette.accent900[1], palette.accent900[2]);
    doc.setCharSpace(22.5 * PT_TO_MM * 0.03);
    const nameLine = doc.splitTextToSize((personal.fullName || 'Seu Nome').toUpperCase(), cursor.colWidth)[0] || '';
    doc.text(nameLine, margin, cursor.y + 6.5);
    doc.setCharSpace(0);
    cursor.y += 11.2 * sp;

    setFont(doc, 'Barlow', 'normal', density.fontPt + 0.5, hasFonts);
    doc.setTextColor(palette.accent700[0], palette.accent700[1], palette.accent700[2]);
    doc.setCharSpace((density.fontPt + 0.5) * PT_TO_MM * 0.08);
    const headLine = doc.splitTextToSize((personal.headline || 'Título profissional').toUpperCase(), cursor.colWidth)[0] || '';
    doc.text(headLine, margin, cursor.y);
    doc.setCharSpace(0);
    cursor.y += 5 * sp;

    setFont(doc, 'Barlow', 'normal', density.fontPt - 1, hasFonts);
    const extraContactY = drawContactLine(doc, personal, palette, margin, cursor.y, {
      align: 'left', maxWidth: cursor.colWidth, fallbackText: 'e-mail · telefone · cidade'
    });
    cursor.y += 3.8 * sp + extraContactY;

    doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
    doc.rect(margin, cursor.y, cursor.colWidth, 0.7, 'F');
    const splitTopY = cursor.y + 4 * sp;

    const gap = margin * 0.75;
    const mainW = (cursor.colWidth - gap) * 0.63;
    const railW = cursor.colWidth - gap - mainW;
    const railX = margin + mainW + gap;

    const railIds = new Set(['skills', 'languages']);
    const mainSections = data.sections.filter((s) => !railIds.has(s.id));
    const railSections = ['skills', 'languages']
      .map((id) => data.sections.find((s) => s.id === id))
      .filter(Boolean);

    if (railSections.length) {
      const itemPt = density.fontPt - 1;
      const itemLineH = itemPt * PT_TO_MM * density.lineHeightMult;
      const headPt = density.fontPt + 1.5;
      const headH = 1.5 * sp + headPt * PT_TO_MM * 0.8 + 2.2 * sp;
      setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
      let estH = 4 * sp;
      railSections.forEach((s) => {
        estH += headH;
        s.blocks.forEach((b) => {
          const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
          list.forEach((entry) => {
            estH += doc.splitTextToSize(String(entry || ''), railW - 6).length * itemLineH;
          });
        });
        estH += 2.5 * sp;
      });
      doc.setFillColor(palette.accent100[0], palette.accent100[1], palette.accent100[2]);
      doc.rect(railX, splitTopY, railW, estH, 'F');
      doc.setFillColor(palette.accent[0], palette.accent[1], palette.accent[2]);
      doc.rect(railX, splitTopY, 0.8, estH, 'F');

      const railCursor = { x: railX + 3.5, y: splitTopY + 1.5 * sp, margin, colWidth: railW - 6 };
      railSections.forEach((s) => {
        drawSectionHeading(doc, railCursor, s.title, railCursor.x, railCursor.colWidth, palette, density, hasFonts, true, undefined, palette.accent900);
        setFont(doc, 'Barlow', 'normal', itemPt, hasFonts);
        s.blocks.forEach((b) => {
          const list = Array.isArray(b.items) && b.items.length ? b.items : [b.text];
          list.forEach((entry) => {
            drawWrappedText(doc, railCursor, entry, railCursor.x, railCursor.colWidth, itemPt, density.lineHeightMult, [58, 60, 62]);
          });
        });
        railCursor.y += 2.5 * sp;
      });
    }

    const mainCursor = { x: margin, y: splitTopY, margin, colWidth: mainW };
    mainSections.forEach((s) => {
      drawSectionHeading(doc, mainCursor, s.title, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts, true, undefined, palette.accent900);
      drawBlocks(doc, mainCursor, s.blocks, mainCursor.x, mainCursor.colWidth, palette, density, hasFonts);
    });
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
