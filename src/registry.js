// 교사 계정 하나의 클래스 목록과 로그인 실패 횟수를 보관하는 Durable Object (이름: "global")
import { DurableObject } from 'cloudflare:workers';
import { randomCode } from './auth.js';

const LOCK_WINDOW = 10 * 60 * 1000;
const LOCK_AFTER = 8;

export class Registry extends DurableObject {
  async fetch(req) {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json() : {};
    const st = this.ctx.storage;
    if (url.pathname === '/classes') {
      return Response.json((await st.get('classes')) || []);
    }
    if (url.pathname === '/create') {
      const classes = (await st.get('classes')) || [];
      let code;
      do { code = randomCode(); } while (classes.some(c => c.code === code));
      const item = { code, name: body.name, createdAt: Date.now() };
      classes.unshift(item);
      await st.put('classes', classes);
      return Response.json(item);
    }
    if (url.pathname === '/remove') {
      const classes = ((await st.get('classes')) || []).filter(c => c.code !== body.code);
      await st.put('classes', classes);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/rename') {
      const classes = (await st.get('classes')) || [];
      const c = classes.find(x => x.code === body.code);
      if (c) c.name = body.name;
      await st.put('classes', classes);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/login-check') {
      const f = (await st.get('fails')) || [];
      const recent = f.filter(t => Date.now() - t < LOCK_WINDOW);
      return Response.json({ locked: recent.length >= LOCK_AFTER, waitMin: Math.ceil(LOCK_WINDOW / 60000) });
    }
    if (url.pathname === '/login-fail') {
      const f = ((await st.get('fails')) || []).filter(t => Date.now() - t < LOCK_WINDOW);
      f.push(Date.now());
      await st.put('fails', f);
      return Response.json({ count: f.length });
    }
    if (url.pathname === '/login-ok') {
      await st.delete('fails');
      return Response.json({ ok: true });
    }
    return new Response('not found', { status: 404 });
  }
}
