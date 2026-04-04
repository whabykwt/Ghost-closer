import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase, fetchLeads, insertLead, updateLead, deleteLead, bulkInsertLeads, saveRevivalMessage, signOut } from '../lib/supabase'

const calcHeat = (days, trigger) => {
  if (trigger && days > 30) return 'fire'
  if (trigger || days < 45) return 'warm'
  return 'cold'
}
const calcBuyScore = (days, trigger) => trigger
  ? Math.min(95, Math.floor(Math.random() * 20 + 65))
  : Math.max(15, Math.floor(Math.random() * 30 + 20))
const fmtBudget = b => (!b || b === 0) ? 'TBD' : '$' + Number(b).toLocaleString()
const notify = (msg) => {
  const n = document.getElementById('gc-notif')
  if (!n) return
  n.textContent = msg; n.style.opacity = '1'
  setTimeout(() => n.style.opacity = '0', 2400)
}

export default function Dashboard({ session }) {
  const [leads, setLeads] = useState([])
  const [dealership, setDealership] = useState(null)
  const [selId, setSelId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [aiMsg, setAiMsg] = useState('')
  const [aiState, setAiState] = useState('idle') // idle | loading | done
  const [channel, setChannel] = useState('text')
  const [modal, setModal] = useState(null) // null | 'add' | 'edit' | 'upload' | 'bulk'
  const [formData, setFormData] = useState({})
  const [revivedCount, setRevivedCount] = useState(0)
  const [dbLoading, setDbLoading] = useState(true)

  // Load dealership + leads
  useEffect(() => {
    const load = async () => {
      const email = session.user.email
      let { data: deal } = await supabase.from('dealerships').select('*').eq('owner_email', email).single()
      if (!deal) {
        const { data } = await supabase.from('dealerships').insert([{ name: email.split('@')[0] + "'s Dealership", owner_email: email }]).select().single()
        deal = data
      }
      setDealership(deal)
      const data = await fetchLeads(deal.id)
      setLeads(data || [])
      const { data: rev } = await supabase.from('leads').select('id').eq('dealership_id', deal.id).eq('heat', 'revived')
      setRevivedCount(rev?.length || 0)
      setDbLoading(false)
    }
    load()
  }, [session])

  const selLead = leads.find(l => l.id === selId)

  const filtered = leads
    .filter(l => filter === 'all' || l.heat === filter)
    .filter(l => !search || [l.name, l.vehicle, l.trigger_event, l.salesperson].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.buy_score - a.buy_score)

  const stats = {
    fire: leads.filter(l => l.heat === 'fire').length,
    warm: leads.filter(l => l.heat === 'warm').length,
    cold: leads.filter(l => l.heat === 'cold').length,
    revived: revivedCount,
    value: leads.reduce((s, l) => s + (l.budget || 0), 0)
  }

  const fmtValue = v => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'K' : '$' + v

  // ADD LEAD
  const handleAdd = async () => {
    const { name, vehicle, phone, email, budget, days_silent, trigger_event, last_touch, salesperson } = formData
    if (!name || !vehicle) return notify('⚠️ Name and vehicle are required')
    const days = parseInt(days_silent) || 60
    const trigger = trigger_event || ''
    const lead = {
      dealership_id: dealership.id,
      name, phone: phone || '', email: email || '', vehicle,
      budget: parseFloat(budget) || 0,
      days_silent: days,
      heat: calcHeat(days, trigger),
      trigger_event: trigger,
      motivation: 'Not yet profiled',
      last_touch: last_touch || 'Newly added',
      persona: ['Profiling pending'],
      buy_score: calcBuyScore(days, trigger),
      engage_score: calcBuyScore(days, trigger) - 5,
      salesperson: salesperson || '',
      lead_source: 'Manual',
      channel: 'text',
      timeline: [
        { date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), text: 'Added to Ghost Closer', hot: false },
        ...(trigger ? [{ date: 'Today', text: `🔥 TRIGGER: ${trigger}`, hot: true }] : [])
      ]
    }
    const created = await insertLead(lead)
    setLeads(prev => [created, ...prev])
    setModal(null); setFormData({})
    notify('✅ Lead added to pipeline!')
  }

  // EDIT LEAD
  const handleEdit = async () => {
    const { name, vehicle, phone, email, budget, days_silent, trigger_event, motivation, salesperson } = formData
    const days = parseInt(days_silent) || selLead.days_silent
    const trigger = trigger_event !== undefined ? trigger_event : selLead.trigger_event
    const updates = {
      name: name || selLead.name,
      phone: phone !== undefined ? phone : selLead.phone,
      email: email !== undefined ? email : selLead.email,
      vehicle: vehicle || selLead.vehicle,
      budget: parseFloat(budget) || selLead.budget,
      days_silent: days,
      trigger_event: trigger,
      motivation: motivation || selLead.motivation,
      salesperson: salesperson !== undefined ? salesperson : selLead.salesperson,
      heat: calcHeat(days, trigger)
    }
    const updated = await updateLead(selId, updates)
    setLeads(prev => prev.map(l => l.id === selId ? updated : l))
    setModal(null); setFormData({})
    notify('✅ Lead updated!')
  }

  // MARK REVIVED
  const handleRevive = async (id) => {
    await updateLead(id, { heat: 'revived', revived_at: new Date().toISOString() })
    setLeads(prev => prev.filter(l => l.id !== id))
    setRevivedCount(c => c + 1)
    setSelId(null); setAiMsg(''); setAiState('idle')
    notify('🎉 Lead marked as revived!')
  }

  // REMOVE LEAD
  const handleRemove = async (id) => {
    await deleteLead(id)
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelId(null); setAiMsg(''); setAiState('idle')
    notify('Lead removed')
  }

  // GENERATE AI MESSAGE
  const generate = async () => {
    if (aiState === 'loading' || !selLead) return
    setAiState('loading'); setAiMsg('')
    const channelLabel = channel === 'text'
      ? 'SMS text message (under 160 chars, punchy and direct)'
      : channel === 'email'
      ? 'email with subject line + body (under 120 words)'
      : 'phone call opening script (30 seconds, natural and confident)'

    const prompt = `You are Ghost Closer — an elite automotive sales AI that specializes in reviving dead leads for car dealerships.

LEAD PROFILE:
Name: ${selLead.name}
Vehicle: ${selLead.vehicle}
Budget: ${fmtBudget(selLead.budget)}
Days Silent: ${selLead.days_silent}
Buyer Persona: ${(selLead.persona || []).join(', ')}
Motivation: ${selLead.motivation || 'Not specified'}
Why They Went Cold: ${selLead.last_touch || 'Unknown'}
Trigger Event Detected: ${selLead.trigger_event || 'None — use time-based approach'}
Salesperson: ${selLead.salesperson || 'Your rep'}

WRITE A ${channelLabel.toUpperCase()}.

STRICT RULES:
- Open with first name only
- Reference the trigger event naturally — not creepy or intrusive
- Briefly acknowledge the silence without groveling
- Tie in their specific vehicle and motivation
- Build urgency without pressure
- End with ONE clear, low-friction call to action
- Sound warm and human — never robotic or salesy
- NEVER use "just checking in" or "I wanted to reach out"

After the message, on a new line write exactly:
---
WHY THIS WORKS: [1 sentence on the psychological hook used]
BEST TIME TO SEND: [day + time recommendation with reason]
PREDICTED RESPONSE RATE: [your estimate and brief reason]`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      const msg = data.content?.map(b => b.text || '').join('') || 'Error generating message.'
      setAiMsg(msg); setAiState('done')
      // Save to DB
      await saveRevivalMessage(selId, channel, msg, dealership.id)
    } catch {
      setAiMsg('Connection error. Please try again.'); setAiState('done')
    }
  }

  // REFINE MESSAGE
  const refine = async (instruction) => {
    if (!instruction.trim() || !aiMsg || aiState === 'loading') return
    setAiState('loading')
    const prompt = `Here is a revival message for ${selLead.name} (${selLead.vehicle}):\n\n"${aiMsg}"\n\nInstruction: "${instruction}"\n\nRewrite applying this change. Keep same format: message + --- + WHY THIS WORKS + BEST TIME TO SEND + PREDICTED RESPONSE RATE.`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      const msg = data.content?.map(b => b.text || '').join('') || 'Error.'
      setAiMsg(msg); setAiState('done')
      await saveRevivalMessage(selId, channel, msg, dealership.id)
    } catch {
      setAiState('done')
    }
  }

  // PBS IMPORT
  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const colMap = {
          name: ['customer name', 'name', 'full name', 'contact'],
          phone: ['phone', 'cell', 'mobile', 'phone number'],
          email: ['email', 'email address'],
          vehicle: ['vehicle interest', 'vehicle', 'vehicle of interest', 'year/make/model'],
          budget: ['budget', 'price', 'amount'],
          days_silent: ['days', 'days since contact'],
          trigger_event: ['trigger', 'trigger event'],
          last_touch: ['last note', 'notes', 'reason cold', 'last comment'],
          salesperson: ['salesperson', 'rep', 'sales rep'],
          lead_source: ['lead source', 'source'],
          lastContact: ['last contact date', 'last activity date', 'last contact']
        }
        const findCol = (obj, keys) => {
          const okeys = Object.keys(obj)
          for (const k of keys) {
            const match = okeys.find(ok => ok.toLowerCase().includes(k) || k.includes(ok.toLowerCase()))
            if (match) return obj[match]
          }
          return ''
        }
        const today = new Date()
        const newLeads = rows.map((row, i) => {
          const name = String(findCol(row, colMap.name) || '').trim()
          const vehicle = String(findCol(row, colMap.vehicle) || '').trim()
          if (!name || !vehicle) return null
          const lastContactStr = findCol(row, colMap.lastContact)
          let days = parseInt(findCol(row, colMap.days_silent)) || 0
          if (!days && lastContactStr) {
            const d = new Date(lastContactStr)
            if (!isNaN(d)) days = Math.floor((today - d) / (1000 * 60 * 60 * 24))
          }
          if (!days) days = 60
          const trigger = String(findCol(row, colMap.trigger_event) || '').trim()
          const budget = parseFloat(String(findCol(row, colMap.budget) || '0').replace(/[$,]/g, '')) || 0
          return {
            dealership_id: dealership.id,
            name, phone: String(findCol(row, colMap.phone) || ''),
            email: String(findCol(row, colMap.email) || ''),
            vehicle, budget, days_silent: days,
            heat: calcHeat(days, trigger), trigger_event: trigger,
            motivation: 'Imported from PBS',
            last_touch: String(findCol(row, colMap.last_touch) || 'No notes'),
            persona: ['Profiling pending'],
            buy_score: calcBuyScore(days, trigger),
            engage_score: calcBuyScore(days, trigger) - 5,
            salesperson: String(findCol(row, colMap.salesperson) || ''),
            lead_source: String(findCol(row, colMap.lead_source) || 'PBS Import'),
            channel: 'text',
            timeline: [
              { date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), text: `Imported from PBS: ${file.name}`, hot: false },
              ...(trigger ? [{ date: 'Today', text: `🔥 TRIGGER: ${trigger}`, hot: true }] : [])
            ]
          }
        }).filter(Boolean)
        const created = await bulkInsertLeads(newLeads)
        setLeads(prev => [...(created || []), ...prev])
        setModal(null)
        notify(`✅ ${newLeads.length} leads imported from PBS!`)
      } catch (err) {
        notify('❌ Could not read file. Please use .xlsx or .csv')
      }
    }
    reader.readAsBinaryString(file)
  }

  // EXPORT
  const exportLeads = () => {
    if (!leads.length) return notify('No leads to export')
    const rows = leads.map(l => ({
      'Name': l.name, 'Phone': l.phone, 'Email': l.email,
      'Vehicle': l.vehicle, 'Budget': fmtBudget(l.budget),
      'Days Silent': l.days_silent, 'Heat': l.heat,
      'Buy Score': l.buy_score + '%', 'Trigger': l.trigger_event || '',
      'Reason Cold': l.last_touch, 'Salesperson': l.salesperson || ''
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, 'Ghost Closer Leads', ws)
    XLSX.writeFile(wb, 'GhostCloser_' + new Date().toISOString().slice(0, 10) + '.xlsx')
    notify('📤 Exported to Excel!')
  }

  if (dbLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center', fontFamily: 'Syne, sans-serif' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👻</div>
        <div style={{ color: '#888', fontSize: 13 }}>Loading your pipeline...</div>
      </div>
    </div>
  )

  return (
    <div style={s.app}>
      {/* TOPBAR */}
      <div style={s.topbar}>
        <div style={s.logo}>
          <div style={s.logoIcon}>👻</div>
          <div>
            <div style={s.logoName}>Ghost Closer</div>
            <div style={s.logoSub}>{dealership?.name}</div>
          </div>
        </div>
        <div style={s.topActions}>
          <button style={s.btn} onClick={() => setModal('upload')}>📥 Import PBS</button>
          <button style={s.btn} onClick={exportLeads}>📤 Export</button>
          <button style={{ ...s.btn, ...s.btnDark }} onClick={() => { setFormData({}); setModal('add') }}>+ Add Lead</button>
          <button style={s.btn} onClick={signOut} title="Sign out">⎋</button>
        </div>
      </div>

      {/* STATS */}
      <div style={s.statBar}>
        {[
          { n: stats.fire, l: '🔥 On Fire', c: '#e24b4a' },
          { n: stats.warm, l: '⚡ Warming', c: '#ba7517' },
          { n: stats.cold, l: '❄️ Cold', c: '#185fa5' },
          { n: stats.revived, l: '✅ Revived', c: '#3b6d11' },
          { n: fmtValue(stats.value), l: '💰 Pipeline', c: '#534ab7' },
        ].map(({ n, l, c }) => (
          <div key={l} style={s.stat}>
            <div style={{ ...s.statN, color: c }}>{n}</div>
            <div style={s.statL}>{l}</div>
          </div>
        ))}
      </div>

      {/* BODY */}
      <div style={s.body}>
        {/* SIDEBAR */}
        <div style={s.sidebar}>
          <div style={s.sideTop}>
            <span style={s.sideTitle}>Pipeline ({filtered.length})</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {[['all', 'All'], ['fire', '🔥'], ['warm', '⚡'], ['cold', '❄️']].map(([f, label]) => (
                <button key={f} style={{ ...s.tab, ...(filter === f ? s.tabOn : {}) }} onClick={() => setFilter(f)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={s.searchRow}>
            <input style={s.searchInp} placeholder="Search leads, vehicles..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={s.leadList}>
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: '#aaa', fontFamily: 'DM Mono, monospace' }}>
                {leads.length === 0 ? 'Import leads from PBS to get started' : 'No leads match filter'}
              </div>
            )}
            {filtered.map(l => (
              <div key={l.id} style={{ ...s.leadCard, ...(selId === l.id ? s.leadCardSel : {}) }} onClick={() => { setSelId(l.id); setAiMsg(''); setAiState('idle'); setChannel(l.channel || 'text') }}>
                {selId === l.id && <div style={s.selBar} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={s.leadName}>{l.name}</div>
                  <span style={{ ...s.badge, ...(l.heat === 'fire' ? s.bFire : l.heat === 'warm' ? s.bWarm : s.bCold) }}>
                    {l.heat === 'fire' ? '🔥 Hot' : l.heat === 'warm' ? '⚡ Warm' : '❄️ Cold'}
                  </span>
                </div>
                <div style={s.leadVehicle}>{l.vehicle}</div>
                <div style={s.leadMeta}>
                  <span>{l.days_silent}d silent</span>
                  <span>{fmtBudget(l.budget)}</span>
                  <span>{l.buy_score}% buy</span>
                </div>
                {l.trigger_event && <div style={s.triggerPill}>{l.trigger_event}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* MAIN PANEL */}
        <div style={s.main}>
          {!selLead ? (
            <div style={s.empty}>
              <div style={{ fontSize: 40, opacity: 0.2 }}>👻</div>
              <div>Select a lead to start reviving them</div>
              {leads.length === 0 && <button style={{ ...s.btn, ...s.btnDark, marginTop: 12 }} onClick={() => setModal('upload')}>📥 Import from PBS</button>}
            </div>
          ) : (
            <>
              <div style={s.detailHead}>
                <div style={s.detailName}>{selLead.name}</div>
                <div style={s.detailMeta}>
                  <span>{selLead.vehicle}</span>
                  <span>{selLead.days_silent}d silent</span>
                  <span>{fmtBudget(selLead.budget)}</span>
                  {selLead.phone && <span>📱 {selLead.phone}</span>}
                  {selLead.salesperson && <span>👤 {selLead.salesperson}</span>}
                </div>
              </div>

              <div style={s.detailBody}>
                {/* SCORES */}
                <div>
                  <div style={s.secLabel}>Revival Scores</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Buy Probability', val: selLead.buy_score, color: '#e24b4a' },
                      { label: 'Engagement Readiness', val: selLead.engage_score, color: '#185fa5' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={s.pcard}>
                        <div style={s.pcardLabel}>{label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <div style={{ flex: 1, height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: val + '%', height: '100%', background: color, borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'DM Mono, monospace' }}>{val}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PROFILE */}
                <div>
                  <div style={s.secLabel}>Buyer Profile</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={s.pcard}><div style={s.pcardLabel}>Motivation</div><div style={{ fontSize: 12 }}>{selLead.motivation}</div></div>
                    <div style={s.pcard}><div style={s.pcardLabel}>Why Cold</div><div style={{ fontSize: 12 }}>{selLead.last_touch}</div></div>
                  </div>
                  {selLead.persona?.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
                      {selLead.persona.map(p => <span key={p} style={s.personaTag}>{p}</span>)}
                    </div>
                  )}
                </div>

                {/* CHANNEL */}
                <div>
                  <div style={s.secLabel}>Contact Channel</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['text', '📱 Text'], ['email', '📧 Email'], ['call', '📞 Call Script']].map(([c, label]) => (
                      <button key={c} style={{ ...s.ctab, ...(channel === c ? s.ctabOn : {}) }} onClick={() => setChannel(c)}>{label}</button>
                    ))}
                  </div>
                </div>

                {/* TIMELINE */}
                {selLead.timeline?.length > 0 && (
                  <div>
                    <div style={s.secLabel}>Activity Timeline</div>
                    <div style={{ borderLeft: '0.5px solid #ddd', paddingLeft: 16, marginLeft: 4 }}>
                      {selLead.timeline.map((e, i) => (
                        <div key={i} style={{ marginBottom: 10, position: 'relative' }}>
                          <div style={{ position: 'absolute', left: -20, top: 4, width: 7, height: 7, borderRadius: '50%', background: e.hot ? '#e24b4a' : '#ddd' }} />
                          <div style={{ fontSize: 10, color: '#aaa', fontFamily: 'DM Mono, monospace' }}>{e.date}</div>
                          <div style={{ fontSize: 12 }}>{e.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI MESSAGE */}
                <div>
                  <div style={s.secLabel}>AI Revival Message</div>
                  {aiState === 'loading' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888', fontFamily: 'DM Mono, monospace' }}>
                      <div style={s.spinner} />Writing personalized message...
                    </div>
                  )}
                  {aiState === 'done' && aiMsg && (
                    <>
                      <div style={s.aiBox}>{aiMsg}</div>
                      <RefineInput onRefine={refine} onCopy={() => {
                        navigator.clipboard.writeText(aiMsg.split('---')[0].trim())
                        notify('📋 Message copied!')
                      }} />
                    </>
                  )}
                  {aiState === 'idle' && (
                    <div style={{ fontSize: 12, color: '#999', fontFamily: 'DM Mono, monospace' }}>
                      Click "Generate Revival Message" to craft a personalized {channel} for {selLead.name.split(' ')[0]}.
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION BAR */}
              <div style={s.actionBar}>
                <button style={{ ...s.btn, ...s.btnRed }} onClick={generate} disabled={aiState === 'loading'}>
                  👻 Generate Revival Message
                </button>
                <button style={{ ...s.btn, ...s.btnGreen }} onClick={() => handleRevive(selId)}>✅ Mark Revived</button>
                <button style={s.btn} onClick={() => { setFormData({ ...selLead, trigger_event: selLead.trigger_event || '' }); setModal('edit') }}>✏️ Edit</button>
                <button style={{ ...s.btn, marginLeft: 'auto', color: '#bbb' }} onClick={() => handleRemove(selId)}>Remove</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODALS */}
      {modal && <Modal onClose={() => { setModal(null); setFormData({}) }}>
        {modal === 'add' && <AddEditForm title="Add New Lead" formData={formData} setFormData={setFormData} onSubmit={handleAdd} onCancel={() => setModal(null)} />}
        {modal === 'edit' && selLead && <AddEditForm title={`Edit — ${selLead.name}`} formData={formData} setFormData={setFormData} onSubmit={handleEdit} onCancel={() => setModal(null)} />}
        {modal === 'upload' && <UploadModal onFile={handleFile} onCancel={() => setModal(null)} />}
      </Modal>}

      <div id="gc-notif" style={s.notif} />
    </div>
  )
}

function RefineInput({ onRefine, onCopy }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
      <input style={{ flex: 1, padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif' }}
        placeholder='Refine: "shorter" / "add urgency" / "mention trade-in"...'
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onRefine(val); setVal('') } }} />
      <button style={{ padding: '7px 12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer' }}
        onClick={() => { onRefine(val); setVal('') }}>Refine ↗</button>
      <button style={{ padding: '7px 10px', border: '0.5px solid #ddd', borderRadius: 8, background: 'transparent', cursor: 'pointer' }} onClick={onCopy} title="Copy message">📋</button>
    </div>
  )
}

function AddEditForm({ title, formData, setFormData, onSubmit, onCancel }) {
  const set = (k, v) => setFormData(p => ({ ...p, [k]: v }))
  return (
    <div>
      <div style={ms.title}>{title}</div>
      <div style={ms.row}>
        <Field label="Full Name *" value={formData.name || ''} onChange={v => set('name', v)} placeholder="Mike Tremblay" />
        <Field label="Phone" value={formData.phone || ''} onChange={v => set('phone', v)} placeholder="506-555-0000" />
      </div>
      <Field label="Email" value={formData.email || ''} onChange={v => set('email', v)} placeholder="customer@email.com" full />
      <div style={ms.row}>
        <Field label="Vehicle Interest *" value={formData.vehicle || ''} onChange={v => set('vehicle', v)} placeholder="2024 Ford F-150" />
        <Field label="Budget ($)" value={formData.budget || ''} onChange={v => set('budget', v)} placeholder="65000" type="number" />
      </div>
      <div style={ms.row}>
        <Field label="Days Silent" value={formData.days_silent || ''} onChange={v => set('days_silent', v)} placeholder="60" type="number" />
        <Field label="Salesperson" value={formData.salesperson || ''} onChange={v => set('salesperson', v)} placeholder="Jean Leblanc" />
      </div>
      <Field label="Why Did They Go Cold?" value={formData.last_touch || ''} onChange={v => set('last_touch', v)} placeholder="Price objection, credit issue..." full />
      <Field label="Motivation" value={formData.motivation || ''} onChange={v => set('motivation', v)} placeholder="Work truck for business..." full />
      <div style={{ marginBottom: 14 }}>
        <div style={ms.label}>Trigger Event</div>
        <select style={ms.inp} value={formData.trigger_event || ''} onChange={e => set('trigger_event', e.target.value)}>
          <option value="">None detected</option>
          {['Lease ending soon', 'Job promotion detected', 'Credit score improved', 'New baby registered', 'Home purchase detected', 'Insurance renewal', 'High mileage alert', 'Price drop on interest'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...ms.btn, background: '#1a1a2e', color: '#fff', flex: 1 }} onClick={onSubmit}>Save Lead</button>
        <button style={ms.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, full, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12, ...(full ? {} : {}) }}>
      <div style={ms.label}>{label}</div>
      <input style={ms.inp} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function UploadModal({ onFile, onCancel }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div>
      <div style={ms.title}>📥 Import from PBS</div>
      <div style={ms.sub}>Upload your PBS dead lead export (.xlsx or .csv)</div>
      <div style={{ border: `2px dashed ${dragging ? '#e24b4a' : '#ddd'}`, borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: dragging ? '#fff5f5' : '#fafafa', transition: 'all .2s' }}
        onClick={() => document.getElementById('gc-file-inp').click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]) }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Drop your PBS file here</div>
        <div style={{ fontSize: 12, color: '#888', fontFamily: 'DM Mono, monospace' }}>Supports .xlsx and .csv — auto-maps all PBS columns</div>
      </div>
      <input id="gc-file-inp" type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files[0])} />
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#666', fontFamily: 'DM Mono, monospace', lineHeight: 1.7, marginBottom: 14 }}>
        PBS → CRM → Lead Management → Filter: Lost/Dead → Export Excel → Upload here
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...ms.btn, flex: 1 }} onClick={() => document.getElementById('gc-file-inp').click()}>📂 Browse File</button>
        <button style={ms.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', width: 500, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', border: '0.5px solid #eee' }}>
        {children}
      </div>
    </div>
  )
}

