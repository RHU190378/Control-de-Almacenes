-- =====================================================================
--  SISTEMA DE ALMACENES, INVENTARIO, COMBUSTIBLE, AGROQUÍMICOS,
--  REPUESTOS, MAQUINARIA Y SERVICIOS  —  SCRIPT ÚNICO PARA SUPABASE
-- =====================================================================
--  CÓMO USARLO (se hace UNA sola vez):
--   1. Cambia el correo de la línea marcada con  >>> EDITA AQUÍ <<<
--   2. Copia TODO este archivo.
--   3. En Supabase: menú "SQL Editor" > "New query" > pega > botón "Run".
--   4. Debe terminar con el mensaje "Success. No rows returned".
--
--  Se puede volver a ejecutar sin miedo: no borra tus datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. CONFIGURACIÓN INICIAL  (lo único que debes editar)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key   text primary key,
  value text
);

-- >>> EDITA AQUÍ <<<  Escribe entre comillas el correo del administrador único.
-- La contraseña la eliges tú en la primera pantalla de la aplicación.
insert into public.app_settings (key, value)
values ('admin_email', 'CAMBIA_ESTE_CORREO@ejemplo.com')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  is_central  boolean not null default false,
  address     text,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists one_central_warehouse on public.warehouses (is_central) where is_central;

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  role          text not null default 'user' check (role in ('system_admin','warehouse_admin','user')),
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  active        boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.company_settings (
  id          int primary key default 1 check (id = 1),
  name        text default 'Mi Empresa',
  tax_id      text,
  phone       text,
  email       text,
  address     text,
  logo_url    text,
  currency    text default 'Bs'
);

create table if not exists public.categories (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  active  boolean not null default true
);

create table if not exists public.units (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  abbreviation  text
);

create table if not exists public.suppliers (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  kind      text,
  contact   text,
  phone     text,
  email     text,
  address   text,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.product_code_seq;

create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  manufacturer_code  text,
  name               text not null,
  category_id        uuid references public.categories(id) on delete restrict,
  brand              text,
  model              text,
  unit_id            uuid references public.units(id) on delete restrict,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  cost               numeric(14,4) not null default 0 check (cost >= 0),
  min_stock          numeric(14,3) not null default 0 check (min_stock >= 0),
  expiry_date        date,
  active             boolean not null default true,
  photo_url          text,
  created_at         timestamptz not null default now()
);
create index if not exists products_name_idx on public.products (name);
create index if not exists products_mfr_idx  on public.products (manufacturer_code);

