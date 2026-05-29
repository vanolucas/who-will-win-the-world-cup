import { getFlag } from "./flags.js";

/**
 * Icon abstraction shared by the chart, table, race and filter components.
 *
 * Each event declares an `iconType` ("flag" | "image"). Components no longer
 * import `getFlag` directly; instead they receive a renderer that turns an
 * entrant into a DOM node (or `null` when there is nothing to show), so the
 * same component code works for the World Cup (emoji flags) and the election
 * (candidate photos).
 */

/** Up-to-two-letter initials used for the image fallback avatar. */
function initials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function createInitialsAvatar(entrant) {
  const span = document.createElement("span");
  span.className = "entrant-icon entrant-icon--avatar";
  span.textContent = initials(entrant.name);
  span.setAttribute("aria-hidden", "true");
  return span;
}

function createImageIcon(entrant) {
  // No image available → use an initials avatar so layout stays consistent.
  if (!entrant.image) return createInitialsAvatar(entrant);

  const img = document.createElement("img");
  img.className = "entrant-icon entrant-icon--img";
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = entrant.name;
  img.src = entrant.image;
  // Fall back to an initials avatar if the cached image fails to load.
  img.addEventListener(
    "error",
    () => {
      if (img.parentNode) {
        img.parentNode.replaceChild(createInitialsAvatar(entrant), img);
      }
    },
    { once: true },
  );
  return img;
}

function createFlagIcon(entrant) {
  const flag = getFlag(entrant.id);
  if (!flag) return null;
  const span = document.createElement("span");
  span.className = "entrant-icon entrant-icon--flag";
  span.textContent = flag;
  span.setAttribute("aria-hidden", "true");
  return span;
}

/**
 * Return a DOM node representing the entrant's icon, or `null` when there is
 * nothing to render (e.g. a flag-type entrant with no known flag).
 */
export function createIcon(entrant, iconType) {
  return iconType === "image" ? createImageIcon(entrant) : createFlagIcon(entrant);
}

/**
 * Convenience: build a renderer bound to a single `iconType`.
 * Components are passed the returned `(entrant) => Node|null` function.
 */
export function createIconRenderer(iconType) {
  return (entrant) => createIcon(entrant, iconType);
}
