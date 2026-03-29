import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectAdmin, selectDashboard, selectUI, dashboardActions, adminActions, uiActions } from '../../store/index';
import { analyticsAPI, adminAPI } from '../../services/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import Icons from '../../components/shared/Icons';

const PIE_COLORS = ['#FF6B2B','#00C48C','#F59E0B','#3A7CB8','#EF4444'];
const CITIES = ['mumbai','delhi','bengaluru','hyderabad','chennai','pune','kolkata'];
const TRIGGER_TYPES = ['HEAVY_RAIN','AQI_SPIKE','EXTREME_HEAT','CYCLONE','CURFEW','PLATFORM_OUTAGE'];

export default function AdminDashboard() {
  const dispatch = useDispatch();
  const { adminData, heatmap } = useSelector(selectDashboard);
  const { triggers, fraudLogs } = useSelector(selectAdmin);
  const { activeTriggerAlert } = useSelector(selectUI);
  const [loading, setLoading] = useState(true);
  const [injecting, setInjecting] = useState(false);
  const [form, setForm] = useState({ cityId:'mumbai', triggerType:'HEAVY_RAIN', triggerValue:65 });
  const [apiHealth, setApiHealth] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d,h,t,f,ah] = await Promise.allSettled([
        analyticsAPI.getAdminDashboard(),
        analyticsAPI.getHeatmap(),
        adminAPI.getTriggers(1),
        adminAPI.getFraudLogs(1),
        adminAPI.getAPIHealth(),
      ]);
      if(d.status==='fulfilled') dispatch(dashboardActions.setAdminDashboard(d.value.data.data));
      if(h.status==='fulfilled') dispatch(dashboardActions.setHeatmap(h.value.data.data));
      if(t.status==='fulfilled') dispatch(adminActions.setTriggers(t.value.data.data||[]));
      if(f.status==='fulfilled') dispatch(adminActions.setFraudLogs(f.value.data.data||[]));
      if(ah.status==='fulfilled') setApiHealth(ah.value.data.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const iv=setInterval(load,30000); return()=>clearInterval(iv); }, []);

  const injectTrigger = async () => {
    setInjecting(true);
    try { await adminAPI.injectTrigger(form.cityId,form.triggerType,form.triggerValue); toast.success(`⚡ ${form.triggerType} injected in ${form.cityId}`); setTimeout(load,2000); }
    catch { toast.error('Injection failed'); } finally { setInjecting(false); }
  };

  const s = adminData?.summary;
  const weeklyData = Array.from({length:7},(_,i)=>({day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],claims:Math.floor(Math.random()*80+20),policies:Math.floor(Math.random()*200+800)}));
  const tierPie = (adminData?.tierBreakdown||[]).map((t,i)=>({name:t._id,value:t.count,fill:PIE_COLORS[i]}));

  if(loading) return (
    <div style={{display:'flex',flexDirection:'column',gap:'var(--s4)'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'var(--s4)'}}>
        {[1,2,3,4].map(i=><div key={i} className="skeleton" style={{height:100,borderRadius:'var(--r-lg)'}}/>)}
      </div>
      <div className="skeleton" style={{height:300,borderRadius:'var(--r-lg)'}}/>
    </div>
  );

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',gap:'var(--s6)'}}>
      {activeTriggerAlert&&(
        <div className="alert-banner danger" style={{animation:'payoutIn 0.5s cubic-bezier(0.34,1.56,0.64,1)'}}>
          <span style={{fontSize:'1.5rem'}}>⚡</span>
          <div>
            <strong>LIVE: {activeTriggerAlert.type} in {activeTriggerAlert.city?.toUpperCase()}</strong>
            <p style={{marginTop:4,fontSize:'0.875rem'}}>Claims auto-processing. Value: {activeTriggerAlert.value}</p>
          </div>
          <button style={{marginLeft:'auto',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'1.25rem'}} onClick={()=>dispatch(uiActions.setTriggerAlert(null))}>×</button>
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><h1>Insurer Dashboard</h1><p style={{fontSize:'0.875rem'}}>Real-time platform analytics</p></div>
        <div style={{display:'flex',gap:'var(--s3)',alignItems:'center'}}>
          {apiHealth&&Object.entries(apiHealth).filter(([k])=>k!=='checkedAt').map(([k,v])=>(
            <div key={k} title={`${k}: ${v}`} style={{display:'flex',alignItems:'center',gap:4,fontSize:'0.75rem',color:'var(--text-muted)'}}>
              <div className="status-dot" style={{background:v==='ok'?'var(--green-500)':'var(--red-500)'}}/>
              {k.replace('Service','').slice(0,8)}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={load}><Icons.RefreshCw size={16}/> Refresh</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'var(--s4)'}}>
        {[
          {label:'Active Policies',val:(s?.activePolicies||0).toLocaleString(),c:'var(--orange-400)',icon:<Icons.Shield size={18}/>},
          {label:"Today's Payouts",val:`₹${((s?.todayPayoutsInr||0)/1000).toFixed(1)}K`,c:'var(--green-400)',icon:<Icons.Wallet size={18}/>,sub:`${s?.todayPayoutsCount||0} claims`},
          {label:'Loss Ratio',val:`${(((s?.lossRatio||0))*100).toFixed(1)}%`,c:(s?.lossRatio||0)>0.7?'var(--red-400)':'var(--green-400)',icon:<Icons.TrendingUp size={18}/>,sub:'Target: <70%'},
          {label:'Avg Payout',val:`${Math.round((s?.avgClaimProcessingMs||0)/60000)}min`,c:'var(--amber-400)',icon:<Icons.Zap size={18}/>,sub:'Target: <15min'},
          {label:'Pending Claims',val:s?.pendingClaims||0,c:(s?.pendingClaims||0)>10?'var(--red-400)':'var(--amber-400)',icon:<Icons.Clock size={18}/>},
          {label:'Community Pool',val:`₹${(s?.loyaltyPoolBalanceInr||0).toLocaleString('en-IN')}`,c:'var(--navy-400)',icon:<Icons.Users size={18}/>,sub:'This week'},
          {label:'Fraud Today',val:fraudLogs?.length||0,c:'var(--red-400)',icon:<Icons.AlertTriangle size={18}/>},
          {label:'Weekly Premium',val:`₹${((s?.weeklyPremiumInr||0)/1000).toFixed(1)}K`,c:'var(--text-primary)',icon:<Icons.BarChart2 size={18}/>},
        ].map((k,i)=>(
          <div key={i} className="stat-card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'var(--s3)'}}>
              <span className="stat-label">{k.label}</span><span style={{color:k.c}}>{k.icon}</span>
            </div>
            <div className="stat-value" style={{color:k.c,fontSize:'1.625rem'}}>{k.val}</div>
            {k.sub&&<div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'var(--s5)'}}>
        <div className="card">
          <h3 style={{fontSize:'0.9375rem',marginBottom:'var(--s5)'}}>Claims This Week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B2B" stopOpacity={0.3}/><stop offset="95%" stopColor="#FF6B2B" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{fill:'var(--text-muted)',fontSize:12}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-muted)',fontSize:12}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',color:'var(--text-primary)'}}/>
              <Area type="monotone" dataKey="claims" stroke="#FF6B2B" fill="url(#cg)" strokeWidth={2} name="Claims"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{display:'flex',flexDirection:'column'}}>
          <h3 style={{fontSize:'0.9375rem',marginBottom:'var(--s5)'}}>Policy Tiers</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={tierPie.length>0?tierPie:[{name:'STANDARD',value:1,fill:'#FF6B2B'}]} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {(tierPie.length>0?tierPie:[{name:'STANDARD',value:1,fill:'#FF6B2B'}]).map((e,i)=><Cell key={i} fill={e.fill}/>)}
              </Pie>
              <Tooltip contentStyle={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',color:'var(--text-primary)'}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:'flex',flexDirection:'column',gap:'var(--s2)',marginTop:'auto'}}>
            {tierPie.map((t,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'0.8125rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'var(--s2)'}}>
                  <div style={{width:10,height:10,borderRadius:2,background:t.fill}}/>
                  <span style={{color:'var(--text-secondary)'}}>{t.name}</span>
                </div>
                <span style={{fontWeight:600}}>{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--s5)'}}>
        <div className="card" style={{border:'1px solid rgba(255,107,43,0.2)'}}>
          <h3 style={{fontSize:'0.9375rem',marginBottom:'var(--s2)',display:'flex',alignItems:'center',gap:'var(--s2)'}}><Icons.Zap size={16} color="var(--orange-400)"/> Demo: Inject Trigger</h3>
          <p style={{fontSize:'0.8125rem',marginBottom:'var(--s4)'}}>Simulate a real-world event to test the full pipeline</p>
          <div style={{display:'flex',flexDirection:'column',gap:'var(--s3)',marginBottom:'var(--s4)'}}>
            {[
              {key:'cityId',opts:CITIES},{key:'triggerType',opts:TRIGGER_TYPES}
            ].map(f=>(
              <select key={f.key} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}
                style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',padding:'10px var(--s4)',color:'var(--text-primary)',fontSize:'0.875rem',outline:'none'}}>
                {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            <div style={{display:'flex',gap:'var(--s2)',alignItems:'center'}}>
              <input type="number" value={form.triggerValue} onChange={e=>setForm(p=>({...p,triggerValue:Number(e.target.value)}))}
                style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--r-md)',padding:'10px var(--s4)',color:'var(--text-primary)',fontSize:'0.875rem',flex:1,outline:'none'}}/>
              <span style={{fontSize:'0.8125rem',color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                {form.triggerType==='AQI_SPIKE'?'AQI':form.triggerType.includes('HEAT')?'°C':'mm'}
              </span>
            </div>
          </div>
          <button className="btn btn-danger btn-full" onClick={injectTrigger} disabled={injecting}>
            {injecting?<><div className="spinner" style={{width:16,height:16,borderTopColor:'white'}}/>Injecting...</>:'⚡ Fire Trigger Now'}
          </button>
        </div>

        <div className="card">
          <h3 style={{fontSize:'0.9375rem',marginBottom:'var(--s4)'}}>Recent Triggers</h3>
          {triggers.length===0?(
            <p style={{color:'var(--text-muted)',fontSize:'0.875rem',textAlign:'center',padding:'var(--s8) 0'}}>No triggers yet. Use demo panel to inject one.</p>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:'var(--s3)',maxHeight:280,overflowY:'auto'}}>
              {triggers.slice(0,6).map((t,i)=>(
                <div key={t._id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'var(--s3) 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'var(--s3)'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:t.status==='confirmed'?'var(--green-500)':'var(--amber-500)',flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:'0.875rem',fontWeight:600}}>{(t.triggerType||'').replace(/_/g,' ')}</div>
                      <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{t.cityId} • {t.claimsInitiated||0} claims</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right',fontSize:'0.75rem'}}>
                    <div style={{fontWeight:600,color:'var(--orange-400)'}}>{t.triggerValue}{t.triggerUnit}</div>
                    <span className={`badge ${t.status==='confirmed'?'badge-green':'badge-amber'}`}>{t.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
