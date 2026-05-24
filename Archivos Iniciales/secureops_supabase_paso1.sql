-- ============================================================
-- SECUREOPS — Paso 1: Configuración completa de Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Orden: ejecutar de arriba hacia abajo en un solo bloque
-- ============================================================


-- ============================================================
-- 0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. TIPOS ENUM
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'gerente', 'supervisor', 'capataz');

CREATE TYPE project_status AS ENUM ('active', 'delayed', 'blocked', 'done', 'paused');

CREATE TYPE report_status AS ENUM ('pending', 'processing', 'done', 'failed');

CREATE TYPE schedule_type AS ENUM ('daily', 'weekly', 'on_blocker');


-- ============================================================
-- 2. TABLA: profiles
-- Extiende auth.users de Supabase con datos del usuario
-- ============================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'capataz',
  avatar_url    TEXT,
  phone         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger: crea perfil automáticamente al registrar usuario en Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Sin nombre'),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'capataz')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- 3. TABLA: projects
-- ============================================================

CREATE TABLE projects (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  client_name        TEXT NOT NULL,
  location           TEXT,
  description        TEXT,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  status             project_status NOT NULL DEFAULT 'active',
  -- Resumen de equipos a instalar (JSON flexible)
  -- Ej: {"cameras": 8, "sirens": 3, "speakers": 0, "radars": 0, "cabinets": 2}
  equipment_summary  JSONB NOT NULL DEFAULT '{}',
  -- Datos de contacto del cliente para envío de informes
  client_emails      TEXT[] NOT NULL DEFAULT '{}',
  gantt_file_url     TEXT,
  created_by         UUID NOT NULL REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 4. TABLA: gantt_tasks
-- Tareas de la carta Gantt de cada proyecto
-- ============================================================

CREATE TABLE gantt_tasks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_name        TEXT NOT NULL,
  planned_start    DATE NOT NULL,
  planned_end      DATE NOT NULL,
  actual_progress  INT NOT NULL DEFAULT 0 CHECK (actual_progress BETWEEN 0 AND 100),
  order_index      INT NOT NULL DEFAULT 0,
  depends_on       UUID REFERENCES gantt_tasks(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER gantt_tasks_updated_at
  BEFORE UPDATE ON gantt_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índice para consultas frecuentes por proyecto
CREATE INDEX idx_gantt_tasks_project ON gantt_tasks(project_id, order_index);


-- ============================================================
-- 5. TABLA: project_members
-- Cuadrilla asignada a cada proyecto + control de acceso
-- ============================================================

CREATE TABLE project_members (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_in_project  TEXT NOT NULL,
  -- Ej: 'Capataz', 'Electricista', 'Ayudante', 'Supervisor'
  can_report       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Solo quienes tienen can_report=true pueden enviar reportes desde la app
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_project ON project_members(project_id);


-- ============================================================
-- 6. TABLA: checklist_templates
-- Plantillas de checklist reutilizables por proyecto/fase
-- ============================================================

CREATE TABLE checklist_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL DEFAULT 'general',
  -- Ej: 'mañana', 'tarde', 'cierre'
  items       JSONB NOT NULL DEFAULT '[]',
  -- Ej: [{"id":"1","text":"Verificar materiales","required":true}, ...]
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 7. TABLA: daily_reports
-- Reporte diario enviado desde la app móvil
-- ============================================================

CREATE TABLE daily_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reporter_id           UUID NOT NULL REFERENCES profiles(id),
  report_date           DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Checklist completado
  -- Ej: [{"id":"1","text":"Verificar materiales","done":true}, ...]
  checklist_items       JSONB NOT NULL DEFAULT '[]',
  tasks_total           INT NOT NULL DEFAULT 0,
  tasks_done            INT NOT NULL DEFAULT 0,

  -- Archivos (URLs en Supabase Storage)
  audio_url             TEXT,
  audio_duration_sec    INT,
  photo_urls            TEXT[] NOT NULL DEFAULT '{}',

  -- Bloqueo
  has_blocker           BOOLEAN NOT NULL DEFAULT FALSE,
  blocker_description   TEXT,
  blocker_requires      TEXT,
  -- Qué se necesita para desbloquear

  -- Generado por IA
  audio_transcript      TEXT,
  ai_summary            TEXT,
  ai_next_day_plan      TEXT,

  -- PDF generado
  pdf_url               TEXT,

  -- Estado del procesamiento IA
  status                report_status NOT NULL DEFAULT 'pending',
  error_message         TEXT,

  -- Metadata
  location_lat          DECIMAL(9,6),
  location_lng          DECIMAL(9,6),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un supervisor solo puede enviar un reporte por proyecto por día
  UNIQUE(project_id, reporter_id, report_date)
);

CREATE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_daily_reports_project ON daily_reports(project_id, report_date DESC);
CREATE INDEX idx_daily_reports_reporter ON daily_reports(reporter_id);
CREATE INDEX idx_daily_reports_status ON daily_reports(status);
CREATE INDEX idx_daily_reports_blocker ON daily_reports(has_blocker) WHERE has_blocker = TRUE;


-- ============================================================
-- 8. TABLA: pdf_schedules
-- Configuración de envío automático de informes PDF
-- ============================================================

CREATE TABLE pdf_schedules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_type   schedule_type NOT NULL DEFAULT 'daily',
  send_time     TIME NOT NULL DEFAULT '18:00:00',
  recipients    TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at  TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- Control de acceso a nivel de fila — crítico para seguridad
-- ============================================================

-- Activar RLS en todas las tablas
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gantt_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_schedules     ENABLE ROW LEVEL SECURITY;


-- ── profiles ──────────────────────────────────────────────
-- Cada usuario ve y edita solo su propio perfil
-- Admin ve todos
CREATE POLICY "profiles: ver propio o admin"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "profiles: editar propio"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);


-- ── projects ──────────────────────────────────────────────
-- Ver: si eres miembro del proyecto o admin/gerente
CREATE POLICY "projects: ver si es miembro o admin"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );

