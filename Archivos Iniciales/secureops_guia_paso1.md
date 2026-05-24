# SecureOps — Guía Paso 1: Configuración Supabase

## 1. Crear el proyecto en Supabase

1. Ir a https://supabase.com y crear cuenta (gratis)
2. Click en **New project**
3. Configurar:
   - **Name:** secureops
   - **Database Password:** (guardar esta contraseña, la necesitarás)
   - **Region:** South America (São Paulo) — la más cercana a Chile
4. Esperar ~2 minutos mientras se crea el proyecto

---

## 2. Ejecutar el SQL principal

1. En el panel de Supabase, ir a **SQL Editor** (ícono de base de datos en el menú izquierdo)
2. Click en **New query**
3. Pegar el contenido completo de `secureops_supabase_paso1.sql`
4. Click en **Run** (o Ctrl+Enter)
5. Verificar que dice "Success" sin errores

### Verificar que todo se creó correctamente:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```
Deberías ver: `checklist_templates`, `daily_reports`, `gantt_tasks`, `pdf_schedules`, `profiles`, `project_members`, `projects`

---

## 3. Crear los Storage Buckets

Ir a **Storage** en el menú izquierdo → **New bucket** → crear estos 4:

| Bucket          | Tipo    | Max size |
|-----------------|---------|----------|
| report-photos   | Private | 10 MB    |
| report-audios   | Private | 25 MB    |
| report-pdfs     | Private | 10 MB    |
| gantt-files     | Private | 5 MB     |

---

## 4. Configurar políticas de Storage

Para cada bucket, ir a **Storage > Policies** y agregar:

### report-photos
- **INSERT:** `(bucket_id = 'report-photos' AND auth.uid() IS NOT NULL)`
- **SELECT:** `(bucket_id = 'report-photos' AND auth.uid() IS NOT NULL)`

### report-audios
- **INSERT:** `(bucket_id = 'report-audios' AND auth.uid() IS NOT NULL)`
- **SELECT:** `(bucket_id = 'report-audios' AND auth.uid() IS NOT NULL)`

### report-pdfs
- Solo admin y gerente pueden descargar (configurar desde la app web)

### gantt-files
- **INSERT/SELECT:** Solo admin y gerente

---

## 5. Configurar autenticación

1. Ir a **Authentication > Providers**
2. Asegurarse que **Email** está habilitado
3. En **Authentication > Email Templates**, personalizar los correos con el nombre SecureOps

### Crear el primer usuario admin:
1. Ir a **Authentication > Users** → **Add user**
2. Crear usuario con tu email
3. Luego en **SQL Editor**, ejecutar:
```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'tu@email.cl';
```

---

## 6. Obtener las credenciales para la app web

Ir a **Settings > API**:

- **Project URL:** `https://xxxxxxxxxxxx.supabase.co`
- **anon public key:** `eyJ...` (para el frontend)
- **service_role key:** `eyJ...` (SOLO para Edge Functions, nunca en frontend)

Guardar estas credenciales — las necesitarás en el Paso 2 (Web App React).

---

## 7. Variables de entorno para el proyecto React

Crear un archivo `.env.local` en la raíz del proyecto React:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Checklist final Paso 1

- [ ] Proyecto Supabase creado (región São Paulo)
- [ ] SQL ejecutado sin errores (7 tablas creadas)
- [ ] 4 Storage buckets creados
- [ ] Políticas de Storage configuradas
- [ ] Usuario admin creado y actualizado a rol 'admin'
- [ ] Credenciales guardadas (URL + anon key)

Una vez completado, avanzar al **Paso 2: Web App React**.
