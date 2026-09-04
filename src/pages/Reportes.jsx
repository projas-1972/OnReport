import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { supabase } from '../lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

// Fecha de hoy en zona horaria de Chile (yyyy-mm-dd) — evita el salto de día de toISOString (UTC)
const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

// Audios de un reporte: usa el arreglo nuevo audio_urls; cae a audio_url por compatibilidad con reportes antiguos
const getAudios = r => (Array.isArray(r.audio_urls) && r.audio_urls.length > 0)
  ? r.audio_urls
  : (r.audio_url ? [r.audio_url] : [])

// Recibe la DESVIACIÓN (realPct - plannedPct), no el progreso absoluto
const statusColor = deviation => {
  if (deviation >= 0)  return { color: '#22c55e', bg: '#052e16', label: 'ADELANTADO',     desc: `${deviation >= 0 ? '+' : ''}${Math.round(deviation)}% sobre lo planificado.` }
  if (deviation >= -10) return { color: '#f59e0b', bg: '#2d1a00', label: 'RETRASO LEVE',   desc: `${Math.round(Math.abs(deviation))} puntos bajo lo planificado. Bajo control.` }
  return                       { color: '#ef4444', bg: '#2d0707', label: 'RETRASO CRÍTICO', desc: `${Math.round(Math.abs(deviation))} puntos bajo lo planificado. Requiere acción inmediata.` }
}

// ── Cálculo de Curva S ─────────────────────────────────────────────────────
// Genera dos arrays de puntos {fecha, pct} para la curva planificada y la real.
// plannedPoints: distribuye el avance esperado de cada tarea linealmente entre
//   su planned_start y planned_end. Cada tarea vale 1/n del total del proyecto.
// realPoints: construye el avance real acumulado día a día desde checklist_items
//   de todos los daily_reports del proyecto, usando el último progreso por tarea.

const calcularCurvaS = (ganttTasks, dailyReports, startDate, endDate) => {
  if (!ganttTasks?.length || !startDate || !endDate) return { planned: [], real: [] }

  const start = new Date(startDate + 'T00:00:00')
  const end   = new Date(endDate   + 'T00:00:00')
  const totalDays = Math.max(1, Math.round((end - start) / 86400000))
  const n = ganttTasks.length

  // Generar array de fechas del proyecto
  const fechas = []
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    fechas.push(d.toISOString().split('T')[0])
  }

  // ── Curva planificada ──────────────────────────────────────────────────
  // Por cada tarea, su contribución al total es (100/n)%.
  // Esa contribución se distribuye linealmente entre planned_start y planned_end.
  const plannedByDate = {}
  fechas.forEach(f => { plannedByDate[f] = 0 })

  ganttTasks.forEach(task => {
    const ts = task.planned_start ? new Date(task.planned_start + 'T00:00:00') : start
    const te = task.planned_end   ? new Date(task.planned_end   + 'T00:00:00') : end
    const taskDays = Math.max(1, Math.round((te - ts) / 86400000))
    const dailyContrib = (100 / n) / taskDays   // cuánto avanza esta tarea por día

    fechas.forEach(f => {
      const fd = new Date(f + 'T00:00:00')
      if (fd >= ts && fd <= te) {
        plannedByDate[f] = (plannedByDate[f] || 0) + dailyContrib
      }
    })
  })

  // Acumular
  let acc = 0
  const planned = fechas.map(f => {
    acc = Math.min(100, acc + (plannedByDate[f] || 0))
    return { fecha: f, pct: Math.round(acc * 10) / 10 }
  })

  // ── Curva real ─────────────────────────────────────────────────────────
  // Para cada daily_report, tomamos el último progreso reportado por task_id.
  // El avance real del proyecto = promedio del último progreso de todas las tareas.
  const reportsByDate = {}
  ;(dailyReports || []).forEach(r => {
    if (!reportsByDate[r.report_date]) reportsByDate[r.report_date] = []
    reportsByDate[r.report_date].push(r)
  })

  // Acumular el mejor progreso conocido por task_id hasta cada fecha
  const bestProgressByTask = {}
  const real = []

  const fechasConReportes = fechas.filter(f => f <= todayCL())
  fechasConReportes.forEach(f => {
    if (reportsByDate[f]) {
      reportsByDate[f].forEach(r => {
        ;(Array.isArray(r.checklist_items) ? r.checklist_items : []).forEach(item => {
          const tid = item.task_id || item.task_name
          if (tid && (item.progress || 0) > (bestProgressByTask[tid] || 0)) {
            bestProgressByTask[tid] = item.progress || 0
          }
        })
      })
    }
    // Calcular avance real del proyecto en esta fecha
    const taskIds = [...new Set([
      ...ganttTasks.map(t => t.id),
      ...Object.keys(bestProgressByTask)
    ])]
    if (taskIds.length === 0) {
      real.push({ fecha: f, pct: 0 })
    } else {
      const totalReal = taskIds.reduce((sum, tid) => sum + (bestProgressByTask[tid] || 0), 0)
      real.push({ fecha: f, pct: Math.round((totalReal / (n * 100)) * 1000) / 10 })
    }
  })

  return { planned, real }
}

