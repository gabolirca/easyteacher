alter table grupos add column valores_fichas jsonb not null default '{"verde":1,"azul":2,"roja":5,"blanca":10}'::jsonb;
;
