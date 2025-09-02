function load() {}
function save() {}

// Wait for the DOM to be loaded
document.addEventListener("DOMContentLoaded", function () {
  try {
    // Create a new directed graph
    var g = new dagreD3.graphlib.Graph().setGraph({
      rankdir: 'TB',
      edgesep: 20,
      ranksep: 50,
      nodesep: 30
    });

    // States and transitions from RFC 793
    var states = ["CLOSED", "LISTEN", "SYN RCVD", "SYN SENT", "ESTAB", "FINWAIT-1", "CLOSE WAIT", "FINWAIT-2", "CLOSING", "LAST-ACK", "TIME WAIT"];

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
      var node = g.node(v);
      node.rx = node.ry = 5;
    });

    // Add some custom colors based on state
    g.node("CLOSED").style = "fill: #f77";
    g.node("ESTAB").style = "fill: #7f7";

    var svg = d3.select("svg"),
      inner = svg.select("g");

    // Set up zoom support
    var zoom = d3.zoom().on("zoom", function () {
      inner.attr("transform", d3.event.transform);
    });
    svg.call(zoom);

    // Create the renderer
    var render = new dagreD3.render();

    // Run the renderer. This is what draws the final graph.
    render(inner, g);

    // Center the graph
    var initialScale = 0.75;
    svg.call(zoom.transform, d3.zoomIdentity.translate((svg.attr("width") - g.graph().width * initialScale) / 2, 20).scale(initialScale));

    svg.attr("height", g.graph().height * initialScale + 40);

    console.log("Graph rendered successfully");
  } catch (error) {
    console.error("Error rendering graph:", error);
    document.getElementById("console").value = "Error: " + error.message;
  }
});