// ── Componente Curva S (web) ───────────────────────────────────────────────

function CurvaSChart({ planned, real, deviation }) {
  // Merge planned + real en un solo array por fecha para recharts
  const allFechas = [...new Set([...planned.map(p => p.fecha), ...real.map(r => r.fecha)])].sort()
  const data = allFechas.map(fecha => {
    const p = planned.find(x => x.fecha === fecha)
    const r = real.find(x => x.fecha === fecha)
    return {
      fecha: fecha.substring(5), // mm-dd para que no sea tan largo
      planificado: p ? p.pct : null,
      real: r ? r.pct : null,
    }
  })

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const plan = payload.find(p => p.dataKey === 'planificado')
    const rl   = payload.find(p => p.dataKey === 'real')
    const gap  = (rl?.value != null && plan?.value != null) ? rl.value - plan.value : null
    return (
      <div style={{ background: '#111318', border: '1px solid #1e2128', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
        <div style={{ color: '#888', marginBottom: 6 }}>{label}</div>
        {plan && <div style={{ color: '#6366f1' }}>Planificado: <strong>{plan.value}%</strong></div>}
        {rl   && <div style={{ color: '#22c55e' }}>Real: <strong>{rl.value}%</strong></div>}
        {gap != null && (
          <div style={{ marginTop: 4, color: gap >= 0 ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
            Gap: {gap >= 0 ? '+' : ''}{Math.round(gap * 10) / 10}% {gap >= 0 ? '↑ adelanto' : '↓ retraso'}
          </div>
        )}
      </div>
    )
  }

  if (!data.length) return (
    <div style={{ textAlign: 'center', color: '#555', fontSize: 13, padding: 24 }}>
      Sin datos suficientes para mostrar la curva S
    </div>
  )

  return (
    <div style={{ background: '#111318', border: '1px solid #1e2128', borderRadius: 16, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
            ● Curva S — Avance acumulado
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#888' }}>
              <span style={{ width: 24, borderTop: '2px dashed #6366f1', display: 'inline-block' }} /> Planificado
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#888' }}>
              <span style={{ width: 24, borderTop: '2px solid #22c55e', display: 'inline-block' }} /> Real
            </span>
          </div>
        </div>
        <div style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          background: deviation >= 0 ? '#052e16' : deviation >= -10 ? '#2d1a00' : '#2d0707',
          color: deviation >= 0 ? '#22c55e' : deviation >= -10 ? '#f59e0b' : '#ef4444',
        }}>
          Gap actual: {deviation >= 0 ? '+' : ''}{deviation}%
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2128" vertical={false} />
          <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#555' }} tickLine={false} axisLine={{ stroke: '#1e2128' }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#555' }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} width={36} />
          <Tooltip content={<CustomTooltip />} />
          <Line dataKey="planificado" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
          <Line dataKey="real" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────

export default function Reportes() {
  const [tab, setTab] = useState('terreno')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Reportes</h1>
        <div style={{ display: 'flex', gap: 4, background: '#1a1a1a', padding: 4, borderRadius: 8, border: '1px solid #2a2a2a' }}>
          {[['terreno', '📋 Terreno'], ['proyecto', '📊 Proyectos']].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 13, border: 'none',
              background: tab === val ? '#2563eb' : 'transparent',
              color: tab === val ? '#fff' : '#888', cursor: 'pointer', fontWeight: tab === val ? 600 : 400
            }}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'terreno' ? <ReportesTerrenoTab /> : <ReportesProyectoTab />}
    </div>
  )
}

// ── Tab 1: Reportes de terreno (original) ─────────────────────────────────

function ReportesTerrenoTab() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadReports() }, [])

  const loadReports = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('*, profiles(full_name), projects(name)')
      .order('created_at', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  const filtered = reports.filter(r => {
    if (filter === 'blocked') return r.has_blocker
    if (filter === 'today') return r.report_date === todayCL()
    return true
  })

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#1a1a1a', padding: 4, borderRadius: 8, border: '1px solid #2a2a2a', width: 'fit-content' }}>
        {[['all', 'Todos'], ['today', 'Hoy'], ['blocked', 'Bloqueados']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, border: 'none',
            background: filter === val ? '#242424' : 'transparent',
            color: filter === val ? '#f0f0f0' : '#888', cursor: 'pointer'
          }}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div>No hay reportes {filter === 'today' ? 'de hoy' : filter === 'blocked' ? 'con bloqueos' : 'aún'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => (
            <div key={r.id} style={{
              background: '#1a1a1a',
              border: r.has_blocker ? '1px solid #7f1d1d' : '1px solid #2a2a2a',
              borderRadius: 12, padding: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: r.has_blocker ? '#2d0707' : '#052e16',
                  color: r.has_blocker ? '#fca5a5' : '#86efac',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600, flexShrink: 0
                }}>
                  {(r.profiles?.full_name || 'U').substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.profiles?.full_name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{r.projects?.name} · {r.report_date}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {r.has_blocker && (
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, background: '#2d0707', color: '#fca5a5' }}>🚫 Bloqueado</span>
                  )}
                  <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, background: '#1a2a1a', color: '#86efac' }}>
                    {r.tasks_done}/{r.tasks_total} tareas
                  </span>
                </div>
              </div>
              {r.has_blocker && r.blocker_description && (
                <div style={{ background: '#2d0707', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                  <strong>Bloqueo:</strong> {r.blocker_description}
                </div>
              )}
              {r.ai_summary && (
                <div style={{ background: '#242424', padding: '10px 14px', borderRadius: 8, fontSize: 13, color: '#ccc', marginBottom: 12 }}>
                  🤖 {r.ai_summary}
                </div>
              )}
              {/* Tareas acumuladas del día */}
              {Array.isArray(r.checklist_items) && r.checklist_items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {r.checklist_items.map((item, i) => (
                    <div key={item.task_id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#242424', padding: '6px 12px', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: '#ccc' }}>{item.task_name}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: (item.progress || 0) === 100 ? '#22c55e' : (item.progress || 0) > 0 ? '#60a5fa' : '#888'
                      }}>{item.progress || 0}%</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Audios del día, reproducibles */}
              {getAudios(r).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {getAudios(r).map((url, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>🎙️ Audio {getAudios(r).length > 1 ? i + 1 : ''}</span>
                      <audio controls preload="none" src={url} style={{ height: 32, flex: 1, maxWidth: 360 }} />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888' }}>
                {r.photo_urls?.length > 0 && <span>📷 {r.photo_urls.length} fotos</span>}
                {getAudios(r).length > 0 && <span>🎙️ {getAudios(r).length} audio{getAudios(r).length !== 1 ? 's' : ''}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Reportes de proyecto ────────────────────────────────────────────

function ReportesProyectoTab() {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(null)
  const [filterDate, setFilterDate] = useState(todayCL())
  const [curvaSData, setCurvaSData] = useState({})  // { [project_id]: { planned, real } }

  useEffect(() => { loadGrupos() }, [filterDate])

  const loadGrupos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('*, profiles(full_name), projects(name, client_name, start_date, end_date)')
      .eq('report_date', filterDate)
      .order('created_at', { ascending: false })

    // Agrupar por project_id
    const map = {}
    ;(data || []).forEach(r => {
      if (!map[r.project_id]) {
        map[r.project_id] = {
          project_id: r.project_id,
          project_name: r.projects?.name || 'Sin nombre',
          client_name: r.projects?.client_name || '',
          start_date: r.projects?.start_date,
          end_date: r.projects?.end_date,
          date: filterDate,
          reports: []
        }
      }
      map[r.project_id].reports.push(r)
    })
    const gruposArr = Object.values(map)
    setGrupos(gruposArr)

    // Cargar curva S para cada proyecto
    const curvaSMap = {}
    await Promise.all(gruposArr.map(async g => {
      if (!g.start_date || !g.end_date) return
      const [{ data: ganttTasks }, { data: allReports }] = await Promise.all([
        supabase.from('gantt_tasks').select('id, task_name, planned_start, planned_end, actual_progress').eq('project_id', g.project_id),
        supabase.from('daily_reports').select('report_date, checklist_items').eq('project_id', g.project_id).order('report_date', { ascending: true })
      ])
      curvaSMap[g.project_id] = calcularCurvaS(ganttTasks, allReports, g.start_date, g.end_date)
    }))
    setCurvaSData(curvaSMap)
    setLoading(false)
  }

  const generateReport = async (grupo) => {
    const key = grupo.project_id + grupo.date
    setGenerating(key)
    try {
      // 1. Recopilar datos de todos los reportes del grupo
      const actividades = grupo.reports.map(r => {
        const items = Array.isArray(r.checklist_items) ? r.checklist_items : []
        return {
          tecnico: r.profiles?.full_name || 'Sin nombre',
          tareas: items,
          progreso_tareas: `${r.tasks_done}/${r.tasks_total}`,
          tiene_bloqueo: r.has_blocker,
          descripcion_bloqueo: r.blocker_description || '',
          audio_transcript: r.audio_transcript || '',
          fotos: r.photo_urls || [],
          audios: getAudios(r),
          cantidad_audios: getAudios(r).length
        }
      })

      // 2. Calcular avance promedio del proyecto
      const avgProgress = grupo.reports.reduce((acc, r) => {
        const items = Array.isArray(r.checklist_items) ? r.checklist_items : []
        const progItems = items.map(i => i.progress || 0)
        return acc + (progItems.length ? progItems.reduce((a, b) => a + b, 0) / progItems.length : 0)
      }, 0) / (grupo.reports.length || 1)

      // 3. Obtener tareas gantt del proyecto para calcular progreso planificado
      const { data: ganttTasks } = await supabase
        .from('gantt_tasks')
        .select('*')
        .eq('project_id', grupo.project_id)

      const ganttProgress = ganttTasks?.length
        ? ganttTasks.reduce((a, t) => a + (t.actual_progress || 0), 0) / ganttTasks.length
        : 0

      // 4. Calcular porcentajes y desviación (necesario antes del statusColor)
      const today = new Date(grupo.date)
      const start = grupo.start_date ? new Date(grupo.start_date) : today
      const end = grupo.end_date ? new Date(grupo.end_date) : today
      const totalDays = Math.max(1, Math.round((end - start) / 86400000))
      const elapsedDays = Math.max(0, Math.round((today - start) / 86400000))
      const plannedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
      const realPct = Math.round(ganttProgress)
      const deviation = realPct - plannedPct

      // 5. Construir transcripciones del día para el prompt
      const transcripciones = grupo.reports
        .map(r => {
          const nombre = r.profiles?.full_name || 'Técnico'
          const texto = r.audio_transcript || ''
          return texto ? `[${nombre}]: ${texto}` : null
        })
        .filter(Boolean)
        .join('\n\n')

      // Fallback de actividades desde checklist_items reales (si la IA falla)
      const actividadesFallback = grupo.reports.flatMap(r =>
        (Array.isArray(r.checklist_items) ? r.checklist_items : []).map(item => ({
          titulo: item.task_name || 'Tarea sin nombre',
          descripcion: `Ejecutado por ${r.profiles?.full_name || 'Técnico'}.`,
          progreso: item.progress || 0,
          estado: (item.progress || 0) === 100 ? 'completado' : (item.progress || 0) > 0 ? 'en_progreso' : 'pendiente'
        }))
      )

      // 5. Llamar a Claude API para generar resumen
      const prompt = `Eres un asistente de gestión de proyectos de seguridad electrónica.
Genera un resumen ejecutivo profesional en español para el informe diario de proyecto.
Usa PRINCIPALMENTE las transcripciones de audio del día para redactar el resumen y las actividades con detalle real.
Si no hay transcripciones, usa las tareas del checklist.

PROYECTO: ${grupo.project_name}
CLIENTE: ${grupo.client_name || 'Sin cliente'}
FECHA: ${grupo.date}

TRANSCRIPCIONES DE AUDIO DEL DÍA:
${transcripciones || 'Sin transcripciones disponibles.'}

TAREAS DEL CHECKLIST:
${JSON.stringify(actividades.map(a => ({ tecnico: a.tecnico, tareas: a.tareas, bloqueo: a.descripcion_bloqueo })), null, 2)}

Genera un JSON con esta estructura exacta (solo JSON, sin markdown, sin texto adicional):
{
  "resumen_ejecutivo": "2-3 oraciones describiendo qué se hizo hoy, basado en las transcripciones reales",
  "actividades": [
    {
      "titulo": "nombre concreto de la actividad ejecutada",
      "descripcion": "descripción detallada basada en lo que dijeron los técnicos en los audios",
      "progreso": 75,
      "estado": "completado|en_progreso|bloqueado"
    }
  ],
  "logros_del_dia": ["logro concreto 1", "logro concreto 2"],
  "alertas": ["solo si hay bloqueos o problemas reales"],
  "plan_manana": "qué se planifica hacer mañana según los técnicos"
}`

      let aiJson = { resumen_ejecutivo: '', actividades: actividadesFallback, logros_del_dia: [], alertas: [], plan_manana: '' }

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Sin sesión activa')

        const response = await fetch(
          'https://ebzbrhyvieaypkffbozm.supabase.co/functions/v1/generate-report',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ prompt })
          }
        )

        if (!response.ok) {
          const errText = await response.text()
          console.error('Error Edge Function:', response.status, errText)
          throw new Error(`Edge Function respondió ${response.status}`)
        }

        const aiData = await response.json()
        if (aiData.error) throw new Error(aiData.error)

        const aiText = aiData.content?.map(c => c.text || '').join('') || ''
        const clean = aiText.replace(/```json[\s\S]*?```|```/g, '').trim()
        const parsed = JSON.parse(clean)

        // Mezclar: si la IA trajo actividades úsalas, si no usa el fallback
        aiJson = {
          resumen_ejecutivo: parsed.resumen_ejecutivo || '',
          actividades: (parsed.actividades?.length > 0) ? parsed.actividades : actividadesFallback,
          logros_del_dia: parsed.logros_del_dia || [],
          alertas: parsed.alertas || [],
          plan_manana: parsed.plan_manana || ''
        }
      } catch (aiErr) {
        console.error('Error generando resumen con IA:', aiErr.message)
        // aiJson ya tiene el fallback de actividades reales, solo ponemos resumen genérico
        aiJson.resumen_ejecutivo = `Jornada del ${fmt(grupo.date)} en ${grupo.project_name}. Se registraron ${actividades.length} reporte(s) de terreno con ${actividades.reduce((a, r) => a + r.tareas.length, 0)} tarea(s) en total.`
      }

      // 6. Calcular datos curva S para el PDF
      const { data: allReportsForCurva } = await supabase
        .from('daily_reports')
        .select('report_date, checklist_items')
        .eq('project_id', grupo.project_id)
        .order('report_date', { ascending: true })

      const curvaS = calcularCurvaS(ganttTasks, allReportsForCurva, grupo.start_date, grupo.end_date)
      const curvaSPlannedJson = JSON.stringify(curvaS.planned)
      const curvaSRealJson = JSON.stringify(curvaS.real)

      // 7. Generar HTML del reporte
      const st = statusColor(deviation)
      const bloqueados = grupo.reports.filter(r => r.has_blocker)

      // Recopilar todas las fotos del día
      const todasFotos = grupo.reports.flatMap(r => r.photo_urls || [])

      const actividadesHtml = (aiJson.actividades || []).map(act => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #1e2128">
          <div style="width:36px;height:36px;border-radius:10px;background:#1a2a4a;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px">${act.estado === 'completado' ? '✅' : act.estado === 'bloqueado' ? '🚫' : '🔧'}</span>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:#f0f0f0;margin-bottom:4px">${act.titulo}</div>
            <div style="font-size:12px;color:#888;line-height:1.5">${act.descripcion}</div>
            <div style="margin-top:8px;background:#1a1a1a;border-radius:6px;overflow:hidden;height:6px">
              <div style="width:${act.progreso}%;height:100%;background:${act.estado === 'completado' ? '#22c55e' : act.estado === 'bloqueado' ? '#ef4444' : '#2563eb'};transition:width .5s"></div>
            </div>
            <div style="font-size:11px;color:#555;margin-top:3px">${act.progreso}% completado</div>
          </div>
        </div>`).join('')

      const logrosHtml = (aiJson.logros_del_dia || []).map(l =>
        `<li style="padding:4px 0;font-size:12px;color:#86efac">✓ ${l}</li>`).join('')

      const alertasHtml = (aiJson.alertas || []).map(a =>
        `<li style="padding:4px 0;font-size:12px;color:#fca5a5">⚠ ${a}</li>`).join('')

      const fotosHtml = todasFotos.slice(0, 8).map(url =>
        `<div style="aspect-ratio:4/3;background:#1a1a1a;border-radius:8px;overflow:hidden;border:1px solid #2a2a2a">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />
        </div>`).join('')

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Reporte de Proyecto — ${grupo.project_name} — ${grupo.date}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#0a0c10;color:#f0f0f0;min-height:100vh;padding:24px}
    .card{background:#111318;border:1px solid #1e2128;border-radius:16px;padding:20px}
    .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
    .kpi{background:#0d0f14;border:1px solid #1e2128;border-radius:12px;padding:16px}
    .kpi-label{font-size:10px;font-weight:700;letter-spacing:.08em;color:#555;text-transform:uppercase;margin-bottom:8px}
    .kpi-value{font-size:28px;font-weight:800;line-height:1}
    .kpi-sub{font-size:11px;color:#555;margin-top:4px}
    .progress-track{background:#1e2128;border-radius:99px;overflow:hidden;height:8px;margin-top:4px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:12px;display:flex;align-items:center;gap:6px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .foto-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
    .no-print{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
    .btn-print{padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
    @media print{
      body{background:#fff!important;color:#111!important;padding:16px}
      .no-print{display:none!important}
      .card{background:#f8fafc!important;border-color:#e2e8f0!important;color:#111!important}
      .kpi{background:#f1f5f9!important;border-color:#e2e8f0!important}
    }
  </style>
</head>
<body>
  <div style="max-width:1000px;margin:0 auto">

    <!-- Control -->
    <div class="no-print">
      <span style="font-size:13px;color:#888">Reporte de proyecto generado por OnReport</span>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
    </div>

    <!-- Header -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;padding-bottom:16px;border-bottom:1px solid #1e2128;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:20px">📊</div>
          <div>
            <div style="font-size:18px;font-weight:800;color:#fff">${grupo.project_name}</div>
            <div style="font-size:12px;color:#555;margin-top:2px">Reporte Diario de Avance · Seguridad Electrónica</div>
          </div>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          ${grupo.client_name ? `<div><div style="font-size:10px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Cliente</div><div style="font-size:12px;font-weight:600;color:#ccc">${grupo.client_name}</div></div>` : ''}
          <div><div style="font-size:10px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Fecha</div><div style="font-size:12px;font-weight:600;color:#ccc">${fmt(grupo.date)}</div></div>
          <div><div style="font-size:10px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Día de obra</div><div style="font-size:12px;font-weight:600;color:#93c5fd">Día ${elapsedDays} de ${totalDays}</div></div>
        </div>
      </div>

      <!-- Resumen ejecutivo -->
      <div style="background:#0d0f14;border-radius:10px;padding:14px;border-left:3px solid #2563eb">
        <div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Resumen Ejecutivo</div>
        <div style="font-size:13px;color:#ccc;line-height:1.6">${aiJson.resumen_ejecutivo || 'Reporte generado.'}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Planificado</div>
        <div class="kpi-value" style="color:#6366f1">${plannedPct}%</div>
        <div class="kpi-sub">Hito esperado según Gantt</div>
        <div class="progress-track" style="margin-top:8px"><div style="width:${plannedPct}%;height:100%;background:#6366f1;border-radius:99px"></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ejecutado Real</div>
        <div class="kpi-value" style="color:${st.color}">${realPct}%</div>
        <div class="kpi-sub">Avance físico en terreno</div>
        <div class="progress-track" style="margin-top:8px"><div style="width:${realPct}%;height:100%;background:${st.color};border-radius:99px"></div></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Desviación</div>
        <div class="kpi-value" style="color:${deviation >= 0 ? '#22c55e' : '#f59e0b'}">${deviation >= 0 ? '+' : ''}${deviation}%</div>
        <div class="kpi-sub">${deviation >= 0 ? 'Adelantado' : `${Math.abs(deviation)} puntos bajo plan`}</div>
      </div>
      <div class="kpi" style="background:${st.bg};border-color:${st.color}33">
        <div class="kpi-label">Estado</div>
        <div style="font-size:16px;font-weight:800;color:${st.color};margin:8px 0">${st.label}</div>
        <div class="kpi-sub" style="color:${st.color}99">${st.desc}</div>
      </div>
    </div>

    <!-- Curva S -->
    <div class="card" style="margin-bottom:16px">
      <div class="section-title"><span style="color:#6366f1">●</span> Curva S — Avance acumulado planificado vs real</div>
      <div style="display:flex;gap:20px;margin-bottom:12px;font-size:12px;color:#888">
        <span><span style="display:inline-block;width:20px;border-top:2px dashed #6366f1;vertical-align:middle;margin-right:6px"></span>Planificado</span>
        <span><span style="display:inline-block;width:20px;border-top:2px solid #22c55e;vertical-align:middle;margin-right:6px"></span>Real</span>
        <span style="margin-left:auto;font-weight:700;color:${deviation >= 0 ? '#22c55e' : '#f59e0b'}">Gap actual: ${deviation >= 0 ? '+' : ''}${deviation}%</span>
      </div>
      <div style="position:relative;height:220px">
        <canvas id="curvaSPdf" role="img" aria-label="Curva S del proyecto"></canvas>
      </div>
    </div>

    <!-- Actividades + Alertas -->
    <div class="two-col" style="margin-bottom:16px">
      <div class="card">
        <div class="section-title"><span style="color:#6366f1">●</span> Trabajos Ejecutados Hoy</div>
        ${actividadesHtml || '<div style="color:#555;font-size:13px">Sin actividades registradas.</div>'}
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${logrosHtml ? `<div class="card">
          <div class="section-title"><span style="color:#22c55e">●</span> Logros del Día</div>
          <ul style="list-style:none;padding:0">${logrosHtml}</ul>
        </div>` : ''}
        ${bloqueados.length ? `<div class="card" style="border-color:#7f1d1d">
          <div class="section-title"><span style="color:#ef4444">●</span> Alertas y Bloqueos</div>
          ${bloqueados.map(r => `<div style="background:#2d0707;border-radius:8px;padding:10px;margin-bottom:8px">
            <div style="font-size:12px;color:#fca5a5;font-weight:600">🚫 ${r.profiles?.full_name || 'Técnico'}</div>
            <div style="font-size:12px;color:#fca5a5;margin-top:4px">${r.blocker_description || ''}</div>
          </div>`).join('')}
        </div>` : `<div class="card">
          <div class="section-title"><span style="color:#22c55e">●</span> Sin Alertas</div>
          <div style="font-size:13px;color:#22c55e">✓ Ningún bloqueo reportado hoy.</div>
        </div>`}
        ${aiJson.plan_manana ? `<div class="card">
          <div class="section-title"><span style="color:#f59e0b">●</span> Plan para Mañana</div>
          <div style="font-size:13px;color:#ccc">${aiJson.plan_manana}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Evidencia Fotográfica -->
    ${todasFotos.length ? `<div class="card" style="margin-bottom:16px">
      <div class="section-title"><span style="color:#2563eb">●</span> Evidencia Fotográfica (${todasFotos.length} fotos)</div>
      <div class="foto-grid">${fotosHtml}</div>
      ${todasFotos.length > 8 ? `<div style="font-size:11px;color:#555;margin-top:8px;text-align:center">+ ${todasFotos.length - 8} fotos adicionales</div>` : ''}
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:16px;font-size:11px;color:#333">
      OnReport · Reporte generado automáticamente · ${new Date().toLocaleString('es-CL')}
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
  <script>
    (function() {
      const planned = ${curvaSPlannedJson};
      const real    = ${curvaSRealJson};
      const allFechas = [...new Set([...planned.map(p=>p.fecha),...real.map(r=>r.fecha)])].sort();
      const labels = allFechas.map(f => f.substring(5));
      const pData  = allFechas.map(f => { const p = planned.find(x=>x.fecha===f); return p?p.pct:null; });
      const rData  = allFechas.map(f => { const r = real.find(x=>x.fecha===f);    return r?r.pct:null; });
      new Chart(document.getElementById('curvaSPdf'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Planificado', data: pData, borderColor: '#6366f1', borderDash: [6,4], borderWidth: 2, pointRadius: 0, tension: 0.3, spanGaps: true },
            { label: 'Real',        data: rData, borderColor: '#22c55e', borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#22c55e', tension: 0.3, spanGaps: false }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            afterBody(items) {
              const p = items.find(i=>i.datasetIndex===0), r = items.find(i=>i.datasetIndex===1);
              if (p&&r&&r.parsed.y!=null) { const g=r.parsed.y-p.parsed.y; return ['Gap: '+(g>=0?'+':'')+Math.round(g*10)/10+'%']; }
              return [];
            }
          }}},
          scales: {
            x: { grid: { color: '#1e2128' }, ticks: { color: '#555', font: { size: 10 } }, border: { color: '#1e2128' } },
            y: { min: 0, max: 100, grid: { color: '#1e2128' }, ticks: { color: '#555', font: { size: 10 }, callback: v => v+'%' }, border: { color: '#1e2128' } }
          }
        }
      });
    })();
  </script>
</body>
</html>`

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (!win) {
        alert('Tu navegador bloqueó la ventana emergente. Permite los popups para on-report.vercel.app e intenta de nuevo.')
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }

    } catch (e) {
      console.error('Error generando reporte:', e)
      alert('Error al generar el reporte: ' + e.message)
    }
    setGenerating(null)
  }

  return (
    <div>
      {/* Filtro de fecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: '#888' }}>Fecha:</label>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          style={{ padding: '7px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#f0f0f0', fontSize: 13 }}
        />
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', paddingTop: 40 }}>Cargando...</div>
      ) : grupos.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div>No hay reportes de terreno para esta fecha</div>
          <div style={{ fontSize: 12, marginTop: 8, color: '#555' }}>Los reportes de terreno aparecen aquí al ser enviados desde Android</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grupos.map(g => {
            const key = g.project_id + g.date
            const isGenerating = generating === key
            const totalFotos = g.reports.flatMap(r => r.photo_urls || []).length
            const totalAudios = g.reports.reduce((acc, r) => acc + getAudios(r).length, 0)
            const hayBloqueo = g.reports.some(r => r.has_blocker)
            const avgP = Math.round(g.reports.reduce((acc, r) => {
              const items = Array.isArray(r.checklist_items) ? r.checklist_items : []
              return acc + (items.length ? items.reduce((a, i) => a + (i.progress || 0), 0) / items.length : 0)
            }, 0) / (g.reports.length || 1))

            return (
              <div key={key} style={{
                background: '#1a1a1a',
                border: hayBloqueo ? '1px solid #7f1d1d' : '1px solid #2a2a2a',
                borderRadius: 12, padding: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1a2a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📁</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{g.project_name}</div>
                        {g.client_name && <div style={{ fontSize: 12, color: '#555' }}>{g.client_name}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
                      <span>👷 {g.reports.length} reporte{g.reports.length !== 1 ? 's' : ''} de terreno</span>
                      {totalFotos > 0 && <span>📷 {totalFotos} fotos</span>}
                      {totalAudios > 0 && <span>🎙️ {totalAudios} audio{totalAudios !== 1 ? 's' : ''}</span>}
                      {hayBloqueo && <span style={{ color: '#fca5a5' }}>🚫 Con bloqueos</span>}
                      <span style={{ color: avgP >= 80 ? '#22c55e' : avgP >= 50 ? '#f59e0b' : '#ef4444' }}>📈 {avgP}% avance promedio</span>
                    </div>

                    {/* Técnicos del día */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {g.reports.map(r => (
                        <span key={r.id} style={{ padding: '2px 8px', background: '#242424', borderRadius: 99, fontSize: 11, color: '#ccc' }}>
                          {r.profiles?.full_name || 'Técnico'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => generateReport(g)}
                    disabled={isGenerating}
                    style={{
                      padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer',
                      background: isGenerating ? '#1e2128' : 'linear-gradient(135deg,#2563eb,#7c3aed)',
                      color: isGenerating ? '#555' : '#fff',
                      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                      minWidth: 160
                    }}
                  >
                    {isGenerating ? <>⏳ Generando con IA...</> : <>📄 Generar Informe PDF</>}
                  </button>
                </div>

                {/* Curva S */}
                {curvaSData[g.project_id] && (
                  curvaSData[g.project_id].planned.length > 1
                    ? <CurvaSChart
                        planned={curvaSData[g.project_id].planned}
                        real={curvaSData[g.project_id].real}
                        deviation={(() => {
                          const today = new Date(g.date)
                          const start = g.start_date ? new Date(g.start_date) : today
                          const end = g.end_date ? new Date(g.end_date) : today
                          const totalDays = Math.max(1, Math.round((end - start) / 86400000))
                          const elapsedDays = Math.max(0, Math.round((today - start) / 86400000))
                          const plannedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
                          const lastReal = curvaSData[g.project_id].real.slice(-1)[0]?.pct || 0
                          return Math.round(lastReal - plannedPct)
                        })()}
                      />
                    : <div style={{ color: '#555', fontSize: 12, marginTop: 12 }}>
                        Sin fechas de inicio/fin configuradas para mostrar curva S.
                      </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
