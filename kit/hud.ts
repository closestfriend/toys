/** A tiny corner HUD. `set()` takes trusted strings (may contain <b>). */
export function hud(): { el: HTMLElement; set: (html: string) => void } {
  const el = document.createElement('div');
  el.className = 'kit-hud';
  document.body.appendChild(el);
  let last = '';
  return {
    el,
    set(html: string) {
      if (html === last) return; // avoid layout churn every frame
      last = html;
      el.innerHTML = html;
    },
  };
}
