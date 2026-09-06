import { supabase } from './supabase-client.js';

const form = document.getElementById('login-form');
const toggleBtn = document.getElementById('toggle-mode');
const modeTitle = document.getElementById('mode-title');
const nombreField = document.getElementById('nombre-field');
const errorBox = document.getElementById('error-box');
const submitBtn = document.getElementById('submit-btn');

let modo = 'login'; // 'login' | 'signup'

// Si ya hay sesión activa, nos vamos directo al panel
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'dashboard.html';
});

toggleBtn.addEventListener('click', () => {
  modo = modo === 'login' ? 'signup' : 'login';
  const esSignup = modo === 'signup';

  modeTitle.textContent = esSignup ? 'Crear cuenta de profesor' : 'Iniciar sesión';
  submitBtn.textContent = esSignup ? 'Crear cuenta' : 'Entrar';
  toggleBtn.textContent = esSignup ? '¿Ya tienes cuenta? Inicia sesión' : '¿Primera vez? Crea tu cuenta';
  nombreField.classList.toggle('hidden', !esSignup);
  errorBox.classList.add('hidden');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.add('hidden');
  submitBtn.disabled = true;

  const correo = document.getElementById('correo').value.trim();
  const password = document.getElementById('password').value;

  try {
    if (modo === 'signup') {
      const nombre = document.getElementById('nombre').value.trim();
      if (!nombre) throw new Error('Escribe tu nombre');

      const { error } = await supabase.auth.signUp({
        email: correo,
        password,
        options: { data: { rol: 'profesor', nombre } },
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password });
      if (error) throw error;
    }

      await irADashboardConTransicion();
  } catch (err) {
    errorBox.textContent = err.message || 'Ocurrió un error, intenta de nuevo';
    errorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
});

function irADashboardConTransicion() {
  return new Promise(() => {
    const overlay = document.getElementById('fade-overlay');
    if (overlay) {
      overlay.classList.add('activo');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 380);
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}
