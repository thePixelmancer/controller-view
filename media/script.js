window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "update") {
    try {
      loadController(JSON.parse(message.json), message.json, message.cursorLine ?? 0);
    } catch (error) {
      showConsoleError("Failed to parse JSON: " + error.message);
    }
  } else if (message.type === "error") {
    showConsoleError(message.text || "Unknown error from extension.");
  }
});

function showConsoleError(msg) {
  document.getElementById("console").innerText += "\nError: " + msg;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════════════════════ */

function getAnimationLabel(anim) {
  if (typeof anim === "string") return anim;
  if (typeof anim === "object" && anim !== null) {
    const [k, v] = Object.entries(anim)[0] || [];
    if (k) return `${k} [${v}]`;
  }
  return JSON.stringify(anim);
}

function wrapLabel(text, maxLen = 28) {
  if (text.length <= maxLen) return text;
  const parts = text.split(/(?=[!&|])|(?<=[!&|])/);
  const lines = [];
  let current = "";
  for (const part of parts) {
    if ((current + part).length > maxLen) {
      if (current) lines.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current) lines.push(current.trim());
  return lines.join("\n");
}

function isNegatedCondition(c) {
  return typeof c === "string" && c.trim().startsWith("!");
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
   Active controller detection
   Scans the raw JSON text for each controller key's line number, then
   returns the name of the controller whose opening line is the highest
   one that is still <= the cursor line — i.e. the block the cursor is in.
═══════════════════════════════════════════════════════════════════════════ */

function activeControllerName(rawJson, cursorLine, controllerNames) {
  if (controllerNames.length === 1) return controllerNames[0];

  // Find the line number of each controller key in the raw text
  const lines = rawJson.split("\n");
  const keyLines = []; // [{name, line}]

  for (const name of controllerNames) {
    // Match the quoted key exactly
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`"${escaped}"`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        keyLines.push({ name, line: i });
        break;
      }
    }
  }

  // Sort by line ascending, pick the last one whose line <= cursorLine
  keyLines.sort((a, b) => a.line - b.line);
  let active = keyLines[0]?.name ?? controllerNames[0];
  for (const { name, line } of keyLines) {
    if (line <= cursorLine) active = name;
  }
  return active;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Molang → JS translator
═══════════════════════════════════════════════════════════════════════════ */

function molangToJS(expr) {
  return expr
    .trim()
    .replace(/\bquery\./g, "q.")
    .replace(/\bq\.([a-zA-Z_][a-zA-Z0-9_]*)/g, '_q["$1"]')
    .replace(/\bv\.([a-zA-Z_][a-zA-Z0-9_]*)/g, '_v["$1"]')
    .replace(/(?<![=!<>])=(?!=)/g, "==")
    .replace(/;$/, "");
}

function evalCondition(expr, queries, variables) {
  if (!expr || expr.trim() === "") return false;
  try {
    const js = molangToJS(String(expr));
    // eslint-disable-next-line no-new-func
    const fn = new Function("_q", "_v", `"use strict"; return !!(${js});`);
    return fn(queries, variables);
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Type inference
   ─────────────────────────────────────────────────────────────────────────
   We scan every expression each symbol appears in and collect a set of
   "usage kinds":
     boolean  — symbol appears bare (!q.x) or in a logical chain
                without any numeric/string comparison
     numeric  — symbol appears in >, <, >=, <=, or compared to a number
                literal, or used in arithmetic (+, -, *, /)
     string   — symbol is compared (== / !=) to a quoted string literal

   Rules:
     • A symbol with only one kind → that type
     • boolean + numeric → numeric  (0/non-zero is fine JS, no conflict)
     • boolean + string  → string   (falsy empty string is fine, no conflict)
     • numeric + string  → CONFLICT (can't be both a number and a string)
     • all three         → CONFLICT
═══════════════════════════════════════════════════════════════════════════ */

// Patterns that indicate a numeric context for a captured symbol placeholder PH
const NUMERIC_CTX_RE  = /PH\s*(?:[><!]=?|==)\s*-?\d[\d.]*|-?\d[\d.]*\s*(?:[><!]=?|==)\s*PH|PH\s*[+\-*/]|-?\d[\d.]*\s*[+\-*/]\s*PH/;
// Symbol is compared to a quoted string
const STRING_CTX_RE   = /PH\s*[!=]=\s*['"]|['"]\s*[!=]=\s*PH/;

/**
 * Given a single Molang expression and a symbol placeholder string,
 * returns the set of kinds {'boolean','numeric','string'} detected.
 */
function kindsInExpr(expr, placeholder) {
  const js = molangToJS(String(expr));
  const kinds = new Set();

  if (NUMERIC_CTX_RE.test(js.replace(/PH/g, "_X_").replace(new RegExp(escapeRegExp(placeholder), "g"), "PH"))) {
    kinds.add("numeric");
  }
  if (STRING_CTX_RE.test(js.replace(/PH/g, "_X_").replace(new RegExp(escapeRegExp(placeholder), "g"), "PH"))) {
    kinds.add("string");
  }
  // If neither numeric nor string context found, the symbol is used as boolean
  if (kinds.size === 0) kinds.add("boolean");

  return kinds;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Collapse a set of all observed kinds into a single inferred type + conflict flag.
 * Returns { type: 'boolean'|'numeric'|'string', conflict: bool, kinds: Set }
 */
function resolveType(allKinds) {
  const has = (k) => allKinds.has(k);
  if (has("numeric") && has("string")) {
    return { type: "numeric", conflict: true, kinds: allKinds };
  }
  if (has("numeric")) return { type: "numeric",  conflict: false, kinds: allKinds };
  if (has("string"))  return { type: "string",   conflict: false, kinds: allKinds };
  return               { type: "boolean",  conflict: false, kinds: allKinds };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Symbol extraction + type inference
   Returns:
     queries:   Map<name, {type, conflict, kinds}>
     variables: Map<name, {type, conflict, kinds}>
     conflicts: string[]   — human-readable conflict descriptions
═══════════════════════════════════════════════════════════════════════════ */

function extractSymbols(animControllers) {
  // Map from name → Set of kind strings seen across all expressions
  const qKinds = new Map(); // q.*
  const vKinds = new Map(); // v.*

  const Q_RE = /\b(?:q\.|query\.)([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const V_RE = /\bv\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

  function scanExpr(expr) {
    if (typeof expr !== "string") return;

    // Discover symbol names first
    const qNames = [...expr.matchAll(Q_RE)].map(m => m[1]);
    const vNames = [...expr.matchAll(V_RE)].map(m => m[1]);

    for (const name of qNames) {
      if (!qKinds.has(name)) qKinds.set(name, new Set());
      const placeholder = `_q["${name}"]`;
      const kinds = kindsInExpr(expr, placeholder);
      for (const k of kinds) qKinds.get(name).add(k);
    }
    for (const name of vNames) {
      if (!vKinds.has(name)) vKinds.set(name, new Set());
      const placeholder = `_v["${name}"]`;
      const kinds = kindsInExpr(expr, placeholder);
      for (const k of kinds) vKinds.get(name).add(k);
    }
  }

  for (const ctrl of Object.values(animControllers)) {
    for (const state of Object.values(ctrl.states || {})) {
      for (const t of state.transitions || [])
        for (const cond of Object.values(t)) scanExpr(cond);
      for (const a of state.animations || [])
        if (typeof a === "object") Object.values(a).forEach(scanExpr);
      for (const e of [...(state.on_entry || []), ...(state.on_exit || [])]) scanExpr(e);
    }
  }

  // Build result maps
  const queries   = new Map();
  const variables = new Map();
  const conflicts = [];

  for (const [name, kinds] of [...qKinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const info = resolveType(kinds);
    queries.set(name, info);
    if (info.conflict) {
      conflicts.push(
        `q.${name} is used as both numeric and string — treating as numeric. ` +
        `Check expressions comparing it to a string literal.`
      );
    }
  }
  for (const [name, kinds] of [...vKinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const info = resolveType(kinds);
    variables.set(name, info);
    if (info.conflict) {
      conflicts.push(
        `v.${name} is used as both numeric and string — treating as numeric. ` +
        `Check expressions comparing it to a string literal.`
      );
    }
  }

  return { queries, variables, conflicts };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Simulation engine
═══════════════════════════════════════════════════════════════════════════ */

class SimController {
  constructor(name, data) {
    this.name         = name;
    this.data         = data;
    this.initialState = data.initial_state || "default";
    this.currentState = this.initialState;
    this._svgInner    = null;
    this._graph       = null;
  }

  reset() { this.currentState = this.initialState; }

  tick(queries, variables) {
    const stateData = this.data.states?.[this.currentState];
    if (!stateData) return null;
    for (const t of stateData.transitions || []) {
      for (const [target, cond] of Object.entries(t)) {
        if (evalCondition(cond, queries, variables) && target !== this.currentState) {
          const from = this.currentState;
          this.currentState = target;
          // blend_transition is on the FROM state (blending away from it)
          const blendDuration = this.data.states?.[from]?.blend_transition ?? 0;
          return { from, to: target, blendDuration };
        }
      }
    }
    return null;
  }

  repaint() {
    if (!this._svgInner) return;
    this._svgInner.selectAll("g.node").each(function() {
      d3.select(this).classed("sim-active", false).classed("sim-inactive", false);
    });
    this._svgInner.selectAll("g.node").each((stateName, i, nodes) => {
      d3.select(nodes[i]).classed(
        stateName === this.currentState ? "sim-active" : "sim-inactive", true
      );
    });
    // NOTE: do NOT interrupt edge transitions here — that cancels flashEdge.
    // Interrupts only happen on explicit reset/rebuild via clearEdgeFlash().
  }

  clearEdgeFlash() {
    if (!this._svgInner) return;
    this._svgInner.node().querySelectorAll("g.edgePath").forEach(grp => {
      const pathEl = grp.querySelector("path.path");
      if (!pathEl) return;
      pathEl.style.transition  = "none";
      pathEl.style.stroke      = grp.dataset.baseStroke || "";
      pathEl.style.strokeWidth = "1.5px";

      const markerId = grp.dataset.markerId;
      const svgRoot  = pathEl.ownerSVGElement;
      if (markerId && svgRoot) {
        const mp = svgRoot.querySelector("#" + CSS.escape(markerId) + " path");
        if (mp) {
          mp.style.transition = "none";
          mp.style.fill       = grp.dataset.baseArrowFill || "";
        }
      }
    });
  }

  clearPaint() {
    if (!this._svgInner) return;
    this._svgInner.selectAll("g.node")
      .classed("sim-active", false).classed("sim-inactive", false);
    this.clearEdgeFlash();
  }

  /**
   * Flash the edge from→to.
   *
   * Strategy:
   *   1. Set inline style stroke/fill to the flash colour immediately
   *      (inline style overrides dagre's style *attribute*)
   *   2. Set the CSS transition duration from the source state's blend_transition
   *   3. On the next frame restore the inline stroke/fill to "" — the CSS
   *      transition then fades it back to the attribute-defined base colour
   *
   * blend_transition === 0  →  0.15s linear snap
   * blend_transition  >  0  →  blend_transition seconds ease-out fade
   *
   * The arrowhead <marker><path> lives inside g.edgePath > defs (confirmed
   * from dagre-d3 source). Its base fill is set via style *attribute* by dagre,
   * so clearing the inline style.fill lets it revert to the attribute value.
   */
  flashEdge(from, to) {
    if (!this._svgInner) return;

    const flashColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--cv-sim-flash").trim() || "#ffffff";

    this._svgInner.selectAll("g.edgePath").each(function(d) {
      if (d.v !== from || d.w !== to) return;

      const pathEl = this.querySelector("path.path");
      if (!pathEl) return;

      // Read the colours we cached at render time — never clear to ""
      const baseStroke    = this.dataset.baseStroke    || "";
      const baseArrowFill = this.dataset.baseArrowFill || "";
      const blendDuration = parseFloat(this.dataset.blendDuration) || 0;
      const duration      = blendDuration > 0 ? `${blendDuration}s` : "0.15s";
      const easing        = blendDuration > 0 ? "ease-out" : "linear";

      const markerId   = this.dataset.markerId;
      const svgRoot    = pathEl.ownerSVGElement;
      const markerPath = markerId && svgRoot
        ? svgRoot.querySelector("#" + CSS.escape(markerId) + " path")
        : null;

      // Frame 0: snap to flash colour, no transition
      pathEl.style.transition  = "none";
      pathEl.style.stroke      = flashColor;
      pathEl.style.strokeWidth = "3px";
      if (markerPath) {
        markerPath.style.transition = "none";
        markerPath.style.fill       = flashColor;
      }

      // Frame 1: arm the transition, then set the explicit base colour as target.
      // The browser sees the colour change and animates it over duration.
      requestAnimationFrame(() => {
        pathEl.style.transition  = `stroke ${duration} ${easing}, stroke-width ${duration} ${easing}`;
        pathEl.style.stroke      = baseStroke;
        pathEl.style.strokeWidth = "1.5px";
        if (markerPath) {
          markerPath.style.transition = `fill ${duration} ${easing}`;
          markerPath.style.fill       = baseArrowFill;
        }
      });
    });
  }
}

class SimEngine {
  constructor() {
    this.controllers = [];
    this.queries     = {};
    this.variables   = {};
    this.running     = false;
    this._interval   = null;
    this._tickMs     = 100;
    this._onChange   = null;
  }

  setControllers(cs) { this.controllers = cs; }

  initSymbols(queries, variables) {
    const prevQ = { ...this.queries };
    const prevV = { ...this.variables };
    this.queries   = {};
    this.variables = {};
    for (const [name, info] of queries) {
      const prev = prevQ[name];
      if (prev !== undefined) {
        this.queries[name] = prev; // preserve across re-parses
      } else {
        this.queries[name] = info.type === "numeric" ? 0
                           : info.type === "string"  ? ""
                           : false;
      }
    }
    for (const [name, info] of variables) {
      const prev = prevV[name];
      if (prev !== undefined) {
        this.variables[name] = prev;
      } else {
        this.variables[name] = info.type === "numeric" ? 0
                             : info.type === "string"  ? ""
                             : false;
      }
    }
  }

  setQuery(name, value)    { this.queries[name]   = value; this._tick(); }
  setVariable(name, value) { this.variables[name] = value; this._tick(); }

  play() {
    if (this.running) return;
    this.running   = true;
    this._interval = setInterval(() => this._tick(), this._tickMs);
  }

  pause() {
    this.running = false;
    clearInterval(this._interval);
    this._interval = null;
  }

  reset() {
    this.pause();
    for (const c of this.controllers) { c.reset(); c.repaint(); }
    if (this._onChange) this._onChange();
  }

  activateSim()   { for (const c of this.controllers) c.repaint(); }
  deactivateSim() { for (const c of this.controllers) c.clearPaint(); }

  _tick() {
    let changed = false;
    for (const c of this.controllers) {
      const transition = c.tick(this.queries, this.variables);
      if (transition) {
        changed = true;
        c.flashEdge(transition.from, transition.to);
      }
      c.repaint();
    }
    if (changed && this._onChange) this._onChange();
  }
}

const SIM = new SimEngine();

/* ═══════════════════════════════════════════════════════════════════════════
   Tooltip
═══════════════════════════════════════════════════════════════════════════ */

let _tooltip = null;
let _tooltipTimer = null;

function getTooltip() {
  if (!_tooltip) {
    _tooltip = document.createElement("div");
    _tooltip.className = "anim-tooltip";
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function buildTooltipHTML(groups) {
  return groups
    .filter(g => g.items.length > 0)
    .map(g => `
      <div class="tooltip-section">
        <div class="tooltip-header">${g.label}</div>
        ${g.items.map(item => `<div class="tooltip-row">${item}</div>`).join("")}
      </div>`)
    .join("");
}

function showTooltip(groups, x, y) {
  clearTimeout(_tooltipTimer);
  const t = getTooltip();
  t.innerHTML = buildTooltipHTML(groups);
  t.classList.remove("visible");
  t.style.display = "block";
  positionTooltip(x, y);
  requestAnimationFrame(() => t.classList.add("visible"));
}

function positionTooltip(x, y) {
  const t = getTooltip();
  const margin = 14;
  let left = x + margin;
  let top  = y + margin;
  if (left + t.offsetWidth  > window.innerWidth)  left = x - t.offsetWidth  - margin;
  if (top  + t.offsetHeight > window.innerHeight) top  = y - t.offsetHeight - margin;
  t.style.left = left + "px";
  t.style.top  = top  + "px";
}

function hideTooltip() {
  if (!_tooltip) return;
  _tooltip.classList.remove("visible");
  _tooltipTimer = setTimeout(() => { if (_tooltip) _tooltip.style.display = "none"; }, 100);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Simulator panel UI
═══════════════════════════════════════════════════════════════════════════ */

function buildSimPanel(queries, variables, conflicts) {
  const panel = document.getElementById("sim-panel");
  // Preserve collapsed state across rebuilds
  const wasCollapsed = panel.classList.contains("collapsed");
  panel.innerHTML = "";
  panel.classList.toggle("collapsed", wasCollapsed);

  // ── Header (also acts as collapse toggle) ───────────────────────────────
  const header = document.createElement("div");
  header.className = "sim-header";
  header.title = "Click to expand / collapse";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;gap:8px;flex:1;min-width:0;";

  const chevron = document.createElement("span");
  chevron.className = "sim-chevron";
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>`;

  const title = document.createElement("span");
  title.className = "sim-title";
  title.textContent = "Simulator";

  titleRow.appendChild(chevron);
  titleRow.appendChild(title);
  header.appendChild(titleRow);

  const controls = document.createElement("div");
  controls.className = "sim-controls";

  const resetBtn = document.createElement("button");
  resetBtn.className = "sim-btn";
  resetBtn.title = "Reset to initial state";
  resetBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg> Reset`;
  resetBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't collapse when clicking Reset
    SIM.reset();
    updateSimStatus();
  });

  const playBtn = document.createElement("button");
  playBtn.className = "sim-btn sim-btn-primary";
  playBtn.id = "sim-play-btn";
  playBtn.innerHTML = playBtnHTML(false);
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't collapse when clicking Play
    SIM.running ? SIM.pause() : SIM.play();
    playBtn.innerHTML = playBtnHTML(SIM.running);
    playBtn.classList.toggle("sim-btn-active", SIM.running);
  });

  controls.appendChild(resetBtn);
  controls.appendChild(playBtn);
  header.appendChild(controls);

  // Toggle collapse on header click
  header.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
  });

  panel.appendChild(header);

  // ── Scrollable body ──────────────────────────────────────────────────────
  const body = document.createElement("div");
  body.className = "sim-body";

  const hasAnything = queries.size > 0 || variables.size > 0;

  if (!hasAnything) {
    const empty = document.createElement("div");
    empty.className = "sim-empty";
    empty.textContent = "No queries or variables found in this file.";
    body.appendChild(empty);
    panel.appendChild(body);
    return;
  }

  // ── Conflict warnings ───────────────────────────────────────────────────
  if (conflicts.length > 0) {
    const warnBox = document.createElement("div");
    warnBox.className = "sim-conflicts";
    warnBox.innerHTML = conflicts.map(c =>
      `<div class="sim-conflict-row">
        <svg class="sim-conflict-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
        </svg>
        ${c}
      </div>`
    ).join("");
    body.appendChild(warnBox);
  }

  // ── Status bar ──────────────────────────────────────────────────────────
  const status = document.createElement("div");
  status.className = "sim-status";
  status.id = "sim-status";
  body.appendChild(status);
  updateSimStatus();

  // ── Symbol grid ─────────────────────────────────────────────────────────
  const grid = document.createElement("div");
  grid.className = "sim-grid";

  if (queries.size > 0) {
    const h = document.createElement("div");
    h.className = "sim-group-label";
    h.textContent = "Queries";
    grid.appendChild(h);
    for (const [name, info] of queries) grid.appendChild(buildSymbolRow("q", name, info));
  }

  if (variables.size > 0) {
    const h = document.createElement("div");
    h.className = "sim-group-label";
    h.textContent = "Variables";
    grid.appendChild(h);
    for (const [name, info] of variables) grid.appendChild(buildSymbolRow("v", name, info));
  }

  body.appendChild(grid);
  panel.appendChild(body);
}

function playBtnHTML(playing) {
  return playing
    ? `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/></svg> Pause`
    : `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg> Play`;
}

function updateSimStatus() {
  const el = document.getElementById("sim-status");
  if (!el) return;
  el.innerHTML = SIM.controllers.map(c => {
    const label = SIM.controllers.length > 1
      ? `<span class="sim-status-ctrl">${c.name.replace("controller.animation.", "")}</span>: `
      : "";
    return `${label}<span class="sim-status-state">${c.currentState}</span>`;
  }).join("  ·  ");
}

/**
 * Build one symbol row. The input widget depends on inferred type:
 *   boolean  → pill toggle (false/true)
 *   numeric  → number input
 *   string   → text input
 *   conflict → number input + warning badge (already warned in conflicts box)
 */
function buildSymbolRow(prefix, name, info) {
  const store = prefix === "q" ? SIM.queries : SIM.variables;
  const { type, conflict } = info;

  const row = document.createElement("div");
  row.className = "sim-row";

  // Label
  const label = document.createElement("label");
  label.className = "sim-label";
  label.title = `${prefix}.${name}  [inferred: ${type}${conflict ? " ⚠ conflict" : ""}]`;
  label.textContent = `${prefix}.${name}`;
  if (conflict) label.classList.add("sim-label-conflict");

  // Type badge
  const badge = document.createElement("span");
  badge.className = `sim-type-badge sim-type-${type}${conflict ? " sim-type-conflict" : ""}`;
  badge.textContent = conflict ? "⚠ " + type : type;

  const inputWrap = document.createElement("div");
  inputWrap.className = "sim-input-wrap";

  if (type === "boolean") {
    const val = !!store[name];
    const toggle = document.createElement("button");
    toggle.className = "sim-toggle" + (val ? " sim-toggle-on" : "");
    toggle.textContent = val ? "true" : "false";
    toggle.addEventListener("click", () => {
      const next = !store[name];
      prefix === "q" ? SIM.setQuery(name, next) : SIM.setVariable(name, next);
      toggle.textContent = next ? "true" : "false";
      toggle.classList.toggle("sim-toggle-on", next);
      updateSimStatus();
    });
    inputWrap.appendChild(toggle);

  } else if (type === "numeric") {
    const input = document.createElement("input");
    input.type      = "number";
    input.className = "sim-number";
    input.value     = store[name] ?? 0;
    input.step      = "0.1";
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      prefix === "q" ? SIM.setQuery(name, isNaN(v) ? 0 : v) : SIM.setVariable(name, isNaN(v) ? 0 : v);
      updateSimStatus();
    });
    inputWrap.appendChild(input);

  } else {
    // string
    const input = document.createElement("input");
    input.type      = "text";
    input.className = "sim-text";
    input.value     = store[name] ?? "";
    input.placeholder = '""';
    input.addEventListener("input", () => {
      prefix === "q" ? SIM.setQuery(name, input.value) : SIM.setVariable(name, input.value);
      updateSimStatus();
    });
    inputWrap.appendChild(input);
  }

  row.appendChild(label);
  row.appendChild(badge);
  row.appendChild(inputWrap);
  return row;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main renderer
═══════════════════════════════════════════════════════════════════════════ */

function loadController(jsonData, rawJson, cursorLine) {
  const controllersList = document.querySelector("#controllers");
  // Disconnect any ResizeObservers from the previous render before clearing
  controllersList.querySelectorAll("svg[data-ro]").forEach(s => s._roCleanup?.());
  controllersList.innerHTML = "";
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";

  const animControllers = jsonData?.animation_controllers;
  if (!animControllers || Object.keys(animControllers).length === 0) {
    consoleEl.innerText = "No animation controllers found in this file.";
    return;
  }

  // Determine which single controller to display based on cursor position
  const allControllerNames = Object.keys(animControllers);
  const focusedName = activeControllerName(rawJson, cursorLine, allControllerNames);
  // Build a filtered view with only the focused controller, but extract
  // symbols from the full file so simulator state is shared across all
  const focusedControllers = { [focusedName]: animControllers[focusedName] };

  SIM.pause();
  const playBtn = document.getElementById("sim-play-btn");
  if (playBtn) { playBtn.innerHTML = playBtnHTML(false); playBtn.classList.remove("sim-btn-active"); }

  const { queries, variables, conflicts } = extractSymbols(focusedControllers);
  SIM.initSymbols(queries, variables);

  // Start collapsed — buildSimPanel will preserve state on subsequent rebuilds
  const simPanel = document.getElementById("sim-panel");
  if (!simPanel.dataset.everBuilt) {
    simPanel.classList.add("collapsed");
    simPanel.dataset.everBuilt = "1";
  }
  buildSimPanel(queries, variables, conflicts);
  SIM._onChange = updateSimStatus;

  // Surface conflicts in the error console too
  for (const c of conflicts) showConsoleError("Type conflict: " + c);

  const edgeColor      = getCSSVar("--cv-edge")       || "#75beff";
  const edgeLabelColor = getCSSVar("--cv-edge-label") || getCSSVar("--cv-fg") || "#cccccc";

  const simControllers = [];

  for (const [controllerName, controllerData] of Object.entries(focusedControllers)) {
    const states = controllerData?.states;

    const li     = document.createElement("li");
    const header = document.createElement("div");
    header.className = "card-header";
    header.innerHTML = `<h2>${controllerName}</h2>`;
    const body = document.createElement("div");
    body.className = "card-body";
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", "100%");
    svgEl.setAttribute("height", "0");
    svgEl.style.display = "block";
    svgEl.innerHTML = "<g></g>";
    body.appendChild(svgEl);
    li.appendChild(header);
    li.appendChild(body);
    controllersList.appendChild(li);

    if (!states || Object.keys(states).length === 0) {
      consoleEl.innerText += `\nWarning: No states in controller [${controllerName}].`;
      continue;
    }

    try {
      const g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: "TB", edgesep: 20, ranksep: 55, nodesep: 35,
      });

      const initialState = controllerData.initial_state || "default";
      const stateKeys    = Object.keys(states);

      if (!stateKeys.includes(initialState))
        throw new Error(`Initial state [${initialState}] not found in controller [${controllerName}]!`);

      stateKeys.forEach((state) => {
        const sd = states[state];
        const animLines     = (sd?.animations      || []).map(getAnimationLabel);
        const particleLines = (sd?.particle_effects || []).map(p => p.locator ? `${p.effect} @ ${p.locator}` : p.effect);
        const soundLines    = (sd?.sound_effects    || []).map(s => s.locator ? `${s.effect} @ ${s.locator}` : s.effect);
        const onEntryLines  = (sd?.on_entry || []).map(String);
        const onExitLines   = (sd?.on_exit  || []).map(String);
        const hasTooltip    = [animLines, particleLines, soundLines, onEntryLines, onExitLines].some(a => a.length > 0);

        g.setNode(state, {
          label: state, rx: 3, ry: 3,
          class: [state === initialState ? "initial-state" : "", hasTooltip ? "has-tooltip" : ""].filter(Boolean).join(" "),
          _tooltipGroups: hasTooltip ? [
            { label: "On Entry",         items: onEntryLines },
            { label: "Animations",       items: animLines },
            { label: "Particle Effects", items: particleLines },
            { label: "Sound Effects",    items: soundLines },
            { label: "On Exit",          items: onExitLines },
          ] : null,
        });
      });

      stateKeys.forEach((state) => {
        const transitions = states[state]?.transitions;
        if (!Array.isArray(transitions)) return;
        transitions.forEach((transition) => {
          if (!transition || typeof transition !== "object") return;
          Object.entries(transition).forEach(([target, condition]) => {
            if (!stateKeys.includes(target))
              consoleEl.innerText += `\nWarning: Transition target [${target}] not found in [${controllerName}].`;
            const color = edgeColor;
            try {
              g.setEdge(state, target, {
                label: wrapLabel(String(condition)),
                curve: d3.curveBasis, labelPos: "c",
                style: `fill: none; stroke: ${color}; stroke-width: 1.5px;`,
                arrowheadStyle: `fill: ${color};`,
                labelStyle: `fill: ${edgeLabelColor}; font-size: 10.5px;`,
              });
            } catch (err) {
              throw new Error(`Error setting edge ${state} -> ${target}: ${err.message}`);
            }
          });
        });
      });

      const svg   = d3.select(svgEl);
      const inner = svg.select("g");
      const zoom  = d3.zoom().on("zoom", () => inner.attr("transform", d3.event.transform));
      svg.call(zoom);
      new dagreD3.render()(inner, g);

      // After dagre renders, cache per-edge data for flashEdge():
      //   blendDuration — from the source state's blend_transition
      //   baseStroke    — the actual resolved stroke colour dagre set
      //   baseArrowFill — the actual resolved arrowhead fill colour
      inner.selectAll("g.edgePath").each(function(d) {
        this.dataset.blendDuration = states[d.v]?.blend_transition ?? 0;

        const pathEl = this.querySelector("path.path");
        if (!pathEl) return;

        // getComputedStyle resolves the colour dagre wrote as a style attribute
        this.dataset.baseStroke = getComputedStyle(pathEl).stroke || "";

        const markerEnd = pathEl.getAttribute("marker-end") || "";
        const m = markerEnd.match(/url\([^#]*#([^)]+)\)/);
        if (m) {
          this.dataset.markerId = m[1];
          const svgRoot = pathEl.ownerSVGElement;
          const mp = svgRoot && svgRoot.querySelector(
            "#" + CSS.escape(m[1]) + " path"
          );
          if (mp) this.dataset.baseArrowFill = getComputedStyle(mp).fill || "";
        }
      });

      inner.selectAll("g.node").each(function(stateName) {
        const groups = g.node(stateName)?._tooltipGroups;
        if (!groups) return;
        this.addEventListener("mouseenter", (e) => showTooltip(groups, e.clientX, e.clientY));
        this.addEventListener("mousemove",  (e) => positionTooltip(e.clientX, e.clientY));
        this.addEventListener("mouseleave", ()  => hideTooltip());
      });

      const graph = g.graph();

      // Centre the graph in whatever space the SVG currently occupies.
      // Called once now, and again whenever the panel is resized.
      function centreGraph() {
        const w = svgEl.clientWidth  || svgEl.parentElement.clientWidth;
        const h = svgEl.clientHeight || svgEl.parentElement.clientHeight;
        const cx = Math.max(0, (w - graph.width)  / 2);
        const cy = Math.max(0, (h - graph.height) / 2);
        svg.call(zoom.transform, d3.zoomIdentity.translate(cx, cy));
      }

      centreGraph();

      // Re-centre when the container is resized (panel drag, window resize)
      const ro = new ResizeObserver(() => centreGraph());
      ro.observe(svgEl.parentElement);

      // Clean up observer if the panel is rebuilt (next loadController call)
      svgEl._roCleanup = () => ro.disconnect();

      const sim = new SimController(controllerName, controllerData);
      sim._svgInner = inner;
      sim._graph    = g;
      simControllers.push(sim);

    } catch (err) {
      console.error(err);
      consoleEl.innerText += "\nError: " + err.message;
    }
  }

  SIM.setControllers(simControllers);
  SIM.activateSim();
  updateSimStatus();
}