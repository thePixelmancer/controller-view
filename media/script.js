window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "update") {
    try {
      const jsonData = JSON.parse(message.json);
      generateElements(jsonData);
    } catch (error) {
      showConsoleError("Failed to parse JSON: " + error.message);
    }
  } else if (message.type === "error") {
    showConsoleError(message.text || "Unknown error from extension.");
  }
});

function showConsoleError(msg) {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText += "\nError: " + msg;
}

function getAnimationLabel(anim) {
  if (typeof anim === "string") return anim;
  if (typeof anim === "object" && anim !== null) {
    const entries = Object.entries(anim);
    if (entries.length > 0) return `${entries[0][0]} [${entries[0][1]}]`;
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

function isNegatedCondition(condition) {
  return typeof condition === "string" && condition.trim().startsWith("!");
}

// Global tooltip element, created once
let tooltip = null;
function getTooltip() {
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "anim-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function buildTooltipHTML(groups) {
  return groups
    .filter(g => g.items.length > 0)
    .map(g => `<div class="tooltip-section"><div class="tooltip-header">${g.label}</div>${g.items.map(item => `<div class="tooltip-row">${item}</div>`).join("")}</div>`)
    .join("");
}

function showTooltip(groups, x, y) {
  const t = getTooltip();
  t.innerHTML = buildTooltipHTML(groups);
  t.style.display = "block";
  positionTooltip(x, y);
}

function positionTooltip(x, y) {
  const t = getTooltip();
  const margin = 12;
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + margin;
  let top = y + margin;
  if (left + tw > vw) left = x - tw - margin;
  if (top + th > vh) top = y - th - margin;
  t.style.left = left + "px";
  t.style.top = top + "px";
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = "none";
}

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

  for (const controllerName of Object.keys(animControllers)) {
    const controllerData = animControllers[controllerName];
    const states = controllerData?.states;

    const controllerItem = document.createElement("li");
    const controllerTitle = document.createElement("h2");
    controllerTitle.textContent = controllerName;
    controllerItem.appendChild(controllerTitle);

    const svgContainer = document.createElement("div");
    svgContainer.className = "svg-container";
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("width", "100%");
    svgElement.setAttribute("height", "0");
    svgElement.style.display = "block";
    svgElement.innerHTML = "<g></g>";

    svgContainer.appendChild(svgElement);
    controllerItem.appendChild(svgContainer);
    controllersList.appendChild(controllerItem);

    if (!states || Object.keys(states).length === 0) {
      consoleEl.innerText += `\nWarning: No states found in controller [${controllerName}].`;
      continue;
    }

    try {
      const g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: "TB",
        edgesep: 20,
        ranksep: 60,
        nodesep: 40,
      });

      const initialState = controllerData.initial_state || "default";
      const stateKeys = Object.keys(states);

      if (!stateKeys.includes(initialState)) {
        throw new Error(`Initial state [${initialState}] not found in controller [${controllerName}]!`);
      }

      // Build nodes — only state name in the box, fx data stored for tooltip
      stateKeys.forEach((state) => {
        const stateData = states[state];
        const animLines = (stateData?.animations || []).map(getAnimationLabel);
        const particleLines = (stateData?.particle_effects || []).map(p =>
          p.locator ? `${p.effect} @ ${p.locator}` : p.effect
        );
        const soundLines = (stateData?.sound_effects || []).map(s =>
          s.locator ? `${s.effect} @ ${s.locator}` : s.effect
        );
        const isInitial = state === initialState;
        const hasTooltip = animLines.length > 0 || particleLines.length > 0 || soundLines.length > 0;

        g.setNode(state, {
          label: state,
          rx: 4,
          ry: 4,
          class: isInitial ? "initial-state" : "",
          // Stored for tooltip — dagre ignores unknown props
          _tooltipGroups: hasTooltip ? [
            { label: "Animations",       items: animLines },
            { label: "Particle Effects", items: particleLines },
            { label: "Sound Effects",    items: soundLines },
          ] : null,
        });
      });

      // Build edges
      stateKeys.forEach((state) => {
        const transitions = states[state]?.transitions;
        if (!Array.isArray(transitions)) return;

        transitions.forEach((transition) => {
          if (!transition || typeof transition !== "object") return;
          Object.entries(transition).forEach(([targetState, condition]) => {
            if (!stateKeys.includes(targetState)) {
              consoleEl.innerText += `\nWarning: Transition target [${targetState}] not found in controller [${controllerName}].`;
            }
            const negated = isNegatedCondition(condition);
            try {
              g.setEdge(state, targetState, {
                label: wrapLabel(String(condition)),
                curve: d3.curveBasis,
                labelPos: "c",
                style: negated
                  ? "fill: none; stroke: #f0a05a; stroke-width: 1.5px;"
                  : "fill: none; stroke: #ffffff; stroke-width: 1.5px;",
                arrowheadStyle: negated ? "fill: #f0a05a;" : "fill: #ffffff;",
                labelStyle: negated ? "fill: #f0a05a;" : "fill: #ffffff;",
              });
            } catch (error) {
              throw new Error(`Error setting edge ${state} -> ${targetState}: ${error.message}`);
            }
          });
        });
      });

      const svg = d3.select(svgElement);
      const inner = svg.select("g");

      const zoom = d3.zoom().on("zoom", function () {
        inner.attr("transform", d3.event.transform);
      });
      svg.call(zoom);

      const render = new dagreD3.render();
      render(inner, g);

      // Attach tooltip listeners to each node after render
      inner.selectAll("g.node").each(function(stateName) {
        const groups = g.node(stateName)._tooltipGroups;
        if (!groups) return;

        const nodeEl = this;
        nodeEl.style.cursor = "default";

        nodeEl.addEventListener("mouseenter", (e) => {
          showTooltip(groups, e.clientX, e.clientY);
        });
        nodeEl.addEventListener("mousemove", (e) => {
          positionTooltip(e.clientX, e.clientY);
        });
        nodeEl.addEventListener("mouseleave", () => {
          hideTooltip();
        });
      });

      const initialScale = 1;
      const graph = g.graph();
      const containerWidth = svg.node().parentElement.clientWidth;
      const graphWidth = graph.width * initialScale;
      const centerX = Math.max(0, (containerWidth - graphWidth) / 2);

      svg.call(zoom.transform, d3.zoomIdentity.translate(centerX, 20).scale(initialScale));
      svg.attr("height", graph.height * initialScale + 60);
      svg.node().parentElement.style.overflow = "visible";
    } catch (error) {
      console.error("Error rendering graph:", error);
      consoleEl.innerText += "\nError: " + error.message;
    }
  }
}