"use client"
import { useState } from 'react'
type Row = { id: string; name: string; etype: 'ORG'|'BU'|'SITE' }
export default function EntitiesAdmin() {
  const [rows, setRows] = useState<Row[]>([{id:'seed-1', name:'HQ', etype:'ORG'}])
  return (
    <div>
      <h2 style={{fontSize:18}}>Entities</h2>
      <div style={{display:'flex', gap:8, marginTop:12}}>
        <input placeholder="Name" id="name" />
        <select id="etype"><option>ORG</option><option>BU</option><option>SITE</option></select>
        <button onClick={()=>{
          const name = (document.getElementById('name') as HTMLInputElement).value
          const etype = (document.getElementById('etype') as HTMLSelectElement).value as Row['etype']
          if (!name) return
          setRows(r=>[...r, { id: crypto.randomUUID(), name, etype }])
        }}>Add</button>
      </div>
      <ul style={{marginTop:12}}>
        {rows.map(r=> <li key={r.id}>{r.name} — {r.etype}</li>)}
      </ul>
    </div>
  )
}


