-- 방향 알리미+ Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 실행하세요.
-- 서버는 service_role 키로만 접근하므로 RLS를 켜고 공개 정책은 만들지 않습니다.

create table if not exists signs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists sign_history (
  id bigserial primary key,
  sign_id text not null,
  version int not null,
  editor text not null,
  reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sign_history_sign_idx on sign_history (sign_id, version desc);

-- 익명 이용 기록: 개인 식별 정보(IP, 기기 ID, 위치)를 저장하지 않는다
create table if not exists events (
  id bigserial primary key,
  type text not null,
  sign_id text,
  lang text,
  dest text,
  query text,
  hearing boolean,
  value text,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);

create table if not exists aliases (
  id bigserial primary key,
  station_id text not null,
  lang text not null,
  text text not null,
  kind text not null,
  added_by text not null,
  created_at timestamptz not null default now()
);

alter table signs enable row level security;
alter table sign_history enable row level security;
alter table events enable row level security;
alter table aliases enable row level security;
