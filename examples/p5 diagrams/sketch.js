class Diagram {
  constructor(parentContainerId) {
    this.nodes = [];
    this.edges = [];

    this.parentContainerId = parentContainerId;
    this.parentContainer = document.getElementById(this.parentContainerId);

    this.containerId = null;
    this.container = null;
    this.createContainer();

    this.width = this.container.offsetWidth || 400; // Default width if container not found
    this.height = this.container.offsetHeight || 400; // Default height if container not found
    this.p5 = null;

    // Zoom and pan properties
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.5;
    this.maxZoom = 5.0;
    this.zoomSpeed = 0.1;

    // Dragging state
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Animation state for smooth transitions
    this.isAnimating = false;
    this.animationStartTime = 0;
    this.animationDuration = 800; // ms
    this.startZoom = 1.0;
    this.startPanX = 0;
    this.startPanY = 0;
    this.targetZoom = 1.0;
    this.targetPanX = 0;
    this.targetPanY = 0;

    // Diagram styling
    this.style = {
      backgroundColor: [248, 250, 252], // Light gray-blue background
    };

    this.initSketch();
    this.createControls();
  }

  createContainer() {
    const containerCount = document.querySelectorAll(".diagram-container").length + 1;
    const diagramContainerId = `diagram-container-${containerCount}`;
    const diagramContainer = document.createElement("div");
    diagramContainer.classList.add("diagram-container");
    diagramContainer.id = diagramContainerId;

    const parentContainer = document.getElementById(this.parentContainerId);
    if (!parentContainer) {
      console.error(`Parent container with ID ${this.parentContainerId} not found.`);
      return;
    }
    parentContainer.appendChild(diagramContainer);
    this.container = diagramContainer;
    this.containerId = diagramContainerId;
  }
  // Setup controls for this specific diagram
  createControls() {
    // Create controls div
    const controlsDiv = document.createElement("div");
    controlsDiv.classList.add("controls");
    this.container.appendChild(controlsDiv);

    // Create fit-to-view button
    const fitToViewBtn = document.createElement("button");
    fitToViewBtn.type = "button";
    fitToViewBtn.textContent = "Fit to View";
    controlsDiv.appendChild(fitToViewBtn);

    // Add event listener for fit-to-view button
    fitToViewBtn.addEventListener("click", () => {
      this.fitToView();
    });
  }
  setStyle(styleObj) {
    this.style = {
      ...this.style,
      ...styleObj,
    };
    return this;
  }

  initSketch() {
    const sketch = (p5) => {
      p5.setup = () => {
        const container = document.getElementById(this.containerId);
        this.width = container.offsetWidth || this.width;
        this.height = container.offsetHeight || this.height;

        const canvas = p5.createCanvas(this.width, this.height);
        p5.background(220, 20);

        // Center the view on the graph after first frame
        setTimeout(() => {
          this.fitToView();
        }, 100);
      };

      p5.draw = () => {
        p5.background(this.style.backgroundColor[0], this.style.backgroundColor[1], this.style.backgroundColor[2]);

        // Update animation if active
        this.updateAnimation();

        // Apply zoom and pan transformations
        p5.push();
        p5.translate(this.panX, this.panY);
        p5.scale(this.zoom);

        this.draw(p5);

        p5.pop();
      };
      p5.windowResized = () => {
        this.width = this.container.offsetWidth || 400;
        this.height = this.container.offsetHeight || 400;
        p5.resizeCanvas(this.width, this.height);
      };
      // Mouse wheel zoom
      p5.mouseWheel = (event) => {
        // Check if mouse is within this canvas bounds
        if (p5.mouseX < 0 || p5.mouseX > this.width || p5.mouseY < 0 || p5.mouseY > this.height) {
          return true; // Allow event to propagate if mouse is outside this canvas
        }

        // Stop any ongoing animation
        this.isAnimating = false;

        // Get mouse position relative to canvas
        const mouseXInCanvas = p5.mouseX;
        const mouseYInCanvas = p5.mouseY;

        // Calculate mouse position in world coordinates (before zoom)
        const worldMouseX = (mouseXInCanvas - this.panX) / this.zoom;
        const worldMouseY = (mouseYInCanvas - this.panY) / this.zoom;

        // Calculate new zoom
        let newZoom = this.zoom;
        if (event.delta > 0) {
          newZoom = this.zoom / (1 + this.zoomSpeed);
        } else {
          newZoom = this.zoom * (1 + this.zoomSpeed);
        }

        // Clamp zoom
        newZoom = p5.constrain(newZoom, this.minZoom, this.maxZoom);

        // Calculate new pan to keep mouse position fixed
        this.panX = mouseXInCanvas - worldMouseX * newZoom;
        this.panY = mouseYInCanvas - worldMouseY * newZoom;
        this.zoom = newZoom;

        return false; // Prevent default scrolling
      };

      // Mouse press for panning
      p5.mousePressed = () => {
        if (p5.mouseX >= 0 && p5.mouseX <= this.width && p5.mouseY >= 0 && p5.mouseY <= this.height) {
          // Stop any ongoing animation
          this.isAnimating = false;
          this.isDragging = true;
          this.lastMouseX = p5.mouseX;
          this.lastMouseY = p5.mouseY;
        }
      };

      // Mouse drag for panning
      p5.mouseDragged = () => {
        if (this.isDragging) {
          const deltaX = p5.mouseX - this.lastMouseX;
          const deltaY = p5.mouseY - this.lastMouseY;

          this.panX += deltaX;
          this.panY += deltaY;

          this.lastMouseX = p5.mouseX;
          this.lastMouseY = p5.mouseY;
        }
      };

      // Mouse release
      p5.mouseReleased = () => {
        this.isDragging = false;
      };
    };

    this.p5 = new p5(sketch, this.containerId);
  }
  addNode(node) {
    this.nodes.push(node);
  }
  addNodes(nodesList) {
    this.nodes = [...this.nodes, ...nodesList];
  }
  setNodes(nodesList) {
    this.nodes = nodesList;
  }
  addEdge(edge) {
    this.edges.push(edge);
  }
  addEdges(edgesList) {
    this.edges = [...this.edges, edgesList];
  }
  setEdges(edgesList) {
    this.edges = edgesList;
  }
  draw(p5) {
    for (let edge of this.edges) {
      edge.draw(p5);
    }
    for (let node of this.nodes) {
      node.draw(p5);
    }
  }
  // Convert screen coordinates to world coordinates
  screenToWorld(screenX, screenY) {
    const worldX = (screenX - this.panX) / this.zoom;
    const worldY = (screenY - this.panY) / this.zoom;
    return { x: worldX, y: worldY };
  }

  // Convert world coordinates to screen coordinates
  worldToScreen(worldX, worldY) {
    const screenX = worldX * this.zoom + this.panX;
    const screenY = worldY * this.zoom + this.panY;
    return { x: screenX, y: screenY };
  }

  // Reset zoom and pan to default
  resetView() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
  }

  // Fit all nodes in view with smooth animation
  fitToView() {
    if (this.nodes.length === 0) return;

    // We need p5 instance to calculate text width, so we'll use the existing one
    if (!this.p5) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let node of this.nodes) {
      // Calculate node dimensions based on text and padding
      this.p5.textSize(node.style.textSize);
      const nodeWidth = this.p5.textWidth(node.text) + node.style.padding * 2;
      const nodeHeight = node.style.textSize + node.style.padding * 2;

      minX = Math.min(minX, node.x - nodeWidth / 2);
      maxX = Math.max(maxX, node.x + nodeWidth / 2);
      minY = Math.min(minY, node.y - nodeHeight / 2);
      maxY = Math.max(maxY, node.y + nodeHeight / 2);
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Add some padding
    const padding = 50;
    const scaleX = (this.width - padding * 2) / contentWidth;
    const scaleY = (this.height - padding * 2) / contentHeight;
    let targetZoom = Math.min(scaleX, scaleY, this.maxZoom);

    // Ensure minimum zoom
    targetZoom = Math.max(targetZoom, this.minZoom);

    // Calculate target pan values
    const targetPanX = this.width / 2 - centerX * targetZoom;
    const targetPanY = this.height / 2 - centerY * targetZoom;

    // Animate to the target view
    this.animateToView(targetZoom, targetPanX, targetPanY);
  }

  // Update animation interpolation
  updateAnimation() {
    if (!this.isAnimating) return;

    const elapsed = Date.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.animationDuration, 1.0);

    // Ease-out function for smooth animation
    const easeOut = 1 - Math.pow(1 - progress, 3);

    // Interpolate values
    this.zoom = this.startZoom + (this.targetZoom - this.startZoom) * easeOut;
    this.panX = this.startPanX + (this.targetPanX - this.startPanX) * easeOut;
    this.panY = this.startPanY + (this.targetPanY - this.startPanY) * easeOut;

    // Stop animation when complete
    if (progress >= 1.0) {
      this.isAnimating = false;
      this.zoom = this.targetZoom;
      this.panX = this.targetPanX;
      this.panY = this.targetPanY;
    }
  }

  // Start smooth animation to target values
  animateToView(targetZoom, targetPanX, targetPanY) {
    this.startZoom = this.zoom;
    this.startPanX = this.panX;
    this.startPanY = this.panY;
    this.targetZoom = targetZoom;
    this.targetPanX = targetPanX;
    this.targetPanY = targetPanY;
    this.animationStartTime = Date.now();
    this.isAnimating = true;
  }
}
class Node {
  constructor(x, y, text = toString(id)) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.style = {
      padding: 16,
      strokeColor: [71, 85, 105], // Slate gray border
      strokeWeight: 1.5,
      color: [255, 255, 255], // White background
      cornerRadius: 8,
      textSize: 14,
      textStrokeColor: 0,
      textStrokeWeight: 0,
      textColor: [30, 41, 59], // Dark slate text
    };
  }

  setStyle(styleObj) {
    this.style = {
      ...this.style,
      ...styleObj,
    };
    return this;
  }
  draw(p5) {
    // Draw the node rectangle
    p5.fill(this.style.color[0], this.style.color[1], this.style.color[2]);
    p5.stroke(this.style.strokeColor[0], this.style.strokeColor[1], this.style.strokeColor[2]);
    p5.strokeWeight(this.style.strokeWeight);
    p5.rectMode(p5.CENTER);
    p5.rect(this.x, this.y, p5.textWidth(this.text) + this.style.padding * 2, this.style.textSize + this.style.padding * 2, this.style.cornerRadius);

    // Draw the text
    p5.fill(this.style.textColor[0], this.style.textColor[1], this.style.textColor[2]);
    p5.stroke(this.style.textStrokeColor);
    p5.strokeWeight(this.style.textStrokeWeight);
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(this.style.textSize);
    p5.text(this.text, this.x, this.y);
  }
}
class Edge {
  constructor(fromNode, toNode) {
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.label = null;
    this.style = {
      curviness: 0,
      color: [100, 116, 139], // Slate gray edge
      weight: 2,
    };
    this.controlPoint = this.getControlPoint();
  }