create or replace function public.products_autocode() returns trigger
language plpgsql as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := 'P' || lpad(nextval('public.product_code_seq')::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_products_autocode on public.products;
create trigger trg_products_autocode before insert on public.products
  for each row execute function public.products_autocode();

create table if not exists public.inventory (
  warehouse_id  uuid not null references public.warehouses(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  quantity      numeric(14,3) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  kind          text not null check (kind in ('machinery','vehicle','equipment')),
  type          text,
  name          text,
  brand         text,
  model         text,
  year          int,
  plate         text,
  serial        text,
  hourmeter     numeric(12,1),
  mileage       numeric(12,1),
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  status        text not null default 'activo' check (status in ('activo','en_reparacion','inactivo','baja')),
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- Notas (cabecera). Un solo diseño sirve para: entradas, salidas, traspasos,
-- pedidos, recepción/entrega de combustible, entrega de agroquímicos y repuestos.
create table if not exists public.notes (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('entry','exit','transfer','request','fuel_in','fuel_out','agro_out','parts_out')),
  number             int  not null,
  note_date          date not null default current_date,
  note_time          time not null default localtime,
  warehouse_id       uuid not null references public.warehouses(id),
  from_warehouse_id  uuid references public.warehouses(id),
  to_warehouse_id    uuid references public.warehouses(id),
  supplier_id        uuid references public.suppliers(id) on delete set null,
  asset_id           uuid references public.assets(id) on delete set null,
  status             text not null default 'registrada',
  reason             text,
  priority           text,
  person_delivers    text,
  person_receives    text,
  observations       text,
  extra              jsonb not null default '{}'::jsonb,
  ref_note_id        uuid references public.notes(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (type, number)
);
alter table public.notes add column if not exists ref_note_id uuid references public.notes(id) on delete set null;
create index if not exists notes_type_date_idx on public.notes (type, note_date);
create index if not exists notes_wh_idx on public.notes (warehouse_id);

create table if not exists public.note_items (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.notes(id) on delete cascade,
  product_id    uuid not null references public.products(id),
  qty           numeric(14,3) not null check (qty > 0),
  qty_sent      numeric(14,3),
  qty_received  numeric(14,3),
  unit_cost     numeric(14,4) not null default 0,
  observation   text,
  pos           int not null default 0
);
create index if not exists note_items_note_idx on public.note_items (note_id);
create index if not exists note_items_prod_idx on public.note_items (product_id);

create table if not exists public.note_counters (
  type  text primary key,
  last  int not null default 0
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated by default as identity unique,
  requested_at  timestamptz not null default now(),
  warehouse_id  uuid not null references public.warehouses(id),
  asset_id      uuid references public.assets(id) on delete set null,
  requester     text,
  reason        text,
  description   text,
  photo_url     text,
  priority      text not null default 'media' check (priority in ('baja','media','alta','urgente')),
  status        text not null default 'solicitado' check (status in ('solicitado','en_atencion','en_reparacion','terminado','cancelado')),
  technician    text,
  work_done     text,
  parts_cost    numeric(14,2) not null default 0,
  labor_cost    numeric(14,2) not null default 0 check (labor_cost >= 0),
  other_cost    numeric(14,2) not null default 0 check (other_cost >= 0),
  total_cost    numeric(14,2) generated always as (parts_cost + labor_cost + other_cost) stored,
  finished_at   timestamptz,
  received_by   text,
  observations  text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists services_wh_idx on public.services (warehouse_id, status);

create table if not exists public.service_parts (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  qty         numeric(14,3) not null check (qty > 0),
  unit_cost   numeric(14,4) not null default 0
);
create index if not exists service_parts_idx on public.service_parts (service_id);

create table if not exists public.inventory_movements (
  id             bigint generated always as identity primary key,
  warehouse_id   uuid not null references public.warehouses(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  delta          numeric(14,3) not null,
  movement_type  text,
  unit_cost      numeric(14,4),
  note_id        uuid references public.notes(id) on delete cascade,
  service_id     uuid references public.services(id) on delete cascade,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists inv_mov_idx on public.inventory_movements (warehouse_id, created_at);
create index if not exists inv_mov_note_idx on public.inventory_movements (note_id);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE PERMISOS
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.my_warehouse() returns uuid
language sql stable security definer set search_path = public as $$
  select warehouse_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_sysadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'system_admin', false)
$$;

create or replace function public.can_see_wh(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() is null then false
    when public.my_role() = 'system_admin' then true
    else w is not null and w = public.my_warehouse()
  end
$$;

-- ---------------------------------------------------------------------
-- 3. CREACIÓN AUTOMÁTICA DE PERFIL + PRIMER ADMINISTRADOR
--    Solo el correo escrito arriba puede convertirse en administrador.
--    Cualquier otra cuenta nace "inactiva" hasta que el administrador
--    la active desde dentro del programa.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text; v_first boolean;
begin
  select value into v_email from public.app_settings where key = 'admin_email';
  v_first := not exists (select 1 from public.profiles where role = 'system_admin');
  if v_first and v_email is not null and lower(new.email) = lower(v_email) then
    insert into public.profiles (id, email, full_name, role, active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'Administrador'), 'system_admin', true);
  else
    insert into public.profiles (id, email, full_name, role, active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'user', false);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.system_needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'system_admin')
$$;

-- Límites: máx. 3 administradores de sistema y 2 administradores por almacén
create or replace function public.profiles_limits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role = 'system_admin' and old.active
     and (new.role <> 'system_admin' or not new.active) then
    if not exists (select 1 from public.profiles where role = 'system_admin' and active and id <> new.id) then
      raise exception 'Debe existir al menos un administrador de sistema activo.';
    end if;
  end if;
  if new.role = 'system_admin' and new.active then
    if (select count(*) from public.profiles where role = 'system_admin' and active and id <> new.id) >= 3 then
      raise exception 'Solo se permiten 3 administradores de sistema.';
    end if;
  end if;
  if new.role in ('warehouse_admin','user') and new.active and new.warehouse_id is null then
    raise exception 'Asigna un almacén a este usuario.';
  end if;
  if new.role = 'warehouse_admin' and new.active then
    if (select count(*) from public.profiles
         where role = 'warehouse_admin' and active and warehouse_id = new.warehouse_id and id <> new.id) >= 2 then
      raise exception 'Cada almacén puede tener como máximo 2 administradores de almacén.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_limits on public.profiles;
create trigger trg_profiles_limits before insert or update on public.profiles
  for each row execute function public.profiles_limits();

-- ---------------------------------------------------------------------
-- 4. MOVIMIENTO DE STOCK (todo el inventario pasa por aquí)
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_wh uuid, p_prod uuid, p_delta numeric, p_note uuid, p_service uuid, p_kind text, p_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
declare q numeric; pname text; wname text;
begin
  if p_wh is null then raise exception 'Falta indicar el almacén.'; end if;
  insert into public.inventory (warehouse_id, product_id, quantity)
  values (p_wh, p_prod, p_delta)
  on conflict (warehouse_id, product_id)
  do update set quantity = public.inventory.quantity + p_delta, updated_at = now()
  returning quantity into q;
  if q < 0 then
    select name into pname from public.products where id = p_prod;
    select name into wname from public.warehouses where id = p_wh;
    raise exception 'Stock insuficiente de "%" en "%" (quedaría en %).', pname, wname, q;
  end if;
  insert into public.inventory_movements (warehouse_id, product_id, delta, movement_type, unit_cost, note_id, service_id, created_by)
  values (p_wh, p_prod, p_delta, p_kind, p_cost, p_note, p_service, auth.uid());
end $$;

-- Aplica (+1) o revierte (-1) el efecto de una nota sobre el inventario
create or replace function public.note_effect(p_note uuid, p_sign int) returns void
language plpgsql security definer set search_path = public as $$
declare n public.notes%rowtype; it record; k text; v_have numeric; v_cost numeric;
begin
  select * into n from public.notes where id = p_note;
  k := case when n.type in ('entry','fuel_in') then 'in'
            when n.type in ('exit','fuel_out','agro_out','parts_out') then 'out'
            else 'transfer' end;
  for it in select * from public.note_items where note_id = p_note loop
    if k = 'in' then
      -- El precio se define en la nota de ingreso: el costo del producto es el promedio ponderado
      if p_sign = 1 and it.unit_cost > 0 then
        select coalesce(sum(greatest(quantity,0)),0) into v_have from public.inventory where product_id = it.product_id;
        select cost into v_cost from public.products where id = it.product_id;
        update public.products set cost = case when v_have > 0
            then round((v_have * v_cost + it.qty * it.unit_cost) / (v_have + it.qty), 4)
            else it.unit_cost end
          where id = it.product_id;
      end if;
      perform public.adjust_stock(n.warehouse_id, it.product_id, it.qty * p_sign, n.id, null, n.type, it.unit_cost);
    elsif k = 'out' then
      perform public.adjust_stock(n.warehouse_id, it.product_id, -it.qty * p_sign, n.id, null, n.type, it.unit_cost);
    else
      if n.status in ('despachado','recibido') then
        perform public.adjust_stock(n.from_warehouse_id, it.product_id, -coalesce(it.qty_sent, it.qty) * p_sign, n.id, null, n.type || '_out', it.unit_cost);
      end if;
      if n.status = 'recibido' then
        perform public.adjust_stock(n.to_warehouse_id, it.product_id, coalesce(it.qty_received, it.qty_sent, it.qty) * p_sign, n.id, null, n.type || '_in', it.unit_cost);
      end if;
    end if;
  end loop;
  if p_sign = -1 then
    delete from public.inventory_movements where note_id = p_note;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. GUARDAR / ELIMINAR NOTAS  (se ejecuta todo o nada)
-- ---------------------------------------------------------------------
create or replace function public.save_note(p_note jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role  text := public.my_role();
  v_wh    uuid := public.my_warehouse();
  v_sys   boolean := (public.my_role() = 'system_admin');
  v_id    uuid := nullif(p_note->>'id','')::uuid;
  v_type  text := p_note->>'type';
  v_tr    boolean := (p_note->>'type') in ('transfer','request');
  v_old   public.notes%rowtype;
  v_num   int;
  v_wid   uuid := nullif(p_note->>'warehouse_id','')::uuid;
  v_from  uuid := nullif(p_note->>'from_warehouse_id','')::uuid;
  v_to    uuid := nullif(p_note->>'to_warehouse_id','')::uuid;
  v_status text;
  v_edit_items boolean := true;
  v_is_from boolean; v_is_to boolean;
  v_order text[] := array['pendiente','aprobado','preparando','despachado','recibido'];
  v_oi int; v_ni int;
  it jsonb; v_pos int := 0;
  v_hm numeric; v_km numeric;
begin
  if v_role is null then raise exception 'Tu usuario no está activo.'; end if;
  if v_type is null or v_type not in ('entry','exit','transfer','request','fuel_in','fuel_out','agro_out','parts_out') then
    raise exception 'Tipo de nota no válido.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un ítem a la nota.';
  end if;

  if v_tr then
    if v_type = 'request' and v_from is null then
      select id into v_from from public.warehouses where is_central limit 1;
    end if;
    if v_from is null or v_to is null then raise exception 'Indica el almacén de origen y el de destino.'; end if;
    if v_from = v_to then raise exception 'El origen y el destino deben ser distintos.'; end if;
    v_wid := case when v_type = 'request' then v_to else v_from end;
  elsif v_wid is null then
    raise exception 'Indica el almacén.';
  end if;

  if v_id is null then
    -- ---------- NOTA NUEVA ----------
    if not v_sys and v_wid is distinct from v_wh then
      raise exception 'Solo puedes registrar notas de tu propio almacén.';
    end if;
    insert into public.note_counters (type, last) values (v_type, 1)
      on conflict (type) do update set last = public.note_counters.last + 1
      returning last into v_num;
    v_status := case when v_tr then 'pendiente' else 'registrada' end;
    insert into public.notes (type, number, note_date, note_time, warehouse_id, from_warehouse_id, to_warehouse_id,
        supplier_id, asset_id, status, reason, priority, person_delivers, person_receives, observations, extra, created_by)
    values (v_type, v_num,
        coalesce(nullif(p_note->>'note_date','')::date, current_date),
        coalesce(nullif(p_note->>'note_time','')::time, localtime),
        v_wid, case when v_tr then v_from end, case when v_tr then v_to end,
        nullif(p_note->>'supplier_id','')::uuid, nullif(p_note->>'asset_id','')::uuid,
        v_status, p_note->>'reason', p_note->>'priority', p_note->>'person_delivers',
        p_note->>'person_receives', p_note->>'observations',
        coalesce(p_note->'extra','{}'::jsonb), auth.uid())
    returning id into v_id;
  else
    -- ---------- NOTA EXISTENTE ----------
    select * into v_old from public.notes where id = v_id for update;
    if not found then raise exception 'La nota ya no existe.'; end if;
    if v_old.type <> v_type then raise exception 'Tipo de nota no coincide.'; end if;
    v_is_from := (v_wh is not null and v_wh = v_old.from_warehouse_id);
    v_is_to   := (v_wh is not null and v_wh = v_old.to_warehouse_id);
    v_status  := v_old.status;

    if v_tr then
      if not (v_sys or v_is_from or v_is_to) then raise exception 'No tienes acceso a esta nota.'; end if;
      v_status := coalesce(nullif(p_note->>'status',''), v_old.status);
      if v_type = 'request' and v_status not in (v_old.status, 'cancelado') then
        raise exception 'Para aprobar un pedido usa el botón "Aprobar y generar nota de traspaso".';
      end if;
      if v_status <> v_old.status then
        if v_status = 'cancelado' then
          if not (v_sys or (v_role = 'warehouse_admin' and (v_is_from or v_is_to)) or v_old.status = 'pendiente') then
            raise exception 'No puedes cancelar esta nota.';
          end if;
          if v_old.status in ('recibido','cancelado') and not v_sys then
            raise exception 'La nota ya está cerrada.';
          end if;
        else
          v_oi := array_position(v_order, v_old.status);
          v_ni := array_position(v_order, v_status);
          if v_ni is null then raise exception 'Estado no válido.'; end if;
          if not v_sys and (v_oi is null or v_ni <> v_oi + 1) then
            raise exception 'El estado debe avanzar paso a paso: Pendiente > Aprobado > Preparando > Despachado > Recibido.';
          end if;
          if v_status = 'aprobado' and not (v_sys or (v_role = 'warehouse_admin' and v_is_from)) then
            raise exception 'Solo el administrador del almacén de origen puede aprobar.';
          end if;
          if v_status in ('preparando','despachado') and not (v_sys or v_is_from) then
            raise exception 'Solo el almacén de origen puede preparar y despachar.';
          end if;
          if v_status = 'recibido' and not (v_sys or v_is_to) then
            raise exception 'Solo el almacén de destino puede confirmar la recepción.';
          end if;
        end if;
      end if;
      v_edit_items := v_sys
        or (v_is_to   and v_old.status = 'pendiente')
        or (v_is_from and v_old.status in ('pendiente','aprobado','preparando'))
        or (v_is_to   and v_old.status = 'despachado' and v_status = 'recibido');
      if v_old.status in ('recibido','cancelado') and not v_sys then v_edit_items := false; end if;
      if v_type = 'request' and v_old.status <> 'pendiente' then v_edit_items := false; end if;
    else
      if not (v_sys or v_old.warehouse_id = v_wh) then raise exception 'No tienes acceso a esta nota.'; end if;
      v_wid := v_old.warehouse_id;
    end if;

    perform public.note_effect(v_id, -1);   -- deshace lo anterior
    update public.notes set
        note_date = coalesce(nullif(p_note->>'note_date','')::date, note_date),
        note_time = coalesce(nullif(p_note->>'note_time','')::time, note_time),
        supplier_id = nullif(p_note->>'supplier_id','')::uuid,
        asset_id = nullif(p_note->>'asset_id','')::uuid,
        status = v_status, reason = p_note->>'reason', priority = p_note->>'priority',
        person_delivers = p_note->>'person_delivers', person_receives = p_note->>'person_receives',
        observations = p_note->>'observations', extra = coalesce(p_note->'extra','{}'::jsonb),
        updated_at = now()
      where id = v_id;
    if v_edit_items then delete from public.note_items where note_id = v_id; end if;
  end if;

  if v_edit_items then
    for it in select * from jsonb_array_elements(p_items) loop
      v_pos := v_pos + 1;
      if nullif(it->>'product_id','') is null then raise exception 'Hay un ítem sin producto.'; end if;
      if coalesce(nullif(it->>'qty','')::numeric, 0) <= 0 then raise exception 'Todas las cantidades deben ser mayores a cero.'; end if;
      if v_type in ('entry','fuel_in') and coalesce(nullif(it->>'unit_cost','')::numeric, 0) <= 0 then
        raise exception 'Escribe el precio unitario de ingreso en todos los ítems.';
      end if;
      insert into public.note_items (note_id, product_id, qty, qty_sent, qty_received, unit_cost, observation, pos)
      values (v_id, (it->>'product_id')::uuid, (it->>'qty')::numeric,
              nullif(it->>'qty_sent','')::numeric, nullif(it->>'qty_received','')::numeric,
              case when v_type in ('entry','fuel_in') then (it->>'unit_cost')::numeric
                   else coalesce((select cost from public.products where id = (it->>'product_id')::uuid), 0) end,
              it->>'observation', v_pos);
    end loop;
  end if;

  perform public.note_effect(v_id, 1);       -- aplica lo nuevo (valida stock)

  if v_type = 'fuel_out' and nullif(p_note->>'asset_id','') is not null then
    v_hm := nullif(p_note->'extra'->>'hourmeter','')::numeric;
    v_km := nullif(p_note->'extra'->>'mileage','')::numeric;
    update public.assets set hourmeter = greatest(coalesce(hourmeter,0), v_hm),
                             mileage   = greatest(coalesce(mileage,0), v_km)
      where id = (p_note->>'asset_id')::uuid and (v_hm is not null or v_km is not null);
  end if;
  return v_id;
end $$;

create or replace function public.delete_note(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n public.notes%rowtype;
begin
  select * into n from public.notes where id = p_id for update;
  if not found then return; end if;
  if not (public.is_sysadmin()
          or (public.my_role() = 'warehouse_admin'
              and public.my_warehouse() in (n.warehouse_id, n.from_warehouse_id))) then
    raise exception 'Solo un administrador puede eliminar notas.';
  end if;
  if n.type = 'request' and n.status = 'aprobado' then
    raise exception 'No se puede eliminar un pedido aprobado: ya generó una nota de traspaso.';
  end if;
  perform public.note_effect(p_id, -1);
  if n.type = 'transfer' and n.ref_note_id is not null then
    update public.notes set status = 'pendiente', updated_at = now() where id = n.ref_note_id and type = 'request';
  end if;
  delete from public.notes where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. SERVICIOS: repuestos descuentan stock, estado actualiza el equipo
-- ---------------------------------------------------------------------
create or replace function public.service_part_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_wh uuid; v_sid uuid;
begin
  v_sid := coalesce(new.service_id, old.service_id);
  if tg_op in ('UPDATE','DELETE') then
    select warehouse_id into v_wh from public.services where id = old.service_id;
    if v_wh is not null then
      perform public.adjust_stock(v_wh, old.product_id, old.qty, null, old.service_id, 'service_return', old.unit_cost);
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select warehouse_id into v_wh from public.services where id = new.service_id;
    perform public.adjust_stock(v_wh, new.product_id, -new.qty, null, new.service_id, 'service', new.unit_cost);
  end if;
  update public.services
     set parts_cost = coalesce((select sum(qty * unit_cost) from public.service_parts where service_id = v_sid), 0)
   where id = v_sid;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_service_part_stock on public.service_parts;
create trigger trg_service_part_stock after insert or update or delete on public.service_parts
  for each row execute function public.service_part_stock();

create or replace function public.service_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.service_parts where service_id = old.id;  -- devuelve el stock
  return old;
end $$;
drop trigger if exists trg_service_before_delete on public.services;
create trigger trg_service_before_delete before delete on public.services
  for each row execute function public.service_before_delete();

create or replace function public.service_asset_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.asset_id is not null then
    if new.status = 'en_reparacion' then
      update public.assets set status = 'en_reparacion' where id = new.asset_id and status <> 'baja';
    elsif new.status in ('terminado','cancelado') then
      update public.assets set status = 'activo' where id = new.asset_id and status = 'en_reparacion';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_service_asset_status on public.services;
create trigger trg_service_asset_status after insert or update of status on public.services
  for each row execute function public.service_asset_status();

-- ---------------------------------------------------------------------
-- 7. ADMINISTRACIÓN DE USUARIOS DESDE EL PROGRAMA
-- ---------------------------------------------------------------------
create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_sysadmin() then raise exception 'Solo el administrador de sistema puede hacer esto.'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_sysadmin() then raise exception 'Solo el administrador de sistema puede hacer esto.'; end if;
  if p_user = auth.uid() then raise exception 'No puedes eliminar tu propio usuario.'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'system_admin' and active)
     and (select count(*) from public.profiles where role = 'system_admin' and active) <= 1 then
    raise exception 'No se puede eliminar al único administrador de sistema.';
  end if;
  delete from auth.users where id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- 8. SEGURIDAD (cada persona ve solo lo que le corresponde)
-- ---------------------------------------------------------------------
alter table public.app_settings        enable row level security;
alter table public.warehouses          enable row level security;
alter table public.profiles            enable row level security;
alter table public.company_settings    enable row level security;
alter table public.categories          enable row level security;
alter table public.units               enable row level security;
alter table public.suppliers           enable row level security;
alter table public.products            enable row level security;
alter table public.inventory           enable row level security;
alter table public.assets              enable row level security;
alter table public.notes               enable row level security;
alter table public.note_items          enable row level security;
alter table public.note_counters       enable row level security;
alter table public.services            enable row level security;
alter table public.service_parts       enable row level security;
alter table public.inventory_movements enable row level security;

do $$
declare t text;
begin
  -- Tablas de consulta general: leen todos los usuarios activos; escriben los administradores
  foreach t in array array['categories','units','suppliers','products'] loop
    execute format('drop policy if exists p_read on public.%I', t);
    execute format('drop policy if exists p_write on public.%I', t);
    execute format('create policy p_read on public.%I for select using (public.my_role() is not null)', t);
    execute format($f$create policy p_write on public.%I for all
       using (public.my_role() in ('system_admin','warehouse_admin'))
       with check (public.my_role() in ('system_admin','warehouse_admin'))$f$, t);
  end loop;
end $$;

drop policy if exists p_read on public.warehouses;
drop policy if exists p_write on public.warehouses;
create policy p_read  on public.warehouses for select using (public.my_role() is not null);
create policy p_write on public.warehouses for all using (public.is_sysadmin()) with check (public.is_sysadmin());

drop policy if exists p_read on public.company_settings;
drop policy if exists p_write on public.company_settings;
create policy p_read  on public.company_settings for select using (public.my_role() is not null);
create policy p_write on public.company_settings for all using (public.is_sysadmin()) with check (public.is_sysadmin());

drop policy if exists p_read on public.profiles;
drop policy if exists p_write on public.profiles;
create policy p_read  on public.profiles for select using (id = auth.uid() or public.my_role() is not null);
create policy p_write on public.profiles for all using (public.is_sysadmin()) with check (public.is_sysadmin());

drop policy if exists p_read on public.assets;
drop policy if exists p_write on public.assets;
create policy p_read  on public.assets for select using (public.my_role() is not null);
create policy p_write on public.assets for all
  using (public.is_sysadmin() or (public.my_role() = 'warehouse_admin' and warehouse_id = public.my_warehouse()))
  with check (public.is_sysadmin() or (public.my_role() = 'warehouse_admin' and warehouse_id = public.my_warehouse()));

drop policy if exists p_read on public.inventory;
create policy p_read on public.inventory for select using (public.can_see_wh(warehouse_id));

drop policy if exists p_read on public.inventory_movements;
create policy p_read on public.inventory_movements for select using (public.can_see_wh(warehouse_id));

drop policy if exists p_read on public.notes;
create policy p_read on public.notes for select using (
  public.my_role() is not null and (
    public.is_sysadmin()
    or warehouse_id = public.my_warehouse()
    or from_warehouse_id = public.my_warehouse()
    or to_warehouse_id = public.my_warehouse()));

drop policy if exists p_read on public.note_items;
create policy p_read on public.note_items for select
  using (exists (select 1 from public.notes n where n.id = note_id));

drop policy if exists p_read on public.services;
drop policy if exists p_ins on public.services;
drop policy if exists p_upd on public.services;
drop policy if exists p_del on public.services;
create policy p_read on public.services for select using (public.can_see_wh(warehouse_id));
create policy p_ins  on public.services for insert with check (public.can_see_wh(warehouse_id));
create policy p_upd  on public.services for update using (public.can_see_wh(warehouse_id)) with check (public.can_see_wh(warehouse_id));
create policy p_del  on public.services for delete using (public.can_see_wh(warehouse_id) and public.my_role() in ('system_admin','warehouse_admin'));

drop policy if exists p_all on public.service_parts;
create policy p_all on public.service_parts for all
  using (exists (select 1 from public.services s where s.id = service_id))
  with check (exists (select 1 from public.services s where s.id = service_id));

-- Las funciones que modifican datos solo las puede llamar un usuario con sesión
revoke execute on function public.save_note(jsonb, jsonb)          from public, anon;
revoke execute on function public.delete_note(uuid)                from public, anon;
revoke execute on function public.admin_set_password(uuid, text)   from public, anon;
revoke execute on function public.admin_delete_user(uuid)          from public, anon;
revoke execute on function public.adjust_stock(uuid,uuid,numeric,uuid,uuid,text,numeric) from public, anon, authenticated;
revoke execute on function public.note_effect(uuid, int)           from public, anon, authenticated;
grant  execute on function public.save_note(jsonb, jsonb)          to authenticated;
grant  execute on function public.delete_note(uuid)                to authenticated;
grant  execute on function public.admin_set_password(uuid, text)   to authenticated;
grant  execute on function public.admin_delete_user(uuid)          to authenticated;
grant  execute on function public.system_needs_setup()             to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8B. NUEVAS FUNCIONES Y TABLAS (unidades de manejo, aprobación de pedidos,
--     control de horómetros y control de mantenimiento)
-- ---------------------------------------------------------------------
alter table public.units add column if not exists base_unit   text;
alter table public.units add column if not exists factor      numeric(14,3);
alter table public.units add column if not exists description  text;

-- Aprobar un pedido: genera automáticamente la nota de traspaso
create or replace function public.approve_request(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.notes%rowtype; v_num int; v_new uuid;
begin
  select * into r from public.notes where id = p_id and type = 'request' for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if r.status <> 'pendiente' then raise exception 'Solo se pueden aprobar pedidos en estado Pendiente.'; end if;
  if not (public.is_sysadmin() or (public.my_role() = 'warehouse_admin' and public.my_warehouse() = r.from_warehouse_id)) then
    raise exception 'Solo el administrador del almacén que surte (o un administrador de sistema) puede aprobar.';
  end if;
  insert into public.note_counters (type, last) values ('transfer', 1)
    on conflict (type) do update set last = public.note_counters.last + 1 returning last into v_num;
  insert into public.notes (type, number, note_date, note_time, warehouse_id, from_warehouse_id, to_warehouse_id,
      status, person_delivers, observations, extra, ref_note_id, created_by)
  values ('transfer', v_num, current_date, localtime, r.from_warehouse_id, r.from_warehouse_id, r.to_warehouse_id,
      'preparando', r.person_delivers, 'Generado del pedido Nº ' || lpad(r.number::text, 6, '0'), '{}'::jsonb, r.id, auth.uid())
  returning id into v_new;
  insert into public.note_items (note_id, product_id, qty, unit_cost, observation, pos)
    select v_new, product_id, qty, coalesce((select cost from public.products p where p.id = note_items.product_id), 0), observation, pos
    from public.note_items where note_id = p_id;
  update public.notes set status = 'aprobado', updated_at = now() where id = p_id;
  return v_new;
end $$;

-- CONTROL DE HORÓMETROS
create table if not exists public.hourmeter_logs (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated by default as identity unique,
  log_date      date not null default current_date,
  asset_id      uuid not null references public.assets(id) on delete cascade,
  warehouse_id  uuid references public.warehouses(id),
  operator      text not null,
  shift         text not null default 'Mañana' check (shift in ('Mañana','Tarde','Noche')),
  hm_start      numeric(12,1) not null check (hm_start >= 0),
  hm_end        numeric(12,1) not null check (hm_end >= 0),
  hours         numeric(12,1) generated always as (hm_end - hm_start) stored,
  fuel_gal      numeric(12,2) not null default 0 check (fuel_gal >= 0),
  observations  text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (hm_end >= hm_start)
);
create index if not exists hm_logs_idx on public.hourmeter_logs (asset_id, log_date);

create or replace function public.hm_log_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select warehouse_id into new.warehouse_id from public.assets where id = new.asset_id;
  if new.warehouse_id is null then raise exception 'La máquina no tiene almacén o base asignada.'; end if;
  if not public.can_see_wh(new.warehouse_id) then raise exception 'No tienes acceso a esta máquina.'; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_hm_log_before on public.hourmeter_logs;
create trigger trg_hm_log_before before insert or update on public.hourmeter_logs
  for each row execute function public.hm_log_before();

create or replace function public.hm_log_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.assets a set hourmeter = (select max(hm_end) from public.hourmeter_logs where asset_id = a.id)
    where a.id = coalesce(new.asset_id, old.asset_id)
      and exists (select 1 from public.hourmeter_logs where asset_id = a.id);
  return null;
end $$;
drop trigger if exists trg_hm_log_after on public.hourmeter_logs;
create trigger trg_hm_log_after after insert or update or delete on public.hourmeter_logs
  for each row execute function public.hm_log_after();

-- CONTROL DE MANTENIMIENTO CON ALERTAS
create table if not exists public.maintenance_logs (
  id               uuid primary key default gen_random_uuid(),
  number           bigint generated by default as identity unique,
  log_date         date not null default current_date,
  asset_id         uuid not null references public.assets(id) on delete cascade,
  warehouse_id     uuid references public.warehouses(id),
  mechanic         text not null,
  mtype            text not null default 'Preventivo' check (mtype in ('Preventivo','Correctivo','Predictivo')),
  start_at         timestamptz not null,
  end_at           timestamptz,
  hm_in            numeric(12,1) not null check (hm_in >= 0),
  hm_out           numeric(12,1) check (hm_out >= 0),
  next_change_hrs  numeric(12,1) check (next_change_hrs >= 0),
  parts            text,
  cost             numeric(14,2) not null default 0 check (cost >= 0),
  status           text not null default 'Activa' check (status in ('Activa','En Taller','Espera de repuestos','Finalizado')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (end_at is null or end_at >= start_at),
  check (hm_out is null or hm_out >= hm_in)
);
create index if not exists mt_logs_idx on public.maintenance_logs (asset_id, log_date);

create or replace function public.mt_log_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select warehouse_id into new.warehouse_id from public.assets where id = new.asset_id;
  if new.warehouse_id is null then raise exception 'La máquina no tiene almacén o base asignada.'; end if;
  if not public.can_see_wh(new.warehouse_id) then raise exception 'No tienes acceso a esta máquina.'; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_mt_log_before on public.maintenance_logs;
create trigger trg_mt_log_before before insert or update on public.maintenance_logs
  for each row execute function public.mt_log_before();

create or replace function public.mt_log_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hm_out is not null then
    update public.assets set hourmeter = greatest(coalesce(hourmeter,0), new.hm_out) where id = new.asset_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_mt_log_after on public.maintenance_logs;
create trigger trg_mt_log_after after insert or update on public.maintenance_logs
  for each row execute function public.mt_log_after();

alter table public.hourmeter_logs   enable row level security;
alter table public.maintenance_logs enable row level security;
drop policy if exists p_read on public.hourmeter_logs;
drop policy if exists p_ins  on public.hourmeter_logs;
drop policy if exists p_upd  on public.hourmeter_logs;
drop policy if exists p_del  on public.hourmeter_logs;
create policy p_read on public.hourmeter_logs for select using (public.can_see_wh(warehouse_id));
create policy p_ins  on public.hourmeter_logs for insert with check (public.my_role() is not null);
create policy p_upd  on public.hourmeter_logs for update using (public.can_see_wh(warehouse_id)) with check (public.my_role() is not null);
create policy p_del  on public.hourmeter_logs for delete using (public.can_see_wh(warehouse_id) and public.my_role() in ('system_admin','warehouse_admin'));
drop policy if exists p_read on public.maintenance_logs;
drop policy if exists p_ins  on public.maintenance_logs;
drop policy if exists p_upd  on public.maintenance_logs;
drop policy if exists p_del  on public.maintenance_logs;
create policy p_read on public.maintenance_logs for select using (public.can_see_wh(warehouse_id));
create policy p_ins  on public.maintenance_logs for insert with check (public.my_role() is not null);
create policy p_upd  on public.maintenance_logs for update using (public.can_see_wh(warehouse_id)) with check (public.my_role() is not null);
create policy p_del  on public.maintenance_logs for delete using (public.can_see_wh(warehouse_id) and public.my_role() in ('system_admin','warehouse_admin'));

revoke execute on function public.approve_request(uuid) from public, anon;
grant  execute on function public.approve_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. DATOS INICIALES
-- ---------------------------------------------------------------------
insert into public.company_settings (id, name) values (1, 'Mi Empresa') on conflict (id) do nothing;

insert into public.categories (name) values
  ('Repuestos'), ('Combustible'), ('Agroquímicos'), ('Pulpería'), ('Otros')
on conflict (name) do nothing;

insert into public.units (name, abbreviation) values
  ('Unidad','und'), ('Litro','lt'), ('Galón','gl'), ('Kilogramo','kg'), ('Caja','cja'),
  ('Bolsa','bls'), ('Frasco','fco'), ('Par','par'), ('Metro','m'), ('Paquete','paq'),
  ('Balde','bld'), ('Tambor','tbr')
on conflict (name) do nothing;

insert into public.warehouses (code, name, is_central)
select 'CENTRAL', 'Almacén Central', true
where not exists (select 1 from public.warehouses where is_central);

-- ---------------------------------------------------------------------
-- 10. ALMACENAMIENTO DE FOTOS (bucket "fotos", público)
--     Si esta parte diera error, el resto igual queda instalado y solo
--     tendrías que crear el bucket a mano (ver instrucciones).
-- ---------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
  on conflict (id) do update set public = true;

  drop policy if exists "fotos_ver"      on storage.objects;
  drop policy if exists "fotos_subir"    on storage.objects;
  drop policy if exists "fotos_cambiar"  on storage.objects;
  drop policy if exists "fotos_borrar"   on storage.objects;
  create policy "fotos_ver"     on storage.objects for select using (bucket_id = 'fotos');
  create policy "fotos_subir"   on storage.objects for insert to authenticated with check (bucket_id = 'fotos');
  create policy "fotos_cambiar" on storage.objects for update to authenticated using (bucket_id = 'fotos');
  create policy "fotos_borrar"  on storage.objects for delete to authenticated using (bucket_id = 'fotos');
exception when others then
  raise notice 'No se pudo crear el bucket automaticamente (%). Crealo a mano con el nombre: fotos', sqlerrm;
end $$;

-- FIN DEL SCRIPT
