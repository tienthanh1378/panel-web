// Connect: the repository and the token, once per device.
import { esc } from "../format.js";

export function render(store, view) {
  const error = view.connectError ? `<p class="notice bad">${esc(view.connectError)}</p>` : "";
  return '<header class="top"><div class="top-row"><h1><span>Connect</span></h1></div></header>'
    + '<form class="card connect" data-connect>'
    + '<label class="row-label" for="repo">Repository</label>'
    + `<input id="repo" name="repo" placeholder="owner/name" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(view.repo)}">`
    + '<label class="row-label" for="token">Token</label>'
    + '<input id="token" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">'
    + '<p class="row-help">A fine-grained token limited to that repository, with Contents read and write. '
    + "It is kept on this device and sent only to api.github.com.</p>"
    + error
    + '<div class="row actions"><button type="submit" class="primary">Connect</button>'
    + '<button type="button" data-demo>Try the demo</button>'
    + (view.connected ? '<a class="button" href="#settings">Back</a>' : "")
    + "</div>"
    + "</form>";
}
