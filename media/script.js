window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "update") {
    try {
      const jsonData = JSON.parse(message.json);
      generateElements(jsonData);
    } catch (error) {
      return;
    }
  } else if (message.type === "error") {
    return;
  }
});

function generateElements(jsonData) {
  const controllersList = document.querySelector("#controllers");
  controllersList.innerHTML = ""; // Clear previous content
  document.getElementById("console").innerText = ""; // Clear previous content
  const controllerKeys = Object.keys(jsonData.animation_controllers);

  for (const controllerName of controllerKeys) {
    const controllerItem = document.createElement("li");
    // Create controller title
    const controllerTitle = document.createElement("h2");
    controllerTitle.textContent = controllerName;
    controllerItem.appendChild(controllerTitle);
    // Create a container for the SVG
    const svgContainer = document.createElement("div");
    svgContainer.className = "svg-container";

    // Create SVG element
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("width", "100%");
    svgElement.setAttribute("height", "600");
    svgElement.style.display = "block";
    svgElement.innerHTML = "<g></g>";

    svgContainer.appendChild(svgElement);
    controllerItem.appendChild(svgContainer);
    controllersList.appendChild(controllerItem);
    /* ------------------------------------------------------------------------------------ */
    try {
      // Create a new directed graph
      const g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: "TB",
        edgesep: 20,
        ranksep: 50,
        nodesep: 30,
      });
      const initialState = jsonData.animation_controllers[controllerName].initial_state || "default";
      const states = Object.keys(jsonData.animation_controllers[controllerName].states);
      if (!states.includes(initialState)) {
        throw new Error(`Initial state [${initialState}] not found in controller [${controllerName}]!`);
      }
      // Automatically label each of the nodes
      states.forEach((state) => {
        g.setNode(state, { label: state, rx: 2, ry: 2, class: state === initialState ? "initial-state" : "" });
      });

      states.forEach((state) => {
        const transitions = jsonData.animation_controllers[controllerName].states[state].transitions;
        transitions.forEach((transition) => {
          const entries = Object.entries(transition);
          entries.forEach((entry) => {
            try {
              g.setEdge(state, entry[0], {
                label: entry[1],
                curve: d3.curveBasis,
                labelOffset: 0, // Offset the label from the edge
                labelPos: "c", // Center the label on the edge
              });
            } catch (error) {
              throw new Error(`Error setting edge ${state} -> ${entry[0]} in controller [${controllerName}]:`, error);
            }
          });
        });
      });
      /* ------------------------------------------------------------------------------------ */

      const svg = d3.select(svgElement);
      const inner = svg.select("g");

      // Set up zoom support
      const zoom = d3.zoom().on("zoom", function () {
        inner.attr("transform", d3.event.transform);
      });
      svg.call(zoom);

      // Create the renderer
      const render = new dagreD3.render();

      // Run the renderer. This is what draws the final graph.
      render(inner, g);

      // Center the graph
      const initialScale = 1;
      const graph = g.graph();
      const containerWidth = svg.node().parentElement.clientWidth;

      // Calculate the available width for the graph
      const graphWidth = graph.width * initialScale;
      const centerX = Math.max(0, (containerWidth - graphWidth) / 2);
      const centerY = 20; // Keep a small top margin

      // Apply the transform with the new center calculation
      svg.call(zoom.transform, d3.zoomIdentity.translate(centerX, centerY).scale(initialScale));

      // Set the height to fit the graph with some padding
      svg.attr("height", graph.height * initialScale + 40);

      // Ensure the container is properly sized
      svg.node().parentElement.style.overflow = "visible";
    } catch (error) {
      console.error("Error rendering graph:", error);
      document.getElementById("console").innerText += "\nError: " + error.message;
    }
  }
}
