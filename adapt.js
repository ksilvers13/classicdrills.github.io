/* Adaptive difficulty for Accounting Drill Pads
   Load after a drill's main <script>. It wraps the drill's own next() and record()
   functions, so the drill code itself doesn't change.

   Levels
     1 Easy   – more concept questions, one wrong choice removed from multiple choice
     2 Medium – the drill as it was before
     3 Hard   – more calculations and full entries, Hint and Show answer hidden
   Auto mode moves up after PROMOTE correct in a row and down after DEMOTE misses
   in the last WINDOW answers. Redo questions never move the level. */
(function () {
  if (typeof next !== "function" || typeof record !== "function") return;

  const PROMOTE = 4, DEMOTE = 2, WINDOW = 3;
  const NAMES = ["", "Easy", "Medium", "Hard"];
  const HARD_KINDS = ["num", "je", "adj", "write", "fx", "omit", "ripple"];
  const EASY_KINDS = ["mc", "rule", "pred", "concept"];
  const KEY = "adapt:" + ((location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index");

  let A = { level: 2, mode: "auto", run: 0, recent: [] };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.level) A = Object.assign(A, s); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (e) {} };
  const level = () => (A.mode === "auto" ? A.level : +A.mode);

  /* ---------- UI: level readout + picker in the stats bar ---------- */
  const css = document.createElement("style");
  css.textContent = `
.adapt{display:flex;flex-direction:column}
.adapt b{display:flex;align-items:center;gap:6px}
.adapt .dots{display:inline-flex;gap:3px}
.adapt .dots i{width:7px;height:7px;border-radius:50%;background:var(--line,#ccc)}
.adapt .dots i.on{background:var(--accent,#8a6100)}
.adapt select{font:600 .72rem var(--mono,monospace);color:var(--muted,#555);background:transparent;border:1px dashed var(--line,#999);border-radius:6px;padding:2px 4px;margin-top:3px;cursor:pointer}
.adapt-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);opacity:0;
  background:var(--ink,#222);color:var(--paper,#fff);font:600 .85rem var(--body,system-ui);padding:10px 16px;border-radius:999px;
  transition:opacity .25s,transform .25s;pointer-events:none;z-index:50;max-width:calc(100vw - 32px);text-align:center}
.adapt-toast.on{opacity:1;transform:translate(-50%,0)}
.adapt-hidden{display:none!important}
@media (max-width:520px){.stats{flex-wrap:wrap}}`;
  document.head.appendChild(css);

  const stats = document.querySelector(".stats");
  const box = document.createElement("div");
  box.className = "adapt";
  box.innerHTML = `Level<b id="sLevel"></b>
    <select id="adaptMode" aria-label="Difficulty">
      <option value="auto">Auto</option><option value="1">Easy</option>
      <option value="2">Medium</option><option value="3">Hard</option></select>`;
  if (stats) {
    const reset = stats.querySelector(".reset");
    reset ? stats.insertBefore(box, reset) : stats.appendChild(box);
  }
  const sel = box.querySelector("select");
  sel.value = A.mode;

  function paint() {
    const L = level(), el = document.getElementById("sLevel");
    if (!el) return;
    el.innerHTML = `${NAMES[L]}<span class="dots" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= L ? "on" : ""}"></i>`).join("")}</span>`;
    el.title = A.mode === "auto" ? "Adjusts automatically as you answer" : "Fixed level";
  }

  const toastEl = document.createElement("div");
  toastEl.className = "adapt-toast"; toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let tt;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove("on"), 2600);
  }

  sel.onchange = () => {
    A.mode = sel.value; A.run = 0; A.recent = [];
    if (A.mode !== "auto") A.level = +A.mode;
    save(); paint();
    if ((typeof done === "undefined" || !done) && !(typeof redoQ !== "undefined" && redoQ)) next(); // swap the unanswered question for one at the new level
  };

  /* ---------- Choosing questions ---------- */
  function accept(kind) {
    const L = level();
    if (L === 1 && HARD_KINDS.includes(kind)) return Math.random() < 0.4;
    if (L === 3 && EASY_KINDS.includes(kind)) return Math.random() < 0.4;
    return true;
  }

  function decorate() {
    if (typeof cur === "undefined" || !cur) return;
    const root = (typeof card !== "undefined" && card) || document;
    const L = level();

    // Easy: drop one wrong choice when there are 4+ options
    if (L === 1 && typeof cur.ans === "string") {
      const opts = [...root.querySelectorAll(".opt")];
      const wrong = opts.filter(b => b.textContent !== cur.ans);
      if (opts.length >= 4 && wrong.length === opts.length - 1) wrong[Math.floor(Math.random() * wrong.length)].remove();
    }
    // Hard: no hints, no peeking
    if (L === 3) {
      ["show", "showAns", "hint"].forEach(id => {
        const b = root.querySelector("#" + id);
        if (b) b.classList.add("adapt-hidden");
      });
    }
  }

  const origNext = next;
  next = function () {
    const redoing = typeof redoQ !== "undefined" && redoQ;
    for (let i = 0; i < 4; i++) {
      origNext.apply(this, arguments);
      if (redoing || !cur || cur._mid || accept(cur.kind)) break;
    }
    decorate();
  };

  /* ---------- Moving the level ---------- */
  const origRecord = record;
  record = function (ok) {
    const r = origRecord.apply(this, arguments);
    if (typeof cur !== "undefined" && cur && cur._mid) return r;

    A.recent.push(!!ok);
    if (A.recent.length > WINDOW) A.recent.shift();
    A.run = ok ? A.run + 1 : 0;

    if (A.mode === "auto") {
      const misses = A.recent.filter(x => !x).length;
      if (A.run >= PROMOTE && A.level < 3) {
        A.level++; A.run = 0; A.recent = [];
        toast(`Level up: ${NAMES[A.level]}. ${A.level === 3 ? "Hints are off now." : "Questions are getting harder."}`);
      } else if (misses >= DEMOTE && A.level > 1) {
        A.level--; A.run = 0; A.recent = [];
        toast(`Easing off to ${NAMES[A.level]} for a bit.`);
      }
    }
    save(); paint();
    return r;
  };

  paint();
  decorate(); // the first question rendered before this file loaded
})();
