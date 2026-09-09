// Cliente de Supabase compartido por toda la app.
// La "publishable key" es segura de exponer en el navegador — no es secreta,
// el acceso real a los datos lo controla Row Level Security en la base.
// El SDK vive en el repo (assets/vendor/supabase.js) en vez de bajarse de un
// CDN externo: en la red de la escuela un CDN de terceros es un punto de
// falla mas, y ademas asi el service worker lo puede guardar para offline.
// Para actualizarlo: npm run vendor
import { createClient } from '../vendor/supabase.js';

export const SUPABASE_URL = 'https://dhvedkqzhtijtbcetfnb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8xD5sfk32iRqeXDZDvAJkA_dj-atPAJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

