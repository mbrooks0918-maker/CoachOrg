import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const mk=()=>createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const SMP='1e8cf2d6-69b1-44dd-91a2-cec557063852', ALB='0e6ab697-b288-4407-bb8b-6016d99fd833'
const res=[]; const check=(l,p,d)=>{res.push({l,p});console.log(`${p?'PASS':'FAIL'}  ${l}${d?`  -- ${d}`:''}`)}

const dana = mk(); await dana.auth.signInWithPassword({ email:'director@sandmountainpark.demo', password:'DemoPass123!' })
const { data: ov, error: ovErr } = await dana.rpc('org_overview', { p_organization_id: SMP })
check('org owner can load the overview', !ovErr && !!ov, ovErr?.message)
if (ov) {
  console.log(`   totals: ${JSON.stringify(ov.totals)}`)
  console.log(`   programs: ${ov.programs.map(p=>`${p.name} ${p.confirmed}c/${p.waitlisted}w`).join(' | ')}`)
  console.log(`   upcoming events: ${ov.upcoming_events.length}, next = ${ov.upcoming_events[0]?.program_name}: ${ov.upcoming_events[0]?.name}`)
  console.log(`   equipment: ${JSON.stringify(ov.equipment)}`)
  check('children counted once, sign-ups counted per sport', ov.totals.children === 12 && ov.totals.signups === 20, `${ov.totals.children} children / ${ov.totals.signups} sign-ups`)
  check('waitlist shows on the basketball clinic', ov.programs.find(p=>p.name==='Youth Basketball')?.waitlisted === 2)
  check('events span every program', new Set(ov.upcoming_events.map(e=>e.program_name)).size === 4, `${new Set(ov.upcoming_events.map(e=>e.program_name)).size} programs represented`)
}
const { error: crossErr } = await dana.rpc('org_overview', { p_organization_id: ALB })
check('an owner cannot see another organization', !!crossErr && /not permitted/.test(crossErr.message), crossErr?.message?.slice(0,50))

await sleep(900)
const ray = mk(); await ray.auth.signInWithPassword({ email:'ray.whitfield@example.com', password:'TestPass123!' })
const { data: rayLeader } = await ray.rpc('is_org_leader', { p_organization_id: ALB })
const { error: rayErr } = await ray.rpc('org_overview', { p_organization_id: ALB })
check('a team manager of the org is NOT an org leader', rayLeader === false, `is_org_leader=${rayLeader}`)
check('...and is refused the overview of his own org', !!rayErr && /not permitted/.test(rayErr.message), rayErr?.message?.slice(0,50))

await sleep(900)
const parent = mk(); await parent.auth.signInWithPassword({ email:'marisol.vega@example.com', password:'DemoPass123!' })
const { error: parErr } = await parent.rpc('org_overview', { p_organization_id: SMP })
check('a parent is refused', !!parErr && /not permitted/.test(parErr.message), parErr?.message?.slice(0,50))

console.log(`\n${res.filter(r=>r.p).length}/${res.length} passed`)
