import { useEffect, useState } from 'react';
import { publicAPI } from '../../services/api';

export default function PublicMapPage() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    Promise.allSettled([
      publicAPI.getMap().then(r => setData(r.data.data)),
      publicAPI.getStats().then(r => setStats(r.data.data)),
    ]);
  }, []);

  return (
    <div style={{minHeight:'100vh',background:'var(--bg-primary)',padding:'var(--s8)',fontFamily:'var(--font-body)'}}>
      <link rel="stylesheet" href="/src/index.css"/>
      <div style={{maxWidth:900,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:'var(--s8)'}}>
          <div style={{fontSize:'3rem',marginBottom:'var(--s3)'}}>🗺️</div>
          <h1 style={{fontFamily:'var(--font-display)',color:'var(--text-primary)',marginBottom:'var(--s2)'}}>GigShield Live Map</h1>
          <p style={{color:'var(--text-muted)'}}>Real-time parametric insurance triggers across India</p>
        </div>
        {stats&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'var(--s4)',marginBottom:'var(--s8)'}}>
            {[{label:'Riders Protected',val:stats.totalRidersProtected},{label:'Total Payouts',val:`₹${((stats.totalPayoutsInr||0)/100000).toFixed(1)}L`},{label:'Avg Payout Time',val:`${stats.avgPayoutMinutes}min`}].map(k=>(
              <div key={k.label} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'var(--s5)',textAlign:'center'}}>
                <div style={{fontFamily:'var(--font-display)',fontWeight:900,fontSize:'1.75rem',color:'var(--orange-400)'}}>{k.val}</div>
                <div style={{fontSize:'0.8125rem',color:'var(--text-muted)',marginTop:'var(--s1)'}}>{k.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'var(--r-xl)',padding:'var(--s6)'}}>
          <h3 style={{color:'var(--text-primary)',marginBottom:'var(--s4)'}}>Active Events</h3>
          {data?.activeEvents?.length>0?(
            <div style={{display:'flex',flexDirection:'column',gap:'var(--s3)'}}>
              {data.activeEvents.map((e,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--s4)',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--r-md)'}}>
                  <div>
                    <div style={{fontWeight:600,color:'var(--text-primary)'}}>{e.triggerType?.replace(/_/g,' ')} — {e.cityName}</div>
                    <div style={{fontSize:'0.8125rem',color:'var(--text-muted)'}}>Value: {e.triggerValue}{e.triggerUnit}</div>
                  </div>
                  <span style={{background:'rgba(239,68,68,0.15)',color:'var(--red-400)',padding:'4px 10px',borderRadius:'var(--r-full)',fontSize:'0.75rem',fontWeight:700}}>ACTIVE</span>
                </div>
              ))}
            </div>
          ):<p style={{color:'var(--text-muted)',textAlign:'center',padding:'var(--s8)'}}>No active triggers right now. All clear! ✅</p>}
        </div>
      </div>
    </div>
  );
}
