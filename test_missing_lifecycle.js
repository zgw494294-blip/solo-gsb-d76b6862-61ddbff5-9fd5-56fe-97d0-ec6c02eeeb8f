/* 最小 DOM/事件 stub：加载真实 static/app.js，端到端验证漏读时间窗推测的生命周期。 */
"use strict";
const fs = require("fs");
const path = require("path");

/* ---------------- mini DOM（与其余生命周期测试同款桩） ---------------- */

class TokenList {
  constructor() { this._s = new Set(); }
  add(...names) { names.forEach((n) => n && this._s.add(n)); }
  remove(n) { this._s.delete(n); }
  contains(n) { return this._s.has(n); }
  [Symbol.iterator]() { return this._s[Symbol.iterator](); }
}

class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.classList = new TokenList();
    this.dataset = {};
    this.id = "";
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this._text = "";
    this._html = "";
    this._listeners = new Map();
    this.name = "";
    this.type = "";
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(html) {
    this._html = html;
    this.children = [];
    if (html) parseHtml(html).forEach((n) => this.appendChild(n));
  }
  get innerHTML() { return this._html; }
  appendChild(c) {
    if (c.parent) c.parent._remove(c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  _remove(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
  }
  remove() { if (this.parent) { this.parent._remove(this); this.parent = null; } }
  insertAdjacentHTML(_pos, html) { parseHtml(html).forEach((n) => this.appendChild(n)); }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  dispatchEvent(evt) {
    let node = this;
    if (!evt.target) evt.target = this;
    if (!evt.preventDefault) evt.preventDefault = () => {};
    while (node) {
      const fns = node._listeners.get(evt.type) || [];
      for (const fn of fns) fn.call(node, evt);
      node = node.parent;
    }
  }
  _descendants(out = []) {
    for (const c of this.children) { out.push(c); c._descendants(out); }
    return out;
  }
  matches(sel) {
    let s = sel.trim();
    const checked = s.endsWith(":checked");
    if (checked) s = s.slice(0, -":checked".length);
    let m = s.match(/^([\w-]+)?(?:\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/);
    if (s.startsWith(".") || s.startsWith("#")) m = null;
    if (s.startsWith(".")) {
      if (checked && !this.checked) return false;
      return this.classList.contains(s.slice(1));
    }
    if (s.startsWith("#")) return this.id === s.slice(1);
    if (!m) return false;
    const [, tag, attr, val] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (attr) {
      const actual = attr === "class" ? [...this.classList].join(" ") : this.attrs[attr] ?? this[attr];
      if (val !== undefined && String(actual) !== val) return false;
      if (val === undefined && actual === undefined) return false;
    }
    if (checked && !this.checked) return false;
    return true;
  }
  querySelector(sel) { return this._descendants().find((n) => n.matches(sel)); }
  querySelectorAll(sel) { return this._descendants().filter((n) => n.matches(sel)); }
  closest(sel) {
    let n = this;
    while (n) { if (n.matches(sel)) return n; n = n.parent; }
    return null;
  }
}

const VOID_TAGS = new Set(["input", "br", "img", "hr", "meta", "link"]);

function parseHtml(html) {
  const root = new El("#root");
  const stack = [root];
  const tokenRe = /<\/?[a-zA-Z][\w-]*(?:[^<>]*?)\/?>|[^<]+/g;
  let tok;
  while ((tok = tokenRe.exec(html))) {
    const t = tok[0];
    if (t[0] !== "<") continue;
    const closing = t[1] === "/";
    const selfClose = t.endsWith("/>");
    const nameM = t.match(/^<\/?([\w-]+)/);
    const tag = nameM[1].toLowerCase();
    if (closing) {
      const el = stack.pop();
      if (el && el._contentStart !== undefined) {
        el._html = html.slice(el._contentStart, tok.index);
      }
      continue;
    }
    const el = new El(tag);
    const attrRe = /([\w:-]+)(?:\s*=\s*"([^"]*)")?/g;
    const raw = t.replace(/^<\/?[\w-]+/, "").replace(/\/?>$/, "");
    let am;
    while ((am = attrRe.exec(raw))) {
      const [, k, v] = am;
      if (!k || k === "/") continue;
      if (v === undefined) { el.attrs[k] = true; continue; }
      el.attrs[k] = v;
      if (k === "class") v.split(/\s+/).forEach((c) => c && el.classList.add(c));
      else if (k === "id") el.id = v;
      else if (k.startsWith("data-")) {
        const dk = k.slice(5);
        el.dataset[dk] = v;
        el.dataset[dk.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      }
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = true;
      else if (k === "hidden") el.hidden = true;
      else if (k === "name") el.name = v;
      else if (k === "type") el.type = v;
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !VOID_TAGS.has(tag)) {
      el._contentStart = tok.index + t.length;
      stack.push(el);
    }
  }
  return root.children.slice();
}

/* ---------------- document stub ---------------- */

const byId = new Map();
function mk(id, tag = "div") { const e = new El(tag); e.id = id; byId.set(id, e); return e; }

const form = mk("judge-form", "form");
const runnerRows = mk("runner-rows");
const recordRows = mk("record-rows");
const addRunner = mk("add-runner", "button");
const addRecord = mk("add-record", "button");
mk("record-count", "span");
mk("error-box"); mk("pending-hint");
const results = mk("results");
mk("diagnosis-box").hidden = true;
const missingBox = mk("missing-box");
missingBox.hidden = true; // 真实 HTML 中带 hidden 属性
for (const id of ["smMin", "smMax", "mfMin", "mfMax"]) mk(id, "input");
mk("sample-btn", "button");
mk("clear-btn", "button");

for (const id of ["smMin", "smMax", "mfMin", "mfMax"]) form.appendChild(byId.get(id));
form.appendChild(runnerRows);
form.appendChild(recordRows);

global.document = { getElementById: (id) => byId.get(id) };

/* ---------------- fetch stub：按 URL 分流裁决/诊断/漏读，可挂起/报错 ---------------- */

function lap(s, m, f, st, mt, ft) {
  return {
    start: { id: s, time: st }, middle: { id: m, time: mt }, finish: { id: f, time: ft },
    smTime: mt - st, mfTime: ft - mt, totalTime: ft - st,
  };
}

const adjudicateResult = {
  runners: [
    {
      runner: 101, lapCount: 1, totalTime: 25,
      laps: [lap("a1", "b1", "c1", 0, 12, 25)],
      unused: [
        { id: "a2", gate: "S", time: 30 },
        { id: "b2", gate: "M", time: 45 },
        { id: "b3", gate: "M", time: 40 },
        { id: "c9", gate: "F", time: 55 },
      ],
    },
  ],
};

// 漏读结果：缺 F（a2,b2）窗口 [55,105]、缺 F（a2,b3）窗口 [50,100]、
// 缺 M（a2,c9）窗口 [40,45]，按缺失门 S/M/F 与 ID 序列排序返回（此处已是排序后顺序）。
const missingResult = {
  runners: [
    {
      runner: 101, lapCount: 1,
      hints: [
        {
          missingGate: "M",
          records: [{ id: "a2", gate: "S", time: 30 }, { id: "c9", gate: "F", time: 55 }],
          timeMin: 40, timeMax: 45,
        },
        {
          missingGate: "F",
          records: [{ id: "a2", gate: "S", time: 30 }, { id: "b2", gate: "M", time: 45 }],
          timeMin: 55, timeMax: 105,
        },
        {
          missingGate: "F",
          records: [{ id: "a2", gate: "S", time: 30 }, { id: "b3", gate: "M", time: 40 }],
          timeMin: 50, timeMax: 100,
        },
      ],
    },
  ],
};

const missingEmptyResult = { runners: [{ runner: 101, lapCount: 1, hints: [] }] };

const server = {
  adjMode: "valid",       // valid | invalid | neterr | hold
  missMode: "valid",      // valid | invalid | neterr | hold | empty
  adjHold: null,
  missHold: null,
  missRaw: null,
};
const calls = { adjudicate: 0, missing: [] };

global.fetch = async (url, opts) => {
  const respond = (data, ok, status) => ({
    ok,
    status,
    json: async () => (typeof data === "string" ? JSON.parse(data) : data),
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  });
  if (url === "/api/adjudicate") {
    calls.adjudicate += 1;
    JSON.parse(opts.body);
    if (server.adjMode === "neterr") throw new TypeError("模拟断网");
    if (server.adjMode === "invalid") {
      return respond({ ok: false, error: "模拟非法输入" }, false, 422);
    }
    if (server.adjMode === "hold") return respond(await server.adjHold, true, 200);
    return respond({ ok: true, result: adjudicateResult }, true, 200);
  }
  if (url === "/api/diagnose") {
    return respond({ ok: true, result: { runners: [{ runner: 101, lapCount: 1, totalTime: 25, diagnoses: [] }] } }, true, 200);
  }
  if (url === "/api/find-missing") {
    calls.missing.push(JSON.parse(opts.body));
    if (server.missMode === "neterr") throw new TypeError("模拟断网");
    if (server.missMode === "invalid") {
      return respond({ ok: false, error: "模拟漏读查询拒绝" }, false, 422);
    }
    if (server.missMode === "hold") return respond(await server.missHold, true, 200);
    if (server.missMode === "empty") {
      return respond({ ok: true, result: missingEmptyResult }, true, 200);
    }
    if (server.missRaw !== null) return respond(server.missRaw, true, 200);
    return respond({ ok: true, result: missingResult }, true, 200);
  }
  throw new Error(`unexpected url ${url}`);
};

/* ---------------- 加载真实 app.js ---------------- */

new Function(fs.readFileSync(path.join(__dirname, "static", "app.js"), "utf8"))();

/* ---------------- 测试辅助 ---------------- */

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("  ✓", msg); }
  else { failures++; console.error("  ✗", msg); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const $ = (id) => byId.get(id);
function setVal(id, v) { $(id).value = v; }
function fire(el, type) { el.dispatchEvent({ type, preventDefault() {}, target: el }); }
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }

function setRow(ids, runner, gate, time) {
  const rows = recordRows.querySelectorAll(".record-row");
  for (const row of rows) {
    if (row.querySelector(".rec-id").value === "") {
      row.querySelector(".rec-id").value = ids;
      row.querySelector(".rec-runner").value = runner;
      row.querySelector(".rec-gate").value = gate;
      row.querySelector(".rec-time").value = time;
      return row;
    }
  }
  throw new Error("no empty row");
}

const missState = () => globalThis.__getMissingStateForTest();
const missHtml = () => missingBox.innerHTML;
function clickMissing() {
  const btn = missingBox.querySelector(".missing-run") ||
    missingBox.querySelector(".missing-rerun");
  assert(btn, "漏读查询按钮存在");
  fire(btn, "click");
  return btn;
}
async function adjudicate() { fire(form, "submit"); await flush(); }

async function setupValid(extraRecordRows = 5) {
  setVal("smMin", "10"); setVal("smMax", "60");
  setVal("mfMin", "10"); setVal("mfMax", "60");
  runnerRows.querySelector(".runner-number").value = "101";
  for (let i = 0; i < extraRecordRows; i++) fire(addRecord, "click");
  const rows = [
    ["a1", "101", "S", "0"], ["b1", "101", "M", "12"], ["c1", "101", "F", "25"],
    ["a2", "101", "S", "30"], ["b2", "101", "M", "45"], ["b3", "101", "M", "40"],
    ["c9", "101", "F", "55"],
  ];
  for (const [i, r, g, t] of rows) setRow(i, r, g, t);
  await adjudicate();
}

async function main() {
  console.log("场景0：初始无结果时漏读卡隐藏，无按钮可点");
  assert(missingBox.hidden, "无裁决结果时漏读卡隐藏");

  await setupValid();
  console.log("场景1：合法裁决后出现“查找漏读”按钮，且不自动发查询请求");
  assert(!missingBox.hidden, "合法结果后漏读卡显示");
  assert(missHtml().includes("查找漏读"), "显示查找漏读按钮");
  assert(missState().status === "idle", "状态为 idle");
  assert(calls.missing.length === 0, "裁决不会自动调用漏读接口");
  assert(results.innerHTML.includes("a1"), "采纳结果正常展示");

  console.log("场景2：点击后发 POST /api/find-missing，载荷为当前完整裁决输入");
  clickMissing();
  assert(missState().status === "loading", "点击后立即进入 loading");
  assert(missHtml().includes("推测"), "loading 态渲染");
  await flush();
  assert(missState().status === "done", "成功后 done");
  assert(calls.missing.length === 1, "恰好发出一次漏读请求");
  const body = calls.missing[0];
  assert(body.standards.smMin === "10" && body.runners[0].number === "101",
    "漏读请求体即当前完整裁决输入");
  assert(body.records.length === 7, "漏读请求包含全部记录行");

  console.log("场景3：窗口按缺失门 S/M/F、ID 序列排序渲染，只读不动采纳结果");
  const html = missHtml();
  assert(html.includes("补 中途门 M 读数"), "渲染缺 M 窗口");
  assert(html.includes("补 终点 F 读数"), "渲染缺 F 窗口");
  const posM = html.indexOf("补 中途门 M 读数");
  const posF1 = html.indexOf("补 终点 F 读数");
  const posF2 = html.indexOf("补 终点 F 读数", posF1 + 1);
  assert(posM !== -1 && posM < posF1 && posF1 < posF2, "缺失门按 S/M/F 次序展示");
  assert(html.indexOf("b2") < html.indexOf("b3"), "同门按两条 ID 序列字典序（b2 在 b3 前）");
  assert(html.includes("[40, 45] 秒"), "缺 M 窗口端点展示");
  assert(html.includes("[55, 105] 秒"), "缺 F 窗口端点展示");
  assert(html.includes("闭区间"), "标明闭区间");
  assert(html.includes("1 → 2"), "展示计次数 1 → 2");
  assert(html.includes("a2") && html.includes("b2"), "展示两条记录 ID");
  assert(!results.innerHTML.includes("查找漏读"), "漏读内容不出现在采纳结果区");
  assert(results.innerHTML.includes("a1"), "采纳结果保持不动");

  console.log("场景4：无解时明确提示");
  server.missMode = "empty";
  clickMissing(); // done 态“重新查找”
  await flush();
  assert(missState().status === "done", "空结果仍 done");
  assert(missHtml().includes("无解"), "明确提示无解");
  assert(missHtml().includes("该选手无可行补读窗口"), "逐选手提示无窗口");
  server.missMode = "valid";
  clickMissing();
  await flush();
  assert(missHtml().includes("[55, 105] 秒"), "恢复有解结果");

  console.log("场景5：查询完成后修改任意输入 → 立即清除，非法/重算期间不可查询");
  setVal("smMin", "");
  fire($("smMin"), "input");
  assert(missingBox.hidden, "输入一改漏读卡立即隐藏");
  assert(missState().status === "idle" && missHtml() === "", "漏读状态与内容清除");
  server.adjMode = "invalid";
  await adjudicate();
  assert(missingBox.hidden, "非法输入期间漏读卡保持隐藏（不可查询）");
  assert(missingBox.querySelector(".missing-run") === undefined, "非法期间没有查询按钮");
  setVal("smMin", "10");
  fire($("smMin"), "input"); // 防抖重算在途
  assert(missingBox.hidden, "重算期间漏读卡隐藏");
  server.adjMode = "valid";
  await new Promise((r) => setTimeout(r, 450));
  await flush();
  assert(!missingBox.hidden && missState().status === "idle",
    "新合法结果到达后恢复 idle，需重新查询（旧窗口不恢复）");
  assert(!missHtml().includes("[55, 105] 秒"), "旧窗口内容未随重算恢复");

  console.log("场景6：迟到的漏读成功不得覆盖新输入状态");
  let resolveHold;
  server.missMode = "hold";
  server.missHold = new Promise((res) => { resolveHold = res; });
  clickMissing();
  assert(missState().status === "loading", "查询在途");
  const inFlightCalls = calls.missing.length;
  assert(missingBox.querySelector(".missing-run") === undefined, "loading 态没有可点按钮");
  $("smMax").value = "61";
  fire($("smMax"), "input");
  assert(missingBox.hidden, "输入改变后漏读卡隐藏");
  resolveHold({ ok: true, result: missingResult });
  await flush();
  assert(missingBox.hidden, "迟到的成功响应没有让漏读卡重新出现");
  assert(calls.missing.length === inFlightCalls, "在途期间未重复发请求");
  server.missMode = "valid";
  $("smMax").value = "60";
  fire($("smMax"), "input");
  await new Promise((r) => setTimeout(r, 450));
  await flush();
  assert(missState().status === "idle", "新合法结果后恢复 idle");

  console.log("场景7：漏读 422 只在漏读卡报错，采纳结果/错误框不受影响，可重试");
  server.missMode = "invalid";
  globalThis.__runMissingForTest();
  await flush();
  assert(missState().status === "error", "漏读 422 → error 态");
  assert(missHtml().includes("模拟漏读查询拒绝"), "漏读卡显示服务端原因");
  assert(results.innerHTML.includes("a1"), "采纳结果仍在（未被漏读失败清掉）");
  assert($("error-box").hidden, "主错误框不显示漏读错误");
  server.missMode = "valid";
  clickMissing(); // 错误态“重试查找”
  await flush();
  assert(missState().status === "done" && missHtml().includes("[55, 105] 秒"), "重试后恢复成功");

  console.log("场景8：非迟到的网络失败可展示并重试；迟到网络失败不回写");
  server.missMode = "neterr";
  globalThis.__runMissingForTest(); // done 态“重新查找”
  await flush();
  assert(missState().status === "error" && missHtml().includes("无法连接漏读推测服务"),
    "非迟到网络失败显示在漏读卡");
  assert(results.innerHTML.includes("a1"), "采纳结果仍在");
  // 迟到断网：挂起 → 输入改变 → 以断网失败
  server.missMode = "hold";
  let resolveHold2;
  server.missHold = new Promise((res) => { resolveHold2 = res; });
  globalThis.__runMissingForTest();
  $("mfMax").value = "59";
  fire($("mfMax"), "input");
  assert(missingBox.hidden, "输入变更后漏读卡隐藏");
  resolveHold2(Promise.reject(new TypeError("模拟断网迟到")));
  await flush();
  assert(missingBox.hidden, "迟到的失败响应没有覆盖新状态");
  server.missMode = "valid";
  $("mfMax").value = "60";
  fire($("mfMax"), "input");
  await new Promise((r) => setTimeout(r, 450));
  await flush();
  assert(missState().status === "idle", "新合法结果后恢复 idle");

  console.log("场景9：输入未变的手动重算——开始即清除并禁止查询，完成后恢复入口");
  clickMissing();
  await flush();
  assert(missState().status === "done", "前置：漏读查询已完成");
  let resolveAdj;
  server.adjMode = "hold";
  server.adjHold = new Promise((res) => { resolveAdj = res; });
  const missCallsBeforeRecompute = calls.missing.length;
  fire(form, "submit"); // 输入未变的手动重算
  assert(missingBox.hidden, "重算开始：漏读卡立即隐藏（禁止查询）");
  assert(missState().status === "idle" && missHtml() === "", "重算开始：旧窗口状态与内容已清除");
  assert(missingBox.querySelector(".missing-run") === undefined, "重算期间没有查询按钮");
  globalThis.__runMissingForTest(); // 绕过界面尝试发查询也被拦截
  await flush();
  assert(calls.missing.length === missCallsBeforeRecompute, "重算期间不会发出漏读请求");
  resolveAdj({ ok: true, result: adjudicateResult });
  await flush();
  server.adjMode = "valid";
  assert(!missingBox.hidden && missState().status === "idle", "最新合法裁决完成后恢复可查询入口");
  assert(missHtml().includes("查找漏读"), "恢复后显示查找按钮");
  assert(!missHtml().includes("[55, 105] 秒"), "旧窗口内容未随重算恢复");

  console.log("场景10：重算前发出的查询 M1 迟到（成功/服务错误/断网）均不回写");
  // 10a：M1 挂起 → 手动重算 → M2 完成 → M1 迟到成功被丢弃
  server.missMode = "hold";
  let resolveM1;
  server.missHold = new Promise((res) => { resolveM1 = res; });
  clickMissing();
  assert(missState().status === "loading", "M1 在途（loading）");
  fire(form, "submit"); // 输入未变的手动重算：M1 即刻作废
  await flush();
  assert(missState().status === "idle", "重算后漏读回到 idle（M1 在途状态被清除）");
  server.missMode = "valid";
  clickMissing(); // M2
  await flush();
  assert(missState().status === "done", "M2 完成");
  const m2Html = missHtml();
  resolveM1({ ok: true, result: { runners: [{ runner: 101, lapCount: 1, hints: [
    { missingGate: "S", records: [{ id: "M1LATE", gate: "M", time: 1 }, { id: "z9", gate: "F", time: 2 }], timeMin: 0, timeMax: 1 },
  ] }] } });
  await flush();
  assert(missState().status === "done", "M1 迟到成功未改变 M2 的完成状态");
  assert(missHtml() === m2Html, "M1 迟到成功未改写 M2 的展示内容");
  assert(!missHtml().includes("M1LATE"), "M1 的结果没有重新显示");
  // 10b：M1 挂起 → 手动重算 → M1 迟到服务错误不得显示
  server.missMode = "hold";
  let resolveM1b;
  server.missHold = new Promise((res) => { resolveM1b = res; });
  clickMissing(); // done 态“重新查找”
  assert(missState().status === "loading", "M1' 在途（loading）");
  fire(form, "submit");
  await flush();
  assert(missState().status === "idle", "重算后回到 idle");
  resolveM1b({ ok: false, error: "M1迟到服务错误" });
  await flush();
  assert(missState().status === "idle", "M1' 迟到的服务错误未显示（保持 idle）");
  assert(!missHtml().includes("M1迟到服务错误"), "服务错误内容未出现");
  assert(missHtml().includes("查找漏读"), "仍是可查询的初始态");
  // 10c：M1 挂起 → 手动重算 → M1 迟到网络失败不得显示
  server.missMode = "hold";
  let resolveM1c;
  server.missHold = new Promise((res) => { resolveM1c = res; });
  clickMissing();
  assert(missState().status === "loading", "M1'' 在途（loading）");
  fire(form, "submit");
  await flush();
  resolveM1c(Promise.reject(new TypeError("M1迟到断网")));
  await flush();
  assert(missState().status === "idle", "M1'' 迟到断网未显示错误");
  assert(!missHtml().includes("无法连接漏读推测服务"), "断网错误未出现");
  server.missMode = "valid";

  console.log("场景11：手动重算失败（非法/断网）时保持不可查询，旧窗口不恢复");
  clickMissing();
  await flush();
  assert(missState().status === "done", "前置：漏读查询完成");
  server.adjMode = "invalid";
  fire(form, "submit");
  await flush();
  assert(!$("error-box").hidden, "重算 422：错误框显示");
  assert(missingBox.hidden && missHtml() === "", "重算 422：漏读卡保持隐藏，旧窗口不恢复");
  assert(missingBox.querySelector(".missing-run") === undefined, "422 后没有查询按钮");
  const missCallsAtFail = calls.missing.length;
  globalThis.__runMissingForTest();
  await flush();
  assert(calls.missing.length === missCallsAtFail, "裁决失败期间不会发出漏读请求");
  server.adjMode = "neterr";
  fire(form, "submit");
  await flush();
  assert(missingBox.hidden && missingBox.querySelector(".missing-run") === undefined,
    "重算断网：漏读卡保持隐藏，不可查询");
  server.adjMode = "valid";
  fire(form, "submit");
  await flush();
  assert(!missingBox.hidden && missState().status === "idle", "重新裁决成功后恢复可查询入口");

  console.log("场景12：清空 / 填入示例路径清除漏读窗口且不自行发请求");
  clickMissing();
  await flush();
  assert(missState().status === "done", "前置：漏读查询完成");
  fire($("clear-btn"), "click");
  await flush();
  assert(missingBox.hidden && missHtml() === "", "清空后漏读卡隐藏并清空");
  const missCallsAtClear = calls.missing.length;
  fire($("sample-btn"), "click");
  await new Promise((r) => setTimeout(r, 450));
  await flush();
  assert(!missingBox.hidden && missState().status === "idle",
    "填入示例重算后漏读为初始 idle（旧窗口清除）");
  assert(calls.missing.length === missCallsAtClear, "示例/清空本身不发起漏读请求");

  console.log("场景13：超过 2^53 的编号与秒数：漏读卡精确渲染，不被 Number 截断");
  const BIG = "9007199254740993";
  fire($("clear-btn"), "click");
  await flush();
  setVal("smMin", "10"); setVal("smMax", "60"); setVal("mfMin", "10"); setVal("mfMax", "60");
  runnerRows.querySelector(".runner-number").value = BIG;
  fire(runnerRows, "input");
  for (let i = 0; i < 2; i++) fire(addRecord, "click"); // 共 3 行记录
  const TS = "9007199254740992", TM = "9007199254741003";
  const TLO = "9007199254741013", THI = "9007199254741063";
  setRow("h1", BIG, "S", TS);
  setRow("h2", BIG, "M", TM);
  server.missRaw = `{"ok":true,"result":{"runners":[{"runner":${BIG},"lapCount":0,` +
    `"hints":[{"missingGate":"F","records":[{"id":"h1","gate":"S","time":${TS}},` +
    `{"id":"h2","gate":"M","time":${TM}}],"timeMin":${TLO},"timeMax":${THI}}]}]}}`;
  const adjRaw = `{"ok":true,"result":{"runners":[{"runner":${BIG},"lapCount":0,"totalTime":0,` +
    `"laps":[],"unused":[{"id":"h1","gate":"S","time":${TS}},{"id":"h2","gate":"M","time":${TM}}]}]}}`;
  server.adjMode = "hold";
  server.adjHold = Promise.resolve(adjRaw);
  fire(form, "submit");
  await flush();
  server.adjMode = "valid";
  assert(missState().status === "idle", "大编号合法裁决后 idle");
  globalThis.__runMissingForTest();
  await flush();
  assert(missHtml().includes(`选手 ${BIG}`), "漏读卡精确显示大编号");
  assert(missHtml().includes(`[${TLO}, ${THI}] 秒`), "窗口端点精确展示（不截断）");
  assert(missHtml().includes(TS) && missHtml().includes(TM), "记录秒数精确展示");
  assert(calls.missing[calls.missing.length - 1].runners[0].number === BIG,
    "漏读请求中的大编号以十进制字符串原样发送");
  server.missRaw = null;

  console.log("场景14：漏读查询只读——复核、罚秒、名次与诊断均不受影响");
  fire($("clear-btn"), "click");
  await flush();
  await setupValid(6); // 清空后只剩 1 空记录行，补 6 行共 7 行
  // 保存复核与罚秒
  const box = results.querySelectorAll(".review-box")[0];
  for (const r of box.querySelectorAll('input[type="radio"]')) r.checked = r.value === "pass";
  box.querySelector(".review-note").value = "漏读只读复核";
  fire(box.querySelector(".review-save"), "click");
  const ed = results.querySelector(".penalty-editor");
  ed.querySelector(".penalty-seconds").value = "4";
  ed.querySelector(".penalty-reason").value = "设备故障";
  fire(ed.querySelector(".penalty-save"), "click");
  // 完成一次诊断
  fire($("diagnosis-box").querySelector(".diagnose-run"), "click");
  await flush();
  const resultsSnapshot = results.innerHTML;
  const diagSnapshot = $("diagnosis-box").innerHTML;
  clickMissing();
  await flush();
  assert(missState().status === "done", "漏读查询完成");
  assert(results.innerHTML === resultsSnapshot, "漏读只读：采纳结果、复核、罚秒与名次不受影响");
  assert($("diagnosis-box").innerHTML === diagSnapshot, "漏读只读：替代性诊断不受影响");
  // 复核/罚秒保存后更新的是子元素（桩不回填父级 innerHTML），直接读子元素断言。
  assert(results.querySelector(".review-current").innerHTML.includes("漏读只读复核"),
    "复核内容保留");
  assert(results.querySelector(".penalty-current").innerHTML.includes("当前已保存：4 秒"),
    "罚秒保留");

  console.log(failures === 0 ? "\nALL MISSING-WINDOW SCENARIOS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
