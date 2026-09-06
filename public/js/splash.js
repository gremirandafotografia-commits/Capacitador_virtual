(function () {
  var html =
    '<div id="appSplash">' +
      '<img class="splash-logo" src="/img/coopelesca-blanco.png" alt="Coopelesca">' +
      '<h1 class="splash-title">CATA</h1>' +
      '<div class="splash-sub">Capacitador de Atención de Trámites de Asociados</div>' +
      '<div class="loading-wave">' +
        '<div class="loading-bar"></div><div class="loading-bar"></div><div class="loading-bar"></div><div class="loading-bar"></div>' +
      '</div>' +
    '</div>';
  document.write(html);

  var minTime = new Promise(function (resolve) { setTimeout(resolve, 4000); });
  var loaded = new Promise(function (resolve) {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

  Promise.all([minTime, loaded]).then(function () {
    var el = document.getElementById('appSplash');
    if (!el) return;
    el.classList.add('splash-hide');
    setTimeout(function () { el.remove(); }, 550);
  });
})();
