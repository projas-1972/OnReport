// Edge Function: send-scheduled-reports
// Lee pdf_schedules, genera informe HTML con Claude y envía por email con Resend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmt = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

const statusColor = (pct: number) => {
  if (pct >= 95) return { color: '#22c55e', bg: '#052e16', label: 'AL DÍA', desc: 'Proyecto en línea con lo planificado.' }
  if (pct >= 80) return { color: '#f59e0b', bg: '#2d1a00', label: 'RETRASO LEVE', desc: 'Desviación menor a 15%. Bajo control.' }
  return { color: '#ef4444', bg: '#2d0707', label: 'RETRASO CRÍTICO', desc: 'Requiere acción inmediata.' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    // Hora actual en Chile (UTC-3 / UTC-4)
    const now = new Date()
    const chileHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const currentTime = `${String(chileHour.getHours()).padStart(2, '0')}:00:00`
    const today = chileHour.toISOString().split('T')[0]

    // Leer schedules activos que coincidan con la hora actual
    const { data: schedules } = await supabase
      .from('pdf_schedules')
      .select('*, projects(id, name, client_name, start_date, end_date)')
      .eq('active', true)
      .eq('send_time', currentTime)

    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: 'No hay envíos programados para esta hora', hora: currentTime }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const results = []

    for (const schedule of schedules) {
      try {
        const projectId = schedule.project_id
        const projectName = schedule.projects?.name || 'Sin nombre'
        const clientName = schedule.projects?.client_name || ''

        // Obtener reportes del día para este proyecto
        const { data: reports } = await supabase
          .from('daily_reports')
          .select('*, profiles(full_name)')
          .eq('project_id', projectId)
          .eq('report_date', today)
          .order('created_at', { ascending: true })

        if (!reports || reports.length === 0) {
          results.push({ schedule_id: schedule.id, status: 'skipped', reason: 'Sin reportes del día' })
          continue
        }

        // Obtener tareas gantt para calcular progreso
        const { data: ganttTasks } = await supabase
          .from('gantt_tasks')
          .select('*')
          .eq('project_id', projectId)

        const ganttProgress = ganttTasks?.length
          ? ganttTasks.reduce((a: number, t: any) => a + (t.actual_progress || 0), 0) / ganttTasks.length
          : 0

        // Calcular días de obra
        const startDate = schedule.projects?.start_date ? new Date(schedule.projects.start_date) : new Date()
        const endDate = schedule.projects?.end_date ? new Date(schedule.projects.end_date) : new Date()
        const todayDate = new Date(today)
        const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
        const elapsedDays = Math.max(0, Math.round((todayDate.getTime() - startDate.getTime()) / 86400000))
        const plannedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
        const realPct = Math.round(ganttProgress)
        const deviation = realPct - plannedPct

        // Preparar actividades para el prompt
        const actividades = reports.map((r: any) => {
          const items = Array.isArray(r.checklist_items) ? r.checklist_items : []
          return {
            tecnico: r.profiles?.full_name || 'Sin nombre',
            tareas: items,
            progreso_tareas: `${r.tasks_done}/${r.tasks_total}`,
            tiene_bloqueo: r.has_blocker,
            descripcion_bloqueo: r.blocker_description || '',
            audio_transcript: r.audio_transcript || '',
          }
        })

        // Llamar a Claude para generar resumen
        const prompt = `Eres un asistente de gestión de proyectos de seguridad electrónica.
Genera un resumen ejecutivo profesional en español para el informe diario de proyecto.

PROYECTO: ${projectName}
CLIENTE: ${clientName}
FECHA: ${today}
ACTIVIDADES DEL DÍA: ${JSON.stringify(actividades)}

Genera un JSON con esta estructura exacta (solo JSON, sin markdown):
{
  "resumen_ejecutivo": "2-3 oraciones resumiendo el trabajo del día",
  "actividades": [
    {
      "titulo": "nombre de la actividad",
      "descripcion": "descripción detallada basada en las tareas y transcripciones",
      "progreso": 75,
      "estado": "completado|en_progreso|bloqueado"
    }
  ],
  "logros_del_dia": ["logro 1", "logro 2"],
  "alertas": ["alerta si hay bloqueos"],
  "plan_manana": "qué se planifica para el día siguiente"
}`

        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        const claudeData = await claudeResponse.json()
        const aiText = claudeData.content?.map((c: any) => c.text || '').join('') || ''

        let aiJson: any = { resumen_ejecutivo: '', actividades: [], logros_del_dia: [], alertas: [], plan_manana: '' }
        try {
          aiJson = JSON.parse(aiText.replace(/```json|```/g, '').trim())
        } catch { aiJson.resumen_ejecutivo = aiText }

        // Generar HTML del informe
        const st = statusColor(ganttProgress)
        const bloqueados = reports.filter((r: any) => r.has_blocker)
        const todasFotos = reports.flatMap((r: any) => r.photo_urls || [])

        const actividadesHtml = (aiJson.actividades || []).map((act: any) => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #e2e8f0">
            <div style="width:32px;height:32px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">
              ${act.estado === 'completado' ? '✅' : act.estado === 'bloqueado' ? '🚫' : '🔧'}
            </div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:4px">${act.titulo}</div>
              <div style="font-size:12px;color:#64748b;line-height:1.5">${act.descripcion}</div>
              <div style="margin-top:6px;background:#e2e8f0;border-radius:4px;overflow:hidden;height:5px">
                <div style="width:${act.progreso}%;height:100%;background:${act.estado === 'completado' ? '#22c55e' : act.estado === 'bloqueado' ? '#ef4444' : '#3b82f6'}"></div>
              </div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px">${act.progreso}% completado</div>
            </div>
          </div>`).join('')

        const logrosHtml = (aiJson.logros_del_dia || []).map((l: string) =>
          `<li style="padding:3px 0;font-size:12px;color:#166534">✓ ${l}</li>`).join('')

        const alertasHtml = bloqueados.length
          ? bloqueados.map((r: any) => `
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:8px">
              <div style="font-size:12px;color:#dc2626;font-weight:600">🚫 ${r.profiles?.full_name || 'Técnico'}</div>
              <div style="font-size:12px;color:#dc2626;margin-top:3px">${r.blocker_description || ''}</div>
            </div>`).join('')
          : '<div style="font-size:13px;color:#166534">✓ Ningún bloqueo reportado hoy.</div>'

        const fotosHtml = todasFotos.slice(0, 6).map((url: string) =>
          `<img src="${url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0" />`
        ).join('')

        const tecnicos = [...new Set(reports.map((r: any) => r.profiles?.full_name).filter(Boolean))]

        const htmlEmail = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Reporte de Proyecto — ${projectName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#0f172a;border-radius:16px 16px 0 0;padding:24px 28px;margin-bottom:0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px">📊</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#fff">${projectName}</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px">Reporte Diario de Avance · Seguridad Electrónica</div>
        </div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        ${clientName ? `<div><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase">Cliente</div><div style="font-size:12px;font-weight:600;color:#cbd5e1">${clientName}</div></div>` : ''}
        <div><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase">Fecha</div><div style="font-size:12px;font-weight:600;color:#cbd5e1">${fmt(today)}</div></div>
        <div><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase">Día de obra</div><div style="font-size:12px;font-weight:600;color:#93c5fd">Día ${elapsedDays} de ${totalDays}</div></div>
        <div><div style="font-size:10px;color:#475569;font-weight:700;text-transform:uppercase">Equipo</div><div style="font-size:12px;font-weight:600;color:#cbd5e1">${tecnicos.join(', ')}</div></div>
      </div>
    </div>

    <!-- Resumen ejecutivo -->
    <div style="background:#1e293b;padding:16px 28px;border-left:3px solid #2563eb">
      <div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Resumen Ejecutivo</div>
      <div style="font-size:13px;color:#cbd5e1;line-height:1.6">${aiJson.resumen_ejecutivo || 'Reporte generado.'}</div>
    </div>

    <!-- KPIs -->
    <div style="background:#fff;padding:20px 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      <div style="background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Planificado</div>
        <div style="font-size:26px;font-weight:800;color:#6366f1">${plannedPct}%</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">Según Gantt</div>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Ejecutado</div>
        <div style="font-size:26px;font-weight:800;color:${st.color}">${realPct}%</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">Avance real</div>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Desviación</div>
        <div style="font-size:26px;font-weight:800;color:${deviation >= 0 ? '#22c55e' : '#f59e0b'}">${deviation >= 0 ? '+' : ''}${deviation}%</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:3px">${deviation >= 0 ? 'Adelantado' : 'Bajo plan'}</div>
      </div>
      <div style="background:${st.bg};border-radius:10px;padding:14px;border:1px solid ${st.color}33">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:8px">Estado</div>
        <div style="font-size:14px;font-weight:800;color:${st.color}">${st.label}</div>
        <div style="font-size:11px;color:${st.color}99;margin-top:3px">${st.desc}</div>
      </div>
    </div>

    <!-- Actividades + Alertas -->
    <div style="background:#fff;padding:20px 28px;display:grid;grid-template-columns:1fr 1fr;gap:20px;border-top:1px solid #f1f5f9">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:12px">● Trabajos Ejecutados</div>
        ${actividadesHtml || '<div style="color:#94a3b8;font-size:13px">Sin actividades registradas.</div>'}
      </div>
      <div>
        ${logrosHtml ? `<div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px">● Logros del Día</div>
          <ul style="list-style:none;padding:0;margin:0">${logrosHtml}</ul>
        </div>` : ''}
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px">● ${bloqueados.length ? 'Alertas y Bloqueos' : 'Sin Alertas'}</div>
          ${alertasHtml}
        </div>
        ${aiJson.plan_manana ? `<div style="margin-top:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px">● Plan Mañana</div>
          <div style="font-size:12px;color:#475569">${aiJson.plan_manana}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Evidencia fotográfica -->
    ${todasFotos.length ? `
    <div style="background:#fff;padding:20px 28px;border-top:1px solid #f1f5f9">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:12px">● Evidencia Fotográfica (${todasFotos.length} fotos)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${fotosHtml}</div>
      ${todasFotos.length > 6 ? `<div style="font-size:11px;color:#94a3b8;margin-top:8px;text-align:center">+ ${todasFotos.length - 6} fotos adicionales</div>` : ''}
    </div>` : ''}

    <!-- Footer -->
    <div style="background:#0f172a;border-radius:0 0 16px 16px;padding:16px 28px;text-align:center">
      <div style="font-size:12px;color:#475569">OnReport · Reporte generado automáticamente · ${new Date().toLocaleString('es-CL')}</div>
      <div style="font-size:11px;color:#334155;margin-top:4px">Este informe fue generado y enviado automáticamente por OnReport</div>
    </div>

  </div>
</body>
</html>`

        // Enviar email con Resend
        const recipients = Array.isArray(schedule.recipients) ? schedule.recipients : []
        if (recipients.length === 0) {
          results.push({ schedule_id: schedule.id, status: 'skipped', reason: 'Sin destinatarios' })
          continue
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'OnReport <reportes@onreport.cl>',
            to: recipients,
            subject: `📊 Reporte Diario — ${projectName} — ${fmt(today)}`,
            html: htmlEmail
          })
        })

        const emailData = await emailResponse.json()

        // Actualizar last_sent_at
        await supabase
          .from('pdf_schedules')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('id', schedule.id)

        results.push({
          schedule_id: schedule.id,
          project: projectName,
          status: emailResponse.ok ? 'sent' : 'error',
          recipients,
          email_id: emailData.id,
          error: emailData.message
        })

      } catch (e: any) {
        results.push({ schedule_id: schedule.id, status: 'error', error: e.message })
      }
    }

    return new Response(JSON.stringify({ success: true, hora: currentTime, fecha: today, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
