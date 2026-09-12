alter table examenes add column archivado boolean not null default false;
create index idx_examenes_archivado on examenes(grupo_id, archivado);
;
