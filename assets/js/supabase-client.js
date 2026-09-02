// Cliente de Supabase compartido por toda la app.
// La "publishable key" es segura de exponer en el navegador — no es secreta,
// el acceso real a los datos lo controla Row Level Security en la base.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://dhvedkqzhtijtbcetfnb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8xD5sfk32iRqeXDZDvAJkA_dj-atPAJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

