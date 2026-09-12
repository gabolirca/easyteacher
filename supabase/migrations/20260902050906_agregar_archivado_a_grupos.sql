alter table grupos add column archivado boolean not null default false;
create index idx_grupos_archivado on grupos(profesor_id, archivado);
;
