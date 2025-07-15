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
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
  },
  stateDiagram: {
    useMaxWidth: true,
  },
});
async function generateElements(jsonData) {
  const controllersList = document.querySelector("#controllers");
  controllersList.innerHTML = ""; // Clear previous content
  const controllerKeys = Object.keys(jsonData.animation_controllers);

  for (const controllerName of controllerKeys) {
    // Create a diagram
    const controller = jsonData.animation_controllers[controllerName];
    const graphCode = translateData(controller);
    const diagram = await drawDiagram(graphCode);

    // Create controller title
    const controllerTitle = document.createElement("h2");
    controllerTitle.textContent = controllerName;
    controllerTitle.classList.add("controller-title");

    // Apply the diagram and title to the list item
    const controllerItem = document.createElement("li");
    controllerItem.appendChild(controllerTitle);
    controllerItem.insertAdjacentHTML("beforeend", diagram);
    controllerItem.classList.add("controller");
    document.querySelector("#controllers").appendChild(controllerItem);
  }
}

function translateData(data) {
  let graphCode = `stateDiagram-v2\n`;

  try {
    const states = data.states;
    Object.keys(states).forEach((state) => {
      const transitions = states[state].transitions;
      const animations = states[state].animations;
      //define states
      graphCode += `state_${state} : ${state}\n `;
      //define transitions
      transitions?.forEach((transition) => {
        const transitionDetails = Object.entries(transition)[0]; // returns []
        graphCode += `state_${state} --> state_${transitionDetails[0]} : ${transitionDetails[1]}\n `;
      });
    });
  } catch {
    return;
  }
  return graphCode;
}

const drawDiagram = async function (graphCode) {
  const { svg } = await mermaid.render(`controller_${Math.random().toString(36).slice(2, 11)}`, graphCode);
  return svg;
};
