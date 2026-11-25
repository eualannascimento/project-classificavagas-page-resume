/**
 * Utilitarios compartilhados entre modulos (escape de HTML/atributo e debounce).
 */
const EuGeroUtils = (function () {
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Devolve a URL apenas quando o esquema e http(s); caso contrario, string
   * vazia. escapeAttr sozinho nao protege aqui: ele escapa aspas, mas deixa
   * passar "javascript:...", que continua clicavel. O rascunho .json e
   * importado de arquivo de terceiro, entao o dado nao e confiavel.
   */
  function safeUrl(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(withScheme);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch {
      return '';
    }
  }

  /**
   * Formata uma URL (especialmente LinkedIn/portfólio) para exibição limpa no
   * currículo impresso e na prévia: remove protocolo http(s), prefixo www. ou
   * subdomínio regional do LinkedIn (ex.: br.linkedin.com -> linkedin.com),
   * parâmetros de rastreamento (?utm_*, ?trk=...) e barra final, preservando o
   * identificador completo do perfil sem cortar o endereço do candidato.
   */
  function formatUrlDisplay(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const href = safeUrl(raw);
    if (!href) return raw;
    try {
      const parsed = new URL(href);
      let host = parsed.hostname.replace(/^www\./i, '');
      if (/^[a-z]{2}\.linkedin\.com$/i.test(host)) {
        host = 'linkedin.com';
      }
      let pathname = parsed.pathname || '';
      try {
        pathname = decodeURIComponent(pathname);
      } catch {
        // Mantem pathname original caso haja sequencia percentual malformada
      }
      pathname = pathname.replace(/\/+$/, '');

      let query = '';
      if (parsed.search && !/linkedin\.com$/i.test(host)) {
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'trk', 'fbclid', 'igshid', 'si'].forEach((k) => parsed.searchParams.delete(k));
        const rest = parsed.searchParams.toString();
        if (rest) query = `?${rest}`;
      }

      const clean = `${host}${pathname}${query}`;
      return clean.length > 96 ? `${clean.slice(0, 93)}...` : clean;
    } catch {
      return raw.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
    }
  }

  function debounce(fn, ms) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  return { escapeHtml, escapeAttr, safeUrl, formatUrlDisplay, debounce };
})();
