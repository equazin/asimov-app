const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const btn = document.getElementById("btnLogin");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const user = document.getElementById("user").value.trim();
  const pass = document.getElementById("pass").value;
  if (!user || !pass) { errorEl.textContent = "Ingresá usuario y contraseña."; return; }
  btn.disabled = true;
  btn.textContent = "Ingresando…";
  try {
    const res = await window.asimovLogin.login(user, pass);
    if (!res || !res.ok) {
      errorEl.textContent = (res && res.error) || "No se pudo iniciar sesión.";
      btn.disabled = false;
      btn.textContent = "Ingresar";
      document.getElementById("pass").value = "";
      document.getElementById("pass").focus();
    }
    // En éxito, el proceso principal cierra esta ventana y abre el sistema.
  } catch (err) {
    errorEl.textContent = "Error de conexión con la base de datos.";
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
});
