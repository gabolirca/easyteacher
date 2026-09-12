-- El profesor decide cuánto pesa cada rubro en el promedio final del grupo.
-- No se fuerza a sumar 100 en la base -- eso se valida en la pantalla donde se edite.
alter table grupos add column peso_examenes numeric not null default 50;
alter table grupos add column peso_tareas numeric not null default 30;
alter table grupos add column peso_participacion numeric not null default 20;

-- ==========================================
-- PARTICIPACIONES (juego de fichas de casino)
-- ==========================================
-- verde=1, azul=2, roja=5, blanca=10. La ficha negra es un multiplicador fijo
-- (x2) pero el profesor decide libremente a qué lo aplica en el momento, así
-- que para "negra" el valor final de puntos se captura a mano en vez de
-- calcularse automático.
create table participaciones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references grupos(id) on delete cascade,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  fecha date not null default current_date,
  tipo_ficha text not null check (tipo_ficha in ('verde','azul','roja','blanca','negra')),
  valor numeric not null,
  nota text,
  created_at timestamptz not null default now()
);

create index idx_participaciones_grupo_fecha on participaciones(grupo_id, fecha);
create index idx_participaciones_alumno on participaciones(alumno_id);

alter table participaciones enable row level security;

create policy "profesor administra participaciones" on participaciones for all using (es_profesor_del_grupo(grupo_id));
create policy "alumno ve su participacion" on participaciones for select using (alumno_id = auth.uid());
;
