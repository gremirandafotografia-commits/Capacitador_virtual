const AdminAuth = (function () {
  const TOKEN_KEY = 'cata_admin_token';
  return {
    getToken() { return localStorage.getItem(TOKEN_KEY); },
    setToken(t) { localStorage.setItem(TOKEN_KEY, t); },
    clearToken() { localStorage.removeItem(TOKEN_KEY); }
  };
})();

function adminGuard() {
  return new Promise((resolve) => {
    if (AdminAuth.getToken()) return resolve();
    showGate();

    function showGate() {
      const overlay = document.createElement('div');
      overlay.className = 'modal-backdrop';
      overlay.id = 'adminGate';
      overlay.innerHTML = `
        <div class="modal login-card" style="max-width:360px">
          <h2 class="login-title">Administración</h2>
          <p class="helper" style="text-align:center">Ingresá la contraseña para continuar.</p>
          <div class="login-input-wrap">
            <input type="password" id="adminGatePass" placeholder="Contraseña" autofocus>
            <span class="msym login-input-icon">lock</span>
          </div>
          <p id="adminGateError" style="color:var(--danger);font-size:13px;min-height:18px;margin:0;text-align:center"></p>
          <button class="login-submit" id="adminGateEntrar" type="button">Entrar</button>
          <p class="login-back-link"><a href="/index.html">Volver al inicio</a></p>
        </div>`;
      document.body.appendChild(overlay);

      const pass = overlay.querySelector('#adminGatePass');
      const err = overlay.querySelector('#adminGateError');

      async function intentar() {
        const password = pass.value;
        if (!password) return;
        try {
          const r = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          if (!r.ok) {
            let msg = 'Contraseña incorrecta';
            try { msg = (await r.json()).error || msg; } catch (e) { /* respuesta no era JSON */ }
            err.textContent = msg;
            pass.value = '';
            pass.focus();
            return;
          }
          const { token } = await r.json();
          AdminAuth.setToken(token);
          overlay.remove();
          resolve();
        } catch (e) {
          err.textContent = 'Error de conexión, intentá de nuevo';
        }
      }

      overlay.querySelector('#adminGateEntrar').addEventListener('click', intentar);
      pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') intentar(); });
      pass.focus();
    }
  });
}
