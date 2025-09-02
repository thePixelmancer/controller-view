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
  const controllerKeys = Object.keys(jsonData.animation_controllers);

  for (const controllerName of controllerKeys) {
    const controllerItem = document.createElement("li");
    // Create controller title
    const controllerTitle = document.createElement("h2");
    controllerTitle.textContent = controllerName;
    controllerItem.appendChild(controllerTitle);
    // Create svg element
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("width", "960");
    svgElement.setAttribute("height", "600");
    svgElement.innerHTML = "<g></g>";
    controllerItem.appendChild(svgElement);
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
        throw new Error(`Initial state ${initialState} not found in controller!`);
      }
      // Automatically label each of the nodes
      states.forEach((state) => {
        g.setNode(state, { label: state, rx: 2, ry: 2 });
      });

      states.forEach((state) => {
        const transitions = jsonData.animation_controllers[controllerName].states[state].transitions;
        transitions.forEach((transition) => {
          const entries = Object.entries(transition);
          entries.forEach((entry) => {
            try {
              g.setEdge(state, entry[0], { label: entry[1], curve: d3.curveBasis });
            } catch (error) {
              console.error(`Error setting edge ${state} -> ${entry[0]}:  `, error);
            }
          });
        });
      });

      g.node(initialState).style = "fill:rgb(122, 160, 211)";
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
      const initialScale = 0.75;
      svg.call(zoom.transform, d3.zoomIdentity.translate((svg.attr("width") - g.graph().width * initialScale) / 2, 20).scale(initialScale));

      svg.attr("height", g.graph().height * initialScale + 40);
    } catch (error) {
      console.error("Error rendering graph:", error);
      document.getElementById("console").innerText = "Error: " + error.message;
    }
  }
}
