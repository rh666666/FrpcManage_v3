import { render } from "preact";
import App from "./App";
import TrayMenu from "./components/tray/TrayMenu";

// 托盘菜单与主窗口共用同一份产物，用 hash 分流
const isTrayMenu = window.location.hash === "#tray";
if (isTrayMenu) {
  document.documentElement.dataset.window = "tray";
}

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

render(isTrayMenu ? <TrayMenu /> : <App />, document.getElementById("root")!);
