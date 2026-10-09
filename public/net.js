// 실시간 연결 — 끊기면 자동으로 다시 붙고, 같은 신원(hello)으로 같은 자리에 복귀한다.
// 모든 요청에는 rid 를 붙여, 재전송되어도 서버가 한 번만 처리한다.
export class Conn {
  constructor(code, helloFn, handlers) {
    this.code = code; this.helloFn = helloFn; this.h = handlers;
    this.pending = new Map(); this.closed = false; this.tries = 0; this.ready = false;
    this.open();
  }
  open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/${this.code}`);
    this.ws = ws; this.ready = false;
    ws.onopen = () => { this.tries = 0; ws.send(JSON.stringify({ type: 'hello', ...this.helloFn() })); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'pong') return;
      if (m.type === 'welcome') { this.ready = true; this.h.status('ok'); this.h.welcome(m); this.flush(); return; }
      if (m.type === 'denied') { this.closed = true; this.h.denied(m); try { ws.close(); } catch { } return; }
      if (m.type === 'state') { this.h.state(m); return; }
      if ((m.type === 'ok' || m.type === 'error') && m.rid && this.pending.has(m.rid)) {
        const p = this.pending.get(m.rid); this.pending.delete(m.rid); clearTimeout(p.timer);
        m.type === 'ok' ? p.resolve(m) : p.reject(m);
      }
    };
    ws.onclose = () => {
      this.ready = false;
      if (this.closed) return;
      this.h.status('lost');
      const wait = Math.min(8000, 600 * 2 ** this.tries++) + Math.random() * 400;
      setTimeout(() => !this.closed && this.open(), wait);
    };
    ws.onerror = () => { };
    clearInterval(this.ping);
    this.ping = setInterval(() => { if (this.ws.readyState === 1) this.ws.send('{"type":"ping"}'); }, 25000);
  }
  // 연결이 다시 붙으면 아직 답을 못 받은 요청을 같은 rid 로 다시 보낸다(서버가 중복을 걸러 냄)
  flush() { for (const [, p] of this.pending) this.ws.send(p.raw); }
  request(msg) {
    const rid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).slice(0, 36);
    const raw = JSON.stringify({ ...msg, rid });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(rid)) { this.pending.delete(rid); reject({ why: '서버 응답이 늦어지고 있습니다.', next: '연결 상태를 확인한 뒤 다시 눌러 주세요.' }); }
      }, 15000);
      this.pending.set(rid, { resolve, reject, raw, timer });
      if (this.ready && this.ws.readyState === 1) this.ws.send(raw);
    });
  }
  close() { this.closed = true; clearInterval(this.ping); try { this.ws.close(); } catch { } }
}
