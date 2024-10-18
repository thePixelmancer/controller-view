function removeChildren(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}
function objectEntries(input) {
  return input.map((item) => {
    if (typeof item === "string") {
      return { key: item, value: "True" };
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
      stateBox.classList.add("state-box");
      stateBox.innerHTML = `
        <div class = "state-box-title">
          <h2>${state}</h2>
        </div>
        <div class = "state-box-content">
          <h3>Animations:</h3>
          <ul class = "animation-list"></ul>
          <h3>Transitions:</h3>
          <ul class = "transition-list"></ul>
          </ul>
        </div>
      `;
      objectEntries(this.states[state].animations).forEach((animation) => {
        const animationBox = document.createElement("li");
        animationBox.innerHTML = `<span class = "key-text">${animation.key}</span><span class = "value-text">${animation.value}</span>`;
        stateBox.querySelector(".animation-list").appendChild(animationBox);
      });
      objectEntries(this.states[state].transitions).forEach((transition) => {
        const transitionBox = document.createElement("li");
        transitionBox.innerHTML = `<span class = "key-text">${transition.key}</span><span class = "value-text">${transition.value}</span>`;
        stateBox.querySelector(".transition-list").appendChild(transitionBox);
      });
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
function main(controllerData) {
  controller.updateData(controllerData);
  controller.populateStateList();
}