// ── STYLES ──────────────────────────────────────────────
const s = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Syne', sans-serif", overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '0.5px solid #eee', flexShrink: 0, gap: 12, background: '#fff' },
  logo: { display: 'flex', alignItems: 'center', gap: 9 },
  logoIcon: { width: 32, height: 32, background: '#1a1a2e', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  logoName: { fontSize: 15, fontWeight: 800, letterSpacing: -0.3 },
  logoSub: { fontSize: 10, color: '#888', fontFamily: 'DM Mono, monospace', letterSpacing: 0.3 },
  topActions: { display: 'flex', alignItems: 'center', gap: 7 },
  btn: { fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 8, border: '0.5px solid #ddd', cursor: 'pointer', background: 'transparent', color: '#333', transition: 'all .15s' },
  btnDark: { background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e' },
  btnRed: { background: '#e24b4a', color: '#fff', borderColor: '#e24b4a' },
  btnGreen: { background: '#3b6d11', color: '#fff', borderColor: '#3b6d11' },
  statBar: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1px', background: '#eee', borderBottom: '0.5px solid #eee', flexShrink: 0 },
  stat: { background: '#fff', padding: '9px 16px', textAlign: 'center' },
  statN: { fontSize: 20, fontWeight: 800, letterSpacing: -1, lineHeight: 1 },
  statL: { fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'DM Mono, monospace', marginTop: 2 },
  body: { display: 'grid', gridTemplateColumns: '290px 1fr', flex: 1, overflow: 'hidden' },
  sidebar: { borderRight: '0.5px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  sideTop: { padding: '10px 12px', borderBottom: '0.5px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  sideTitle: { fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'DM Mono, monospace', color: '#888' },
  tab: { fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '3px 7px', borderRadius: 4, cursor: 'pointer', border: '0.5px solid #eee', background: 'transparent', color: '#888' },
  tabOn: { background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e' },
  searchRow: { padding: '8px 12px', borderBottom: '0.5px solid #eee', flexShrink: 0 },
  searchInp: { width: '100%', padding: '6px 10px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 12, fontFamily: 'Syne, sans-serif', background: '#fafafa', boxSizing: 'border-box' },
  leadList: { overflowY: 'auto', flex: 1 },
  leadCard: { padding: '11px 13px', borderBottom: '0.5px solid #f0f0f0', cursor: 'pointer', position: 'relative', background: '#fff' },
  leadCardSel: { background: '#fafafa' },
  selBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#e24b4a' },
  leadName: { fontSize: 13, fontWeight: 700, letterSpacing: -0.2 },
  leadVehicle: { fontSize: 11, color: '#888', marginBottom: 3 },
  leadMeta: { fontSize: 10, color: '#bbb', fontFamily: 'DM Mono, monospace', display: 'flex', gap: 8 },
  badge: { fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  bFire: { background: '#fcebeb', color: '#a32d2d' },
  bWarm: { background: '#faeeda', color: '#854f0b' },
  bCold: { background: '#e6f1fb', color: '#185fa5' },
  triggerPill: { fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '2px 6px', background: '#e6f1fb', color: '#185fa5', borderRadius: 3, marginTop: 4, display: 'inline-block' },
  main: { display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 12, gap: 8, fontFamily: 'DM Mono, monospace' },
  detailHead: { padding: '16px 20px 12px', borderBottom: '0.5px solid #eee', flexShrink: 0 },
  detailName: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 3 },
  detailMeta: { fontSize: 11, color: '#888', fontFamily: 'DM Mono, monospace', display: 'flex', gap: 14, flexWrap: 'wrap' },
  detailBody: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  secLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'DM Mono, monospace', color: '#aaa', marginBottom: 8, fontWeight: 500 },
  pcard: { background: '#f9f9f9', borderRadius: 8, padding: '10px 12px' },
  pcardLabel: { fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'DM Mono, monospace', marginBottom: 3 },
  personaTag: { fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '2px 7px', borderRadius: 3, background: '#eeedfe', color: '#3c3489' },
  ctab: { fontSize: 11, fontFamily: 'DM Mono, monospace', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: '0.5px solid #ddd', background: 'transparent', color: '#888' },
  ctabOn: { background: '#1a1a2e', color: '#fff', borderColor: '#1a1a2e' },
  aiBox: { background: '#f9f9f9', borderRadius: 12, padding: '14px 16px', borderLeft: '3px solid #e24b4a', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' },
  spinner: { width: 12, height: 12, border: '1.5px solid #eee', borderTopColor: '#e24b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 },
  actionBar: { display: 'flex', gap: 7, flexShrink: 0, padding: '12px 20px', borderTop: '0.5px solid #eee', background: '#fff', flexWrap: 'wrap' },
  notif: { position: 'fixed', bottom: 20, right: 20, background: '#1a1a2e', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Mono, monospace', zIndex: 999, opacity: 0, transition: 'opacity .3s', pointerEvents: 'none' },
}

const ms = {
  title: { fontSize: 17, fontWeight: 800, marginBottom: 16, letterSpacing: -0.3 },
  sub: { fontSize: 11, color: '#888', fontFamily: 'DM Mono, monospace', marginBottom: 16 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  label: { fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  inp: { width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 13, fontFamily: 'Syne, sans-serif', boxSizing: 'border-box', background: '#fafafa' },
  btn: { fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: '0.5px solid #ddd', cursor: 'pointer', background: 'transparent' },
}
