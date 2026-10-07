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

const ICON_PATHS = Object.freeze({
  interview: 'M5 4h14v12H8l-3 3V4Zm3 4h8M8 11h6',
  answer: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  competencies: 'M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4L8 16.7l.9-5-3.6-3.5 5-.7L12 3Z',
  mission: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  readiness: 'm5 12 4 4L19 6',
  book: 'M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23V5.5Z',
  microphone: 'M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm-7-4a7 7 0 0 0 14 0M12 18v3M9 21h6',
  reports: 'M5 3h14v18H5zM9 16v-4M12 16V8M15 16v-6',
  home: 'm3 11 9-8 9 8v10h-6v-6H9v6H3V11Z',
  search: 'm21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9-.1l-1 .6a1.7 1.7 0 0 0-.9 1.6v.2h-4v-.2a1.7 1.7 0 0 0-.9-1.6l-1-.6a1.7 1.7 0 0 0-1.9.1l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9v-1.1a1.7 1.7 0 0 0-1.2-1.5h-.2V8.5H3a1.7 1.7 0 0 0 1.2-1.5V5.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9.1l1-.6A1.7 1.7 0 0 0 9.8-1v-.2h4v.2a1.7 1.7 0 0 0 .9 1.6l1 .6a1.7 1.7 0 0 0 1.9-.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9v1.1A1.7 1.7 0 0 0 20.6 9h.2v4h-.2a1.7 1.7 0 0 0-1.2 1.5V15Z',
  leadership: 'M4 19v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4M9 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM4 9a2 2 0 1 0 0-4M20 9a2 2 0 1 1 0-4',
  decision: 'M4 6h11M12 3l3 3-3 3M20 18H9M12 15l-3 3 3 3M4 6v12',
  communication: 'M4 5h11v8H8l-4 4V5Zm7 11h5l4 4V9h-2',
  profile: 'M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h3A5.5 5.5 0 0 1 18 19.5V21M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5-6h5v4h-2l-2.5 2V9H16V5Z',
  team: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2a5 5 0 0 1 10 0v2M12 20v-2a5 5 0 0 1 10 0v2',
  planning: 'M6 3h12v18H6zM9 8l1.5 1.5L13 7M14 9h2M9 14l1.5 1.5L13 13M14 15h2',
  problem: 'M9 18h6M10 22h4M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.3 14 16 14 18h-4c0-2-.5-2.7-1.5-3.5Z',
  resilience: 'M12 21a8 8 0 1 0-8-8M4 17v-4h4M12 7v5l3 2',
  results: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  flag: 'M6 22V3m0 1h11l-2 4 2 4H6',
  checklist: 'M5 3h14v18H5zM8 8l1.5 1.5L12 7M13 9h3M8 14l1.5 1.5L12 13M13 15h3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm2-4 7-7',
  calendar: 'M5 5h14v16H5zM8 2v6M16 2v6M5 10h14',
  print: 'M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z',
  export: 'M12 3v12M8 7l4-4 4 4M5 13v8h14v-8',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  palette: 'M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a4 4 0 0 1 0-8h7.5A9 9 0 0 0 12 3ZM7 10h.01M10 7h.01M14 7h.01M17 10h.01',
  text: 'M5 5h14M12 5v14M8 19h8',
  privacy: 'M12 3 5 6v5c0 4.6 2.8 8.4 7 10 4.2-1.6 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-5',
  database: 'M4 6c0 2 3.6 3 8 3s8-1 8-3-3.6-3-8-3-8 1-8 3Zm0 0v6c0 2 3.6 3 8 3s8-1 8-3V6M4 12v6c0 2 3.6 3 8 3s8-1 8-3v-6'
});

export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.book);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function bindExclusiveAccordions(container, storageKey = '') {
  const items = [...container.querySelectorAll(':scope > details')];
  let saved = '';
  try {
    saved = storageKey ? sessionStorage.getItem(`lic:accordion:${storageKey}`) : '';
  } catch {
    saved = '';
  }
  if (saved) {
    const match = items.find(item => item.id === saved);
    if (match) {
      items.forEach(item => { item.open = false; });
      match.open = true;
    }
  }
  items.forEach(item => item.addEventListener('toggle', () => {
    if (!item.open) {
      try {
        if (storageKey && sessionStorage.getItem(`lic:accordion:${storageKey}`) === item.id) {
          sessionStorage.removeItem(`lic:accordion:${storageKey}`);
        }
      } catch {
        // التخزين اختياري؛ يبقى سلوك الأكورديون عاملًا في وضع التصفح الخاص.
      }
      return;
    }
    items.forEach(other => { if (other !== item) other.open = false; });
    try {
      if (storageKey && item.id) sessionStorage.setItem(`lic:accordion:${storageKey}`, item.id);
    } catch {
      // لا نعطّل القراءة إذا منع المتصفح التخزين المؤقت.
    }
  }));
  return container;
}

export function printActions(label = 'المحتوى') {
  return el('div', { class: 'document-actions no-print', 'aria-label': `خيارات ${label}` },
    button('طباعة', { className: 'document-action primary', onClick: () => window.print() }),
    button('تصدير PDF', { variant: 'secondary', className: 'document-action', onClick: () => window.print() })
  );
}

export function button(text, options = {}) {
  const { variant = '', href = null, onClick = null, className = '', ...attrs } = options;
  const classes = `button ${variant} ${className}`.trim();
  if (href) return el('a', {
    class: classes,
    href,
    on: onClick ? { click: onClick } : undefined,
    ...attrs
  }, text);
  return el('button', { class: classes, type: 'button', on: onClick ? { click: onClick } : undefined, ...attrs }, text);
}

export function notice(text, kind = '', icon = 'ⓘ') {
  return el('div', { class: `notice ${kind}`.trim(), role: 'note' },
    el('strong', { 'aria-hidden': 'true', text: icon }),
    el('p', { text })
  );
}

export const TRAINING_ANSWER_NOTICE = 'تنبيه: هذا اجتهاد تدريبي وليس إجابة رسمية.';
export const TRAINING_EVALUATION_NOTICE = 'تنبيه: هذا اجتهاد تدريبي وليس تقييمًا رسميًا.';

export function trainingDisclaimer(kind = 'answer') {
  const text = kind === 'evaluation' ? TRAINING_EVALUATION_NOTICE : TRAINING_ANSWER_NOTICE;
  return el('aside', { class: `training-disclaimer training-disclaimer-${kind}`, role: 'note' },
    el('span', { class: 'training-disclaimer-icon', 'aria-hidden': 'true', text: '!' }),
    el('strong', { text })
  );
}

export function privacyReminder(text = 'لا تُدخل معلومات شخصية أو وظيفية حساسة.') {
  return el('aside', { class: 'privacy-reminder', role: 'note' },
    icon('privacy'),
    el('span', { text })
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
