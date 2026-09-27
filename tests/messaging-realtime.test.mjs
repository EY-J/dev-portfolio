import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/features/messaging/realtime/signals.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", compiled)(loaded, loaded.exports);
const { conversationRealtimeTopic, isRealtimeSignal, createRefreshScheduler } = loaded.exports;

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    set(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clear(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

test("conversation topics are opaque UUID-based and reject bearer strings", () => {
  assert.equal(conversationRealtimeTopic("11111111-1111-4111-8111-111111111111"), "conversation:11111111-1111-4111-8111-111111111111");
  assert.equal(conversationRealtimeTopic("visitor@example.com"), null);
  assert.equal(conversationRealtimeTopic("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), null);
});

test("only matching minimal Broadcast events trigger refresh", () => {
  assert.equal(isRealtimeSignal({ event: "conversation_updated", payload: { type: "conversation_updated" } }, "conversation_updated"), true);
  assert.equal(isRealtimeSignal({ event: "other", payload: { type: "conversation_updated" } }, "conversation_updated"), false);
  assert.equal(isRealtimeSignal({ event: "conversation_updated", payload: { type: "other" } }, "conversation_updated"), false);
  assert.equal(isRealtimeSignal({ event: "inbox_updated", payload: { type: "inbox_updated" } }, "inbox_updated"), true);
  assert.equal(isRealtimeSignal(null, "inbox_updated"), false);
});

test("nearby events coalesce and sustained events respect cooldown", () => {
  const clock = fakeClock();
  let refreshes = 0;
  const scheduler = createRefreshScheduler(() => { refreshes += 1; }, 200, 800, clock);
  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(clock.pending(), 1);
  clock.advance(199);
  assert.equal(refreshes, 0);
  clock.advance(1);
  assert.equal(refreshes, 1);
  scheduler.schedule();
  clock.advance(799);
  assert.equal(refreshes, 1);
  clock.advance(1);
  assert.equal(refreshes, 2);
});

test("cleanup cancels pending work and permits Strict Mode resubscription", () => {
  const clock = fakeClock();
  let refreshes = 0;
  const scheduler = createRefreshScheduler(() => { refreshes += 1; }, 200, 800, clock);
  scheduler.schedule();
  scheduler.cancel();
  clock.advance(500);
  assert.equal(refreshes, 0);
  assert.equal(clock.pending(), 0);
  scheduler.schedule();
  clock.advance(200);
  assert.equal(refreshes, 1);
});

test("database broadcast payloads contain no row data", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20260926000200_conversation_realtime.sql"), "utf8");
  assert.match(sql, /jsonb_build_object\('type', 'conversation_updated'\)/);
  assert.match(sql, /jsonb_build_object\('type', 'inbox_updated'\)/);
  assert.doesNotMatch(sql, /NEW\.(body|visitor_email|visitor_name|public_token_hash)/);
});