  addLabel(text, positionAlongEdge = 0.5) {
    this.label = new EdgeLabel(this, text, positionAlongEdge);
    return this.label;
  }

  setStyle(styleObj) {
    this.style = {
      ...this.style,
      ...styleObj,
    };
    return this;
  }

  draw(p5) {
    //update control point
    this.controlPoint = this.getControlPoint();
    // Draw the edge line
    p5.stroke(this.style.color[0], this.style.color[1], this.style.color[2]);
    p5.strokeWeight(this.style.weight);
    p5.noFill();
    p5.bezier(
      this.fromNode.x,
      this.fromNode.y,
      this.controlPoint.x,
      this.controlPoint.y,
      this.controlPoint.x,
      this.controlPoint.y,
      this.toNode.x,
      this.toNode.y
    );

    // Draw the label if it exists
    if (this.label) {
      this.label.draw(p5);
    }
  }
  getControlPoint() {
    // Calculate the midpoint between nodes
    const midpointX = (this.fromNode.x + this.toNode.x) / 2;
    const midpointY = (this.fromNode.y + this.toNode.y) / 2;

    // Calculate the direction vector from fromNode to toNode
    const directionX = this.toNode.x - this.fromNode.x;
    const directionY = this.toNode.y - this.fromNode.y;

    // Calculate perpendicular vector (right-hand rule)
    // Rotate 90 degrees clockwise for positive curviness
    let perpendicularX = directionY;
    let perpendicularY = -directionX;

    // Normalize the perpendicular vector
    const vectorLength = Math.sqrt(perpendicularX * perpendicularX + perpendicularY * perpendicularY);
    if (vectorLength > 0) {
      perpendicularX /= vectorLength;
      perpendicularY /= vectorLength;
    }

    // Apply curviness
    const controlPointX = midpointX + perpendicularX * this.style.curviness;
    const controlPointY = midpointY + perpendicularY * this.style.curviness;

    return { x: controlPointX, y: controlPointY };
  }
  getPointOnEdge(curveParameter, p5) {
    // Use p5.js bezierPoint function for bezier curves
    const pointX = p5.bezierPoint(this.fromNode.x, this.controlPoint.x, this.controlPoint.x, this.toNode.x, curveParameter);
    const pointY = p5.bezierPoint(this.fromNode.y, this.controlPoint.y, this.controlPoint.y, this.toNode.y, curveParameter);
    return { x: pointX, y: pointY };
  }
}
class EdgeLabel {
  constructor(parentEdge, text, positionAlongEdge = 0.5) {
    this.parentEdge = parentEdge;
    this.text = text;
    this.style = {
      color: [255, 255, 255], // White background
      strokeColor: [203, 213, 225], // Light gray border
      strokeWeight: 1,
      cornerRadius: 6,
      positionAlongEdge: Math.max(0, Math.min(1, positionAlongEdge)),
      rotateWithEdge: false,
      textColor: [51, 65, 85], // Dark gray text
      textSize: 11,
      textStrokeColor: 0,
      textStrokeWeight: 0,
      padding: 8,
      visible: true,
    };
  }

