window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "update") {
    try {
      generateElements(JSON.parse(message.json));
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

/* ── CSS variable reader ─────────────────────────────────────────────────
   dagre-d3 only accepts inline style strings for edge colours, so we
   resolve the CSS custom properties at render time from the computed style
   of the document root. This ensures edges match whatever VS Code theme
   is active, including high-contrast and light themes.
─────────────────────────────────────────────────────────────────────────── */
function getCSSVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

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
  // Force reflow then fade in
  requestAnimationFrame(() => t.classList.add("visible"));
}

function positionTooltip(x, y) {
  const t = getTooltip();
  const margin = 14;
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  let left = x + margin;
  let top  = y + margin;
  if (left + tw > window.innerWidth)  left = x - tw - margin;
  if (top  + th > window.innerHeight) top  = y - th - margin;
  t.style.left = left + "px";
  t.style.top  = top  + "px";
}

function hideTooltip() {
  if (!_tooltip) return;
  _tooltip.classList.remove("visible");
  _tooltipTimer = setTimeout(() => {
    if (_tooltip) _tooltip.style.display = "none";
  }, 100);
}

/* ── Main renderer ───────────────────────────────────────────────────────── */

function generateElements(jsonData) {
  const controllersList = document.querySelector("#controllers");
  controllersList.innerHTML = "";
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";

  const animControllers = jsonData?.animation_controllers;
  if (!animControllers || Object.keys(animControllers).length === 0) {
    consoleEl.innerText = "No animation controllers found in this file.";
    return;
  }

  // Read theme colours once per render pass
  const edgeColor    = getCSSVar("--cv-edge")    || "#75beff";
  const edgeNegColor = getCSSVar("--cv-edge-neg") || "#cca700";
  const bgColor      = getCSSVar("--cv-bg")       || "transparent";
  const edgeLabelColor = getCSSVar("--cv-edge-label") || getCSSVar("--cv-fg") || "#cccccc";

  for (const controllerName of Object.keys(animControllers)) {
    const controllerData = animControllers[controllerName];
    const states = controllerData?.states;

    // Card shell
    const li = document.createElement("li");

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
        rankdir: "TB",
        edgesep: 20,
        ranksep: 55,
        nodesep: 35,
      });

      const initialState = controllerData.initial_state || "default";
      const stateKeys = Object.keys(states);

      if (!stateKeys.includes(initialState)) {
        throw new Error(`Initial state [${initialState}] not found in controller [${controllerName}]!`);
      }

      // ── Nodes ──────────────────────────────────────────────────────────
      stateKeys.forEach((state) => {
        const sd = states[state];
        const animLines     = (sd?.animations      || []).map(getAnimationLabel);
        const particleLines = (sd?.particle_effects || []).map(p =>
          p.locator ? `${p.effect} @ ${p.locator}` : p.effect);
        const soundLines    = (sd?.sound_effects    || []).map(s =>
          s.locator ? `${s.effect} @ ${s.locator}` : s.effect);
        const onEntryLines  = (sd?.on_entry || []).map(String);
        const onExitLines   = (sd?.on_exit  || []).map(String);

        const hasTooltip = animLines.length > 0 || particleLines.length > 0 ||
                           soundLines.length > 0 || onEntryLines.length > 0 || onExitLines.length > 0;

        g.setNode(state, {
          label: state,
          rx: 3,
          ry: 3,
          class: [
            state === initialState ? "initial-state" : "",
            hasTooltip ? "has-tooltip" : "",
          ].filter(Boolean).join(" "),
          _tooltipGroups: hasTooltip ? [
            { label: "On Entry",         items: onEntryLines },
            { label: "Animations",       items: animLines },
            { label: "Particle Effects", items: particleLines },
            { label: "Sound Effects",    items: soundLines },
            { label: "On Exit",          items: onExitLines },
          ] : null,
        });
      });

      // ── Edges ──────────────────────────────────────────────────────────
      stateKeys.forEach((state) => {
        const transitions = states[state]?.transitions;
        if (!Array.isArray(transitions)) return;

        transitions.forEach((transition) => {
          if (!transition || typeof transition !== "object") return;
          Object.entries(transition).forEach(([target, condition]) => {
            if (!stateKeys.includes(target)) {
              consoleEl.innerText += `\nWarning: Transition target [${target}] not found in [${controllerName}].`;
            }
            const neg = isNegatedCondition(condition);
            const color = neg ? edgeNegColor : edgeColor;
            try {
              g.setEdge(state, target, {
                label: wrapLabel(String(condition)),
                curve: d3.curveBasis,
                labelPos: "c",
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

      // ── Render ─────────────────────────────────────────────────────────
      const svg   = d3.select(svgEl);
      const inner = svg.select("g");

      const zoom = d3.zoom().on("zoom", () => inner.attr("transform", d3.event.transform));
      svg.call(zoom);

      new dagreD3.render()(inner, g);

      // Tooltip listeners (post-render, so DOM nodes exist)
      inner.selectAll("g.node").each(function(stateName) {
        const groups = g.node(stateName)?._tooltipGroups;
        if (!groups) return;
        this.addEventListener("mouseenter", (e) => showTooltip(groups, e.clientX, e.clientY));
        this.addEventListener("mousemove",  (e) => positionTooltip(e.clientX, e.clientY));
        this.addEventListener("mouseleave", ()  => hideTooltip());
      });

      // Centre and resize
      const graph = g.graph();
      const containerW = svgEl.parentElement.clientWidth;
      const cx = Math.max(0, (containerW - graph.width) / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(cx, 16));
      svg.attr("height", graph.height + 40);
      svgEl.parentElement.style.overflow = "visible";

    } catch (err) {
      console.error(err);
      consoleEl.innerText += "\nError: " + err.message;
    }
  }
}