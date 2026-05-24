// Edge Function: process-report
// Recibe el reporte, transcribe audio con Whisper, genera resumen con GPT-4o
// y actualiza el daily_report en Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { report_id } = await req.json()

    if (!report_id) {
      return new Response(JSON.stringify({ error: 'report_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cliente Supabase con service_role para acceso total
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const openaiKey = Deno.env.get('OPENAI_API_KEY')!

    // 1. Obtener el reporte completo
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('*, projects(name, client_name, equipment_summary), profiles(full_name)')
      .eq('id', report_id)
      .single()

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'Reporte no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Marcar como procesando
    await supabase.from('daily_reports').update({ status: 'processing' }).eq('id', report_id)

    let audioTranscript = ''

    // 2. Transcribir audio con Whisper (si hay audio)
    if (report.audio_url) {
      try {
        // Descargar el audio desde Supabase Storage
        const { data: audioData } = await supabase.storage
          .from('report-audios')
          .download(report.audio_url.replace(/.*report-audios\//, ''))

        if (audioData) {
          const formData = new FormData()
          formData.append('file', audioData, 'audio.m4a')
          formData.append('model', 'whisper-1')
          formData.append('language', 'es')

          const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}` },
            body: formData
          })

          const whisperData = await whisperResponse.json()
          audioTranscript = whisperData.text || ''
        }
      } catch (e) {
        console.error('Error transcribiendo audio:', e)
      }
    }

    // 3. Preparar contexto para GPT-4o
    const checklist = report.checklist_items || []
    const completedTasks = checklist.filter((t: any) => t.done).map((t: any) => t.text).join(', ')
    const pendingTasks = checklist.filter((t: any) => !t.done).map((t: any) => t.text).join(', ')
    const photoCount = report.photo_urls?.length || 0

    const prompt = `
Eres el sistema de informes de OnReport, plataforma de gestión de obras de seguridad electrónica.

DATOS DEL REPORTE:
- Proyecto: ${report.projects?.name}
- Cliente: ${report.projects?.client_name}
- Supervisor: ${report.profiles?.full_name}
- Fecha: ${report.report_date}
- Tareas completadas (${report.tasks_done}/${report.tasks_total}): ${completedTasks || 'Ninguna'}
- Tareas pendientes: ${pendingTasks || 'Ninguna'}
- Fotos adjuntas: ${photoCount}
- Bloqueo: ${report.has_blocker ? 'SÍ - ' + report.blocker_description : 'No'}
${report.has_blocker ? `- Requiere para continuar: ${report.blocker_requires}` : ''}
${audioTranscript ? `- Transcripción del audio del supervisor: "${audioTranscript}"` : ''}

Genera un informe diario profesional en español con exactamente este formato JSON:
{
  "resumen": "Párrafo conciso de 2-3 oraciones describiendo el trabajo realizado hoy",
  "logros": ["logro 1", "logro 2", "logro 3"],
  "plan_manana": "Descripción breve de lo planificado para mañana",
  "alerta": ${report.has_blocker ? '"Descripción clara del bloqueo y qué se necesita para resolverlo"' : 'null'},
  "estado_general": "${report.has_blocker ? 'bloqueado' : report.tasks_done >= report.tasks_total ? 'completado' : 'en_progreso'}"
}

Responde SOLO con el JSON, sin texto adicional ni backticks.
`

    // 4. Generar resumen con GPT-4o
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 800,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const gptData = await gptResponse.json()
    const rawText = gptData.choices?.[0]?.message?.content || '{}'

    let aiResult = { resumen: '', logros: [], plan_manana: '', alerta: null, estado_general: 'en_progreso' }
    try {
      aiResult = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch (e) {
      aiResult.resumen = rawText
    }

    // 5. Actualizar el reporte con los resultados
    await supabase.from('daily_reports').update({
      audio_transcript: audioTranscript,
      ai_summary: aiResult.resumen,
      ai_next_day_plan: aiResult.plan_manana,
      status: 'done'
    }).eq('id', report_id)

    // 6. Actualizar estado del proyecto si hay bloqueo
    if (report.has_blocker) {
      await supabase.from('projects').update({ status: 'blocked' }).eq('id', report.project_id)
    }

    return new Response(JSON.stringify({
      success: true,
      report_id,
      ai_summary: aiResult.resumen,
      ai_next_day_plan: aiResult.plan_manana,
      audio_transcript: audioTranscript,
      logros: aiResult.logros,
      alerta: aiResult.alerta
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error en process-report:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