  setText(text) {
    this.text = text;
    return this;
  }

  setPosition(positionAlongEdge) {
    this.style.positionAlongEdge = Math.max(0, Math.min(1, positionAlongEdge));
    return this;
  }

  setStyle(styleObj) {
    this.style = {
      ...this.style,
      ...styleObj,
    };
    return this;
  }

  draw(p5) {
    if (!this.style.visible) return;

    let labelX, labelY;

    // Calculate position using the edge's getPointOnEdge method
    const labelPosition = this.parentEdge.getPointOnEdge(this.style.positionAlongEdge, p5);
    labelX = labelPosition.x;
    labelY = labelPosition.y;

    p5.push(); // Save current transformation state

    // Rotate if needed
    if (this.style.rotateWithEdge) {
      const edgeAngle = p5.atan2(this.parentEdge.toNode.y - this.parentEdge.fromNode.y, this.parentEdge.toNode.x - this.parentEdge.fromNode.x);
      p5.translate(labelX, labelY);
      p5.rotate(edgeAngle);
      labelX = 0;
      labelY = 0;
    }

    // Draw background
    p5.fill(this.style.color[0], this.style.color[1], this.style.color[2]);
    p5.stroke(this.style.strokeColor[0], this.style.strokeColor[1], this.style.strokeColor[2]);
    p5.strokeWeight(this.style.strokeWeight);
    p5.rectMode(p5.CENTER);
    p5.rect(labelX, labelY, p5.textWidth(this.text) + this.style.padding * 2, this.style.textSize + this.style.padding * 2, this.style.cornerRadius);

    // Draw text
    p5.fill(this.style.textColor[0], this.style.textColor[1], this.style.textColor[2]);
    p5.stroke(this.style.textStrokeColor);
    p5.strokeWeight(this.style.textStrokeWeight);
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(this.style.textSize);
    p5.text(this.text, labelX, labelY);

    p5.pop(); // Restore transformation state
  }
}

// Create diagram
const diagram1 = new Diagram("main");

// Create nodes
const node1 = new Node(100, 200, "Node 1");
const node2 = new Node(300, 350, "Node 2");
const node3 = new Node(200, 50, "Node 3");
const node4 = new Node(400, 400, "Node 4").setStyle({
  color: [255, 223, 186], // Light orange background
  strokeColor: [245, 158, 11], // Orange border
  cornerRadius: 822,
  textColor: [30, 41, 59], // Dark slate text
});
diagram1.setNodes([node1, node2, node3, node4]);

// Create edges
const edge1 = new Edge(node1, node2);
edge1.addLabel("label1");

const edge2 = new Edge(node2, node3);
edge2.addLabel("label2");

const edge3 = new Edge(node1, node4);
edge3.addLabel("label3");

const edge4 = new Edge(node4, node3);
edge4.addLabel("label4");

diagram1.setEdges([edge1, edge2, edge3, edge4]);
