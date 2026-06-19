// pages/api/sync-status.js
import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5)

  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 's-maxage=60')
  return res.status(200).json(data || [])
}
