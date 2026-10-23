/**
 * JavaScript injected into the HAUSJO web portal.
 *
 * File downloads (CSV statements, exports, documents) need the user's session cookie, which the
 * native side does not have. So the page fetches the file itself (same-origin, with cookies),
 * encodes it as base64 and hands it to the app, which saves it and opens the share sheet.
 */
export const DOWNLOAD_PATHS = [
  "/agent/wallet/statement",
  "/api/files/",
  "/admin/reports/export",
  "/admin/imports/template",
  "/admin/payouts/",
  "/admin/imports/",
];

export const INJECTED_BRIDGE = `
(function () {
  if (window.__hausjoBridge) return;
  window.__hausjoBridge = true;
  var PATHS = ${JSON.stringify(DOWNLOAD_PATHS)};
  var MAX_BYTES = 15 * 1024 * 1024;
  function isDownload(a) {
    if (!a || !a.href) return false;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    if (u.pathname.indexOf("/admin/payouts/") === 0) return /\\/instructions$/.test(u.pathname);
    if (u.pathname.indexOf("/admin/imports/") === 0) return /\\/errors$/.test(u.pathname) || u.pathname === "/admin/imports/template";
    return PATHS.some(function (p) { return u.pathname.indexOf(p) === 0; });
  }
  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function filename(res, url) {
    var cd = res.headers.get("content-disposition") || "";
    var m = cd.match(/filename="?([^";]+)"?/i);
    if (m) return m[1];
    var last = new URL(url).pathname.split("/").pop() || "download";
    return last.indexOf(".") > 0 ? last : last + ".bin";
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!isDownload(a)) return;
    ev.preventDefault();
    post({ type: "download-start" });
    fetch(a.href, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t.slice(0, 200) || ("HTTP " + res.status)); });
        var name = filename(res, a.href);
        var mime = res.headers.get("content-type") || "application/octet-stream";
        return res.blob().then(function (blob) {
          if (blob.size > MAX_BYTES) throw new Error("File too large to share from the app");
          return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve({ name: name, mime: mime.split(";")[0], base64: String(r.result).split(",")[1] || "" }); };
            r.onerror = function () { reject(new Error("Could not read file")); };
            r.readAsDataURL(blob);
          });
        });
      })
      .then(function (f) { post({ type: "download", name: f.name, mime: f.mime, base64: f.base64 }); })
      .catch(function (e) { post({ type: "download-error", message: String(e && e.message || e) }); });
  }, true);
  // window.print() is unavailable in a WebView; tell the app instead.
  window.print = function () { post({ type: "print-unsupported" }); };
})();
true;
`;
