(function () {
  var yaMostrada = false;
  try { yaMostrada = sessionStorage.getItem('cataSplashShown') === '1'; } catch (e) {}
  if (yaMostrada) return;

  var html =
    '<div id="appSplash">' +
      '<img class="splash-logo" src="/img/coopelesca-blanco.png" alt="Coopelesca">' +
      '<h1 class="splash-title">CATA</h1>' +
      '<div class="splash-sub">Capacitador de Atención de Trámites de Asociados</div>' +
      '<div class="loading-wave" id="splashLoading">' +
        '<div class="loading-bar"></div><div class="loading-bar"></div><div class="loading-bar"></div><div class="loading-bar"></div>' +
      '</div>' +
      '<button type="button" class="splash-comenzar" id="splashComenzar" hidden>Comenzar</button>' +
    '</div>';
  document.write(html);

  function ocultarSplash() {
    var el = document.getElementById('appSplash');
    if (!el) return;
    el.classList.add('splash-hide');
    setTimeout(function () { el.remove(); }, 550);
    try { sessionStorage.setItem('cataSplashShown', '1'); } catch (e) {}
  }

  // Espera un mínimo breve (para que la animación no se sienta como un
  // parpadeo) y a que la página termine de cargar; a partir de ahí,
  // que sea la persona quien decida cuándo entrar con "Comenzar" en
  // vez de forzarla a esperar un tiempo fijo.
  var minTime = new Promise(function (resolve) { setTimeout(resolve, 1200); });
  var loaded = new Promise(function (resolve) {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

  Promise.all([minTime, loaded]).then(function () {
    var loading = document.getElementById('splashLoading');
    var boton = document.getElementById('splashComenzar');
    if (loading) loading.hidden = true;
    if (boton) {
      boton.hidden = false;
      boton.addEventListener('click', ocultarSplash);
      boton.focus();
    }
  });
})();
