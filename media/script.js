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
    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svgElement.setAttribute("width", "960")
    svgElement.setAttribute("height", "600")
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

      // States and transitions from RFC 793
      const states = ["CLOSED", "LISTEN", "SYN RCVD", "SYN SENT", "ESTAB", "FINWAIT-1", "CLOSE WAIT", "FINWAIT-2", "CLOSING", "LAST-ACK", "TIME WAIT"];

      // Automatically label each of the nodes
      states.forEach(function (state) {
        g.setNode(state, { label: state });
      });

      // Set up the edges with different curve styling to show all possibilities
      g.setEdge("CLOSED", "LISTEN", { label: "open (curveBasis)", curve: d3.curveBasis });
      g.setEdge("LISTEN", "SYN RCVD", { label: "rcv SYN (curveBundle)", curve: d3.curveBasis });
      g.setEdge("LISTEN", "SYN SENT", { label: "send (curveCardinal)", curve: d3.curveBasis });

      // Set some general styles
      g.nodes().forEach(function (v) {
        const node = g.node(v);
        node.rx = node.ry = 5;
      });

      // Add some custom colors based on state
      g.node("CLOSED").style = "fill: #f77";
      g.node("ESTAB").style = "fill: #7f7";
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
