/* ------------------------------------------------------------------------------------ */
// Listen for messages from the extension

window.addEventListener("message", (event) => {
  const message = event.data; // Get the data sent by the extension

  if (message.type === "update") {
    const jsonData = JSON.parse(message.json);
    main(jsonData);
  }
});


function main(controllerData) {
  const graphDiv = document.getElementById("graph");
  if (graphDiv) {
    graphDiv.textContent = JSON.stringify(controllerData, null, 2);
  }
}
