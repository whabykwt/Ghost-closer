import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────
// STEP 1: Replace these with your Supabase keys
// Get them from: supabase.com → your project → Settings → API
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-anon-key-here'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

// ─────────────────────────────────────────────
// LEAD HELPERS
// ─────────────────────────────────────────────
export const fetchLeads = async (dealershipId) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('dealership_id', dealershipId)
    .neq('heat', 'revived')
    .order('buy_score', { ascending: false })
  if (error) throw error
  return data
}

export const insertLead = async (lead) => {
  const { data, error } = await supabase
    .from('leads')
    .insert([lead])
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateLead = async (id, updates) => {
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteLead = async (id) => {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export const bulkInsertLeads = async (leads) => {
  const { data, error } = await supabase
    .from('leads')
    .insert(leads)
    .select()
  if (error) throw error
  return data
}

export const fetchRevivalMessages = async (leadId) => {
  const { data, error } = await supabase
    .from('revival_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const saveRevivalMessage = async (leadId, channel, message, dealershipId) => {
  const { data, error } = await supabase
    .from('revival_messages')
    .insert([{ lead_id: leadId, channel, message, dealership_id: dealershipId }])
    .select()
    .single()
  if (error) throw error
  return data
}

export const fetchStats = async (dealershipId) => {
  const { data, error } = await supabase
    .from('leads')
    .select('heat, budget')
    .eq('dealership_id', dealershipId)
  if (error) throw error
  return data
}
