// 작은 DOM 도우미. 사용자 입력(이름·제목)은 항상 textContent 로만 넣는다 — HTML 로 해석하지 않는다.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function toast(why, next, kind) {
  const root = document.getElementById('toasts');
  const t = h('div', { class: 'toast' + (kind ? ' ' + kind : '') }, h('b', null, why), next ? h('div', null, next) : null);
  root.appendChild(t);
  setTimeout(() => t.remove(), kind === 'info' ? 3500 : 7000);
}

let modalClose = null;
export function openModal(title, body, opts = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  const prev = document.activeElement;
  const closeBtn = h('button', { class: 'btn small ghost', onclick: () => closeModal(), 'aria-label': '닫기' }, '닫기 ✕');
  const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: opts.width ? { maxWidth: opts.width } : null },
    h('div', { class: 'modal-head' }, h('h2', null, title), closeBtn),
    h('div', { class: 'modal-body' }, body));
  const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) closeModal(); } }, dlg);
  const onKey = e => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  root.appendChild(back);
  closeBtn.focus();
  modalClose = () => { document.removeEventListener('keydown', onKey); back.remove(); modalClose = null; if (prev && prev.focus) prev.focus(); };
  return dlg;
}
export function closeModal() { if (modalClose) modalClose(); }
export const modalOpen = () => !!modalClose;

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('cita:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cita:' + k, JSON.stringify(v)); } catch { /* 사생활 모드 */ } },
  del(k) { try { localStorage.removeItem('cita:' + k); } catch { } },
};
