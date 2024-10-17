function removeChildren(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}
function objectEntries(input) {
  return input.map((item) => {
    if (typeof item === 'string') {
      return { key: item, value: "" };
    } else {
      const [[key, value]] = Object.entries(item);
      return { key, value };
    }
  });
}
class Controller {
  constructor(controllerData = {}) {
    this.initialState = controllerData.initial_state;
    this.states = controllerData.states;
  }
  updateData(controllerData) {
    this.initialState = controllerData.initial_state;
    this.states = controllerData.states;
  }
  populateStateList() {
    const stateList = document.getElementById("state-list");
    removeChildren(stateList);
    Object.keys(this.states).forEach((state) => {
      const stateBox = document.createElement("li");
      const stateBoxTitle = document.createElement("h2");
      const stateAnimationsBox = document.createElement("ul");
      const stateAnimationsBoxTitle = document.createElement("h3");
      stateAnimationsBoxTitle.innerText = "Animations";
      stateAnimationsBox.appendChild(stateAnimationsBoxTitle);
      const stateBlendValue = document.createElement("p");

      stateBoxTitle.innerText = state;

      objectEntries(this.states[state].animations).forEach((animation) => {
        const animationLine = document.createElement("li");
        animationLine.innerText = ` ${animation.key} : ${animation.value}`;
        stateAnimationsBox.appendChild(animationLine);
      });

      stateBlendValue.innerText = this.states[state].blend_transition;
      stateBox.appendChild(stateBoxTitle);
      stateBox.appendChild(stateAnimationsBox);
      stateBox.appendChild(stateBlendValue);
      stateList.appendChild(stateBox);
    });
  }
}
/* ------------------------------------------------------------------------------------ */
// Listen for messages from the extension
window.addEventListener("message", (event) => {
  const message = event.data; // Get the data sent by the extension

  if (message.type === "update") {
    const jsonData = JSON.parse(message.json);
    const firstController = jsonData.animation_controllers[Object.keys(jsonData.animation_controllers)[0]];
    main(firstController);
  }
});

/* ------------------------------------------------------------------------------------ */
const controller = new Controller();
function main(data) {
  controller.updateData(data);
  controller.populateStateList();
  // document.getElementById("main-panel").innerText = JSON.stringify(data, null, 4);
}
