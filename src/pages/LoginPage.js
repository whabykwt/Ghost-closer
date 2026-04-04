import React, { useState } from 'react'
import { signIn, signUp, supabase } from '../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dealerName, setDealerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
      } else {
        const { data, error } = await signUp(email, password)
        if (error) throw error
        // Create dealership record
        if (data.user) {
          await supabase.from('dealerships').insert([{
            name: dealerName || email.split('@')[0] + "'s Dealership",
            owner_email: email
          }])
        }
        setSuccess('Account created! Check your email to confirm, then log in.')
        setMode('login')
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={styles.bg}>
      <div style={styles.left}>
        <div style={styles.leftInner}>
          <div style={styles.ghostIcon}>👻</div>
          <h1 style={styles.headline}>Ghost Closer</h1>
          <p style={styles.tagline}>Your dead leads aren't dead.<br />They're just waiting for the right moment.</p>
          <div style={styles.features}>
            {['AI-powered revival messages', 'PBS Excel import', 'Live buyer heat scoring', 'Text, email & call scripts', 'Full team pipeline'].map(f => (
              <div key={f} style={styles.feature}>
                <span style={styles.featureDot}>▸</span>{f}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>{mode === 'login' ? 'Sign in to your dealership' : 'Create your account'}</div>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.successMsg}>{success}</div>}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div style={styles.field}>
                <label style={styles.label}>Dealership Name</label>
                <input style={styles.input} value={dealerName} onChange={e => setDealerName(e.target.value)} placeholder="Acme Motors Moncton" />
              </div>
            )}
            <div style={styles.field}>
              <label style={styles.label}>Email Address</label>
              <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@dealership.com" required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div style={styles.switchRow}>
            {mode === 'login' ? (
              <span>No account? <button style={styles.link} onClick={() => setMode('signup')}>Create one free</button></span>
            ) : (
              <span>Already have an account? <button style={styles.link} onClick={() => setMode('login')}>Sign in</button></span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  bg: { display: 'flex', minHeight: '100vh', fontFamily: "'Syne', sans-serif" },
  left: { flex: 1, background: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' },
  leftInner: { maxWidth: 420 },
  ghostIcon: { fontSize: 52, marginBottom: 20 },
  headline: { fontSize: 48, fontWeight: 800, color: '#fff', letterSpacing: -2, marginBottom: 16, lineHeight: 1 },
  tagline: { fontSize: 18, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 40 },
  features: { display: 'flex', flexDirection: 'column', gap: 12 },
  feature: { fontSize: 14, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 10 },
  featureDot: { color: '#e24b4a', fontSize: 12 },
  right: { width: 480, background: '#f4f3ef', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '36px 32px', border: '0.5px solid #e0e0e0' },
  cardTitle: { fontSize: 20, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: 8, fontSize: 14, fontFamily: "'Syne', sans-serif", outline: 'none', boxSizing: 'border-box', background: '#fafafa' },
  submitBtn: { width: '100%', padding: '12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "'Syne', sans-serif", cursor: 'pointer', marginTop: 8 },
  switchRow: { textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' },
  link: { background: 'none', border: 'none', color: '#e24b4a', cursor: 'pointer', fontSize: 13, fontFamily: "'Syne', sans-serif", fontWeight: 700 },
  error: { background: '#fff0f0', border: '0.5px solid #fcc', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c00', marginBottom: 16 },
  successMsg: { background: '#f0fff4', border: '0.5px solid #c3e6cb', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#276749', marginBottom: 16 },
}
