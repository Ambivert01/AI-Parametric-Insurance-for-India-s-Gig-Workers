import { useSelector, useDispatch } from 'react-redux';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { selectAuth, selectUI, authActions } from '../../store/index';
import { authAPI } from '../../services/api';
import Icons from './Icons';
import toast from 'react-hot-toast';

const RIDER_NAV = [
  { to: '/dashboard', icon: <Icons.Home />, label: 'Home', end: true },
  { to: '/policies',  icon: <Icons.Shield />, label: 'My Shield' },
  { to: '/claims',    icon: <Icons.FileText />, label: 'Claims' },
  { to: '/payments',  icon: <Icons.Wallet />, label: 'Payments' },
  { to: '/community', icon: <Icons.Users />, label: 'Community' },
  { to: '/profile',   icon: <Icons.Settings />, label: 'Profile' },
];
const ADMIN_NAV = [
  { to: '/admin',        icon: <Icons.BarChart2 />, label: 'Dashboard', end: true },
  { to: '/admin/claims', icon: <Icons.FileText />, label: 'Claims' },
  { to: '/admin/riders', icon: <Icons.Users />, label: 'Riders' },
  { to: '/admin/fraud',  icon: <Icons.AlertTriangle />, label: 'Fraud' },
  { to: '/admin/map',    icon: <Icons.Map />, label: 'Risk Map' },
  { to: '/admin/pool',   icon: <Icons.Activity />, label: 'Pool' },
];

export default function AppLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(selectAuth);
  const { unreadCount } = useSelector(selectUI);
  const isAdmin = ['admin','insurer','super_admin'].includes(user?.role);
  const nav = isAdmin ? ADMIN_NAV : RIDER_NAV;

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    dispatch(authActions.logout());
    navigate('/auth');
    toast.success('Logged out');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span style={{fontSize:'1.5rem'}}>🛡️</span>
          <div>
            <div className="logo-text">GigShield</div>
            {isAdmin && <span className="logo-badge">Admin</span>}
          </div>
        </div>
        <nav className="sidebar-nav">
          {nav.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({isActive}) => `nav-item ${isActive?'active':''}`}>
              {item.icon}{item.label}
              {item.label==='Home' && unreadCount>0 && (
                <span style={{marginLeft:'auto',background:'var(--orange-500)',color:'white',borderRadius:'var(--r-full)',width:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.6875rem',fontWeight:700}}>
                  {unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div style={{padding:'var(--s4) var(--s3)',borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'var(--s3)',padding:'var(--s3) var(--s4)',marginBottom:'var(--s2)'}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:'var(--orange-500)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-display)',fontWeight:700,fontSize:'1rem',color:'white',flexShrink:0}}>
              {user?.name?.[0]?.toUpperCase()||'?'}
            </div>
            <div style={{overflow:'hidden'}}>
              <div style={{fontWeight:600,fontSize:'0.875rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name||'Rider'}</div>
              <div style={{fontSize:'0.75rem',color:'var(--text-muted)',textTransform:'capitalize'}}>{user?.riderProfile?.cityId||user?.role}</div>
            </div>
          </div>
          <button className="nav-item" style={{width:'100%',color:'var(--red-400)'}} onClick={handleLogout}>
            <Icons.LogOut size={18}/>Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="page-container"><Outlet /></div>
      </main>
      <nav className="mobile-nav">
        <div className="mobile-nav-items">
          {nav.slice(0,5).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({isActive}) => `mobile-nav-item ${isActive?'active':''}`}>
              {item.icon}<span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
