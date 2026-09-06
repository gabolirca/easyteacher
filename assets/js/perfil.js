import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

function mostrarOk(msg) {
  const box = document.getElementById('ok-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

const AVATAR_DEFAULT = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAh4c-YCf7n16DM2uFJtU8QFRfRVNvzYPDhMB_U1GcSV4umCadhz8DZQyJ0syjYD1sX_p5TXHxMLc1y-7nPJvrrFha3CiluQmE6WH25scStvTS_DeaHVNVWisUBMuTcrcq39CpkLGkHgYpNbUwB1OrKjmXe9Shc7tR4sAmO7A4-IdIBa6UYBY7oDrcrYlM3N26ZVGnXO9yGebct91jGm6IQ7YIp1DRfcOdsDyEkZ0_m9BNkM-ZBv6JJlw';

document.getElementById('avatar-input').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  const { data: { session } } = await supabase.auth.getSession();
  const extension = archivo.name.split('.').pop();
  const ruta = `${session.user.id}/avatar.${extension}`;

  const { error: errorSubida } = await supabase.storage
    .from('avatars')
    .upload(ruta, archivo, { upsert: true });

  if (errorSubida) {
    mostrarError(`No se pudo subir la foto: ${errorSubida.message}`);
    return;
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(ruta);
  // Le agregamos un parámetro con la hora para que el navegador no muestre la
  // versión vieja en caché si ya habías subido una foto antes con el mismo nombre.
  const urlConCache = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: errorGuardar } = await supabase
    .from('profesores')
    .update({ avatar_url: urlConCache })
    .eq('id', session.user.id);

  if (errorGuardar) {
    mostrarError(`Foto subida, pero no se pudo guardar en tu perfil: ${errorGuardar.message}`);
    return;
  }

  document.getElementById('avatar-preview').src = urlConCache;
  mostrarOk('Foto de perfil actualizada.');
});

document.getElementById('btn-guardar-perfil').addEventListener('click', async () => {
  const nombre = document.getElementById('perfil-nombre').value.trim();
  const tipo_maestro = document.getElementById('perfil-tipo').value || null;
  if (!nombre) {
    mostrarError('El nombre no puede quedar vacío');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const btn = document.getElementById('btn-guardar-perfil');
  btn.disabled = true;

  const { error } = await supabase.from('profesores').update({ nombre, tipo_maestro }).eq('id', session.user.id);

  btn.disabled = false;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  mostrarOk('Perfil actualizado.');
});

document.getElementById('btn-cambiar-password').addEventListener('click', async () => {
  const nueva = document.getElementById('nueva-password').value;
  const confirmar = document.getElementById('confirmar-password').value;

  if (nueva.length < 6) {
    mostrarError('La contraseña debe tener al menos 6 caracteres');
    return;
  }
  if (nueva !== confirmar) {
    mostrarError('Las contraseñas no coinciden');
    return;
  }

  const btn = document.getElementById('btn-cambiar-password');
  btn.disabled = true;

  const { error } = await supabase.auth.updateUser({ password: nueva });

  btn.disabled = false;

  if (error) {
    mostrarError(`No se pudo cambiar la contraseña: ${error.message}`);
    return;
  }

  document.getElementById('nueva-password').value = '';
  document.getElementById('confirmar-password').value = '';
  mostrarOk('Contraseña actualizada.');
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  document.getElementById('perfil-nombre').value = profesor.nombre || '';
  document.getElementById('perfil-correo').value = profesor.correo || '';
  document.getElementById('perfil-tipo').value = profesor.tipo_maestro || '';
  document.getElementById('avatar-preview').src = profesor.avatar_url || AVATAR_DEFAULT;
}

init();