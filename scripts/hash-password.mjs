// 사용법: node scripts/hash-password.mjs '<비밀번호>'
// 출력값을 TEACHER_PASS_HASH 비밀값으로 넣는다:  npx wrangler secret put TEACHER_PASS_HASH
import { webcrypto as crypto } from 'node:crypto';
const pw = process.argv[2];
if (!pw) { console.error('비밀번호를 인자로 주세요.'); process.exit(1); }
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const iter = 100000; // Cloudflare Workers 의 PBKDF2 반복 상한
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
const b64 = u => Buffer.from(u).toString('base64');
console.log(`pbkdf2-sha256$${iter}$${b64(salt)}$${b64(new Uint8Array(bits))}`);
