// 교사 인증 — 비밀번호는 PBKDF2 해시로만 보관(TEACHER_PASS_HASH 비밀값), 세션은 HMAC 서명 토큰.
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// 형식: pbkdf2-sha256$<반복>$<salt base64>$<hash base64>
export async function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string') return false;
  const [alg, iterS, saltB, hashB] = stored.split('$');
  if (alg !== 'pbkdf2-sha256') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB), iterations: +iterS }, key, 256);
  return timingSafeEqual(new Uint8Array(bits), unb64(hashB));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signToken(secret, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return body + '.' + b64u(await hmac(secret, body));
}

export async function verifyToken(secret, token) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  let given;
  try { given = unb64u(sig); } catch { return null; }
  if (!timingSafeEqual(await hmac(secret, body), given)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

export async function sha256(s) {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export function randomId(bytes = 18) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64u(a);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 6) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
export const isCode = s => typeof s === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(s);

// 이름·제목: 일반 텍스트로만. 제어 문자와 꺾쇠를 지우고 길이를 자른다(표시할 때도 textContent 만 쓴다).
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
