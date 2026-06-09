-- Outpost - persist aggregated revisit counts on destinations

alter table destinations add column if not exists visit_count int;

update destinations
set visit_count = 1
where visit_count is null or visit_count < 1;

alter table destinations alter column visit_count set default 1;
alter table destinations alter column visit_count set not null;

alter table destinations drop constraint if exists destinations_visit_count_check;
alter table destinations add constraint destinations_visit_count_check
  check (visit_count >= 1);
