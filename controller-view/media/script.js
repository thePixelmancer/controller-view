function removeChildren(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}
function objectEntries(input) {
  return input.map((item) => {
    if (typeof item === "string") {
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
      stateBox.innerHTML = `
      <li class = "state-box">
        <div class = "state-box-title">
          <h2>State: ${state}</h2>
        </div>
        <div class = "state-box-content">
          <h3>Animations:</h3>
          <ul class = "animation-list"></ul>
          <ul>
          <h3>Transitions:</h3>
          <ul class = "transition-list"></ul>
          </ul>
        </div>
      </li>
      `;
      objectEntries(this.states[state].animations).forEach((animation) => {
        const animationBox = document.createElement("li");
        animationBox.innerText = `${animation.key} ${animation.value}`;
        stateBox.querySelector(".animation-list").appendChild(animationBox);
      })
      objectEntries(this.states[state].transitions).forEach((transition) => {
        const transitionBox = document.createElement("li");
        transitionBox.innerText = `${transition.key} ${transition.value}`;
        stateBox.querySelector(".transition-list").appendChild(transitionBox);
      })
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
