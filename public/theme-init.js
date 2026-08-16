/* global window, document */
(function () {
  var storageKey = "a3-manager:appearance";
  var allowed = { light: true, dark: true, system: true };

  function readPreference() {
    try {
      var stored = window.localStorage.getItem(storageKey);
      return allowed[stored] ? stored : "system";
    } catch {
      return "system";
    }
  }

  function resolve(preference) {
    if (preference === "light" || preference === "dark") {
      return preference;
    }
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  var preference = readPreference();
  var resolved = resolve(preference);
  var root = document.documentElement;
  root.dataset.appearance = preference;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
})();
