/**
 * Circuit — shared site-wide theme constants. Lives outside
 * ThemeToggle.tsx on purpose: that file is "use client", and a server
 * component (layout.tsx) importing a plain string from a client module
 * gets a client reference, not the string itself.
 */

export const THEME_STORAGE_KEY = "circuit-theme";

/**
 * Inlined into <head>: applies the saved theme before the first paint,
 * and keeps every other open Circuit tab in step — the `storage` event
 * fires in all *other* tabs when one tab's ThemeToggle writes the key.
 */
export const THEME_INIT_SCRIPT = `(function(){var k="${THEME_STORAGE_KEY}",r=document.documentElement;function a(v){if(v==="dark")r.dataset.theme="dark";else delete r.dataset.theme}try{a(localStorage.getItem(k))}catch(e){}addEventListener("storage",function(e){if(e.key===k)a(e.newValue)})})()`;
