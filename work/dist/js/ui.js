export function el(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = safeText(value);
    else if (key === 'html') throw new Error('Dynamic HTML insertion is disabled.');
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') {
      for (const [property, propertyValue] of Object.entries(value)) {
        if (property.startsWith('--')) node.style.setProperty(property, propertyValue);
        else node.style[property] = propertyValue;
      }
    }
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (key in node && !key.startsWith('aria-')) {
      try { node[key] = value; } catch { node.setAttribute(key, value); }
    } else node.setAttribute(key, String(value));
  }
  appendChildren(node, ...children);
  return node;
}

function safeText(value) {
  if (value == null) return '';
  const text = String(value);
  return /^(null|undefined)$/i.test(text.trim()) ? '' : text;
}

export function appendChildren(node, ...children) {
  const safeChildren = children
    .flat(Infinity)
    .filter(child => child != null && child !== false)
    .map(child => child instanceof Node ? child : document.createTextNode(safeText(child)));
  node.append(...safeChildren);
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function fragment(...children) {
  const result = document.createDocumentFragment();
  return appendChildren(result, ...children);
}

export function toast(message, duration = 2600) {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const item = el('div', { class: 'toast', role: 'status', text: message });
  region.replaceChildren(item);
  window.setTimeout(() => item.remove(), duration);
}

export function pageHead(eyebrow, title, description, action = null) {
  const copy = el('div', {},
    el('div', { class: 'eyebrow', text: eyebrow }),
    el('h1', { text: title }),
    description ? el('p', { text: description }) : null
  );
  return el('header', { class: 'page-head' }, copy, action);
}

export function tag(text, kind = '') {
  return el('span', { class: `tag ${kind}`.trim(), text });
}

export function button(text, options = {}) {
  const { variant = '', href = null, onClick = null, className = '', ...attrs } = options;
  const classes = `button ${variant} ${className}`.trim();
  if (href) return el('a', { class: classes, href, ...attrs }, text);
  return el('button', { class: classes, type: 'button', on: onClick ? { click: onClick } : undefined, ...attrs }, text);
}

export function notice(text, kind = '', icon = 'ⓘ') {
  return el('div', { class: `notice ${kind}`.trim(), role: 'note' },
    el('strong', { 'aria-hidden': 'true', text: icon }),
    el('p', { text })
  );
}

export function normalizeArabic(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function formatModel(mode) {
  return ({ star_l: 'STAR-L', seal: 'SEAL', general: 'عام', self_intro: 'تقديم الذات' })[mode] || safeText(mode);
}

export function formatType(type) {
  return ({ behavioural: 'سلوكي', scenario: 'سيناريو', general: 'عام' })[type] || safeText(type);
}

export function showDialog(title, content) {
  const dialog = document.querySelector('#app-dialog');
  document.querySelector('#dialog-title').textContent = title;
  const body = document.querySelector('#dialog-content');
  body.replaceChildren(content instanceof Node ? content : document.createTextNode(String(content)));
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

function cellLabel(value) {
  if (Array.isArray(value)) return value.map(cellLabel).filter(Boolean).join(' ');
  if (value && typeof value === 'object' && Array.isArray(value.list)) return value.list.join(' ');
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function renderCellValue(value) {
  if (Array.isArray(value)) {
    const box = el('div', { class: 'stack' });
    value.forEach(item => box.append(renderCellValue(item)));
    return box;
  }
  if (value && typeof value === 'object' && Array.isArray(value.list)) {
    return el('ul', {}, ...value.list.map(item => el('li', { text: item })));
  }
  return el('span', { text: value == null ? '' : String(value) });
}

export function renderBlock(block) {
  const wrap = el('div', { class: `source-block block-${block.type}` });
  if (block.type === 'paragraph') wrap.append(el('p', { text: block.text }));
  else if (block.type === 'key_point') wrap.append(el('div', { class: 'key-point', text: block.text }));
  else if (block.type === 'list') {
    const list = el(block.ordered ? 'ol' : 'ul');
    (block.items || []).forEach(item => list.append(el('li', {}, renderCellValue(item))));
    wrap.append(list);
  } else if (block.type === 'table') {
    const headers = block.headers?.length ? block.headers : [];
    // البند 9: الجداول ذات الترويسات تتحول إلى بطاقات مكدسة على الشاشات الضيقة عبر data-label.
    const table = el('table', { class: headers.length ? 'source-table stacked' : 'source-table stacked keyed' });
    if (headers.length) {
      const row = el('tr');
      headers.forEach(header => row.append(el('th', { scope: 'col' }, renderCellValue(header))));
      table.append(el('thead', {}, row));
    }
    const body = el('tbody');
    (block.rows || []).forEach(sourceRow => {
      const row = el('tr');
      sourceRow.forEach((value, index) => {
        const label = headers[index] == null ? '' : cellLabel(headers[index]);
        row.append(el('td', label ? { 'data-label': label } : {}, renderCellValue(value)));
      });
      body.append(row);
    });
    table.append(body);
    // جدول بلا ترويسات (keyed): العمود الأول هو مفتاح الصف ويصبح عنوان البطاقة عند التكديس.
    wrap.append(el('div', { class: 'table-wrap' }, table));
  } else if (block.type === 'template') {
    const box = el('div', { class: 'template-block' }, el('h3', { text: block.title }));
    (block.paragraphs || []).forEach(paragraph => box.append(el('p', { text: paragraph })));
    wrap.append(box);
  }
  return wrap;
}

export function renderSourceSection(section, headingLevel = 2) {
  const card = el('section', { class: 'card source-section', id: `section-${section.number.replace('.', '-')}` });
  card.append(el(`h${headingLevel}`, {},
    el('small', { text: `القسم ${section.number}` }),
    document.createTextNode(section.title)
  ));
  (section.blocks || []).forEach(block => card.append(renderBlock(block)));
  return card;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