-- Crear/editar: solo admin o gerente
CREATE POLICY "projects: crear si es admin o gerente"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );

CREATE POLICY "projects: editar si es admin o gerente"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );


-- ── gantt_tasks ───────────────────────────────────────────
-- Lectura: todos los miembros del proyecto
CREATE POLICY "gantt_tasks: ver si es miembro"
  ON gantt_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = gantt_tasks.project_id AND pm.user_id = auth.uid()
    )
  );

-- Escritura: solo admin o gerente
CREATE POLICY "gantt_tasks: modificar si es admin o gerente"
  ON gantt_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );


-- ── project_members ───────────────────────────────────────
CREATE POLICY "project_members: ver si es miembro del proyecto o admin"
  ON project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );

CREATE POLICY "project_members: gestionar si es admin o gerente"
  ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );


-- ── daily_reports ─────────────────────────────────────────
-- Ver: si eres el reportero, miembro del proyecto o admin/gerente
CREATE POLICY "daily_reports: ver si es miembro o admin"
  ON daily_reports FOR SELECT
  USING (
    reporter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = daily_reports.project_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );

-- Insertar: solo si can_report = true para ese proyecto
CREATE POLICY "daily_reports: insertar si puede reportar"
  ON daily_reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = daily_reports.project_id
        AND pm.user_id = auth.uid()
        AND pm.can_report = TRUE
    )
  );

-- Editar: solo el propio reporte y solo si está en estado pending
CREATE POLICY "daily_reports: editar propio si pending"
  ON daily_reports FOR UPDATE
  USING (
    reporter_id = auth.uid()
    AND status = 'pending'
  );


-- ── pdf_schedules ─────────────────────────────────────────
CREATE POLICY "pdf_schedules: ver y gestionar si es admin o gerente"
  ON pdf_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );


-- ── checklist_templates ───────────────────────────────────
CREATE POLICY "checklist_templates: ver si es miembro"
  ON checklist_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = checklist_templates.project_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "checklist_templates: gestionar si es admin o gerente"
  ON checklist_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'gerente')
    )
  );


-- ============================================================
-- 10. VISTAS ÚTILES
-- ============================================================

-- Vista: avance real vs planificado por proyecto
CREATE OR REPLACE VIEW project_progress AS
SELECT
  p.id AS project_id,
  p.name,
  p.status,
  p.start_date,
  p.end_date,
  ROUND(AVG(gt.actual_progress)) AS avg_progress,
  -- Avance planificado según fecha actual
  ROUND(
    LEAST(100,
      GREATEST(0,
        (CURRENT_DATE - p.start_date)::NUMERIC /
        NULLIF((p.end_date - p.start_date)::NUMERIC, 0) * 100
      )
    )
  ) AS planned_progress,
  COUNT(gt.id) AS total_tasks,
  COUNT(CASE WHEN gt.actual_progress = 100 THEN 1 END) AS completed_tasks
FROM projects p
LEFT JOIN gantt_tasks gt ON gt.project_id = p.id
GROUP BY p.id;


-- Vista: último reporte por proyecto
CREATE OR REPLACE VIEW latest_reports AS
SELECT DISTINCT ON (project_id)
  dr.*,
  pr.full_name AS reporter_name
FROM daily_reports dr
JOIN profiles pr ON pr.id = dr.reporter_id
ORDER BY project_id, report_date DESC, created_at DESC;


-- Vista: proyectos bloqueados activos
CREATE OR REPLACE VIEW active_blockers AS
SELECT
  dr.id AS report_id,
  dr.project_id,
  p.name AS project_name,
  dr.report_date,
  dr.blocker_description,
  dr.blocker_requires,
  pr.full_name AS reported_by,
  CURRENT_DATE - dr.report_date AS days_blocked
