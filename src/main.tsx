import { render } from "preact";
import App from "./App";

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  const node = el.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  return node !== null;
}

window.addEventListener(
  "contextmenu",
  (e) => {
    if (isEditable(e.target)) return;
    e.preventDefault();
  },
  true
);

render(<App />, document.getElementById("root")!);
