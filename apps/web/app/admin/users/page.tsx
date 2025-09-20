export default function UsersAdmin() {
  return (
    <div>
      <h2 style={{fontSize:18}}>Users</h2>
      <div style={{display:'flex', gap:8, marginTop:12}}>
        <input placeholder="email@example.com" />
        <button data-test="admin-invite-user" onClick={()=>alert('Invite stub recorded')}>Invite</button>
      </div>
    </div>
  )
}


