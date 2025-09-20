export async function POST() {
  return new Response(JSON.stringify({
    tables: [],
    fields: [
      { name:'kWh', candidates:[{ value:'1234', conf:0.9 }]},
      { name:'date', candidates:[{ value: new Date().toISOString().slice(0,10), conf:0.85 }]},
      { name:'site', candidates:[{ value:'HQ', conf:0.6 }]}
    ]
  }), { headers: { 'Content-Type':'application/json' }})
}


