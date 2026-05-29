/**
 * Header event-selector dropdown.
 *
 * Replaces the static title suffix with an accessible menu listing every
 * configured event (`dropdownLabel`). Selecting an event navigates to its
 * dedicated page `<base>/<event-id>/`.
 */

function eventUrl(eventId) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${eventId}/`;
}

export function initEventDropdown(events, currentEventId) {
  const root = document.getElementById("event-dropdown");
  const toggle = document.getElementById("event-dropdown-toggle");
  const menu = document.getElementById("event-dropdown-menu");
  const label = document.getElementById("event-dropdown-label");
  if (!root || !toggle || !menu) return;

  const current = events.find((e) => e.id === currentEventId);
  if (current && label) label.textContent = current.dropdownLabel;

  menu.replaceChildren();
  for (const ev of events) {
    const li = document.createElement("li");
    li.setAttribute("role", "none");

    const item = document.createElement("a");
    item.className = "event-dropdown__item";
    item.setAttribute("role", "menuitem");
    item.href = eventUrl(ev.id);
    item.textContent = ev.dropdownLabel;
    if (ev.id === currentEventId) {
      item.classList.add("is-current");
      item.setAttribute("aria-current", "true");
    }
    li.appendChild(item);
    menu.appendChild(li);
  }

  function open() {
    root.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("keydown", onKeydown, true);
  }

  function close() {
    root.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  }

  function onOutsideClick(e) {
    if (!root.contains(e.target)) close();
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      close();
      toggle.focus();
    }
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (root.classList.contains("open")) {
      close();
    } else {
      open();
    }
  });
}