FROM daily_reports dr
JOIN projects p ON p.id = dr.project_id
JOIN profiles pr ON pr.id = dr.reporter_id
WHERE dr.has_blocker = TRUE
  AND p.status = 'blocked'
ORDER BY dr.report_date DESC;


-- ============================================================
-- 11. FUNCIÓN: calcular estado del proyecto automáticamente
-- Se puede llamar desde Edge Functions al recibir un reporte
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_project_status(p_project_id UUID)
RETURNS project_status AS $$
DECLARE
  v_avg_progress     INT;
  v_planned_progress INT;
  v_has_blocker      BOOLEAN;
  v_start            DATE;
  v_end              DATE;
BEGIN
  SELECT start_date, end_date INTO v_start, v_end
  FROM projects WHERE id = p_project_id;

  SELECT ROUND(AVG(actual_progress)) INTO v_avg_progress
  FROM gantt_tasks WHERE project_id = p_project_id;

  v_planned_progress := LEAST(100, GREATEST(0,
    (CURRENT_DATE - v_start)::NUMERIC /
    NULLIF((v_end - v_start)::NUMERIC, 0) * 100
  ))::INT;

  SELECT EXISTS (
    SELECT 1 FROM daily_reports
    WHERE project_id = p_project_id
      AND has_blocker = TRUE
      AND report_date >= CURRENT_DATE - INTERVAL '2 days'
  ) INTO v_has_blocker;

  IF v_has_blocker THEN
    RETURN 'blocked';
  ELSIF COALESCE(v_avg_progress, 0) >= 100 THEN
    RETURN 'done';
  ELSIF COALESCE(v_avg_progress, 0) < v_planned_progress - 10 THEN
    RETURN 'delayed';
  ELSE
    RETURN 'active';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 12. DATOS DE EJEMPLO (opcional — comentar en producción)
-- ============================================================

-- Usuario admin de prueba (crear primero en Auth, luego actualizar rol)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@tuempresa.cl';

-- Proyecto de ejemplo
INSERT INTO projects (name, client_name, location, start_date, end_date, equipment_summary, client_emails, created_by)
SELECT
  'Ruta 68 Km 12-45',
  'Autopista del Sol',
  'Ruta 68 Poniente, Región Metropolitana',
  '2025-04-01',
  '2025-05-04',
  '{"cameras": 8, "sirens": 3, "speakers": 0, "radars": 0, "cabinets": 2}',
  ARRAY['cliente@autopistasol.cl'],
  id
FROM profiles
WHERE role = 'admin'
LIMIT 1;

-- Tareas Gantt del proyecto de ejemplo
INSERT INTO gantt_tasks (project_id, task_name, planned_start, planned_end, actual_progress, order_index)
SELECT
  p.id,
  t.task_name,
  t.planned_start::DATE,
  t.planned_end::DATE,
  t.actual_progress,
  t.order_index
FROM projects p,
(VALUES
  ('Instalación de postes',    '2025-04-01', '2025-04-07', 100, 1),
  ('Tendido de cable',         '2025-04-05', '2025-04-12', 100, 2),
  ('Instalación de cámaras',   '2025-04-10', '2025-04-28',  82, 3),
  ('Gabinetes eléctricos',     '2025-04-14', '2025-04-25',  60, 4),
  ('Sirenas y altoparlantes',  '2025-04-22', '2025-04-28',   0, 5),
  ('Configuración de software','2025-04-26', '2025-05-01',   0, 6),
  ('Pruebas y cierre',         '2025-05-01', '2025-05-04',   0, 7)
) AS t(task_name, planned_start, planned_end, actual_progress, order_index)
WHERE p.name = 'Ruta 68 Km 12-45'
LIMIT 7;


-- ============================================================
-- 13. STORAGE BUCKETS
-- Ejecutar en: Supabase Dashboard > Storage > New bucket
-- O usar la API de administración (requiere service_role key)
-- ============================================================

-- NOTA: Los buckets no se crean con SQL estándar en Supabase.
-- Crear manualmente en el Dashboard > Storage > New bucket:
--
--   Bucket: report-photos   | Privado | Max file size: 10 MB
--   Bucket: report-audios   | Privado | Max file size: 25 MB
--   Bucket: report-pdfs     | Privado | Max file size: 10 MB
--   Bucket: gantt-files     | Privado | Max file size: 5 MB
--
-- Luego aplicar estas políticas de Storage:

-- Política para report-photos:
-- Usuarios pueden subir fotos solo a su propia carpeta
-- INSERT policy: (bucket_id = 'report-photos' AND auth.uid()::text = (storage.foldername(name))[1])
-- SELECT policy: miembros del proyecto pueden ver

-- Ver archivo README adjunto para las políticas de Storage completas.


-- ============================================================
-- FIN DEL SCRIPT
-- Verificar con:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public';
-- ============================================================
