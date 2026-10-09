import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import qrcode from 'qrcode-generator';

// SHOP_CONFIG, APP_VERSION and TEMPLATE_CONFIG are injected as globals by the build (see src/shell.html).

// ── Inline SVG icon set (no dependencies, no emoji) ─────────────────────────
const ICONS = {
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
  box: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M14 21h3M18 18h3v3h-3z"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
  check: <path d="M20 6 9 17l-5-5"/>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
  x: <path d="M18 6 6 18M6 6l12 12"/>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  tag: <><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42Z"/><circle cx="7" cy="7" r="1.5"/></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
  pulse: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></>,
};

const Icon = ({name, size}) => (
  <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">{ICONS[name] || null}</svg>
);

// Initialize Firebase (each service wrapped separately so the setup wizard
// still renders when credentials are placeholders — e.g. the pristine
// template build a shop downloads first).
let database, auth;
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(SHOP_CONFIG.firebase);
  }
  auth = firebase.auth();
} catch(e) {
  console.warn('Firebase Auth init failed — check your SHOP_CONFIG.firebase credentials:', e.message);
}
try {
  database = firebase.database();
} catch(e) {
  console.warn('Firebase Database init failed — check your SHOP_CONFIG.firebase credentials:', e.message);
}

// User roles configuration
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

// Helper function to check if user is admin
const isAdminUser = (email) => {
  return SHOP_CONFIG.adminEmails.map(e => e.toLowerCase()).includes(email.toLowerCase());
};

// Converts an email into a display-safe name (e.g. john.doe.1@us.af.mil → "John D.")
// so email addresses are never shown in the UI.
const displayName = (email) => {
  if (!email) return 'Unknown';
  if (!email.includes('@')) return email;
  const parts = email.split('@')[0].split('.').filter(p => isNaN(p) && p.length > 0);
  if (parts.length >= 2) return `${parts[0][0].toUpperCase()}${parts[0].slice(1)} ${parts[1][0].toUpperCase()}.`;
  if (parts.length === 1) return `${parts[0][0].toUpperCase()}${parts[0].slice(1)}`;
  return email.split('@')[0];
};

// =============================================================================
// DIAGNOSTICS PANEL
// Admin-only health check. Problems show up as simple cards, each with one
// clear action (Setup Wizard, copy-paste button, or Firebase link). Healthy
// checks collapse into a single tidy row. No dead rows, no Notepad surgery.
// =============================================================================
function DiagnosticsPanel({onClose, onOpenWizard}) {
  const [results, setResults]     = useState([]);
  const [running, setRunning]     = useState(false);
  const [lastRun, setLastRun]     = useState(null);
  const [showHealthy, setShowHealthy] = useState(false);
  const [copiedId, setCopiedId]   = useState(null);

  // Template originals (injected at build time) — used to detect "never configured".
  const ORIG = (typeof TEMPLATE_CONFIG !== 'undefined') ? {
    projectId:   TEMPLATE_CONFIG.firebase.projectId,
    shopName:    TEMPLATE_CONFIG.shopName,
    adminEmails: TEMPLATE_CONFIG.adminEmails.map(e => e.toLowerCase()),
  } : {
    projectId:   'PASTE_YOUR_PROJECT_ID_HERE',
    shopName:    'My Shop Tools Tracker',
    adminEmails: ['your.email@us.af.mil'],
  };

  const SECURE_RULES = '{\n  "rules": {\n    ".read": "auth != null",\n    ".write": "auth != null"\n  }\n}';

  const copyText = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(_) {}
      ta.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(cur => cur === id ? null : cur), 2000);
  };

  // Stable AbortController-based fetch with timeout (works on all modern browsers)
  const fetchWithTimeout = (url, ms = 6000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(timer));
  };

  const runChecks = async () => {
    setRunning(true);
    setShowHealthy(false);

    // Result shape per check:
    //   {id, name, status, message, why, steps[], actions[]}
    // status: 'checking' | 'healthy' | 'warning' | 'error'
    // action: {kind:'wizard', label} | {kind:'copy', label, text} | {kind:'link', label, href}
    const seed = [
      {id:'fb-init',       name:'Firebase connection'},
      {id:'fb-conn',       name:'Database exists'},
      {id:'fb-auth',       name:'Login system'},
      {id:'db-read',       name:'Reading the tool list'},
      {id:'db-security',   name:'Database is locked down'},
      {id:'cfg-name',      name:'Shop name'},
      {id:'cfg-firebase',  name:'Your own Firebase project'},
      {id:'cfg-admins',    name:'Admin accounts'},
      {id:'qr-gen',        name:'QR code generator'},
      {id:'browser-store', name:'Browser storage'},
    ];
    const out = {};
    seed.forEach(s => { out[s.id] = {...s, status:'checking', message:'Checking…'}; });
    const set = (id, patch) => {
      out[id] = {...out[id], ...patch};
      setResults(Object.values(out));
    };
    setResults(Object.values(out));

    const fb = SHOP_CONFIG.firebase || {};
    const fbUrl = `https://console.firebase.google.com/project/${fb.projectId || ''}`;
    const wizardAction = {kind:'wizard', label:'Fix in Setup Wizard →'};
    const rulesActions = [
      {kind:'copy', label:'Copy secure rules', text:SECURE_RULES},
      {kind:'link', label:'Open Firebase Rules', href:`${fbUrl}/database`},
    ];

    // ── 1. Firebase Initialization ────────────────────────────────────────────
    if (!database || !auth) {
      set('fb-init', {
        status:'error',
        message:'The app is not connected to Firebase at all',
        why:'The Firebase settings in this file are missing or wrong. Nothing else can work until this is fixed — but the Setup Wizard will walk you through it.',
        actions:[wizardAction],
      });
    } else {
      set('fb-init', {status:'healthy', message:'Connected to Firebase'});
    }

    // ── 2. Database Connection ─────────────────────────────────────────────────
    if (!database) {
      set('fb-conn', {
        status:'error',
        message:'Could not test this yet',
        why:'Fix the Firebase connection problem above first — this check depends on it.',
      });
    } else {
      try {
        const snap = await Promise.race([
          database.ref('.info/connected').once('value'),
          new Promise((_,r) => setTimeout(() => r(new Error('timeout')), 7000))
        ]);
        if (snap.val() === true) {
          set('fb-conn', {status:'healthy', message:'Database is responding'});
        } else {
          set('fb-conn', {
            status:'error',
            message:'Your Firebase project has no database yet',
            why:'The project exists, but nobody has added a Realtime Database to it. Takes about 30 seconds.',
            actions:[{kind:'link', label:'Open Firebase Database', href:`${fbUrl}/database`}],
            steps:[
              'Click "Create Database"',
              'Pick any region → Next',
              'Choose "Start in test mode" → Enable',
              'Come back here and hit Re-run',
            ],
          });
        }
      } catch(e) {
        set('fb-conn', {
          status:'error',
          message:'Cannot reach Firebase',
          why:'This device may be offline — or the database address in your setup is wrong.',
          actions:[wizardAction],
          steps:[
            'Make sure this device has internet',
            'If it does, re-do the Firebase step in the Setup Wizard (button above)',
          ],
        });
      }
    }

    // ── 3. Authentication Service ──────────────────────────────────────────────
    if (!auth) {
      set('fb-auth', {
        status:'error',
        message:'Could not test this yet',
        why:'Fix the Firebase connection problem above first — this check depends on it.',
      });
    } else {
      try {
        await auth.fetchSignInMethodsForEmail('diag-check@example.com');
        set('fb-auth', {
          status:'healthy',
          message: auth.currentUser ? 'Logins are working (you are signed in)' : 'Logins are working',
        });
      } catch(e) {
        if (e.code === 'auth/network-request-failed') {
          set('fb-auth', {
            status:'error',
            message:'The login system is not reachable',
            why:'Email/Password sign-in is probably not turned on in your Firebase project.',
            actions:[{kind:'link', label:'Open Sign-in Methods', href:`${fbUrl}/authentication/providers`}],
            steps:[
              'Click "Email/Password"',
              'Switch it on → Save',
              'Come back here and hit Re-run',
            ],
          });
        } else {
          set('fb-auth', {status:'healthy', message:'Logins are working'});
        }
      }
    }

    // ── 4. Database Read Access ────────────────────────────────────────────────
    if (!database) {
      set('db-read', {
        status:'error',
        message:'Could not test this yet',
        why:'Fix the Firebase connection problem above first — this check depends on it.',
      });
    } else {
      try {
        await database.ref('tools').limitToFirst(1).once('value');
        set('db-read', {status:'healthy', message:'The tool list loads fine'});
      } catch(e) {
        if (e.code === 'PERMISSION_DENIED') {
          set('db-read', {
            status:'error',
            message:'The database is blocking the app',
            why:'The security rules are too strict — even logged-in users cannot see the tool list. Paste in the secure rules below.',
            actions:rulesActions,
            steps:[
              'Open the Rules page (button above) → click the Rules tab',
              'Select everything, delete it, then paste (Ctrl+V)',
              'Click Publish — then hit Re-run here',
            ],
          });
        } else {
          set('db-read', {
            status:'error',
            message:'Could not read the tool list',
            why:'Something unexpected went wrong. Check your internet, then re-run. If it keeps failing, re-do the Firebase step in the Setup Wizard.',
            actions:[wizardAction],
          });
        }
      }
    }

    // ── 5. Database Security Rules ─────────────────────────────────────────────
    if (!fb.databaseURL || /PASTE_YOUR|undefined/i.test(fb.databaseURL)) {
      set('db-security', {
        status:'warning',
        message:'Could not verify the security rules',
        why:'The database address is not set, so this check was skipped. Fix it in the Setup Wizard.',
        actions:[wizardAction],
      });
    } else {
      try {
        const res = await fetchWithTimeout(`${fb.databaseURL}/.json?shallow=true`);
        if (res.status === 200) {
          set('db-security', {
            status:'warning',
            message:'Anyone on the internet can read your tool list',
            why:'Your database is public. It should only open for logged-in users — this is a quick copy-paste fix.',
            actions:rulesActions,
            steps:[
              'Open the Rules page (button above) → click the Rules tab',
              'Select everything, delete it, then paste (Ctrl+V)',
              'Click Publish — then hit Re-run here',
            ],
          });
        } else if (res.status === 401 || res.status === 403) {
          set('db-security', {status:'healthy', message:'Locked down — login required'});
        } else {
          set('db-security', {
            status:'warning',
            message:'Could not confirm the rules are locked down',
            why:'Got an unexpected response. Just hit Re-run to try again.',
          });
        }
      } catch(e) {
        set('db-security', {
          status:'warning',
          message:'Could not check right now',
          why:'A network hiccup got in the way — the rules are probably fine. Try again when the connection is stable.',
        });
      }
    }

    // ── 6. Config: Shop Name ───────────────────────────────────────────────────
    if (SHOP_CONFIG.shopName && SHOP_CONFIG.shopName !== ORIG.shopName) {
      set('cfg-name', {status:'healthy', message:`Set to "${SHOP_CONFIG.shopName}"`});
    } else {
      set('cfg-name', {
        status:'warning',
        message:'Still showing the default shop name',
        why:'Everyone opening this app will see the template name instead of your shop. Change it in the Setup Wizard.',
        actions:[wizardAction],
      });
    }

    // ── 7. Config: Firebase Credentials ───────────────────────────────────────
    const fbUnconfigured = !fb.projectId || fb.projectId === ORIG.projectId
      || /PASTE_YOUR/i.test(fb.projectId) || /PASTE_YOUR/i.test(fb.apiKey || '');
    if (!fbUnconfigured) {
      set('cfg-firebase', {status:'healthy', message:'Using your own Firebase project'});
    } else {
      set('cfg-firebase', {
        status:'warning',
        message:'Still connected to the template database',
        why:'Your tools would share a database with the template. Each shop needs its own free Firebase project — the wizard walks you through it.',
        actions:[wizardAction],
      });
    }

    // ── 8. Config: Admin Accounts ──────────────────────────────────────────────
    const admins = SHOP_CONFIG.adminEmails || [];
    const leftoverDefaults = admins.filter(e => ORIG.adminEmails.includes((e || '').toLowerCase()));
    if (admins.length === 0) {
      set('cfg-admins', {
        status:'error',
        message:'No admins set up',
        why:'Nobody can add tools or manage the app until at least one admin email is set.',
        actions:[wizardAction],
      });
    } else if (leftoverDefaults.length > 0) {
      set('cfg-admins', {
        status:'warning',
        message:'Template admin still has access',
        why:'An email from the template is still on the admin list. Swap in your own people in the Setup Wizard.',
        actions:[wizardAction],
      });
    } else {
      set('cfg-admins', {status:'healthy', message:`${admins.length} admin${admins.length !== 1 ? 's' : ''} set`});
    }

    // ── 9. QR Code Generator (built-in, no network) ──────────────────────────
    try {
      const testUrl = makeQRDataURL('diagnostic-test');
      if (testUrl && testUrl.indexOf('data:image') === 0) {
        set('qr-gen', {status:'healthy', message:'QR codes are working'});
      } else {
        throw new Error('unexpected output');
      }
    } catch(e) {
      set('qr-gen', {
        status:'error',
        message:'QR codes are broken in this copy of the file',
        why:'This is a problem with the file itself, not your setup. Grab a fresh copy.',
        steps:[
          'Download a fresh copy from the Releases page',
          'Run the Setup Wizard on it with your settings',
        ],
      });
    }

    // ── 10. Browser Local Storage ──────────────────────────────────────────────
    try {
      localStorage.setItem('__diag__','1');
      localStorage.removeItem('__diag__');
      set('browser-store', {status:'healthy', message:'Browser storage is working'});
    } catch(e) {
      set('browser-store', {
        status:'warning',
        message:'Settings will not save in this browser',
        why:'You are probably in a private or incognito window.',
        steps:['Open the app in a normal (non-private) browser window'],
      });
    }

    setRunning(false);
    setLastRun(new Date());
  };

  useEffect(() => { runChecks(); }, []);

  const problems = results.filter(r => r.status === 'error' || r.status === 'warning');
  const healthy  = results.filter(r => r.status === 'healthy');
  const anyChecking = results.some(r => r.status === 'checking');
  const overallStatus = results.length === 0 || anyChecking ? 'checking'
    : problems.some(r => r.status === 'error') ? 'error'
    : problems.length > 0 ? 'warning'
    : 'healthy';

  const DOT_COLORS = {healthy:'#10b981', warning:'#f59e0b', error:'#ef4444', checking:'#6366f1'};

  const Dot = ({status, size=10}) => (
    <div className={status==='checking' ? 'diag-pulse' : ''} style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background: DOT_COLORS[status] || '#475569',
      boxShadow: status!=='healthy' ? `0 0 7px ${DOT_COLORS[status]}` : 'none'
    }}/>
  );

  const StatusBadge = ({status}) => {
    const labels = {healthy:'OK', warning:'FIX ME', error:'BROKEN', checking:'…'};
    const bgs    = {healthy:'#065f46', warning:'#78350f', error:'#7f1d1d', checking:'#1e3a5f'};
    const fgs    = {healthy:'#6ee7b7', warning:'#fcd34d', error:'#fca5a5', checking:'#93c5fd'};
    return (
      <span style={{background:bgs[status]||'#1e293b', color:fgs[status]||'#64748b', padding:'2px 9px', borderRadius:'12px', fontSize:'11px', fontWeight:'bold', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>
        {labels[status]||status}
      </span>
    );
  };

  const btnBase = {
    padding:'8px 14px', borderRadius:'7px', fontSize:'13px', fontWeight:'bold',
    cursor:'pointer', textDecoration:'none', display:'inline-block', border:'1px solid transparent',
  };
  const ActionButton = ({action, id}) => {
    if (!action) return null;
    if (action.kind === 'wizard') {
      return <button onClick={onOpenWizard} style={{...btnBase, background:'#2563eb', color:'white'}}>{action.label}</button>;
    }
    if (action.kind === 'copy') {
      const done = copiedId === id;
      return (
        <button onClick={() => copyText(id, action.text)}
          style={{...btnBase, background: done ? '#065f46' : '#78350f', color: done ? '#6ee7b7' : '#fcd34d', borderColor: done ? '#10b981' : '#b45309'}}>
          {done ? '✓ Copied!' : '⧉ ' + action.label}
        </button>
      );
    }
    if (action.kind === 'link') {
      return <a href={action.href} target="_blank" rel="noopener noreferrer"
        style={{...btnBase, background:'#1e3a5f', color:'#93c5fd', borderColor:'#2c5282'}}>{action.label} ↗</a>;
    }
    return null;
  };

  const ProblemCard = ({r}) => {
    const accent = r.status === 'error' ? '#ef4444' : '#f59e0b';
    const border = r.status === 'error' ? '#7f1d1d' : '#78350f';
    return (
      <div style={{background:'#0f172a', borderRadius:'10px', padding:'14px 16px', marginBottom:'10px',
                   border:`1px solid ${border}`, borderLeft:`4px solid ${accent}`}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px'}}>
          <Dot status={r.status} size={10}/>
          <span style={{color:'white', fontSize:'14px', fontWeight:'bold', flex:1}}>{r.name}</span>
          <StatusBadge status={r.status}/>
        </div>
        <p style={{color:'#e2e8f0', fontSize:'13.5px', fontWeight:'600', margin:'0 0 4px'}}>{r.message}</p>
        {r.why && <p style={{color:'#94a3b8', fontSize:'13px', lineHeight:1.6, margin:'0 0 10px'}}>{r.why}</p>}
        {r.actions && r.actions.length > 0 && (
          <div style={{display:'flex', gap:'8px', flexWrap:'wrap', marginBottom: r.steps && r.steps.length ? '10px' : '2px'}}>
            {r.actions.map((a, i) => <ActionButton key={i} action={a} id={r.id}/>)}
          </div>
        )}
        {r.steps && r.steps.length > 0 && (
          <ol style={{margin:0, paddingLeft:'20px', color:'#cbd5e1', fontSize:'13px', lineHeight:1.9}}>
            {r.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
      </div>
    );
  };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',zIndex:2000}}>
      <div style={{background:'#1e293b',borderRadius:'12px',maxWidth:'620px',width:'100%',border:'1px solid #334155',maxHeight:'90vh',display:'flex',flexDirection:'column'}}>

        {/* ── Header ── */}
        <div style={{padding:'16px 20px 14px',borderBottom:'1px solid #334155',display:'flex',alignItems:'center',gap:'12px'}}>
          <Dot status={overallStatus} size={14}/>
          <div style={{flex:1}}>
            <h2 style={{color:'white',fontSize:'17px',fontWeight:'bold',margin:'0 0 2px'}}>System Diagnostics</h2>
            <p style={{color:'#64748b',fontSize:'12px',margin:0}}>
              {running ? 'Running checks…'
               : lastRun ? (problems.length === 0
                   ? `All ${healthy.length} checks passed · ${lastRun.toLocaleTimeString()}`
                   : `${problems.length} need${problems.length === 1 ? 's' : ''} attention · ${healthy.length} passed · ${lastRun.toLocaleTimeString()}`)
               : ''}
            </p>
          </div>
          <button onClick={runChecks} disabled={running}
            style={{padding:'7px 13px',background:'#334155',color:running?'#475569':'#cbd5e1',border:'none',borderRadius:'6px',cursor:running?'default':'pointer',fontSize:'13px',fontWeight:'bold'}}>
            {running ? '⟳ Running…' : '⟳ Re-run'}
          </button>
          <button onClick={onClose}
            style={{padding:'7px 13px',background:'#334155',color:'#cbd5e1',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'13px'}}>
            ✕ Close
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {anyChecking && results.length > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'12px',color:'#93c5fd',fontSize:'13px'}}>
              <Dot status="checking" size={10}/> Running checks…
            </div>
          )}

          {!anyChecking && problems.length === 0 && healthy.length > 0 && (
            <div style={{background:'#052e1f',border:'1px solid #065f46',borderRadius:'10px',padding:'16px',marginBottom:'12px',display:'flex',alignItems:'center',gap:'12px'}}>
              <span style={{fontSize:'22px'}}>✓</span>
              <div>
                <p style={{color:'#6ee7b7',fontSize:'14px',fontWeight:'bold',margin:'0 0 2px'}}>Everything looks good</p>
                <p style={{color:'#34d399',fontSize:'12px',margin:0}}>All {healthy.length} checks passed. Nothing needs your attention.</p>
              </div>
            </div>
          )}

          {problems.length > 0 && (
            <p style={{color:'#64748b',fontSize:'11px',fontWeight:'bold',letterSpacing:'0.08em',textTransform:'uppercase',margin:'0 0 10px'}}>
              Needs attention ({problems.length})
            </p>
          )}
          {problems.map(r => <ProblemCard key={r.id} r={r}/>)}

          {healthy.length > 0 && (
            <button onClick={() => setShowHealthy(v => !v)}
              style={{width:'100%',background:'none',border:'1px solid #1e293b',borderRadius:'8px',padding:'10px 14px',
                      color:'#64748b',fontSize:'13px',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px',marginTop: problems.length ? '4px' : '0'}}>
              <Dot status="healthy" size={8}/>
              <span style={{flex:1,textAlign:'left'}}>✓ {healthy.length} check{healthy.length !== 1 ? 's' : ''} passed</span>
              <span>{showHealthy ? '▴' : '▾'}</span>
            </button>
          )}
          {showHealthy && healthy.map(r => (
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 14px',borderBottom:'1px solid #1e293b'}}>
              <Dot status="healthy" size={8}/>
              <span style={{color:'#cbd5e1',fontSize:'13px',fontWeight:'bold'}}>{r.name}</span>
              <span style={{color:'#475569',fontSize:'12px',flex:1,textAlign:'right'}}>{r.message}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
// =============================================================================
// CHANGE PASSWORD MODAL
// Lets a logged-in user set their own password (e.g. replace the temporary
// password an admin gave them). Uses Firebase Auth updatePassword.
// =============================================================================
function ChangePasswordModal({onClose}) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    if (pw1.length < 6) { setError('Use at least 6 characters.'); return; }
    if (pw1 !== pw2) { setError('The two passwords do not match.'); return; }
    if (!auth || !auth.currentUser) { setError('You are not logged in.'); return; }
    setSaving(true);
    try {
      await auth.currentUser.updatePassword(pw1);
      setDone(true);
    } catch(e) {
      if (e.code === 'auth/requires-recent-login') {
        setError('For security, please log out and log back in, then try again.');
      } else if (e.code === 'auth/weak-password') {
        setError('That password is too weak — use at least 6 characters.');
      } else {
        setError('Could not change the password: ' + (e.message || 'unknown error'));
      }
    }
    setSaving(false);
  };

  const inputStyle = {width:'100%',padding:'10px',background:'#0f172a',border:'1px solid #475569',borderRadius:'6px',color:'white',fontSize:'14px',boxSizing:'border-box'};

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',zIndex:2000}}>
      <div style={{background:'#1e293b',borderRadius:'12px',padding:'24px',maxWidth:'400px',width:'100%',border:'1px solid #334155'}}>
        <h3 style={{color:'white',fontSize:'17px',fontWeight:'bold',margin:'0 0 6px'}}>Change Password</h3>
        <p style={{color:'#64748b',fontSize:'13px',margin:'0 0 16px'}}>Pick something you will remember. You will use it next time you log in.</p>
        {done ? (
          <div>
            <div style={{background:'#052e1f',border:'1px solid #065f46',borderRadius:'8px',padding:'14px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px'}}>
              <span style={{fontSize:'20px'}}>&#10003;</span>
              <p style={{color:'#6ee7b7',fontSize:'14px',fontWeight:'bold',margin:0}}>Password changed. Use the new one next time you log in.</p>
            </div>
            <button onClick={onClose} style={{width:'100%',padding:'10px',background:'#2563eb',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px',fontWeight:'bold'}}>Done</button>
          </div>
        ) : (
          <div>
            <div style={{marginBottom:'12px'}}>
              <label style={{color:'#cbd5e1',fontSize:'13px',display:'block',marginBottom:'5px'}}>New password</label>
              <input type="password" value={pw1} onChange={e => setPw1(e.target.value)} autoComplete="new-password" style={inputStyle}/>
            </div>
            <div style={{marginBottom:'14px'}}>
              <label style={{color:'#cbd5e1',fontSize:'13px',display:'block',marginBottom:'5px'}}>Confirm new password</label>
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password"
                onKeyDown={e => { if (e.key === 'Enter') submit(); }} style={inputStyle}/>
            </div>
            {error && <p style={{color:'#fca5a5',fontSize:'13px',margin:'0 0 12px'}}>{error}</p>}
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={onClose} style={{flex:1,padding:'10px',background:'#334155',color:'#cbd5e1',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px'}}>Cancel</button>
              <button onClick={submit} disabled={saving} style={{flex:1,padding:'10px',background:'#2563eb',color:'white',border:'none',borderRadius:'6px',cursor:saving?'default':'pointer',fontSize:'14px',fontWeight:'bold',opacity:saving?0.6:1}}>
                {saving ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// =============================================================================
// =============================================================================

// =============================================================================
// =============================================================================

// =============================================================================
// SETUP WIZARD
// Shown when SHOP_CONFIG.setupComplete is false.
// Guides a new shop through every configuration step with auto-checks.
// =============================================================================
function SetupWizard({onSkip}) {
  const [fbStatus, setFbStatus] = useState('checking'); // 'checking' | 'connected' | 'disconnected'
  const [manualDone, setManualDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('raws_setup_steps') || '{}'); }
    catch { return {}; }
  });
  const [expanded, setExpanded] = useState(0);

  // Test Firebase connection
  useEffect(() => {
    if (!database) { setFbStatus('disconnected'); return; }
    const ref = database.ref('.info/connected');
    const handler = snap => setFbStatus(snap.val() === true ? 'connected' : 'disconnected');
    ref.on('value', handler);
    const timer = setTimeout(() => setFbStatus(prev => prev === 'checking' ? 'disconnected' : prev), 6000);
    return () => { ref.off('value', handler); clearTimeout(timer); };
  }, []);

  const toggleManual = (key) => {
    setManualDone(prev => {
      const next = {...prev, [key]: !prev[key]};
      localStorage.setItem('raws_setup_steps', JSON.stringify(next));
      return next;
    });
  };

  // ── Paste-and-download configured file (idiot-proof setup) ────────────────
  const [cfgShopName, setCfgShopName] = useState('');
  const [cfgAdmins, setCfgAdmins] = useState('');
  const [cfgPaste, setCfgPaste] = useState('');
  const [cfgError, setCfgError] = useState('');
  const [cfgDownloaded, setCfgDownloaded] = useState(false);

  const FB_KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

  const parseFirebaseConfig = (text) => {
    const out = {};
    for (const key of FB_KEYS) {
      const m = text.match(new RegExp(key + '\\s*:\\s*["\']([^"\']+)["\']'));
      if (m) out[key] = m[1].trim();
    }
    return out;
  };

  const escDbl = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escSingle = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const handleConfiguredDownload = () => {
    setCfgError('');
    const fb = parseFirebaseConfig(cfgPaste);
    const missing = FB_KEYS.filter(k => !fb[k]);
    if (missing.length) {
      setCfgError('Could not find these in what you pasted: ' + missing.join(', ') + '. Copy the entire firebaseConfig block from Firebase console → ⚙️ Project Settings → "Your apps" → the </> web app.');
      return;
    }
    const name = cfgShopName.trim();
    if (!name) { setCfgError('Enter your shop name first (e.g. "14 MXS Tools").'); return; }
    const admins = cfgAdmins.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    const bad = admins.filter(e => !/^\S+@\S+\.\S+$/.test(e));
    if (!admins.length) { setCfgError('Enter at least one admin email address.'); return; }
    if (bad.length) { setCfgError('These do not look like email addresses: ' + bad.join(', ')); return; }

    const cfgBlock =
`const SHOP_CONFIG = {
  // Generated by the setup wizard on ${new Date().toLocaleString()} — safe to edit by hand later
  setupComplete: true,
  shopName: '${escSingle(name)}',
  firebase: {
${FB_KEYS.map(k => `    ${k}: "${escDbl(fb[k])}",`).join('\n')}
  },
  adminEmails: [
${admins.map(e => `    '${escSingle(e)}',`).join('\n')}
  ]
};`;

    let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const start = html.indexOf('const SHOP_CONFIG = {');
    const endMarker = '// END SHOP CONFIGURATION';
    const end = html.indexOf(endMarker);
    if (start === -1 || end === -1 || end < start) {
      setCfgError('Could not find the config block in this file — download a fresh copy of the app and try again.');
      return;
    }
    html = html.slice(0, start) + cfgBlock + '\n' + html.slice(end);
    const blob = new Blob([html], {type: 'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raws-tools-tracker-configured.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    setCfgDownloaded(true);
  };

  // Hyperlink helper
  const A = ({href, children}) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       style={{color:'#38bdf8',textDecoration:'underline'}}>{children}</a>
  );

  // Original template values used for auto-detection.
  // TEMPLATE_CONFIG is injected by the build (the pristine template); fall back
  // to hardcoded values if missing (dev / legacy).
  const ORIG = (typeof TEMPLATE_CONFIG !== 'undefined') ? {
    projectId:    TEMPLATE_CONFIG.firebase.projectId,
    shopName:     TEMPLATE_CONFIG.shopName,
    adminEmails:  TEMPLATE_CONFIG.adminEmails.map(e => e.toLowerCase()),
  } : {
    projectId:    'raws-tool-tracker',
    shopName:     'RAWS Tools Tracker',
    adminEmails:  ['your.email@us.af.mil']
  };

  const chk = {
    firebaseChanged:    SHOP_CONFIG.firebase.projectId !== ORIG.projectId,
    shopNameChanged:    SHOP_CONFIG.shopName !== ORIG.shopName,
    adminEmailsChanged: !SHOP_CONFIG.adminEmails.some(e => ORIG.adminEmails.includes(e.toLowerCase())),
    fbConnected:        fbStatus === 'connected',
  };
  const configAllDone = chk.firebaseChanged && chk.shopNameChanged && chk.adminEmailsChanged;

  // ── Step definitions ─────────────────────────────────────────────────────
  const steps = [
    {
      title: 'Get the Files',
      autoCheck: true,
      status: 'complete',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            You're already here — that means you have the file! ✅ If you haven't forked the GitHub repo yet, do that now so you can get future updates without starting from scratch.
          </p>
          <div style={{background:'#0f172a',borderRadius:'6px',padding:'12px 16px'}}>
            <p style={{color:'#cbd5e1',fontSize:'13px',marginBottom:'6px'}}><strong>What to do:</strong></p>
            <ol style={{color:'#94a3b8',fontSize:'13px',lineHeight:2,paddingLeft:'18px',margin:0}}>
              <li>Go to <A href="https://github.com/OpticFallz/RAWS-Tool-Tracker">github.com/OpticFallz/RAWS-Tool-Tracker</A></li>
              <li>Click the <strong style={{color:'#f97316'}}>Fork</strong> button (top-right corner)</li>
              <li>Choose your own GitHub account as the destination</li>
              <li>Done — you now have your own copy you can edit</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      title: 'Create a Firebase Project',
      autoCheck: true,
      status: chk.firebaseChanged && chk.fbConnected ? 'complete'
             : chk.firebaseChanged && fbStatus === 'disconnected' ? 'error'
             : !chk.firebaseChanged ? 'pending' : 'checking',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            Firebase is a free Google service that stores your tool data and handles user logins. Each shop must have its own Firebase project — this keeps every shop's data completely separate.
          </p>
          <ol style={{color:'#cbd5e1',fontSize:'14px',lineHeight:2.2,paddingLeft:'20px',marginBottom:'14px'}}>
            <li>Go to <A href="https://console.firebase.google.com">console.firebase.google.com</A> and sign in with a Google account</li>
            <li>Click <strong>Add project</strong> → type a name (e.g. <code style={{background:'#0f172a',padding:'2px 6px',borderRadius:'3px'}}>14mxs-tools</code>) → Continue → Continue → Create project</li>
            <li>Left sidebar → Build → <strong>Realtime Database</strong> → <strong>Create database</strong> → pick your region → click <strong>Start in test mode</strong> → Enable</li>
            <li>Left sidebar → Build → <strong>Authentication</strong> → <strong>Get started</strong> → Sign-in method → click <strong>Email/Password</strong> → toggle Enable → Save</li>
            <li>Click the ⚙️ gear (top-left) → <strong>Project Settings</strong> → scroll down to "Your apps" → click the <strong>&lt;/&gt;</strong> (web) icon → type any app nickname → Register app → <strong>copy the entire firebaseConfig block</strong> — you'll paste it in Step 3</li>
          </ol>
          <div style={{padding:'12px 16px',background:'#0f172a',borderRadius:'6px',fontSize:'13px',border:'1px solid #334155'}}>
            {fbStatus === 'checking'    && <span style={{color:'#93c5fd'}}>🔄 Checking Firebase connection…</span>}
            {fbStatus === 'connected'   && chk.firebaseChanged  && <span style={{color:'#6ee7b7'}}>✓ Firebase connected successfully to your project</span>}
            {fbStatus === 'connected'   && !chk.firebaseChanged && <span style={{color:'#f59e0b'}}>⚠️ Connected to the template project — you need your own Firebase project</span>}
            {fbStatus === 'disconnected'&& chk.firebaseChanged  && <span style={{color:'#fca5a5'}}>✗ Cannot connect — double-check your firebaseConfig values in SHOP_CONFIG</span>}
            {fbStatus === 'disconnected'&& !chk.firebaseChanged && <span style={{color:'#64748b'}}>○ Not yet configured</span>}
          </div>
        </div>
      )
    },
    {
      title: '⚡ Easy Setup: Paste & Download',
      autoCheck: true,
      status: cfgDownloaded ? 'complete' : 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            <strong style={{color:'#6ee7b7'}}>Recommended — no text editor needed.</strong> Fill in the three fields below and download a ready-to-host copy of the app with your Firebase project, shop name, and admins already baked in (the setup wizard is pre-completed in the download). Then skip ahead to <strong>Set Database Security Rules</strong>.
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:'12px',marginBottom:'14px'}}>
            <div>
              <label style={{color:'#cbd5e1',fontSize:'13px',fontWeight:'bold',display:'block',marginBottom:'6px'}}>1. Your shop name</label>
              <input
                type="text"
                value={cfgShopName}
                onChange={(e) => setCfgShopName(e.target.value)}
                placeholder='e.g. 319 OSS RAWS Tools'
                style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:'6px',color:'white',fontSize:'14px'}}
              />
            </div>
            <div>
              <label style={{color:'#cbd5e1',fontSize:'13px',fontWeight:'bold',display:'block',marginBottom:'6px'}}>2. Admin email addresses <span style={{color:'#64748b',fontWeight:'normal'}}>(one per line — full access)</span></label>
              <textarea
                value={cfgAdmins}
                onChange={(e) => setCfgAdmins(e.target.value)}
                placeholder={'john.doe.1@us.af.mil\njane.smith.2@us.af.mil'}
                rows={3}
                style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:'6px',color:'white',fontSize:'14px',fontFamily:'monospace'}}
              />
            </div>
            <div>
              <label style={{color:'#cbd5e1',fontSize:'13px',fontWeight:'bold',display:'block',marginBottom:'6px'}}>3. Paste your firebaseConfig block <span style={{color:'#64748b',fontWeight:'normal'}}>(from Step 2 — Firebase console → ⚙️ Project Settings → your web app)</span></label>
              <textarea
                value={cfgPaste}
                onChange={(e) => setCfgPaste(e.target.value)}
                placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  ...\n};'}
                rows={6}
                style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:'6px',color:'#93c5fd',fontSize:'12px',fontFamily:'monospace'}}
              />
            </div>
          </div>
          {cfgError && (
            <div style={{padding:'10px 14px',background:'#7f1d1d',borderRadius:'6px',marginBottom:'12px'}}>
              <p style={{color:'#fca5a5',fontSize:'13px',lineHeight:1.6}}>⚠️ {cfgError}</p>
            </div>
          )}
          <button
            onClick={handleConfiguredDownload}
            style={{padding:'12px 24px',background:'#16a34a',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'15px',fontWeight:'bold',width:'100%'}}
          >
            ⬇️ Download My Configured File
          </button>
          {cfgDownloaded && (
            <div style={{marginTop:'12px',padding:'12px 16px',background:'#0d2818',borderRadius:'6px',border:'1px solid #065f46'}}>
              <p style={{color:'#6ee7b7',fontSize:'13px',lineHeight:1.7,marginBottom:'8px'}}>✓ <strong>Downloaded!</strong> Your file is called <code style={{background:'#0f172a',padding:'2px 6px',borderRadius:'3px'}}>raws-tools-tracker-configured.html</code>.</p>
              <p style={{color:'#94a3b8',fontSize:'13px',lineHeight:1.7}}>Next: <strong style={{color:'#cbd5e1'}}>rename it to index.html</strong>, then continue with <strong style={{color:'#cbd5e1'}}>Set Database Security Rules</strong> below — you can skip the manual SHOP_CONFIG step and the final "Mark Setup Complete" step entirely.</p>
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Update SHOP_CONFIG in index.html',
      autoCheck: true,
      status: configAllDone ? 'complete' : (chk.firebaseChanged || chk.shopNameChanged || chk.adminEmailsChanged) ? 'partial' : 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            Open <code style={{background:'#0f172a',padding:'2px 6px',borderRadius:'3px'}}>index.html</code> in any text editor (Notepad, VS Code, etc.) and find the <code style={{background:'#0f172a',padding:'2px 6px',borderRadius:'3px'}}>SHOP_CONFIG</code> block near the top. Update all three items below:
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'14px'}}>
            {[
              { key:'firebaseChanged',    label:'Firebase credentials pasted in (firebaseConfig)',        cur: chk.firebaseChanged ? `Project: ${SHOP_CONFIG.firebase.projectId}` : 'Still using the template — paste your own firebaseConfig here' },
              { key:'shopNameChanged',    label:'Shop name changed to your shop',                         cur: `Currently: "${SHOP_CONFIG.shopName}"` },
              { key:'adminEmailsChanged', label:'Admin list updated — removed the default template names', cur: chk.adminEmailsChanged ? `${SHOP_CONFIG.adminEmails.length} admin(s) configured` : 'Still has the original template admins — replace these with your people' },
            ].map(item => (
              <div key={item.key} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 14px',background:'#0f172a',borderRadius:'6px',border:`1px solid ${chk[item.key] ? '#065f46' : '#334155'}`}}>
                <span style={{fontSize:'17px',flexShrink:0,marginTop:'1px',color:chk[item.key]?'#6ee7b7':'#475569'}}>{chk[item.key]?'✓':'○'}</span>
                <div>
                  <p style={{color:chk[item.key]?'#6ee7b7':'#cbd5e1',fontSize:'13px',fontWeight:'bold',marginBottom:'3px'}}>{item.label}</p>
                  <p style={{color:'#475569',fontSize:'12px'}}>{item.cur}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={{color:'#94a3b8',fontSize:'13px',padding:'10px 14px',background:'#0f172a',borderRadius:'6px'}}>
            💡 Tip: Keep <code>setupComplete: false</code> while you're still setting up so this wizard stays visible. When you're completely done with every step, change it to <code style={{color:'#6ee7b7'}}>setupComplete: true</code>, save, and push — the wizard will go away for good.
          </p>
        </div>
      )
    },
    {
      title: 'Set Database Security Rules',
      autoCheck: false,
      manualKey: 'rules',
      status: manualDone.rules ? 'complete' : 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            Right now Firebase is wide open — anyone on the internet can read or write your database. These rules lock it down so only logged-in users can access anything. <strong style={{color:'#fcd34d'}}>Don't skip this step.</strong>
          </p>
          <ol style={{color:'#cbd5e1',fontSize:'14px',lineHeight:2.2,paddingLeft:'20px',marginBottom:'14px'}}>
            <li>Go to <A href="https://console.firebase.google.com">console.firebase.google.com</A> → click your project → left sidebar → <strong>Realtime Database</strong></li>
            <li>Click the <strong>Rules</strong> tab at the top</li>
            <li>Click inside the text box, select everything (<strong>Ctrl+A</strong>), and delete it</li>
            <li>Paste in the rules shown below</li>
            <li>Click the blue <strong>Publish</strong> button</li>
          </ol>
          <pre style={{background:'#0f172a',padding:'14px 18px',borderRadius:'6px',color:'#6ee7b7',fontSize:'13px',overflowX:'auto',border:'1px solid #1e3a2f'}}>{`{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null"
  }
}`}</pre>
        </div>
      )
    },
    {
      title: 'Create User Accounts',
      autoCheck: false,
      manualKey: 'users',
      status: manualDone.users ? 'complete' : 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            Nobody can create their own account — you have to create it for them in Firebase. This is intentional so random people can't sign up. Create at least one account for yourself first so you can log in once the app is live.
          </p>
          <ol style={{color:'#cbd5e1',fontSize:'14px',lineHeight:2.2,paddingLeft:'20px',marginBottom:'14px'}}>
            <li>Go to <A href="https://console.firebase.google.com">console.firebase.google.com</A> → your project → left sidebar → Build → <strong>Authentication</strong></li>
            <li>Click the <strong>Users</strong> tab → click <strong>Add user</strong></li>
            <li>Enter their .mil email address and a temporary password → click <strong>Add user</strong></li>
            <li>Send them the login URL and their temporary password (they can change it later)</li>
            <li>To make someone an admin: add their email to <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px'}}>adminEmails</code> in SHOP_CONFIG, save, and re-deploy the file</li>
          </ol>
          <div style={{padding:'10px 14px',background:'#422006',borderRadius:'6px',border:'1px solid #78350f'}}>
            <p style={{color:'#fcd34d',fontSize:'13px'}}>⚠️ Make sure to create your own account <strong>first</strong>. If you skip this you won't be able to log in at all once the app is live.</p>
          </div>
        </div>
      )
    },
    {
      title: 'Host the File on GitHub Pages',
      autoCheck: false,
      manualKey: 'host',
      status: manualDone.host ? 'complete' : 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            The QR code scanning feature only works when the app is running on a real HTTPS web address (not just a file on your computer). GitHub Pages gives you a free public URL in about 2 minutes — no IT ticket required.
          </p>
          <ol style={{color:'#cbd5e1',fontSize:'14px',lineHeight:2.2,paddingLeft:'20px',marginBottom:'12px'}}>
            <li>Make sure your updated <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px'}}>index.html</code> is saved and committed to your GitHub fork's <strong>main</strong> branch</li>
            <li>Go to <A href="https://github.com">github.com</A> → open your forked repo → click <strong>Settings</strong> (top navigation bar)</li>
            <li>In the left sidebar, scroll down and click <strong>Pages</strong></li>
            <li>Under "Build and deployment" → Source: <strong>Deploy from a branch</strong></li>
            <li>Branch: <strong>main</strong> / folder: <strong>/ (root)</strong> → click <strong>Save</strong></li>
            <li>Wait about 1–2 minutes → your app will be live at <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px'}}>https://[your-username].github.io/[repo-name]/</code></li>
          </ol>
          <p style={{color:'#64748b',fontSize:'13px'}}>
            Current URL: <code style={{background:'#0f172a',padding:'2px 6px',borderRadius:'3px'}}>{window.location.href}</code>
          </p>
        </div>
      )
    },
    {
      title: 'Mark Setup Complete',
      autoCheck: false,
      status: 'pending',
      body: (
        <div>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.7,marginBottom:'12px'}}>
            Once every step above is done, hide this wizard permanently by setting the flag in SHOP_CONFIG.
          </p>
          <ol style={{color:'#cbd5e1',fontSize:'14px',lineHeight:2.2,paddingLeft:'20px',marginBottom:'14px'}}>
            <li>Open <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px'}}>index.html</code> in your text editor</li>
            <li>Find the line <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px',color:'#fca5a5'}}>setupComplete: false</code></li>
            <li>Change it to <code style={{background:'#0f172a',padding:'2px 5px',borderRadius:'3px',color:'#6ee7b7'}}>setupComplete: true</code></li>
            <li>Save and push to GitHub — the wizard will no longer appear</li>
          </ol>
          <div style={{padding:'10px 14px',background:'#0d2818',borderRadius:'6px',border:'1px solid #065f46'}}>
            <p style={{color:'#6ee7b7',fontSize:'13px'}}>✓ Your shop's tool tracker will be fully operational after this final step.</p>
          </div>
        </div>
      )
    }
  ];
  // ── End step definitions ─────────────────────────────────────────────────

  const completedCount = steps.filter(s => s.status === 'complete').length;

  const StatusBadge = ({status}) => {
    const map = {
      complete:  {bg:'#065f46', color:'#6ee7b7', label:'COMPLETE'},
      partial:   {bg:'#78350f', color:'#fcd34d', label:'IN PROGRESS'},
      error:     {bg:'#7f1d1d', color:'#fca5a5', label:'ERROR'},
      checking:  {bg:'#1e3a5f', color:'#93c5fd', label:'CHECKING…'},
      pending:   {bg:'#1e293b', color:'#475569', label:'NOT STARTED'},
    };
    const c = map[status] || map.pending;
    return (
      <span style={{background:c.bg,color:c.color,padding:'3px 9px',borderRadius:'12px',fontSize:'11px',fontWeight:'bold',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>
        {c.label}
      </span>
    );
  };

  return (
    <div style={{minHeight:'100vh',background:'#0f172a',padding:'20px',overflowY:'auto'}}>
      <div style={{maxWidth:'700px',margin:'0 auto',paddingBottom:'40px'}}>

        {/* Header */}
        <div style={{textAlign:'center',paddingTop:'30px',marginBottom:'28px'}}>
          <p style={{color:'#f97316',fontSize:'13px',fontWeight:'bold',letterSpacing:'0.1em',marginBottom:'8px'}}>SHOP TOOLS TRACKER</p>
          <h1 style={{color:'white',fontSize:'26px',fontWeight:'bold',marginBottom:'6px'}}>First-Time Setup Guide</h1>
          <p style={{color:'#94a3b8',fontSize:'14px',lineHeight:1.6}}>
            Follow each step in order. Steps marked <span style={{color:'#6366f1',fontWeight:'bold'}}>🔍 auto-check</span> verify themselves — you'll see the status update automatically when you save the file and reload.
          </p>

          {/* Progress bar */}
          <div style={{marginTop:'22px',background:'#1e293b',borderRadius:'10px',padding:'16px 20px',border:'1px solid #334155'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
              <span style={{color:'#94a3b8',fontSize:'13px'}}>Overall Progress</span>
              <span style={{color:'white',fontSize:'14px',fontWeight:'bold'}}>{completedCount} of {steps.length} steps complete</span>
            </div>
            <div style={{background:'#334155',borderRadius:'4px',height:'10px',overflow:'hidden'}}>
              <div style={{
                background: completedCount === steps.length ? '#10b981' : '#f97316',
                height:'100%',
                width:`${(completedCount/steps.length)*100}%`,
                transition:'width 0.4s ease',
                borderRadius:'4px'
              }}/>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
          {steps.map((step, i) => {
            const isOpen = expanded === i;
            const borderColor = step.status === 'complete' ? '#065f46'
                              : step.status === 'error'    ? '#7f1d1d'
                              : step.status === 'partial'  ? '#78350f' : '#334155';
            return (
              <div key={i} style={{background:'#1e293b',borderRadius:'10px',border:`1px solid ${borderColor}`,overflow:'hidden'}}>
                {/* Row header */}
                <div
                  onClick={() => setExpanded(isOpen ? null : i)}
                  style={{display:'flex',alignItems:'center',gap:'12px',padding:'15px 18px',cursor:'pointer',userSelect:'none'}}
                >
                  {/* Step number circle */}
                  <div style={{
                    width:'34px',height:'34px',borderRadius:'50%',flexShrink:0,
                    background: step.status==='complete' ? '#065f46' : step.status==='error' ? '#7f1d1d' : '#334155',
                    color:       step.status==='complete' ? '#6ee7b7' : step.status==='error' ? '#fca5a5' : '#94a3b8',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize: step.status==='complete' ? '17px' : '14px',fontWeight:'bold'
                  }}>
                    {step.status === 'complete' ? '✓' : i + 1}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                      <span style={{color:'white',fontSize:'15px',fontWeight:'bold'}}>Step {i+1} — {step.title}</span>
                      {step.autoCheck && <span style={{color:'#6366f1',fontSize:'11px',fontWeight:'bold'}}>🔍 auto-check</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
                    <StatusBadge status={step.status} />
                    <span style={{color:'#475569',fontSize:'14px'}}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expandable body */}
                {isOpen && (
                  <div style={{padding:'4px 18px 20px',borderTop:'1px solid #334155'}}>
                    <div style={{paddingTop:'16px'}}>
                      {step.body}
                      {/* Manual confirm checkbox */}
                      {step.manualKey && (
                        <div
                          onClick={() => toggleManual(step.manualKey)}
                          style={{
                            display:'flex',alignItems:'center',gap:'12px',
                            marginTop:'16px',padding:'12px 16px',
                            background: manualDone[step.manualKey] ? '#0d2818' : '#0f172a',
                            borderRadius:'8px',
                            border:`2px solid ${manualDone[step.manualKey] ? '#10b981' : '#334155'}`,
                            cursor:'pointer'
                          }}
                        >
                          <div style={{
                            width:'22px',height:'22px',borderRadius:'5px',flexShrink:0,
                            background: manualDone[step.manualKey] ? '#10b981' : 'transparent',
                            border:`2px solid ${manualDone[step.manualKey] ? '#10b981' : '#475569'}`,
                            display:'flex',alignItems:'center',justifyContent:'center'
                          }}>
                            {manualDone[step.manualKey] && <span style={{color:'white',fontSize:'14px',lineHeight:1}}>✓</span>}
                          </div>
                          <span style={{color: manualDone[step.manualKey] ? '#6ee7b7' : '#cbd5e1', fontSize:'14px',fontWeight:'bold'}}>
                            I have completed this step
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer escape hatch */}
        <div style={{textAlign:'center',marginTop:'30px'}}>
          <p style={{color:'#334155',fontSize:'12px',marginBottom:'10px'}}>
            Manual step confirmations are saved in this browser. Auto-checked steps re-verify every time the page loads.
          </p>
          <button
            onClick={onSkip}
            style={{background:'none',border:'none',color:'#475569',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}
          >
            Already configured — skip wizard and go to app
          </button>
        </div>

      </div>
    </div>
  );
}
// =============================================================================

// =============================================================================
// ORDER LIST PAGE
// Shows all tools flagged as needing to be ordered (missing or damaged).
// Accessible via the "Order List" button in the header.
// =============================================================================
function OrderListPage({ tools, user, onBack, onFulfill, onMarkOrdered, orderHistory, onEditOrderLog, onDeleteOrderLog }) {
  const orderTools = tools.filter(t => t.inOrderList);
  const pendingCount = orderTools.filter(t => t.orderStatus === 'pending').length;
  const orderedCount = orderTools.filter(t => t.orderStatus === 'ordered').length;
  const [showHistory, setShowHistory] = React.useState(false);
  const [editingLog, setEditingLog] = React.useState(null);
  const [editReason, setEditReason] = React.useState('');

  const statusBadge = (tool) => {
    if (tool.orderStatus === 'ordered') return { label: 'ORDERED', bg: '#78350f', color: '#fcd34d' };
    return { label: 'NEEDS ORDERING', bg: '#7f1d1d', color: '#fca5a5' };
  };

  const reasonBadge = (tool) => {
    if (tool.orderReason === 'damaged') return { label: '🔧 Damaged', bg: '#450a0a', color: '#fca5a5' };
    return { label: '⚠️ Missing', bg: '#422006', color: '#fcd34d' };
  };

  return (
    <div style={{minHeight:'100vh', background:'#0f172a'}}>
      {/* Header */}
      <div style={{background:'#1e293b', padding:'20px', borderBottom:'1px solid #334155', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap'}}>
        <button
          onClick={onBack}
          style={{padding:'8px 14px', background:'#334155', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'14px'}}
        >
          ← Back
        </button>
        <div style={{flex:1}}>
          <h1 style={{color:'white', fontSize:'22px', fontWeight:'bold', marginBottom:'2px'}}>📦 Need to Order</h1>
          <p style={{color:'#94a3b8', fontSize:'13px'}}>
            Tools that are missing or damaged and need to be replaced or reordered
          </p>
        </div>
        <div style={{display:'flex', gap:'12px', flexWrap:'wrap'}}>
          {pendingCount > 0 && (
            <div style={{padding:'8px 14px', background:'#7f1d1d', borderRadius:'6px', border:'1px solid #991b1b'}}>
              <span style={{color:'#fca5a5', fontSize:'13px', fontWeight:'bold'}}>{pendingCount} need ordering</span>
            </div>
          )}
          {orderedCount > 0 && (
            <div style={{padding:'8px 14px', background:'#78350f', borderRadius:'6px', border:'1px solid #92400e'}}>
              <span style={{color:'#fcd34d', fontSize:'13px', fontWeight:'bold'}}>{orderedCount} ordered</span>
            </div>
          )}
        </div>
      </div>

      <div style={{padding:'20px', maxWidth:'900px', margin:'0 auto'}}>
        {orderTools.length === 0 ? (
          <div style={{textAlign:'center', padding:'60px 20px'}}>
            <p style={{fontSize:'48px', marginBottom:'16px'}}>✅</p>
            <p style={{color:'#6ee7b7', fontSize:'20px', fontWeight:'bold', marginBottom:'8px'}}>No items on the order list.</p>
            <p style={{color:'#475569', fontSize:'14px'}}>Tools marked as missing or damaged will automatically appear here.</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
            {orderTools.map(tool => {
              const sb = statusBadge(tool);
              const rb = reasonBadge(tool);
              return (
                <div key={tool.id} style={{background:'#1e293b', borderRadius:'10px', border:`1px solid ${tool.orderStatus === 'ordered' ? '#78350f' : '#7f1d1d'}`, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:'16px', flexWrap:'wrap'}}>
                  {/* Tool image if available */}
                  {tool.image && (
                    <img src={tool.image} alt={tool.name}
                      style={{width:'60px', height:'60px', objectFit:'cover', borderRadius:'6px', flexShrink:0, border:'1px solid #334155'}} />
                  )}

                  {/* Info */}
                  <div style={{flex:1, minWidth:'200px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'6px'}}>
                      <span style={{color:'white', fontSize:'16px', fontWeight:'bold'}}>{tool.name}</span>
                      <span style={{background:rb.bg, color:rb.color, padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold'}}>{rb.label}</span>
                      <span style={{background:sb.bg, color:sb.color, padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold'}}>{sb.label}</span>
                    </div>
                    <div style={{display:'flex', gap:'16px', flexWrap:'wrap'}}>
                      {tool.category && <span style={{color:'#64748b', fontSize:'13px'}}>Category: {tool.category}</span>}
                      {tool.location && <span style={{color:'#64748b', fontSize:'13px'}}>Location: {tool.location}</span>}
                    </div>
                    {tool.orderAddedDate && (
                      <p style={{color:'#475569', fontSize:'12px', marginTop:'4px'}}>
                        Added to order list: {new Date(tool.orderAddedDate).toLocaleDateString()}
                      </p>
                    )}
                    {/* Show the notes from when it was marked missing/damaged */}
                    {tool.statusLogs && tool.statusLogs.length > 0 && (() => {
                      const lastRelevant = [...tool.statusLogs].reverse().find(l => l.toStatus === 'missing' || l.toStatus === 'damaged');
                      return lastRelevant?.notes ? (
                        <p style={{color:'#94a3b8', fontSize:'13px', marginTop:'6px', fontStyle:'italic'}}>
                          Note: "{lastRelevant.notes}"
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Admin actions */}
                  {user.isAdmin && (
                    <div style={{display:'flex', gap:'8px', flexShrink:0, flexWrap:'wrap', alignSelf:'center'}}>
                      {tool.orderStatus === 'pending' && (
                        <button
                          onClick={() => onMarkOrdered(tool)}
                          style={{padding:'8px 14px', background:'#78350f', color:'#fcd34d', border:'1px solid #92400e', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:'bold'}}
                        >
                          Mark Ordered
                        </button>
                      )}
                      <button
                        onClick={() => onFulfill(tool)}
                        style={{padding:'8px 14px', background:'#065f46', color:'#6ee7b7', border:'1px solid #047857', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:'bold'}}
                      >
                        ✓ Received
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Order History */}
        <div style={{marginTop:'32px', borderTop:'1px solid #334155', paddingTop:'24px'}}>
          <div
            onClick={() => setShowHistory(!showHistory)}
            style={{display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', marginBottom:'12px'}}
          >
            <h2 style={{color:'#94a3b8', fontSize:'16px', fontWeight:'bold', margin:0}}>
              📋 Order History ({orderHistory.length})
            </h2>
            <span style={{color:'#475569', fontSize:'13px'}}>{showHistory ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showHistory && (
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              {orderHistory.length === 0 ? (
                <p style={{color:'#475569', fontSize:'13px'}}>No order history yet.</p>
              ) : orderHistory.map(entry => (
                <div key={entry.id} style={{background:'#1e293b', borderRadius:'8px', padding:'10px 14px', border:'1px solid #334155', display:'flex', alignItems:'flex-start', gap:'12px'}}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', marginBottom:'3px'}}>
                      <span style={{color:'white', fontSize:'14px', fontWeight:'bold'}}>{entry.toolName}</span>
                      <span style={{
                        background: entry.action==='received' ? '#065f46' : entry.action==='ordered' ? '#78350f' : '#7f1d1d',
                        color: entry.action==='received' ? '#6ee7b7' : entry.action==='ordered' ? '#fcd34d' : '#fca5a5',
                        padding:'1px 7px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold'
                      }}>
                        {entry.action==='received' ? '✓ Received' : entry.action==='ordered' ? 'Ordered' : entry.action==='added' ? 'Added to List' : entry.action}
                      </span>
                      {entry.edited && <span style={{color:'#f59e0b', fontSize:'11px'}}>✏️ edited</span>}
                    </div>
                    <p style={{color:'#475569', fontSize:'12px', margin:0}}>
                      By {displayName(entry.admin)} — {entry.dateString}
                    </p>
                    {entry.notes && <p style={{color:'#94a3b8', fontSize:'12px', marginTop:'3px', fontStyle:'italic'}}>Note: "{entry.notes}"</p>}
                    {entry.editReason && <p style={{color:'#f59e0b', fontSize:'11px', marginTop:'3px'}}>Edit reason: "{entry.editReason}"</p>}
                  </div>
                  {user.isAdmin && (
                    <div style={{display:'flex', gap:'6px', flexShrink:0}}>
                      <button
                        onClick={() => { setEditingLog(entry); setEditReason(''); }}
                        style={{background:'#334155', border:'none', borderRadius:'4px', padding:'4px 8px', color:'#94a3b8', cursor:'pointer', fontSize:'11px'}}
                      >✏️</button>
                      <button
                        onClick={() => {
                          const r = prompt('Reason for deleting this log entry:');
                          if (r && r.trim()) onDeleteOrderLog(entry.id);
                        }}
                        style={{background:'#334155', border:'none', borderRadius:'4px', padding:'4px 8px', color:'#ef4444', cursor:'pointer', fontSize:'11px'}}
                      >🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit order log modal */}
        {editingLog && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',zIndex:2000}}>
            <div style={{background:'#1e293b',borderRadius:'10px',padding:'28px',maxWidth:'440px',width:'100%',border:'1px solid #334155'}}>
              <h3 style={{color:'white',fontSize:'18px',marginBottom:'16px'}}>Edit Order Log Entry</h3>
              <div style={{marginBottom:'12px'}}>
                <label style={{color:'#cbd5e1',fontSize:'13px',display:'block',marginBottom:'5px'}}>Notes</label>
                <input
                  type="text"
                  value={editingLog.notes || ''}
                  onChange={e => setEditingLog({...editingLog, notes: e.target.value})}
                  style={{width:'100%',padding:'9px',background:'#334155',border:'1px solid #475569',borderRadius:'5px',color:'white',fontSize:'13px'}}
                />
              </div>
              <div style={{marginBottom:'16px'}}>
                <label style={{color:'#fcd34d',fontSize:'13px',display:'block',marginBottom:'5px'}}>Reason for Edit (required)</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="Why is this being edited?"
                  style={{width:'100%',padding:'9px',background:'#334155',border:'1px solid #78350f',borderRadius:'5px',color:'white',fontSize:'13px'}}
                />
              </div>
              <div style={{display:'flex',gap:'10px'}}>
                <button onClick={() => setEditingLog(null)} style={{flex:1,padding:'10px',background:'#334155',color:'#cbd5e1',border:'none',borderRadius:'5px',cursor:'pointer'}}>Cancel</button>
                <button
                  onClick={() => {
                    if (!editReason.trim()) { alert('A reason is required.'); return; }
                    onEditOrderLog(editingLog.id, {...editingLog, edited: true, editReason, editAdmin: editingLog.admin, editDate: new Date().toLocaleString()});
                    setEditingLog(null);
                  }}
                  style={{flex:1,padding:'10px',background:'#f97316',color:'white',border:'none',borderRadius:'5px',cursor:'pointer'}}
                >Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// =============================================================================

// =============================================================================
// BULK ADD PAGE
// Textarea-based bulk entry: type or paste a list of tool names, pick category
// and location once, hit Add. Serial numbers are auto-assigned for all tools.
// =============================================================================
const TOOL_CATEGORIES = ['Hand Tools', 'Power Tools', 'Measuring Tools', 'Safety Equipment', 'Other'];

// AFI compliance checks: daily tool-bag checks, monthly full-inventory checks,
// quarterly checks. intervalDays = how often the check is due; warnHours = how
// far ahead of the due time the card flips from green to yellow.
const COMPLIANCE_CHECKS = [
  {id: 'daily-bags', title: 'Daily Tool Bag Checks', desc: 'Tool bags inspected per AFI', intervalDays: 1, warnHours: 12, icon: 'clipboard'},
  {id: 'monthly-inventory', title: 'Monthly Inventory Check', desc: 'All tools accounted for; flag anything to order', intervalDays: 30, warnHours: 7 * 24, icon: 'box'},
  {id: 'quarterly', title: 'Quarterly Check', desc: 'Full quarterly inspection per AFI', intervalDays: 91, warnHours: 14 * 24, icon: 'check'},
];

function BulkAddPage({ tools, user, locationsList, onAddTool, onBack }) {
  const [category, setCategory] = React.useState('Hand Tools');
  const [locationId, setLocationId] = React.useState(locationsList[0]?.id || '');
  // Dynamic rows: one per tool, each with a name and a quantity. A fresh empty
  // row appears automatically as soon as the last row has a name.
  const [rows, setRows] = React.useState([{ name: '', qty: 1 }]);
  const [sessionAdded, setSessionAdded] = React.useState(0);
  const [sessionUsedSerials, setSessionUsedSerials] = React.useState(new Set());
  const lastRowRef = React.useRef(null);

  React.useEffect(() => { lastRowRef.current?.focus(); }, []);

  const selectedLocation = locationsList.find(l => l.id === locationId);

  const updateRow = (i, field, value) => {
    setRows(prev => {
      let next = prev.map((r, j) => j === i ? { ...r, [field]: value } : r);
      // Collapse down to a single trailing empty row
      let end = next.length;
      while (end > 1 && next[end - 1].name.trim() === '' && next[end - 2].name.trim() === '') end--;
      next = next.slice(0, end);
      // Keep one empty row at the end so there's always room to keep going
      if (next[next.length - 1].name.trim() !== '') next.push({ name: '', qty: 1 });
      return next;
    });
  };

  const removeRow = (i) => {
    setRows(prev => {
      if (prev.length === 1) return [{ name: '', qty: 1 }];
      const next = prev.filter((_, j) => j !== i);
      return next.length === 0 ? [{ name: '', qty: 1 }] : next;
    });
  };

  const clampQty = (q) => {
    const n = parseInt(q, 10);
    if (isNaN(n) || n < 1) return 1;
    return Math.min(n, 99);
  };

  // Rows with a name, and the total number of tool records they'll create
  const entries = rows
    .map(r => ({ name: r.name.trim(), qty: clampQty(r.qty) }))
    .filter(e => e.name !== '');
  const totalCount = entries.reduce((sum, e) => sum + e.qty, 0);

  const baseNames = entries.map(e => e.name);
  const dupeNames = new Set(
    baseNames.filter((n, i) => baseNames.findIndex(o => o.toLowerCase() === n.toLowerCase()) !== i)
      .map(n => n.toLowerCase())
  );
  const existingNames = new Set(
    baseNames.filter(n => tools.some(t => t.name.toLowerCase() === n.toLowerCase()))
      .map(n => n.toLowerCase())
  );

  const handleAddAll = () => {
    if (entries.length === 0) return;
    const used = new Set([
      ...tools.map(t => t.serialNumber).filter(n => n != null),
      ...sessionUsedSerials
    ]);
    let counter = used.size > 0 ? Math.max(...used) + 1 : 1;
    const assignedThisBatch = [];

    entries.forEach(entry => {
      for (let n = 1; n <= entry.qty; n++) {
        while (used.has(counter)) counter++;
        const sn = counter++;
        used.add(sn);
        assignedThisBatch.push(sn);
        // Number the copies so identical tools stay distinguishable
        const name = entry.qty > 1 ? `${entry.name} #${n}` : entry.name;
        onAddTool({
          name,
          category,
          location: selectedLocation ? selectedLocation.name : '',
          locationId: locationId || null,
          image: null,
          status: 'available',
          holder: null,
          history: [],
          serialNumber: sn
        });
      }
    });

    setSessionUsedSerials(prev => new Set([...prev, ...assignedThisBatch]));
    setSessionAdded(prev => prev + totalCount);
    setRows([{ name: '', qty: 1 }]);
  };

  const warnings = [
    ...baseNames.filter(n => dupeNames.has(n.toLowerCase())).map(n => `"${n}" appears more than once`),
    ...baseNames.filter(n => existingNames.has(n.toLowerCase())).map(n => `"${n}" already exists in the tracker`)
  ];

  return (
    <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column'}}>
      {/* Header */}
      <div style={{background: '#1e293b', padding: '14px 20px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10}}>
        <button onClick={onBack} style={{padding: '8px 14px', background: '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '14px', flexShrink: 0}}>
          ← Back
        </button>
        <div style={{flex: 1}}>
          <h1 style={{color: 'white', fontSize: '20px', fontWeight: 'bold', margin: 0}}>Bulk Add Tools</h1>
          {sessionAdded > 0 && (
            <p style={{color: '#6ee7b7', fontSize: '12px', margin: '1px 0 0'}}>{sessionAdded} tool{sessionAdded !== 1 ? 's' : ''} added this session</p>
          )}
        </div>
        <button
          onClick={handleAddAll}
          disabled={totalCount === 0}
          style={{padding: '10px 24px', background: totalCount > 0 ? '#f97316' : '#1e293b', color: totalCount > 0 ? 'white' : '#475569', border: totalCount > 0 ? 'none' : '1px solid #334155', borderRadius: '6px', cursor: totalCount > 0 ? 'pointer' : 'default', fontWeight: 'bold', fontSize: '15px', flexShrink: 0}}
        >
          {totalCount > 0 ? `Add ${totalCount} Tool${totalCount !== 1 ? 's' : ''}` : 'Add Tools'}
        </button>
      </div>

      {/* Category + location */}
      <div style={{background: '#162032', borderBottom: '1px solid #1e3a5f', padding: '12px 20px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <label style={{color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap'}}>Category:</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '13px'}}>
            {TOOL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <label style={{color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap'}}>Location:</label>
          {locationsList.length > 0 ? (
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              style={{padding: '7px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '13px'}}>
              <option value="">— Unassigned —</option>
              {locationsList.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          ) : (
            <span style={{color: '#475569', fontSize: '13px'}}>No locations set — tools will be unassigned</span>
          )}
        </div>
      </div>

      {/* Tool rows: name + quantity each. A new row appears as you type. */}
      <div style={{flex: 1, padding: '20px', maxWidth: '700px', width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px'}}>
        <label style={{color: '#94a3b8', fontSize: '13px'}}>
          One tool per row — set how many of each, and a new row appears as you type:
        </label>
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
          {rows.map((row, i) => (
            <div key={i} style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
              <input
                ref={i === rows.length - 1 ? lastRowRef : null}
                value={row.name}
                onChange={e => updateRow(i, 'name', e.target.value)}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddAll(); }}
                placeholder={i === 0 ? 'e.g. Torque Wrench 1/2in' : 'Next tool…'}
                style={{
                  flex: 1, padding: '11px 12px', background: '#1e293b', border: '1px solid #334155',
                  borderRadius: '7px', color: 'white', fontSize: '15px', outline: 'none', minWidth: 0
                }}
              />
              <label style={{display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px', whiteSpace: 'nowrap'}}>
                Qty
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={row.qty}
                  onChange={e => updateRow(i, 'qty', e.target.value)}
                  onBlur={e => updateRow(i, 'qty', clampQty(e.target.value))}
                  title="How many of this tool"
                  style={{
                    width: '64px', padding: '11px 8px', background: '#1e293b', border: '1px solid #334155',
                    borderRadius: '7px', color: 'white', fontSize: '15px', outline: 'none', textAlign: 'center'
                  }}
                />
              </label>
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length === 1 && row.name.trim() === ''}
                title="Remove this row"
                style={{
                  padding: '11px 12px', background: 'transparent', color: '#64748b', border: '1px solid #334155',
                  borderRadius: '7px', cursor: 'pointer', fontSize: '14px', flexShrink: 0,
                  opacity: rows.length === 1 && row.name.trim() === '' ? 0.35 : 1
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Live count + warnings */}
        <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'}}>
          <div>
            {totalCount > 0 ? (
              <p style={{color: '#94a3b8', fontSize: '13px', margin: 0}}>
                <span style={{color: 'white', fontWeight: 'bold'}}>{totalCount}</span> tool{totalCount !== 1 ? 's' : ''} ready to add
                {entries.length !== totalCount && <span style={{color: '#64748b'}}> &nbsp;· {entries.length} row{entries.length !== 1 ? 's' : ''}</span>}
                {dupeNames.size > 0 && <span style={{color: '#fb923c'}}> &nbsp;· {dupeNames.size} duplicate name{dupeNames.size !== 1 ? 's' : ''}</span>}
                {existingNames.size > 0 && <span style={{color: '#fbbf24'}}> &nbsp;· {existingNames.size} already exist</span>}
                <span style={{color: '#475569'}}> &nbsp;· serials auto-assigned</span>
              </p>
            ) : (
              <p style={{color: '#475569', fontSize: '13px', margin: 0}}>Enter tool names above, then click Add.</p>
            )}
            {warnings.length > 0 && (
              <ul style={{margin: '6px 0 0', paddingLeft: '16px', color: '#fbbf24', fontSize: '12px', listStyle: 'disc'}}>
                {warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                {warnings.length > 5 && <li style={{color:'#475569'}}>…and {warnings.length - 5} more</li>}
              </ul>
            )}
          </div>
          {totalCount > 0 && (
            <button
              onClick={handleAddAll}
              style={{padding: '11px 28px', background: '#f97316', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', flexShrink: 0}}
            >
              Add {totalCount} Tool{totalCount !== 1 ? 's' : ''} →
            </button>
          )}
        </div>
        <p style={{color: '#334155', fontSize: '12px', margin: 0}}>Tip: Ctrl+Enter adds everything. Copies are numbered automatically (e.g. "Socket #1", "Socket #2").</p>
      </div>
    </div>
  );
}

// =============================================================================
// SERIAL NUMBERS PAGE
// Subpage for viewing, editing, auto-assigning, and resetting tool serial numbers.
// =============================================================================
function SerialPage({ tools, user, onBack, onUpdateTool, onAutoAssign, onResetAll }) {
  const [search, setSearch] = React.useState('');
  const [filterAssigned, setFilterAssigned] = React.useState('all'); // 'all' | 'assigned' | 'unassigned'
  const [editingId, setEditingId] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');
  const [resetStage, setResetStage] = React.useState(0); // 0=idle, 1=first confirm, 2=second confirm

  const assignedCount   = tools.filter(t => t.serialNumber != null).length;
  const unassignedCount = tools.filter(t => t.serialNumber == null).length;

  const filtered = tools
    .filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filterAssigned === 'all'
        || (filterAssigned === 'assigned'   && t.serialNumber != null)
        || (filterAssigned === 'unassigned' && t.serialNumber == null);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (a.serialNumber == null && b.serialNumber == null) return a.name.localeCompare(b.name);
      if (a.serialNumber == null) return 1;
      if (b.serialNumber == null) return -1;
      return a.serialNumber - b.serialNumber;
    });

  const saveEdit = (tool) => {
    const val = editVal === '' ? null : parseInt(editVal);
    const conflict = tools.find(t => t.serialNumber === val && t.id !== tool.id && val != null);
    if (conflict) { alert(`#${val} is already assigned to "${conflict.name}"`); return; }
    const prevSerial = tool.serialNumber;
    onUpdateTool(tool.id, {
      ...tool,
      serialNumber: val,
      serialLogs: [...(tool.serialLogs || []), {
        action: 'manual-edit',
        previousSerial: prevSerial,
        newSerial: val,
        admin: user.name,
        dateString: new Date().toLocaleString(),
        timestamp: new Date().toISOString()
      }]
    });
    setEditingId(null);
  };

  return (
    <div style={{minHeight:'100vh', background:'#0f172a'}}>
      {/* Header */}
      <div style={{background:'#1e293b', padding:'20px', borderBottom:'1px solid #334155', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap'}}>
        <button onClick={onBack} style={{padding:'8px 14px', background:'#334155', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'14px'}}>
          ← Back
        </button>
        <div style={{flex:1}}>
          <h1 style={{color:'white', fontSize:'22px', fontWeight:'bold', marginBottom:'2px'}}>🔢 Serial Numbers</h1>
          <p style={{color:'#94a3b8', fontSize:'13px'}}>
            {assignedCount} assigned · {unassignedCount} unassigned · {tools.length} total
          </p>
        </div>
        {user.isAdmin && (
          <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
            {unassignedCount > 0 && (
              <button
                onClick={() => { if (window.confirm(`Auto-assign serial numbers to ${unassignedCount} tool(s) without one? Numbers/Tools will be assigned in order.`)) onAutoAssign(); }}
                style={{padding:'8px 14px', background:'#1e3a5f', color:'#93c5fd', border:'1px solid #1e40af', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'13px'}}
              >
                🔢 Auto-Assign ({unassignedCount})
              </button>
            )}
            {resetStage === 0 && (
              <button
                onClick={() => setResetStage(1)}
                style={{padding:'8px 14px', background:'#334155', color:'#fca5a5', border:'1px solid #7f1d1d', borderRadius:'6px', cursor:'pointer', fontSize:'13px'}}
              >
                🗑️ Reset All Serials
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reset confirmation banner */}
      {resetStage > 0 && (
        <div style={{background: resetStage === 1 ? '#1c0a0a' : '#2d0000', borderBottom:'1px solid #7f1d1d', padding:'14px 20px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap'}}>
          <p style={{color: resetStage === 1 ? '#fca5a5' : '#ef4444', fontSize:'14px', flex:1, fontWeight:'bold', margin:0}}>
            {resetStage === 1
              ? `⚠️ This will clear serial numbers from all ${tools.length} tools. Are you sure?`
              : `🚨 Final confirmation — all ${tools.length} serial numbers will be permanently wiped. No undo.`}
          </p>
          <div style={{display:'flex', gap:'8px'}}>
            <button onClick={() => setResetStage(0)} style={{padding:'8px 14px', background:'#334155', color:'#cbd5e1', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'13px'}}>
              Cancel
            </button>
            {resetStage === 1 ? (
              <button onClick={() => setResetStage(2)} style={{padding:'8px 14px', background:'#7f1d1d', color:'#fca5a5', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold', fontSize:'13px'}}>
                Yes, Continue
              </button>
            ) : (
              <button onClick={() => { onResetAll(); setResetStage(0); }} style={{padding:'8px 14px', background:'#ef4444', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold', fontSize:'13px'}}>
                CONFIRM RESET
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{padding:'20px', maxWidth:'900px', margin:'0 auto'}}>
        {/* Search + filter */}
        <div style={{display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap'}}>
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{flex:1, minWidth:'200px', padding:'9px 12px', background:'#334155', border:'1px solid #475569', borderRadius:'5px', color:'white', fontSize:'14px'}}
          />
          <select
            value={filterAssigned}
            onChange={e => setFilterAssigned(e.target.value)}
            style={{padding:'9px 12px', background:'#334155', border:'1px solid #475569', borderRadius:'5px', color:'white', fontSize:'14px'}}
          >
            <option value="all">All Tools</option>
            <option value="assigned">Assigned Only</option>
            <option value="unassigned">Unassigned Only</option>
          </select>
        </div>

        {/* Tool list */}
        <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
          {filtered.map(tool => {
            const isEditing = editingId === tool.id;
            const conflict = editVal !== '' && tools.find(t => t.serialNumber === parseInt(editVal) && t.id !== tool.id);
            return (
              <div key={tool.id} style={{background:'#1e293b', borderRadius:'8px', border:`1px solid ${tool.serialNumber == null ? '#334155' : '#1e3a5f'}`, padding:'12px 16px', display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap'}}>
                {/* Serial badge / edit field */}
                <div style={{flexShrink:0, width:'80px', textAlign:'center'}}>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      autoFocus
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(tool); if (e.key === 'Escape') setEditingId(null); }}
                      style={{width:'72px', padding:'6px', background:'#0f172a', border:'1px solid #6366f1', borderRadius:'5px', color:'white', fontSize:'14px', fontWeight:'bold', textAlign:'center'}}
                    />
                  ) : (
                    <span style={{
                      background: tool.serialNumber != null ? '#1e3a5f' : '#1e293b',
                      color: tool.serialNumber != null ? '#93c5fd' : '#475569',
                      padding:'4px 10px', borderRadius:'10px', fontSize:'13px', fontWeight:'bold',
                      border: tool.serialNumber != null ? '1px solid #1e40af' : '1px dashed #334155'
                    }}>
                      {tool.serialNumber != null ? `#${tool.serialNumber}` : '—'}
                    </span>
                  )}
                </div>

                {/* Tool info */}
                <div style={{flex:1, minWidth:'150px'}}>
                  <p style={{color:'white', fontSize:'14px', fontWeight:'bold', margin:0}}>{tool.name}</p>
                  <p style={{color:'#64748b', fontSize:'12px', margin:0}}>{tool.category}{tool.location ? ` · ${tool.location}` : ''}</p>
                  {conflict && <p style={{color:'#fca5a5', fontSize:'11px', margin:'3px 0 0'}}>⚠️ #{editVal} already used by "{conflict.name}"</p>}
                </div>

                {/* Actions */}
                {user.isAdmin && (
                  <div style={{display:'flex', gap:'6px', flexShrink:0}}>
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(tool)} style={{padding:'6px 12px', background:'#065f46', color:'#6ee7b7', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:'bold'}}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{padding:'6px 12px', background:'#334155', color:'#94a3b8', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px'}}>Cancel</button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditingId(tool.id); setEditVal(tool.serialNumber != null ? String(tool.serialNumber) : ''); }}
                        style={{padding:'6px 12px', background:'#334155', color:'#93c5fd', border:'1px solid #1e3a5f', borderRadius:'5px', cursor:'pointer', fontSize:'12px'}}
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p style={{color:'#475569', textAlign:'center', padding:'40px'}}>No tools match your search.</p>}
        </div>
      </div>
    </div>
  );
}
// =============================================================================
// Stable per-tab ID that survives page reloads but dies when the tab closes.
// Used for single-session enforcement so a fresh login kicks all other tabs.
const TAB_SESSION_ID = (() => {
  let id = sessionStorage.getItem('toolroom_session_id');
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('toolroom_session_id', id);
  }
  return id;
})();

function App() {
  const [skipSetupWizard, setSkipSetupWizard] = useState(false);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);
  const [showWizard, setShowWizard] = useState(false); // re-run setup wizard from Diagnostics
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showOrderList, setShowOrderList] = useState(false);
  const [bgHealth, setBgHealth] = useState('unknown'); // quick background health for the header dot
  const [user, setUser] = useState(null);
  const [tools, setTools] = useState([]);
  const [login, setLogin] = useState({email: '', password: ''});
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTool, setNewTool] = useState({name: '', category: 'Power Tools', location: '', locationId: '', image: null});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [cameraMode, setCameraMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [showDamagedModal, setShowDamagedModal] = useState(false);
  const [showFoundModal, setShowFoundModal] = useState(false);
  const [showRepairedModal, setShowRepairedModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [statusChangeData, setStatusChangeData] = useState({notes: '', location: '', condition: ''});
  const [showEditLogModal, setShowEditLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [editLogReason, setEditLogReason] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutTool, setCheckoutTool] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTool, setQrTool] = useState(null);
  const [pendingToolId, setPendingToolId] = useState(null);

  // Location-based QR state
  const [locationsList, setLocationsList] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [showLocationsManageModal, setShowLocationsManageModal] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocation, setNewLocation] = useState({name: '', description: ''});
  const [showLocationQRModal, setShowLocationQRModal] = useState(false);
  const [locationQRTarget, setLocationQRTarget] = useState(null);
  const [pendingLocationId, setPendingLocationId] = useState(null);
  const [showLocationScanModal, setShowLocationScanModal] = useState(false);
  const [locationScanTarget, setLocationScanTarget] = useState(null);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [showSerialPage, setShowSerialPage] = useState(false);
  const [showBulkAddPage, setShowBulkAddPage] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [editingOrderLog, setEditingOrderLog] = useState(null);
  const [orderLogEditReason, setOrderLogEditReason] = useState('');
  // AFI compliance checks
  const [complianceLog, setComplianceLog] = useState({});
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkTarget, setCheckTarget] = useState(null);
  const [checkNotes, setCheckNotes] = useState('');
  const [expandedCheck, setExpandedCheck] = useState(null);
  // Checkout borrower notes (external shops / airmen borrowing tools)
  const [checkoutNotes, setCheckoutNotes] = useState('');
  // Bulk QR label printing
  const [showQRPrintModal, setShowQRPrintModal] = useState(false);
  const [qrPrintIds, setQrPrintIds] = useState(new Set());
  const [qrPrintSearch, setQrPrintSearch] = useState('');
  // Bulk edit: select multiple tools, apply Location/Category to all at once
  // (names are deliberately not bulk-editable)
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditIds, setBulkEditIds] = useState(new Set());
  const [bulkEditLocationId, setBulkEditLocationId] = useState(''); // '' = no change
  const [bulkEditCategory, setBulkEditCategory] = useState('');     // '' = no change

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const sessionListenerRef = useRef(null); // cleanup fn for the DB listener
  const isFreshLoginRef = useRef(false);   // true only while handleLogin is mid-flight

  // Firebase auth state listener + single-session enforcement
  useEffect(() => {
    if (!auth) return; // placeholder config (setup wizard mode) — nothing to listen to
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      // Clean up any previous session listener
      if (sessionListenerRef.current) {
        sessionListenerRef.current();
        sessionListenerRef.current = null;
      }

      if (firebaseUser) {
        // Watch for session changes — sign out if another device claims the session
        const sessionRef = database.ref(`userSessions/${firebaseUser.uid}`);
        const handler = (snap) => {
          // While handleLogin is still awaiting the DB write, ignore all events
          if (isFreshLoginRef.current) return;
          const dbVal = snap.val();
          if (dbVal && dbVal !== TAB_SESSION_ID) {
            auth.signOut();
          }
        };
        sessionRef.on('value', handler);
        sessionListenerRef.current = () => sessionRef.off('value', handler);

        const userRole = isAdminUser(firebaseUser.email) ? USER_ROLES.ADMIN : USER_ROLES.USER;
        setUser({
          name: firebaseUser.email,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: userRole,
          isAdmin: userRole === USER_ROLES.ADMIN
        });
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Load tools from Firebase — attached only after auth is confirmed. A listen
  // that reaches the server while unauthenticated is denied, and the RTDB
  // client drops denied listens permanently (they are NOT retried after a
  // later login), which used to strand the app on "Loading tools..." forever
  // after every fresh login. (A page refresh worked because the restored
  // session authenticated the connection before the listen went out.)
  useEffect(() => {
    if (!database || !user) return; // placeholder config, or not logged in yet
    setLoading(true);
    const toolsRef = database.ref('tools');
    const handleValue = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const toolsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setTools(toolsArray);
      } else {
        setTools([]);
      }
      setLoading(false);
    };
    const handleError = (error) => {
      console.error('tools listen failed:', error && error.code);
      setLoading(false); // never strand the UI on the loader
    };
    toolsRef.on('value', handleValue, handleError);

    return () => toolsRef.off();
  }, [user?.uid]);

  // Load locations from Firebase (auth-gated: see tools listener above for why)
  useEffect(() => {
    if (!database || !user) return; // placeholder config, or not logged in yet
    const locRef = database.ref('locations');
    const handleValue = (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.keys(data).map(key => ({id: key, ...data[key]}));
        setLocationsList(arr.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setLocationsList([]);
      }
      setLocationsLoaded(true);
    };
    const handleError = (error) => {
      console.error('locations listen failed:', error && error.code);
      setLocationsLoaded(true);
    };
    locRef.on('value', handleValue, handleError);
    return () => locRef.off();
  }, [user?.uid]);

  // Load order history from Firebase (auth-gated: see tools listener above)
  useEffect(() => {
    if (!database || !user) return; // placeholder config, or not logged in yet
    const ref = database.ref('orderHistory');
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.keys(data).map(key => ({id: key, ...data[key]}));
        setOrderHistory(arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      } else {
        setOrderHistory([]);
      }
    });
    return () => ref.off();
  }, [user?.uid]);

  // Load AFI compliance check log from Firebase (auth-gated: see tools listener above)
  useEffect(() => {
    if (!database || !user) return; // placeholder config, or not logged in yet
    const ref = database.ref('complianceChecks');
    ref.on('value', (snapshot) => {
      setComplianceLog(snapshot.val() || {});
    });
    return () => ref.off();
  }, [user?.uid]);

  // Clear the checkout-notes field each time the checkout modal opens
  useEffect(() => {
    if (showCheckoutModal) setCheckoutNotes('');
  }, [showCheckoutModal]);

  // Background health check — runs once on load, updates the header dot
  useEffect(() => {
    if (!database) { setBgHealth('error'); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const snap = await database.ref('.info/connected').once('value');
        if (!cancelled) setBgHealth(snap.val() === true ? 'healthy' : 'error');
      } catch { if (!cancelled) setBgHealth('error'); }
    }, 2000); // small delay so it doesn't race with initial load
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Extract tool ID or location ID from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const toolId = params.get('tool');
    const locationId = params.get('location');
    if (toolId) {
      setPendingToolId(toolId);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (locationId) {
      setPendingLocationId(locationId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Once we have a pending tool ID, user is logged in, and tools are loaded — open checkout modal
  useEffect(() => {
    if (pendingToolId && user && tools.length > 0) {
      const tool = tools.find(t => t.id === pendingToolId);
      if (tool) {
        setCheckoutTool(tool);
        setShowCheckoutModal(true);
      }
      setPendingToolId(null);
    }
  }, [pendingToolId, user, tools]);

  // Once we have a pending location ID, user is logged in, and locations have loaded — open scan modal
  useEffect(() => {
    if (pendingLocationId && user && locationsLoaded) {
      const loc = locationsList.find(l => l.id === pendingLocationId);
      if (loc) {
        setLocationScanTarget(loc);
        setSelectedToolIds(new Set());
        setShowLocationScanModal(true);
      } else {
        alert('Location not found. It may have been deleted.');
      }
      setPendingLocationId(null);
    }
  }, [pendingLocationId, user, locationsLoaded, locationsList]);

  const addToolToFirebase = (tool) => {
    const newToolRef = database.ref('tools').push();
    const serialNumber = tool.serialNumber != null ? tool.serialNumber : getNextSerialNumber();
    newToolRef.set({
      ...tool,
      id: newToolRef.key,
      serialNumber,
      serialLogs: [{
        action: 'assigned',
        previousSerial: null,
        newSerial: serialNumber,
        admin: user ? user.name : 'system',
        dateString: new Date().toLocaleString(),
        timestamp: new Date().toISOString()
      }]
    });
  };

  const updateToolInFirebase = (toolId, updatedData) => {
    database.ref(`tools/${toolId}`).update(updatedData);
  };

  const deleteToolFromFirebase = (toolId) => {
    database.ref(`tools/${toolId}`).remove();
  };

  const updateToolStatus = (tool, newStatus, details = {}) => {
    const statusLog = {
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name,
      fromStatus: tool.status,
      toStatus: newStatus,
      ...details
    };

    const updatedTool = {
      ...tool,
      status: newStatus,
      statusLogs: [...(tool.statusLogs || []), statusLog]
    };

    // If marking as available from missing/damaged, clear holder
    if (newStatus === 'available') {
      updatedTool.holder = null;
      updatedTool.checkoutNote = null;
    }

    // Auto-add to order list when marked missing or damaged
    if (newStatus === 'missing' || newStatus === 'damaged') {
      updatedTool.inOrderList = true;
      updatedTool.orderStatus = 'pending';
      updatedTool.orderReason = newStatus;
      updatedTool.orderAddedDate = new Date().toISOString();
      // Log to global order history
      const histRef = database.ref('orderHistory').push();
      histRef.set({
        id: histRef.key,
        toolId: tool.id,
        toolName: tool.name,
        action: 'added',
        reason: newStatus,
        timestamp: new Date().toISOString(),
        dateString: new Date().toLocaleString(),
        admin: user.name
      });
    }

    updateToolInFirebase(tool.id, updatedTool);
  };

  // Fulfill an order — marks item received AND sets the tool back to available
  const fulfillOrder = (tool) => {
    const statusLog = {
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name,
      fromStatus: tool.status,
      toStatus: 'available',
      notes: 'Marked as received via Order List'
    };
    updateToolInFirebase(tool.id, {
      ...tool,
      inOrderList: false,
      orderStatus: 'received',
      status: 'available',
      holder: null,
      statusLogs: [...(tool.statusLogs || []), statusLog]
    });
    const histRef = database.ref('orderHistory').push();
    histRef.set({
      id: histRef.key,
      toolId: tool.id,
      toolName: tool.name,
      action: 'received',
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name
    });
  };

  const markOrdered = (tool) => {
    updateToolInFirebase(tool.id, { ...tool, orderStatus: 'ordered' });
    const histRef = database.ref('orderHistory').push();
    histRef.set({
      id: histRef.key,
      toolId: tool.id,
      toolName: tool.name,
      action: 'ordered',
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name
    });
  };

  // Serialization helpers
  const getNextSerialNumber = () => {
    const used = tools.map(t => t.serialNumber).filter(n => n != null && Number.isInteger(n));
    if (used.length === 0) return 1;
    return Math.max(...used) + 1;
  };

  const resetAllSerials = () => {
    tools.forEach(t => {
      updateToolInFirebase(t.id, {
        ...t,
        serialNumber: null,
        serialLogs: [...(t.serialLogs || []), {
          action: 'reset',
          previousSerial: t.serialNumber,
          newSerial: null,
          admin: user.name,
          dateString: new Date().toLocaleString(),
          timestamp: new Date().toISOString()
        }]
      });
    });
    // reset stage is managed inside SerialPage
  };

  const autoAssignSerials = () => {
    const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((t, i) => {
      updateToolInFirebase(t.id, {
        ...t,
        serialNumber: i + 1,
        serialLogs: [...(t.serialLogs || []), {
          action: 'auto-assigned',
          previousSerial: t.serialNumber,
          newSerial: i + 1,
          admin: user.name,
          dateString: new Date().toLocaleString(),
          timestamp: new Date().toISOString()
        }]
      });
    });
  };

  const updateOrderHistoryEntry = (entryId, newData) => {
    database.ref(`orderHistory/${entryId}`).update(newData);
  };

  const deleteOrderHistoryEntry = (entryId) => {
    database.ref(`orderHistory/${entryId}`).remove();
  };

  const editLog = (tool, logType, logIndex, newData, reason) => {
    const originalLog = logType === 'status'
      ? {...tool.statusLogs[logIndex]}
      : {...tool.history[logIndex]};

    // Create edit record
    const editRecord = {
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name,
      reason: reason,
      logType: logType,
      logIndex: logIndex,
      originalData: originalLog,
      newData: newData
    };

    // Update the log
    const updatedTool = {...tool};
    if (logType === 'status') {
      const updatedStatusLogs = [...tool.statusLogs];
      updatedStatusLogs[logIndex] = {...originalLog, ...newData};
      updatedTool.statusLogs = updatedStatusLogs;
    } else {
      const updatedHistory = [...tool.history];
      updatedHistory[logIndex] = {...originalLog, ...newData};
      updatedTool.history = updatedHistory;
    }

    // Add to logEdits array
    updatedTool.logEdits = [...(tool.logEdits || []), editRecord];

    updateToolInFirebase(tool.id, updatedTool);
  };

  const deleteLog = (tool, logType, logIndex, reason) => {
    const originalLog = logType === 'status'
      ? {...tool.statusLogs[logIndex]}
      : {...tool.history[logIndex]};

    // Create edit record for deletion
    const editRecord = {
      timestamp: new Date().toISOString(),
      dateString: new Date().toLocaleString(),
      admin: user.name,
      reason: reason,
      logType: logType,
      logIndex: logIndex,
      originalData: originalLog,
      action: 'deleted'
    };

    // Remove the log
    const updatedTool = {...tool};
    if (logType === 'status') {
      const updatedStatusLogs = [...tool.statusLogs];
      updatedStatusLogs.splice(logIndex, 1);
      updatedTool.statusLogs = updatedStatusLogs;
    } else {
      const updatedHistory = [...tool.history];
      updatedHistory.splice(logIndex, 1);
      updatedTool.history = updatedHistory;
    }

    // Add to logEdits array
    updatedTool.logEdits = [...(tool.logEdits || []), editRecord];

    updateToolInFirebase(tool.id, updatedTool);
  };

  const handleLogin = async () => {
    setLoginError('');
    if (!login.email || !login.password) {
      setLoginError('Please enter email and password');
      return;
    }
    isFreshLoginRef.current = true;
    try {
      const cred = await auth.signInWithEmailAndPassword(login.email, login.password);
      // Write this tab's session ID BEFORE clearing the flag so the listener
      // never sees a stale value and incorrectly signs us out.
      await database.ref(`userSessions/${cred.user.uid}`).set(TAB_SESSION_ID);
      setLogin({email: '', password: ''});
    } catch (error) {
      let errorMessage = 'Failed to sign in';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No user found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Try again later';
      }
      setLoginError(errorMessage);
    } finally {
      isFreshLoginRef.current = false;
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const startCamera = async (mode) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setShowCamera(true);
      setCameraMode(mode);
    } catch (err) {
      alert('Camera access denied or unavailable');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.7);
    
    if (cameraMode === 'edit') {
      setEditingTool({...editingTool, image: imageData});
    } else {
      setNewTool({...newTool, image: imageData});
    }
    stopCamera();
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
    setCameraMode(null);
  };

  const openQRModal = (tool) => {
    setQrTool(tool);
    setShowQRModal(true);
  };

  // QR codes are generated 100% client-side (qrcode-generator, bundled).
  // No network requests, no third-party service — works fully offline.
  const makeQRDataURL = (text) => {
    const qr = qrcode(0, 'M'); // 0 = auto-select version, M = medium error correction
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 4); // 6px cells, 4-cell quiet zone → crisp for print
  };

  const getQRImageUrl = (tool) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const toolUrl = `${baseUrl}?tool=${tool.id}`;
    return makeQRDataURL(toolUrl);
  };

  const downloadQRCode = (tool) => {
    // Composite the QR with the tool name/nomenclature printed immediately
    // underneath, so the downloaded label identifies the tool when taped
    // next to/under/above it.
    try {
      const img = new Image();
      img.onload = () => {
        const qrSize = img.width;
        const pad = Math.round(qrSize * 0.06);
        const fontPx = Math.max(20, Math.round(qrSize * 0.075));
        const lineH = Math.round(fontPx * 1.25);
        const meas = document.createElement('canvas').getContext('2d');
        meas.font = `bold ${fontPx}px Arial, sans-serif`;
        // Word-wrap the name to the QR width
        const words = String(tool.name || '').split(/\s+/);
        const lines = [];
        let cur = '';
        words.forEach(w => {
          const trial = cur ? cur + ' ' + w : w;
          if (meas.measureText(trial).width > qrSize && cur) { lines.push(cur); cur = w; }
          else cur = trial;
        });
        if (cur) lines.push(cur);
        const labelH = lines.length * lineH;
        const c = document.createElement('canvas');
        c.width = qrSize;
        c.height = qrSize + pad + labelH + pad;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${fontPx}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        lines.forEach((ln, i) => ctx.fillText(ln, qrSize / 2, qrSize + pad + i * lineH));
        const a = document.createElement('a');
        a.href = c.toDataURL('image/png');
        a.download = `QR-${String(tool.name || 'tool').replace(/\s+/g, '-')}.png`;
        a.click();
      };
      img.onerror = () => alert('QR render failed. Try right-clicking the QR image and saving it.');
      img.src = getQRImageUrl(tool);
    } catch (e) {
      alert('Download failed. Try right-clicking the QR image and saving it.');
    }
  };

  // Location Firebase functions
  const addLocationToFirebase = (location) => {
    const ref = database.ref('locations').push();
    ref.set({...location, id: ref.key});
  };

  const deleteLocationFromFirebase = (locationId) => {
    database.ref(`locations/${locationId}`).remove();
  };

  const getLocationQRImageUrl = (location) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?location=${location.id}`;
    return makeQRDataURL(url);
  };

  const downloadLocationQRCode = (location) => {
    try {
      const a = document.createElement('a');
      a.href = getLocationQRImageUrl(location);
      a.download = `QR-Location-${location.name.replace(/\s+/g, '-')}.gif`;
      a.click();
    } catch (e) {
      alert('Download failed. Try right-clicking the QR image and saving it.');
    }
  };

  // ---- AFI compliance checks ----
  // Traffic-light status for a check type: green = good, yellow = coming due,
  // red = past due (or never logged).
  const getCheckStatus = (check) => {
    const entries = complianceLog[check.id] || {};
    const arr = Object.values(entries);
    if (arr.length === 0) return {state: 'overdue', last: null, nextDue: null};
    const last = arr.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b));
    const nextDue = new Date(last.at).getTime() + check.intervalDays * 86400000;
    const now = Date.now();
    if (now > nextDue) return {state: 'overdue', last, nextDue};
    if (now > nextDue - check.warnHours * 3600000) return {state: 'due-soon', last, nextDue};
    return {state: 'good', last, nextDue};
  };

  const checkDueText = (check, st) => {
    if (!st.last) return 'Never logged — overdue';
    const days = (st.nextDue - Date.now()) / 86400000;
    if (days < 0) {
      const d = Math.abs(days);
      return d < 1 ? 'Overdue (due earlier today)' : `Overdue by ${Math.floor(d)}d`;
    }
    if (days < 1) return 'Due today';
    if (days < 2) return 'Due tomorrow';
    return `Due in ${Math.floor(days)}d`;
  };

  const logComplianceCheck = () => {
    if (!checkTarget || !database) return;
    const entry = {
      at: new Date().toISOString(),
      by: displayName(user.name),
      email: user.email,
      notes: checkNotes.trim()
    };
    database.ref('complianceChecks').child(checkTarget.id).push().set(entry);
    setCheckNotes('');
    setShowCheckModal(false);
    setCheckTarget(null);
  };

  const getCheckHistory = (checkId) => {
    const entries = complianceLog[checkId] || {};
    return Object.entries(entries)
      .map(([key, e]) => ({key, ...e}))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  };

  const handleBulkCheckout = (toolIds) => {
    const toolsToCheckout = tools.filter(t => toolIds.has(t.id) && t.status === 'available');
    toolsToCheckout.forEach(tool => {
      const updatedTool = {...tool};
      updatedTool.status = 'checked-out';
      updatedTool.holder = user.name;
      updatedTool.history = [...(tool.history || []), {action: 'checked-out', user: user.name, time: new Date().toLocaleString()}];
      updateToolInFirebase(tool.id, updatedTool);
    });
    setSelectedToolIds(new Set());
    setShowLocationScanModal(false);
  };

  // Bulk edit: apply the chosen Location and/or Category to every selected tool
  const toggleBulkEditId = (id) => {
    setBulkEditIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const applyBulkEdit = () => {
    const updates = {};
    if (bulkEditLocationId !== '') {
      if (bulkEditLocationId === '__unassigned') {
        updates.location = '';
        updates.locationId = null;
      } else {
        const loc = locationsList.find(l => l.id === bulkEditLocationId);
        updates.location = loc ? loc.name : '';
        updates.locationId = bulkEditLocationId;
      }
    }
    if (bulkEditCategory !== '') {
      updates.category = bulkEditCategory;
    }
    if (Object.keys(updates).length === 0 || bulkEditIds.size === 0) return;
    bulkEditIds.forEach(id => updateToolInFirebase(id, updates));
    setBulkEditIds(new Set());
    setBulkEditLocationId('');
    setBulkEditCategory('');
    setBulkEditMode(false);
  };
  const exitBulkEditMode = () => {
    setBulkEditMode(false);
    setBulkEditIds(new Set());
    setBulkEditLocationId('');
    setBulkEditCategory('');
  };

  const handleBulkReturn = (toolIds) => {
    const toolsToReturn = tools.filter(t =>
      toolIds.has(t.id) &&
      t.status === 'checked-out' &&
      (t.holder === user.name || user.isAdmin)
    );
    toolsToReturn.forEach(tool => {
      const updatedTool = {...tool};
      updatedTool.status = 'available';
      updatedTool.holder = null;
      updatedTool.checkoutNote = null;
      updatedTool.history = [...(tool.history || []), {action: 'checked-in', user: user.name, time: new Date().toLocaleString()}];
      updateToolInFirebase(tool.id, updatedTool);
    });
    setSelectedToolIds(new Set());
    setShowLocationScanModal(false);
  };

  const handleImageUpload = (e, mode) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (mode === 'edit') {
          setEditingTool({...editingTool, image: reader.result});
        } else {
          setNewTool({...newTool, image: reader.result});
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Show setup wizard when not yet configured
  if (!SHOP_CONFIG.setupComplete && !skipSetupWizard) {
    return <SetupWizard onSkip={() => setSkipSetupWizard(true)} />;
  }

  if (!authReady) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <p style={{color: 'white', fontSize: '20px'}}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-wrap">
        <div className="login-card fade-up">
          <div className="app-brand-mark"><Icon name="wrench" size={30} /></div>
          <h1>{SHOP_CONFIG.shopName}</h1>
          <p className="login-sub">Sign in with your shop account to continue</p>
          {loginError && (
            <div style={{background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,.4)', color: '#fca5a5', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '15px', fontSize: '14px', textAlign: 'left'}}>
              {loginError}
            </div>
          )}
          <input
            type="email"
            placeholder="Email"
            value={login.email}
            onChange={(e) => setLogin({...login, email: e.target.value})}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleLogin();
              }
            }}
            className="input"
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={login.password}
            onChange={(e) => setLogin({...login, password: e.target.value})}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleLogin();
              }
            }}
            className="input"
            autoComplete="current-password"
          />
          <button onClick={handleLogin} className="btn btn-primary btn-block" style={{padding:'12px', fontSize:'16px', marginTop:'8px'}}>
            Sign In
          </button>
          <p style={{marginTop:'18px', fontSize:'11px', color:'var(--faint)'}}>v{typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev'} · self-contained build</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <p style={{color: 'white', fontSize: '20px'}}>Loading tools...</p>
      </div>
    );
  }

  if (showOrderList) {
    return (
      <OrderListPage
        tools={tools}
        user={user}
        onBack={() => setShowOrderList(false)}
        onFulfill={fulfillOrder}
        onMarkOrdered={markOrdered}
        orderHistory={orderHistory}
        onEditOrderLog={updateOrderHistoryEntry}
        onDeleteOrderLog={deleteOrderHistoryEntry}
      />
    );
  }

  if (showBulkAddPage) {
    return (
      <BulkAddPage
        tools={tools}
        user={user}
        locationsList={locationsList}
        onAddTool={addToolToFirebase}
        onBack={() => setShowBulkAddPage(false)}
      />
    );
  }

  if (showSerialPage) {
    return (
      <SerialPage
        tools={tools}
        user={user}
        onBack={() => setShowSerialPage(false)}
        onUpdateTool={updateToolInFirebase}
        onAutoAssign={autoAssignSerials}
        onResetAll={resetAllSerials}
      />
    );
  }

  // Get unique locations from tools
  const locations = [...new Set(tools.map(t => t.location).filter(loc => loc && loc.trim()))].sort();

  const filteredTools = tools.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLocation = filterLocation === 'all' || t.location === filterLocation;
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchesSearch && matchesLocation && matchesStatus;
  });
  
  return (
    <>
    <div className="page">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-top">
            <div className="app-brand">
              <div className="app-brand-mark"><Icon name="wrench" size={22} /></div>
              <div>
                <h1>{SHOP_CONFIG.shopName}</h1>
                <p>Shop tool inventory</p>
              </div>
            </div>
            <div className="user-chip">
              <span className="avatar">{displayName(user.name).charAt(0).toUpperCase()}</span>
              <span>{displayName(user.name)}</span>
              <span className={`role-badge ${user.isAdmin ? 'admin' : 'user'}`}>{user.isAdmin ? 'ADMIN' : 'USER'}</span>
            </div>
          </div>
          <div className="app-header-actions">
            {(() => {
              const orderCount = tools.filter(t => t.inOrderList && t.orderStatus === 'pending').length;
              return (
                <button onClick={() => setShowOrderList(true)} className={orderCount > 0 ? 'btn btn-danger' : 'btn'}>
                  <Icon name="clipboard" /> Order List
                  {orderCount > 0 && <span className="count-bubble">{orderCount}</span>}
                </button>
              );
            })()}
            {user.isAdmin && (
              <button onClick={() => setShowDiagnosticsPanel(true)} className="btn">
                <div className={bgHealth==='unknown'?'diag-pulse':''} style={{
                  width:'9px',height:'9px',borderRadius:'50%',flexShrink:0,
                  background: bgHealth==='healthy'?'#10b981': bgHealth==='error'?'#ef4444': bgHealth==='warning'?'#f59e0b':'#475569',
                  boxShadow: bgHealth==='error'?'0 0 6px #ef4444': bgHealth==='warning'?'0 0 6px #f59e0b':'none'
                }}/>
                Diagnostics
              </button>
            )}
            <button onClick={() => setShowPasswordModal(true)} className="btn btn-ghost">
              Change Password
            </button>
            <button onClick={handleLogout} className="btn btn-ghost">
              <Icon name="logout" /> Logout
            </button>
          </div>
        </div>
      </header>
      <div className="page-body">
        <div className="stat-grid">
          {[
            {icon:'box', label:'Total tools', value: tools.length, bg:'var(--blue-soft)', color:'var(--blue)'},
            {icon:'check', label:'Available', value: tools.filter(t => t.status === 'available').length, bg:'var(--green-soft)', color:'var(--green)'},
            {icon:'clock', label:'Checked out', value: tools.filter(t => t.status === 'checked-out').length, bg:'var(--amber-soft)', color:'var(--amber)'},
            {icon:'alert', label:'Missing / damaged', value: tools.filter(t => t.status === 'missing' || t.status === 'damaged').length, bg:'var(--red-soft)', color:'var(--red)'},
            {icon:'clipboard', label:'On order', value: tools.filter(t => t.inOrderList && t.orderStatus === 'pending').length, bg:'var(--accent-soft)', color:'var(--accent)'},
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-ic" style={{background:s.bg, color:s.color}}><Icon name={s.icon} size={19} /></div>
              <div>
                <div className="stat-num">{s.value}</div>
                <div className="stat-lbl">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
        {/* AFI compliance checks — traffic-light status at a glance */}
        <div className="check-panel">
          <div className="check-panel-head">
            <span className="check-panel-title"><Icon name="clipboard" size={16} /> Compliance checks</span>
            <span className="check-panel-sub">AFI required inspections</span>
          </div>
          <div className="check-grid">
            {COMPLIANCE_CHECKS.map(check => {
              const st = getCheckStatus(check);
              const stateClass = st.state === 'good' ? 'check-good' : st.state === 'due-soon' ? 'check-due' : 'check-overdue';
              const pillText = st.state === 'good' ? 'Good' : st.state === 'due-soon' ? 'Coming due' : 'Past due';
              const history = getCheckHistory(check.id);
              const expanded = expandedCheck === check.id;
              return (
                <div key={check.id} className={`check-card ${stateClass}`}>
                  <div className="check-card-top">
                    <div className="check-ic"><Icon name={check.icon} size={18} /></div>
                    <div style={{flex: 1}}>
                      <div className="check-title">{check.title}</div>
                      <div className="check-desc">{check.desc}</div>
                    </div>
                    <span className={`check-pill ${stateClass}`}><span className="dot"></span>{pillText}</span>
                  </div>
                  <div className="check-meta">
                    <div>{st.last ? (<>Last: <b>{new Date(st.last.at).toLocaleString()}</b> by <b>{st.last.by}</b></>) : 'No check logged yet'}</div>
                    <div className="check-due">{checkDueText(check, st)}</div>
                  </div>
                  <div className="check-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setCheckTarget(check); setCheckNotes(''); setShowCheckModal(true); }}
                    >
                      <Icon name="check" size={14} /> Log check
                    </button>
                    {history.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setExpandedCheck(expanded ? null : check.id)}>
                        History ({history.length})
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="check-history">
                      {history.slice(0, 10).map(h => (
                        <div key={h.key} className="check-history-row">
                          <div><b>{h.by}</b> <span className="check-history-date">{new Date(h.at).toLocaleString()}</span></div>
                          {h.notes && <div className="check-history-notes">{h.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="toolbar">
          <input
            type="text"
            placeholder="Search tools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
          />
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="select"
          >
            <option value="all">All Locations</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select"
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="checked-out">Checked Out</option>
            <option value="missing">Missing</option>
            <option value="damaged">Damaged</option>
          </select>
          {user.isAdmin && (
            <>
              <button onClick={() => setShowLocationsManageModal(true)} className="btn">
                <Icon name="pin" /> Locations
              </button>
              <button onClick={() => setShowSerialPage(true)} className="btn">
                <Icon name="tag" /> Serial Numbers{tools.some(t => t.serialNumber == null) ? <span className="count-bubble" style={{background:'#7f1d1d',color:'#fca5a5'}}>{tools.filter(t=>t.serialNumber==null).length} unassigned</span> : ''}
              </button>
              <button onClick={() => setShowBulkAddPage(true)} className="btn">
                <Icon name="plus" /> Bulk Add
              </button>
              <button
                onClick={() => { bulkEditMode ? exitBulkEditMode() : setBulkEditMode(true); }}
                className={bulkEditMode ? "btn btn-primary" : "btn"}
                title="Select multiple tools and edit them together"
              >
                <Icon name="wrench" /> {bulkEditMode ? 'Done' : 'Bulk Edit'}
              </button>
              <button onClick={() => { setQrPrintIds(new Set()); setQrPrintSearch(''); setShowQRPrintModal(true); }} className="btn">
                <Icon name="qr" /> QR Labels
              </button>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                <Icon name="plus" /> Add Tool
              </button>
            </>
          )}
        </div>

        {/* Bulk edit bar — select tools via the checkboxes on each card, then
            apply a Location and/or Category to all of them at once */}
        {bulkEditMode && (
          <div className="bulk-edit-bar">
            <span className="bulk-edit-count">
              <b>{bulkEditIds.size}</b> selected
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setBulkEditIds(new Set(filteredTools.map(t => t.id)))}
            >
              Select all ({filteredTools.length})
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setBulkEditIds(new Set())}>
              Clear
            </button>
            <label className="bulk-edit-field">
              Location
              <select
                value={bulkEditLocationId}
                onChange={(e) => setBulkEditLocationId(e.target.value)}
                className="select"
              >
                <option value="">— No change —</option>
                <option value="__unassigned">Unassigned</option>
                {locationsList.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </label>
            <label className="bulk-edit-field">
              Category
              <select
                value={bulkEditCategory}
                onChange={(e) => setBulkEditCategory(e.target.value)}
                className="select"
              >
                <option value="">— No change —</option>
                {TOOL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary"
              disabled={bulkEditIds.size === 0 || (bulkEditLocationId === '' && bulkEditCategory === '')}
              onClick={applyBulkEdit}
            >
              Apply to {bulkEditIds.size} tool{bulkEditIds.size === 1 ? '' : 's'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exitBulkEditMode}>
              Cancel
            </button>
          </div>
        )}

        <div className="tool-grid">
          {filteredTools.map(tool => (
            <div key={tool.id} className="card fade-up" style={{position: 'relative'}}>
              {bulkEditMode && (
                <div style={{position: 'absolute', top: '10px', left: '10px', zIndex: 5}} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={bulkEditIds.has(tool.id)}
                    onChange={() => toggleBulkEditId(tool.id)}
                    className="card-select-check"
                    aria-label={`Select ${tool.name} for bulk edit`}
                  />
                </div>
              )}
              {user.isAdmin && (
                <div style={{position: 'absolute', top: '10px', right: '10px', zIndex: 5}}>
                  <button onClick={() => setOpenMenuId(openMenuId === tool.id ? null : tool.id)} className="icon-btn" aria-label="Tool options">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
                  </button>
                  {openMenuId === tool.id && (
                    <div className="menu-dropdown">
                      <button className="menu-item accent" onClick={() => {
                        openQRModal(tool);
                        setOpenMenuId(null);
                      }}>
                        <Icon name="qr" /> QR Code
                      </button>
                      <button className="menu-item" onClick={() => {
                        setEditingTool(tool);
                        setShowEditModal(true);
                        setOpenMenuId(null);
                      }}>
                        <Icon name="wrench" /> Edit
                      </button>
                      {tool.status === 'missing' ? (
                        <button className="menu-item good" onClick={() => {
                          setSelectedTool(tool);
                          setShowFoundModal(true);
                          setOpenMenuId(null);
                        }}>
                          <Icon name="check" /> Mark as Found
                        </button>
                      ) : tool.status === 'damaged' ? (
                        <button className="menu-item good" onClick={() => {
                          setSelectedTool(tool);
                          setShowRepairedModal(true);
                          setOpenMenuId(null);
                        }}>
                          <Icon name="wrench" /> Mark as Repaired
                        </button>
                      ) : (
                        <>
                          <button className="menu-item warn" onClick={() => {
                            setSelectedTool(tool);
                            setShowMissingModal(true);
                            setOpenMenuId(null);
                          }}>
                            <Icon name="alert" /> Mark as Missing
                          </button>
                          <button className="menu-item danger" onClick={() => {
                            setSelectedTool(tool);
                            setShowDamagedModal(true);
                            setOpenMenuId(null);
                          }}>
                            <Icon name="alert" /> Mark as Damaged
                          </button>
                        </>
                      )}
                      <button className="menu-item danger" onClick={() => {
                        if (window.confirm('Delete this tool?')) {
                          deleteToolFromFirebase(tool.id);
                        }
                        setOpenMenuId(null);
                      }}>
                        <Icon name="x" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
              {tool.image ? (
                <img src={tool.image} alt={tool.name} className="card-photo" />
              ) : (
                <div className="card-photo-fallback"><Icon name="wrench" size={44} /></div>
              )}
              <div className="card-body">
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', paddingRight:'36px', flexWrap:'wrap'}}>
                <h3 className="card-title">{tool.name}</h3>
                {tool.serialNumber != null && (
                  <span className="badge" style={{background:'var(--blue-soft)', color:'#93c5fd', borderColor:'rgba(56,189,248,.35)'}}>
                    #{tool.serialNumber}
                  </span>
                )}
              </div>
              <p className="card-sub">{tool.category}</p>
              {tool.location && (
                <div className="card-meta">
                  <div className="row"><Icon name="pin" size={14} /> {tool.location}</div>
                </div>
              )}
              <div className={`badge badge-${tool.status}`} style={{marginTop:'8px'}}>
                <span className="dot"></span>
                {tool.status === 'available' ? 'Available' :
                 tool.status === 'checked-out' ? 'Checked Out' :
                 tool.status === 'missing' ? 'Missing' :
                 tool.status === 'damaged' ? 'Damaged' : tool.status}
              </div>
              {(tool.status === 'available' || tool.status === 'checked-out') && (
                <button onClick={() => {
                  if (tool.status === 'available') {
                    // Show confirmation modal for checkout
                    setCheckoutTool(tool);
                    setShowCheckoutModal(true);
                  } else {
                    // Check in directly without confirmation
                    const updatedTool = {...tool};
                    updatedTool.status = 'available';
                    updatedTool.holder = null;
                    updatedTool.checkoutNote = null;
                    updatedTool.history = [...(tool.history || []), {action: 'checked-in', user: user.name, time: new Date().toLocaleString()}];
                    updateToolInFirebase(tool.id, updatedTool);
                  }
                }} className={`btn btn-block ${tool.status === 'available' ? 'btn-primary' : 'btn-success'}`} style={{marginTop:'12px'}}>
                  {tool.status === 'available' ? 'Check Out' : 'Check In'}
                </button>
              )}
              {tool.holder && (
                <div className="card-meta" style={{marginTop:'10px'}}>
                  <div className="row"><Icon name="user" size={14} /> Checked out by: {displayName(tool.holder)}</div>
                  {tool.checkoutNote && (
                    <div className="row" style={{marginTop:'4px'}}><Icon name="clipboard" size={14} /> <span style={{fontStyle:'italic'}}>{tool.checkoutNote}</span></div>
                  )}
                </div>
              )}
              {((tool.history && tool.history.length > 0) || (tool.statusLogs && tool.statusLogs.length > 0)) && (
                <details style={{marginTop: '10px'}}>
                  <summary style={{color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', display:'flex', alignItems:'center', gap:'6px'}}>
                    <Icon name="clock" size={14} /> History ({(tool.history?.length || 0) + (tool.statusLogs?.length || 0)})
                  </summary>
                  <div style={{marginTop: '5px', maxHeight: '200px', overflowY: 'auto'}}>
                    {/* Status Logs */}
                    {tool.statusLogs && tool.statusLogs.slice(-20).reverse().map((log, i) => {
                      const actualIndex = tool.statusLogs.length - 1 - i;
                      return (
                      <div key={`status-${i}`} style={{padding: '8px', background: '#0f172a', borderRadius: '3px', marginBottom: '5px', fontSize: '12px', color: '#cbd5e1', border: '1px solid #1e293b', position: 'relative'}}>
                        {user.isAdmin && (
                          <div style={{position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '4px'}}>
                            <button
                              onClick={() => {
                                setEditingLog({tool, logType: 'status', logIndex: actualIndex, log});
                                setShowEditLogModal(true);
                              }}
                              style={{background: '#334155', border: 'none', borderRadius: '3px', padding: '2px 6px', color: '#94a3b8', cursor: 'pointer', fontSize: '10px'}}
                              title="Edit log"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Please provide a reason for deleting this log:');
                                if (reason && reason.trim()) {
                                  deleteLog(tool, 'status', actualIndex, reason);
                                }
                              }}
                              style={{background: '#334155', border: 'none', borderRadius: '3px', padding: '2px 6px', color: '#ef4444', cursor: 'pointer', fontSize: '10px'}}
                              title="Delete log"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                        <div style={{fontWeight: 'bold', marginBottom: '4px', paddingRight: user.isAdmin ? '50px' : '0'}}>
                          <span style={{
                            color: log.toStatus === 'missing' ? '#fef3c7' :
                                   log.toStatus === 'damaged' ? '#fecaca' :
                                   log.toStatus === 'available' ? '#6ee7b7' : '#cbd5e1'
                          }}>
                            {log.toStatus === 'missing' ? '⚠️ Marked Missing' :
                             log.toStatus === 'damaged' ? '🔧 Marked Damaged' :
                             log.toStatus === 'available' && log.fromStatus === 'missing' ? '✓ Found' :
                             log.toStatus === 'available' && log.fromStatus === 'damaged' ? '✓ Repaired' : 'Status Changed'}
                          </span>
                        </div>
                        <div style={{color: '#94a3b8', fontSize: '11px', marginBottom: '2px'}}>
                          By {displayName(log.admin)} - {log.dateString}
                        </div>
                        {log.notes && (
                          <div style={{color: '#cbd5e1', fontSize: '11px', marginTop: '4px', fontStyle: 'italic'}}>
                            📝 {log.notes}
                          </div>
                        )}
                        {log.location && (
                          <div style={{color: '#cbd5e1', fontSize: '11px', marginTop: '2px'}}>
                            📍 Found at: {log.location}
                          </div>
                        )}
                        {log.condition && (
                          <div style={{color: '#cbd5e1', fontSize: '11px', marginTop: '2px'}}>
                            🔍 Condition: {log.condition}
                          </div>
                        )}
                        {log.repairDetails && (
                          <div style={{color: '#cbd5e1', fontSize: '11px', marginTop: '2px'}}>
                            🔧 Repair: {log.repairDetails}
                          </div>
                        )}
                      </div>
                    );})}
                    {/* Check in/out History */}
                    {tool.history && tool.history.slice(-10).reverse().map((h, i) => {
                      const actualIndex = tool.history.length - 1 - i;
                      return (
                      <div key={`history-${i}`} style={{padding: '5px', background: '#0f172a', borderRadius: '3px', marginBottom: '3px', fontSize: '12px', color: '#cbd5e1', position: 'relative', paddingRight: user.isAdmin ? '50px' : '5px'}}>
                        {user.isAdmin && (
                          <div style={{position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '4px'}}>
                            <button
                              onClick={() => {
                                setEditingLog({tool, logType: 'history', logIndex: actualIndex, log: h});
                                setShowEditLogModal(true);
                              }}
                              style={{background: '#334155', border: 'none', borderRadius: '3px', padding: '2px 6px', color: '#94a3b8', cursor: 'pointer', fontSize: '10px'}}
                              title="Edit log"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Please provide a reason for deleting this log:');
                                if (reason && reason.trim()) {
                                  deleteLog(tool, 'history', actualIndex, reason);
                                }
                              }}
                              style={{background: '#334155', border: 'none', borderRadius: '3px', padding: '2px 6px', color: '#ef4444', cursor: 'pointer', fontSize: '10px'}}
                              title="Delete log"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                        <span style={{color: h.action === 'checked-out' ? '#fdba74' : '#6ee7b7'}}>
                          {h.action === 'checked-out' ? '📤' : '📥'} {h.action}
                        </span> by {displayName(h.user)} - {h.time}
                      </div>
                    );})}
                  </div>
                </details>
              )}
              {/* Log Edits Section - Only visible to admins */}
              {user.isAdmin && tool.logEdits && tool.logEdits.length > 0 && (
                <details style={{marginTop: '10px'}}>
                  <summary style={{color: '#f59e0b', fontSize: '14px', cursor: 'pointer'}}>
                    🔍 Log Edit History ({tool.logEdits.length})
                  </summary>
                  <div style={{marginTop: '5px', maxHeight: '200px', overflowY: 'auto'}}>
                    {tool.logEdits.slice().reverse().map((edit, i) => (
                      <div key={`edit-${i}`} style={{padding: '8px', background: '#1e1b16', borderRadius: '3px', marginBottom: '5px', fontSize: '11px', color: '#cbd5e1', border: '1px solid #422006'}}>
                        <div style={{fontWeight: 'bold', marginBottom: '4px', color: '#fbbf24'}}>
                          {edit.action === 'deleted' ? '🗑️ Log Deleted' : '✏️ Log Edited'}
                        </div>
                        <div style={{color: '#94a3b8', fontSize: '10px', marginBottom: '4px'}}>
                          By {displayName(edit.admin)} - {edit.dateString}
                        </div>
                        <div style={{color: '#94a3b8', fontSize: '10px', marginBottom: '4px'}}>
                          Log Type: {edit.logType === 'status' ? 'Status Change' : 'Check-in/out'}
                        </div>
                        {edit.reason && (
                          <div style={{color: '#fbbf24', fontSize: '10px', marginTop: '4px', fontStyle: 'italic'}}>
                            💬 Reason: {edit.reason}
                          </div>
                        )}
                        {edit.action !== 'deleted' && edit.newData && (
                          <details style={{marginTop: '4px'}}>
                            <summary style={{color: '#94a3b8', fontSize: '10px', cursor: 'pointer'}}>
                              View Changes
                            </summary>
                            <div style={{marginTop: '4px', fontSize: '10px'}}>
                              <div style={{color: '#ef4444', marginBottom: '2px'}}>
                                Before: {JSON.stringify(edit.originalData, null, 2)}
                              </div>
                              <div style={{color: '#10b981'}}>
                                After: {JSON.stringify(edit.newData, null, 2)}
                              </div>
                            </div>
                          </details>
                        )}
                        {edit.action === 'deleted' && (
                          <div style={{marginTop: '4px', fontSize: '10px', color: '#ef4444'}}>
                            Deleted Data: {JSON.stringify(edit.originalData, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {user.isAdmin && tool.serialLogs && tool.serialLogs.length > 0 && (
                <details style={{marginTop: '10px'}}>
                  <summary style={{color: '#93c5fd', fontSize: '14px', cursor: 'pointer'}}>
                    🔢 Serial Number History ({tool.serialLogs.length})
                  </summary>
                  <div style={{marginTop: '5px', maxHeight: '200px', overflowY: 'auto'}}>
                    {tool.serialLogs.slice().reverse().map((log, i) => (
                      <div key={i} style={{padding: '6px 8px', background: '#0f172a', borderRadius: '3px', marginBottom: '3px', fontSize: '11px', color: '#cbd5e1', border: '1px solid #1e3a5f'}}>
                        <span style={{color:'#93c5fd', fontWeight:'bold'}}>
                          {log.action === 'assigned' ? '🔢 Assigned' : log.action === 'auto-assigned' ? '🔢 Auto-Assigned' : log.action === 'reset' ? '🗑️ Reset' : '✏️ Manual Edit'}
                        </span>
                        {' '}
                        {log.previousSerial != null && <span style={{color:'#475569'}}>#{log.previousSerial} → </span>}
                        {log.newSerial != null ? <span style={{color:'#93c5fd'}}>#{log.newSerial}</span> : <span style={{color:'#475569'}}>cleared</span>}
                        <div style={{color:'#475569', fontSize:'10px', marginTop:'2px'}}>By {displayName(log.admin)} — {log.dateString}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              </div>
            </div>
          ))}
        </div>
        {filteredTools.length === 0 && (
          <div className="empty-state" style={{marginTop:'8px'}}>
            <Icon name="search" size={46} />
            <h3>No tools found</h3>
            <p>{tools.length === 0 ? 'Your inventory is empty — add your first tool to get started.' : 'Try a different search or filter.'}</p>
          </div>
        )}
      </div>
      
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>Add New Tool</h2>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Tool Name</label>
              <input 
                type="text" 
                value={newTool.name}
                onChange={(e) => setNewTool({...newTool, name: e.target.value})}
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                placeholder="Enter tool name"
              />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Category</label>
              <select
                value={newTool.category}
                onChange={(e) => setNewTool({...newTool, category: e.target.value})}
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              >
                <option value="Power Tools">Power Tools</option>
                <option value="Hand Tools">Hand Tools</option>
                <option value="Measuring Tools">Measuring Tools</option>
                <option value="Safety Equipment">Safety Equipment</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Location
              </label>
              {locationsList.length > 0 ? (
                <select
                  value={newTool.locationId || ''}
                  onChange={(e) => {
                    const selected = locationsList.find(l => l.id === e.target.value);
                    setNewTool({...newTool, locationId: e.target.value, location: selected ? selected.name : ''});
                  }}
                  style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                >
                  <option value="">-- Unassigned --</option>
                  {locationsList.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}{loc.description ? ` — ${loc.description}` : ''}</option>
                  ))}
                </select>
              ) : (
                <p style={{color: '#94a3b8', fontSize: '13px', padding: '10px', background: '#334155', borderRadius: '5px'}}>
                  No locations defined yet. <button onClick={() => { setShowAddModal(false); setShowLocationsManageModal(true); }} style={{background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', textDecoration: 'underline', padding: 0}}>Create one first.</button>
                </p>
              )}
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Serial Number
                <span style={{color:'#475569', fontWeight:'normal', marginLeft:'8px', fontSize:'12px'}}>
                  (auto-assigned: #{getNextSerialNumber()})
                </span>
              </label>
              <input
                type="number"
                min="1"
                value={newTool.serialNumber != null ? newTool.serialNumber : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                  setNewTool({...newTool, serialNumber: val});
                }}
                placeholder={`Leave blank for auto (#${getNextSerialNumber()})`}
                style={{width:'100%', padding:'10px', background:'#334155', border:'1px solid #475569', borderRadius:'5px', color:'white'}}
              />
              {newTool.serialNumber != null && (() => {
                const conflict = tools.find(t => t.serialNumber === newTool.serialNumber);
                return conflict ? (
                  <p style={{color:'#fca5a5', fontSize:'12px', marginTop:'4px'}}>
                    ⚠️ #{newTool.serialNumber} is already assigned to "{conflict.name}"
                  </p>
                ) : null;
              })()}
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Tool Image</label>
              {newTool.image && (
                <div style={{width: '100%', height: '200px', marginBottom: '10px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a'}}>
                  <img src={newTool.image} alt="Preview" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                </div>
              )}
              <div style={{display: 'flex', gap: '10px'}}>
                <button
                  onClick={() => startCamera('add')}
                  style={{flex: 1, padding: '10px', background: '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
                >
                  📷 Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{flex: 1, padding: '10px', background: '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
                >
                  📁 Upload
                </button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'add')}
                  style={{display: 'none'}}
                />
              </div>
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewTool({name: '', category: 'Power Tools', location: '', image: null});
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!newTool.name.trim()) return;
                  const sn = newTool.serialNumber != null ? newTool.serialNumber : getNextSerialNumber();
                  const conflict = tools.find(t => t.serialNumber === sn);
                  if (conflict) { alert(`Serial #${sn} is already assigned to "${conflict.name}". Choose a different number.`); return; }
                  addToolToFirebase({
                    name: newTool.name,
                    category: newTool.category,
                    location: newTool.location,
                    locationId: newTool.locationId || null,
                    image: newTool.image,
                    serialNumber: sn,
                    status: 'available',
                    holder: null,
                    history: []
                  });
                  setNewTool({name: '', category: 'Power Tools', location: '', locationId: '', image: null, serialNumber: null});
                  setShowAddModal(false);
                }}
                style={{flex: 1, padding: '10px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Add Tool
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showEditModal && editingTool && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>Edit Tool</h2>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Tool Name</label>
              <input 
                type="text" 
                value={editingTool.name}
                onChange={(e) => setEditingTool({...editingTool, name: e.target.value})}
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Category</label>
              <select
                value={editingTool.category}
                onChange={(e) => setEditingTool({...editingTool, category: e.target.value})}
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              >
                <option value="Power Tools">Power Tools</option>
                <option value="Hand Tools">Hand Tools</option>
                <option value="Measuring Tools">Measuring Tools</option>
                <option value="Safety Equipment">Safety Equipment</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Location
              </label>
              {locationsList.length > 0 ? (
                <select
                  value={editingTool.locationId || ''}
                  onChange={(e) => {
                    const selected = locationsList.find(l => l.id === e.target.value);
                    setEditingTool({...editingTool, locationId: e.target.value, location: selected ? selected.name : (editingTool.location || '')});
                  }}
                  style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                >
                  <option value="">-- Unassigned --</option>
                  {locationsList.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}{loc.description ? ` — ${loc.description}` : ''}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={editingTool.location || ''}
                  onChange={(e) => setEditingTool({...editingTool, location: e.target.value})}
                  style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  placeholder="Enter location"
                />
              )}
              {editingTool.location && !editingTool.locationId && (
                <p style={{color: '#f59e0b', fontSize: '12px', marginTop: '5px'}}>
                  ⚠️ Legacy location text: "{editingTool.location}". Select from the list above to link to a QR location.
                </p>
              )}
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Serial Number</label>
              <input
                type="number"
                min="1"
                value={editingTool.serialNumber != null ? editingTool.serialNumber : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                  setEditingTool({...editingTool, serialNumber: val});
                }}
                placeholder="Enter serial number"
                style={{width:'100%', padding:'10px', background:'#334155', border:'1px solid #475569', borderRadius:'5px', color:'white'}}
              />
              {editingTool.serialNumber != null && (() => {
                const conflict = tools.find(t => t.serialNumber === editingTool.serialNumber && t.id !== editingTool.id);
                return conflict ? (
                  <p style={{color:'#fca5a5', fontSize:'12px', marginTop:'4px'}}>
                    ⚠️ #{editingTool.serialNumber} is already assigned to "{conflict.name}"
                  </p>
                ) : null;
              })()}
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>Tool Image</label>
              {editingTool.image && (
                <div style={{width: '100%', height: '200px', marginBottom: '10px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a'}}>
                  <img src={editingTool.image} alt="Preview" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                </div>
              )}
              <div style={{display: 'flex', gap: '10px'}}>
                <button 
                  onClick={() => startCamera('edit')}
                  style={{flex: 1, padding: '10px', background: '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
                >
                  📷 Camera
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  style={{flex: 1, padding: '10px', background: '#334155', color: 'white', border: '1px solid #475569', borderRadius: '5px', cursor: 'pointer'}}
                >
                  📁 Upload
                </button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'edit')}
                  style={{display: 'none'}}
                />
              </div>
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTool(null);
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!editingTool.name.trim()) return;
                  const conflict = tools.find(t => t.serialNumber === editingTool.serialNumber && t.id !== editingTool.id && editingTool.serialNumber != null);
                  if (conflict) { alert(`Serial #${editingTool.serialNumber} is already assigned to "${conflict.name}".`); return; }
                  const prevSerial = tools.find(t => t.id === editingTool.id)?.serialNumber;
                  const updatedTool = prevSerial !== editingTool.serialNumber
                    ? { ...editingTool, serialLogs: [...(editingTool.serialLogs || []), { action: 'manual-edit', previousSerial: prevSerial, newSerial: editingTool.serialNumber, admin: user.name, dateString: new Date().toLocaleString(), timestamp: new Date().toISOString() }] }
                    : editingTool;
                  updateToolInFirebase(editingTool.id, updatedTool);
                  setShowEditModal(false);
                  setEditingTool(null);
                }}
                style={{flex: 1, padding: '10px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 2000}}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{width: '100%', maxWidth: '600px', borderRadius: '10px', marginBottom: '20px'}}
          />
          <div style={{display: 'flex', gap: '10px'}}>
            <button
              onClick={stopCamera}
              style={{padding: '15px 30px', background: '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px'}}
            >
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              style={{padding: '15px 30px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px'}}
            >
              📸 Capture
            </button>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>{SHOP_CONFIG.shopName}</span>
        <span className="app-footer-dot">•</span>
        <span>v{typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'dev'}</span>
        <span className="app-footer-dot">•</span>
        <span className="app-footer-muted">self-contained build</span>
      </footer>

      {/* Mark as Missing Modal */}
      {showMissingModal && selectedTool && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>⚠️ Mark as Missing</h2>
            <p style={{color: '#cbd5e1', fontSize: '14px', marginBottom: '15px'}}>
              Tool: <strong>{selectedTool.name}</strong>
            </p>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Notes (Optional)
              </label>
              <textarea
                value={statusChangeData.notes}
                onChange={(e) => setStatusChangeData({...statusChangeData, notes: e.target.value})}
                placeholder="Add any notes about when/where it was last seen..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '100px', resize: 'vertical'}}
              />
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowMissingModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateToolStatus(selectedTool, 'missing', {
                    notes: statusChangeData.notes
                  });
                  setShowMissingModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Mark as Missing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Damaged Modal */}
      {showDamagedModal && selectedTool && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>🔧 Mark as Damaged</h2>
            <p style={{color: '#cbd5e1', fontSize: '14px', marginBottom: '15px'}}>
              Tool: <strong>{selectedTool.name}</strong>
            </p>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Damage Description
              </label>
              <textarea
                value={statusChangeData.notes}
                onChange={(e) => setStatusChangeData({...statusChangeData, notes: e.target.value})}
                placeholder="Describe the damage..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '100px', resize: 'vertical'}}
              />
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowDamagedModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateToolStatus(selectedTool, 'damaged', {
                    notes: statusChangeData.notes
                  });
                  setShowDamagedModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Mark as Damaged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Found Modal */}
      {showFoundModal && selectedTool && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>✓ Mark as Found</h2>
            <p style={{color: '#cbd5e1', fontSize: '14px', marginBottom: '15px'}}>
              Tool: <strong>{selectedTool.name}</strong>
            </p>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Where was it found? <span style={{color: '#ef4444'}}>*</span>
              </label>
              <input
                type="text"
                value={statusChangeData.location}
                onChange={(e) => setStatusChangeData({...statusChangeData, location: e.target.value})}
                placeholder="e.g., Storage room B, under workbench..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Condition when found <span style={{color: '#ef4444'}}>*</span>
              </label>
              <input
                type="text"
                value={statusChangeData.condition}
                onChange={(e) => setStatusChangeData({...statusChangeData, condition: e.target.value})}
                placeholder="e.g., Good condition, slightly dirty, missing parts..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              />
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Additional Notes (Optional)
              </label>
              <textarea
                value={statusChangeData.notes}
                onChange={(e) => setStatusChangeData({...statusChangeData, notes: e.target.value})}
                placeholder="Any additional details..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '80px', resize: 'vertical'}}
              />
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowFoundModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!statusChangeData.location.trim() || !statusChangeData.condition.trim()) {
                    alert('Please fill in where it was found and its condition');
                    return;
                  }
                  updateToolStatus(selectedTool, 'available', {
                    location: statusChangeData.location,
                    condition: statusChangeData.condition,
                    notes: statusChangeData.notes
                  });
                  setShowFoundModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Mark as Found
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Repaired Modal */}
      {showRepairedModal && selectedTool && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>✓ Mark as Repaired</h2>
            <p style={{color: '#cbd5e1', fontSize: '14px', marginBottom: '15px'}}>
              Tool: <strong>{selectedTool.name}</strong>
            </p>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Repair Details <span style={{color: '#ef4444'}}>*</span>
              </label>
              <textarea
                value={statusChangeData.notes}
                onChange={(e) => setStatusChangeData({...statusChangeData, notes: e.target.value})}
                placeholder="Describe what was repaired/fixed..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '100px', resize: 'vertical'}}
              />
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowRepairedModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!statusChangeData.notes.trim()) {
                    alert('Please describe the repair work done');
                    return;
                  }
                  updateToolStatus(selectedTool, 'available', {
                    repairDetails: statusChangeData.notes,
                    notes: statusChangeData.notes
                  });
                  setShowRepairedModal(false);
                  setSelectedTool(null);
                  setStatusChangeData({notes: '', location: '', condition: ''});
                }}
                style={{flex: 1, padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Mark as Repaired
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Log Modal */}
      {showEditLogModal && editingLog && (
        <div className="modal-backdrop">
          <div className="modal wide" style={{maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px'}}>✏️ Edit Log Entry</h2>
            <p style={{color: '#cbd5e1', fontSize: '14px', marginBottom: '15px'}}>
              Tool: <strong>{editingLog.tool.name}</strong>
            </p>
            <p style={{color: '#94a3b8', fontSize: '12px', marginBottom: '20px'}}>
              Log Type: {editingLog.logType === 'status' ? 'Status Change' : 'Check-in/out'}
            </p>

            {editingLog.logType === 'status' ? (
              <>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    From Status
                  </label>
                  <input
                    type="text"
                    value={editingLog.log.fromStatus || ''}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, fromStatus: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  />
                </div>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    To Status
                  </label>
                  <input
                    type="text"
                    value={editingLog.log.toStatus || ''}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, toStatus: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  />
                </div>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    Notes
                  </label>
                  <textarea
                    value={editingLog.log.notes || ''}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, notes: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '80px', resize: 'vertical'}}
                  />
                </div>
                {editingLog.log.location !== undefined && (
                  <div style={{marginBottom: '15px'}}>
                    <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                      Location
                    </label>
                    <input
                      type="text"
                      value={editingLog.log.location || ''}
                      onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, location: e.target.value}})}
                      style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                    />
                  </div>
                )}
                {editingLog.log.condition !== undefined && (
                  <div style={{marginBottom: '15px'}}>
                    <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                      Condition
                    </label>
                    <input
                      type="text"
                      value={editingLog.log.condition || ''}
                      onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, condition: e.target.value}})}
                      style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                    />
                  </div>
                )}
                {editingLog.log.repairDetails !== undefined && (
                  <div style={{marginBottom: '15px'}}>
                    <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                      Repair Details
                    </label>
                    <textarea
                      value={editingLog.log.repairDetails || ''}
                      onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, repairDetails: e.target.value}})}
                      style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '80px', resize: 'vertical'}}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    Action
                  </label>
                  <select
                    value={editingLog.log.action || 'checked-out'}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, action: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  >
                    <option value="checked-out">checked-out</option>
                    <option value="checked-in">checked-in</option>
                  </select>
                </div>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    User
                  </label>
                  <input
                    type="text"
                    value={editingLog.log.user || ''}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, user: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  />
                </div>
                <div style={{marginBottom: '15px'}}>
                  <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                    Time
                  </label>
                  <input
                    type="text"
                    value={editingLog.log.time || ''}
                    onChange={(e) => setEditingLog({...editingLog, log: {...editingLog.log, time: e.target.value}})}
                    style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
                  />
                </div>
              </>
            )}

            <div style={{marginBottom: '20px', padding: '15px', background: '#422006', borderRadius: '5px', border: '1px solid #78350f'}}>
              <label style={{color: '#fbbf24', fontSize: '14px', display: 'block', marginBottom: '5px', fontWeight: 'bold'}}>
                Reason for Edit <span style={{color: '#ef4444'}}>*</span>
              </label>
              <textarea
                value={editLogReason}
                onChange={(e) => setEditLogReason(e.target.value)}
                placeholder="Explain why you're making this change (required for accountability)..."
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white', minHeight: '80px', resize: 'vertical'}}
              />
            </div>

            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowEditLogModal(false);
                  setEditingLog(null);
                  setEditLogReason('');
                }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!editLogReason.trim()) {
                    alert('Please provide a reason for editing this log');
                    return;
                  }
                  editLog(editingLog.tool, editingLog.logType, editingLog.logIndex, editingLog.log, editLogReason);
                  setShowEditLogModal(false);
                  setEditingLog(null);
                  setEditLogReason('');
                }}
                style={{flex: 1, padding: '10px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && qrTool && (
        <div className="modal-backdrop">
          <div className="modal" style={{textAlign: 'center'}}>
            <h2 style={{color: 'white', fontSize: '22px', marginBottom: '5px'}}>📱 QR Code</h2>
            <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '20px'}}>Scan to check out this tool</p>
            <div style={{background: 'white', display: 'inline-block', padding: '12px', borderRadius: '8px', marginBottom: '15px'}}>
              <img src={getQRImageUrl(qrTool)} alt={`QR code for ${qrTool.name}`} style={{display: 'block', width: '220px', height: '220px'}} />
            </div>
            <div style={{background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '20px'}}>
              <p style={{color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '3px'}}>{qrTool.name}</p>
              <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '2px'}}>{qrTool.category}</p>
              {qrTool.location && <p style={{color: '#cbd5e1', fontSize: '12px'}}>📍 {qrTool.location}</p>}
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => { setShowQRModal(false); setQrTool(null); }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Close
              </button>
              <button
                onClick={() => downloadQRCode(qrTool)}
                style={{flex: 1, padding: '10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                ⬇️ Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk QR Label Print Modal */}
      {showQRPrintModal && (() => {
        const q = qrPrintSearch.trim().toLowerCase();
        const pickable = tools
          .filter(t => !q || (t.name || '').toLowerCase().includes(q))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const toggleId = (id) => {
          setQrPrintIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };
        return (
          <div className="modal-backdrop">
            <div className="modal wide" style={{maxHeight: '90vh', overflowY: 'auto'}}>
              <h2 style={{color: 'white', fontSize: '22px', marginBottom: '5px'}}>🏷️ Print QR Labels</h2>
              <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '15px'}}>
                Tick the tools you want, then print. Each label is a small QR with the tool name underneath — cut them out and stick them by the tool.
              </p>
              <input
                type="text"
                placeholder="Search tools..."
                value={qrPrintSearch}
                onChange={(e) => setQrPrintSearch(e.target.value)}
                className="input"
                style={{marginBottom: '10px'}}
              />
              <div style={{display: 'flex', gap: '10px', marginBottom: '12px'}}>
                <button className="btn btn-sm" onClick={() => setQrPrintIds(new Set(pickable.map(t => t.id)))}>
                  Select all ({pickable.length})
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setQrPrintIds(new Set())}>
                  Clear
                </button>
                <span style={{marginLeft: 'auto', color: '#94a3b8', fontSize: '13px', alignSelf: 'center'}}>
                  {qrPrintIds.size} selected
                </span>
              </div>
              <div className="qr-pick-list">
                {pickable.map(t => (
                  <label key={t.id} className="qr-pick-row">
                    <input type="checkbox" checked={qrPrintIds.has(t.id)} onChange={() => toggleId(t.id)} />
                    <span className="qr-pick-name">{t.name}</span>
                    <span className="qr-pick-sub">{t.category}{t.location ? ` · ${t.location}` : ''}</span>
                  </label>
                ))}
                {pickable.length === 0 && (
                  <p style={{color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px'}}>No tools match.</p>
                )}
              </div>
              <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                <button
                  onClick={() => setShowQRPrintModal(false)}
                  style={{flex: 1, padding: '12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '15px'}}
                >
                  Cancel
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={qrPrintIds.size === 0}
                  style={{flex: 2, padding: '12px', background: qrPrintIds.size ? '#0ea5e9' : '#334155', color: 'white', border: 'none', borderRadius: '5px', cursor: qrPrintIds.size ? 'pointer' : 'not-allowed', fontSize: '15px', fontWeight: 'bold'}}
                >
                  🖨️ Print {qrPrintIds.size} label{qrPrintIds.size === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Log Compliance Check Modal */}
      {showCheckModal && checkTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '22px', marginBottom: '6px', textAlign: 'center'}}>Log {checkTarget.title}</h2>
            <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '20px', textAlign: 'center'}}>
              Logging as <b style={{color: '#e2e8f0'}}>{displayName(user.name)}</b> — this stamps the check complete with your name and the current time.
            </p>
            <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '6px'}}>
              Notes <span style={{color: '#64748b'}}>(optional — missing/damaged tools, discrepancies, etc.)</span>
            </label>
            <textarea
              value={checkNotes}
              onChange={(e) => setCheckNotes(e.target.value)}
              placeholder="e.g. Bag 3 missing 10mm socket — added to order list"
              rows={4}
              style={{width: '100%', padding: '10px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '14px', marginBottom: '20px', resize: 'vertical'}}
            />
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => { setShowCheckModal(false); setCheckTarget(null); setCheckNotes(''); }}
                style={{flex: 1, padding: '12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px'}}
              >
                Cancel
              </button>
              <button
                onClick={logComplianceCheck}
                style={{flex: 1, padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'}}
              >
                ✓ Mark Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Confirmation Modal */}
      {showCheckoutModal && checkoutTool && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '20px', textAlign: 'center'}}>Confirm Check Out</h2>
            <p style={{color: '#cbd5e1', fontSize: '16px', marginBottom: '20px', textAlign: 'center'}}>
              Are you checking out this tool?
            </p>
            {checkoutTool.image && (
              <div style={{width: '100%', maxHeight: '250px', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <img src={checkoutTool.image} alt={checkoutTool.name} style={{maxWidth: '100%', maxHeight: '250px', objectFit: 'contain'}} />
              </div>
            )}
            <div style={{background: '#0f172a', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center'}}>
              <h3 style={{color: 'white', fontSize: '20px', marginBottom: '5px'}}>{checkoutTool.name}</h3>
              <p style={{color: '#94a3b8', fontSize: '14px', marginBottom: '3px'}}>{checkoutTool.category}</p>
              {checkoutTool.location && (
                <p style={{color: '#cbd5e1', fontSize: '13px'}}>📍 {checkoutTool.location}</p>
              )}
            </div>
            <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '6px', textAlign: 'left'}}>
              Borrower / notes <span style={{color: '#64748b'}}>(optional)</span>
            </label>
            <textarea
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              placeholder="e.g. SSgt Smith, 319 MXS — borrowing for the weekend"
              rows={2}
              style={{width: '100%', padding: '10px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', fontSize: '14px', marginBottom: '20px', resize: 'vertical'}}
            />
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => {
                  setShowCheckoutModal(false);
                  setCheckoutTool(null);
                }}
                style={{flex: 1, padding: '12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updatedTool = {...checkoutTool};
                  updatedTool.status = 'checked-out';
                  updatedTool.holder = user.name;
                  updatedTool.checkoutNote = checkoutNotes.trim() || null;
                  updatedTool.history = [...(checkoutTool.history || []), {action: 'checked-out', user: user.name, note: checkoutNotes.trim() || undefined, time: new Date().toLocaleString()}];
                  updateToolInFirebase(checkoutTool.id, updatedTool);
                  setShowCheckoutModal(false);
                  setCheckoutTool(null);
                }}
                style={{flex: 1, padding: '12px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'}}
              >
                ✓ Confirm Check Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Locations Management Modal */}
      {showLocationsManageModal && (
        <div className="modal-backdrop">
          <div className="modal wide" style={{maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{color: 'white', fontSize: '24px', marginBottom: '5px'}}>📍 Manage Locations</h2>
            <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '20px'}}>Create named locations (drawers, cabinets, racks) and generate QR codes for them. Assign tools to these locations when adding or editing tools.</p>
            <button
              onClick={() => setShowAddLocationModal(true)}
              style={{width: '100%', padding: '12px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '15px', marginBottom: '20px'}}
            >
              + Add New Location
            </button>
            {locationsList.length === 0 ? (
              <p style={{color: '#94a3b8', textAlign: 'center', padding: '20px'}}>No locations yet. Add your first one above.</p>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                {locationsList.map(loc => {
                  const toolCount = tools.filter(t => t.locationId === loc.id || t.location === loc.name).length;
                  return (
                    <div key={loc.id} style={{background: '#0f172a', padding: '15px', borderRadius: '8px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px'}}>
                      <div style={{flex: 1}}>
                        <p style={{color: 'white', fontSize: '16px', fontWeight: 'bold', marginBottom: '2px'}}>{loc.name}</p>
                        {loc.description && <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '4px'}}>{loc.description}</p>}
                        <p style={{color: '#6366f1', fontSize: '12px'}}>{toolCount} tool{toolCount !== 1 ? 's' : ''} assigned</p>
                      </div>
                      <button
                        onClick={() => { setLocationQRTarget(loc); setShowLocationQRModal(true); }}
                        style={{padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap'}}
                      >
                        📱 QR Code
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete location "${loc.name}"? Tools assigned here will become unassigned.`)) {
                            deleteLocationFromFirebase(loc.id);
                          }
                        }}
                        style={{padding: '8px 12px', background: '#334155', color: '#ef4444', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px'}}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowLocationsManageModal(false)}
              style={{width: '100%', marginTop: '20px', padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 style={{color: 'white', fontSize: '22px', marginBottom: '20px'}}>Add New Location</h2>
            <div style={{marginBottom: '15px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Location Name <span style={{color: '#ef4444'}}>*</span>
              </label>
              <input
                type="text"
                value={newLocation.name}
                onChange={(e) => setNewLocation({...newLocation, name: e.target.value})}
                placeholder="e.g., Drawer A1, Cabinet 3, Wall Rack"
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              />
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{color: '#cbd5e1', fontSize: '14px', display: 'block', marginBottom: '5px'}}>
                Description <span style={{color: '#94a3b8', fontSize: '12px'}}>(Optional)</span>
              </label>
              <input
                type="text"
                value={newLocation.description}
                onChange={(e) => setNewLocation({...newLocation, description: e.target.value})}
                placeholder="e.g., Top left drawer near lathe"
                style={{width: '100%', padding: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '5px', color: 'white'}}
              />
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => { setShowAddLocationModal(false); setNewLocation({name: '', description: ''}); }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newLocation.name.trim()) { alert('Please enter a location name'); return; }
                  addLocationToFirebase({name: newLocation.name.trim(), description: newLocation.description.trim()});
                  setNewLocation({name: '', description: ''});
                  setShowAddLocationModal(false);
                }}
                style={{flex: 1, padding: '10px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Create Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location QR Code Modal */}
      {showLocationQRModal && locationQRTarget && (
        <div className="modal-backdrop">
          <div className="modal" style={{textAlign: 'center'}}>
            <h2 style={{color: 'white', fontSize: '22px', marginBottom: '5px'}}>📱 Location QR Code</h2>
            <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '20px'}}>Scan to view and check out tools at this location</p>
            <div style={{background: 'white', display: 'inline-block', padding: '12px', borderRadius: '8px', marginBottom: '15px'}}>
              <img src={getLocationQRImageUrl(locationQRTarget)} alt={`QR code for ${locationQRTarget.name}`} style={{display: 'block', width: '220px', height: '220px'}} />
            </div>
            <div style={{background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '20px'}}>
              <p style={{color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '3px'}}>📍 {locationQRTarget.name}</p>
              {locationQRTarget.description && <p style={{color: '#94a3b8', fontSize: '13px'}}>{locationQRTarget.description}</p>}
              <p style={{color: '#6366f1', fontSize: '12px', marginTop: '6px'}}>
                {tools.filter(t => t.locationId === locationQRTarget.id || t.location === locationQRTarget.name).length} tool(s) at this location
              </p>
            </div>
            <div style={{display: 'flex', gap: '10px'}}>
              <button
                onClick={() => { setShowLocationQRModal(false); setLocationQRTarget(null); }}
                style={{flex: 1, padding: '10px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                Close
              </button>
              <button
                onClick={() => downloadLocationQRCode(locationQRTarget)}
                style={{flex: 1, padding: '10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
              >
                ⬇️ Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Scan Modal — shown when a location QR is scanned */}
      {showLocationScanModal && locationScanTarget && (() => {
        const locationTools = tools.filter(t => t.locationId === locationScanTarget.id || t.location === locationScanTarget.name);
        const availableTools = locationTools.filter(t => t.status === 'available');
        const checkedOutTools = locationTools.filter(t => t.status === 'checked-out');
        const otherTools = locationTools.filter(t => t.status !== 'available' && t.status !== 'checked-out');

        const toggleTool = (toolId) => {
          setSelectedToolIds(prev => {
            const next = new Set(prev);
            if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
            return next;
          });
        };

        const selectedAvailable = [...selectedToolIds].filter(id => availableTools.some(t => t.id === id));
        const selectedReturnable = [...selectedToolIds].filter(id => checkedOutTools.some(t => t.id === id && (t.holder === user.name || user.isAdmin)));

        const ToolRow = ({tool, canSelect, selectColor}) => (
          <div
            key={tool.id}
            onClick={() => canSelect && toggleTool(tool.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
              background: selectedToolIds.has(tool.id) ? '#1e3a5f' : '#0f172a',
              borderRadius: '8px', marginBottom: '8px',
              border: `1px solid ${selectedToolIds.has(tool.id) ? '#3b82f6' : '#334155'}`,
              cursor: canSelect ? 'pointer' : 'default',
              opacity: canSelect ? 1 : 0.6,
              transition: 'background 0.15s, border-color 0.15s'
            }}
          >
            {canSelect && (
              <div style={{
                width: '22px', height: '22px', borderRadius: '4px', border: `2px solid ${selectColor}`,
                background: selectedToolIds.has(tool.id) ? selectColor : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {selectedToolIds.has(tool.id) && <span style={{color: 'white', fontSize: '14px', lineHeight: 1}}>✓</span>}
              </div>
            )}
            {!canSelect && <div style={{width: '22px', flexShrink: 0}} />}
            {tool.image && (
              <img src={tool.image} alt={tool.name} style={{width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0}} />
            )}
            {!tool.image && (
              <div style={{width: '48px', height: '48px', background: '#334155', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px'}}>🔧</div>
            )}
            <div style={{flex: 1, minWidth: 0}}>
              <p style={{color: 'white', fontSize: '15px', fontWeight: 'bold', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{tool.name}</p>
              <p style={{color: '#94a3b8', fontSize: '12px', marginBottom: '2px'}}>{tool.category}</p>
              {tool.status === 'checked-out' && (
                <p style={{color: '#fdba74', fontSize: '12px'}}>
                  📤 {tool.holder === user.name ? 'Checked out by you' : `Checked out by ${displayName(tool.holder)}`}
                  {!user.isAdmin && tool.holder !== user.name && ' (cannot return)'}
                </p>
              )}
              {tool.status === 'available' && <p style={{color: '#6ee7b7', fontSize: '12px'}}>✓ Available</p>}
              {tool.status === 'missing' && <p style={{color: '#fef3c7', fontSize: '12px'}}>⚠️ Missing</p>}
              {tool.status === 'damaged' && <p style={{color: '#fecaca', fontSize: '12px'}}>🔧 Damaged</p>}
            </div>
          </div>
        );

        return (
          <div className="modal-backdrop">
            <div style={{background: '#1e293b', borderRadius: '10px', maxWidth: '550px', width: '100%', border: '1px solid #334155', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
              {/* Header */}
              <div style={{padding: '20px 20px 15px', borderBottom: '1px solid #334155'}}>
                <h2 style={{color: 'white', fontSize: '22px', marginBottom: '4px'}}>📍 {locationScanTarget.name}</h2>
                {locationScanTarget.description && <p style={{color: '#94a3b8', fontSize: '13px'}}>{locationScanTarget.description}</p>}
                {locationTools.length === 0 && (
                  <p style={{color: '#f59e0b', fontSize: '13px', marginTop: '8px'}}>No tools assigned to this location yet.</p>
                )}
              </div>

              {/* Tool list */}
              <div style={{flex: 1, overflowY: 'auto', padding: '15px 20px'}}>
                {availableTools.length > 0 && (
                  <>
                    <p style={{color: '#6ee7b7', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                      Available to Check Out ({availableTools.length})
                    </p>
                    {availableTools.map(tool => <ToolRow key={tool.id} tool={tool} canSelect={true} selectColor="#f97316" />)}
                  </>
                )}

                {checkedOutTools.length > 0 && (
                  <>
                    <p style={{color: '#fdba74', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', marginTop: availableTools.length > 0 ? '16px' : 0, textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                      Checked Out ({checkedOutTools.length})
                    </p>
                    {checkedOutTools.map(tool => {
                      const canReturn = tool.holder === user.name || user.isAdmin;
                      return <ToolRow key={tool.id} tool={tool} canSelect={canReturn} selectColor="#16a34a" />;
                    })}
                  </>
                )}

                {otherTools.length > 0 && (
                  <>
                    <p style={{color: '#94a3b8', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                      Other ({otherTools.length})
                    </p>
                    {otherTools.map(tool => <ToolRow key={tool.id} tool={tool} canSelect={false} selectColor="#94a3b8" />)}
                  </>
                )}
              </div>

              {/* Actions */}
              <div style={{padding: '15px 20px', borderTop: '1px solid #334155'}}>
                {selectedToolIds.size > 0 && (
                  <p style={{color: '#94a3b8', fontSize: '13px', textAlign: 'center', marginBottom: '10px'}}>
                    {selectedToolIds.size} tool{selectedToolIds.size !== 1 ? 's' : ''} selected
                  </p>
                )}
                <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                  <button
                    onClick={() => { setShowLocationScanModal(false); setSelectedToolIds(new Set()); }}
                    style={{flex: 1, minWidth: '90px', padding: '12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
                  >
                    Close
                  </button>
                  {selectedAvailable.length > 0 && (
                    <button
                      onClick={() => handleBulkCheckout(selectedToolIds)}
                      style={{flex: 2, minWidth: '140px', padding: '12px', background: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'}}
                    >
                      📤 Check Out ({selectedAvailable.length})
                    </button>
                  )}
                  {selectedReturnable.length > 0 && (
                    <button
                      onClick={() => handleBulkReturn(selectedToolIds)}
                      style={{flex: 2, minWidth: '140px', padding: '12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'}}
                    >
                      📥 Return ({selectedReturnable.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Diagnostics Panel */}
      {showDiagnosticsPanel && (
        <DiagnosticsPanel onOpenWizard={() => {
          setShowDiagnosticsPanel(false);
          setShowWizard(true);
        }} onClose={() => {
          setShowDiagnosticsPanel(false);
          // Update header dot from whatever the panel last found
          setBgHealth('unknown');
          // Kick off a fresh quick check for the dot
          if (database) {
            database.ref('.info/connected').once('value')
              .then(s => setBgHealth(s.val() ? 'healthy' : 'error'))
              .catch(() => setBgHealth('error'));
          }
        }} />
      )}
      {/* Change Password modal */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
      {/* Setup Wizard re-run (from Diagnostics "Fix in Setup Wizard") */}
      {showWizard && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:3000,overflowY:'auto',background:'#0f172a'}}>
          <SetupWizard onSkip={() => setShowWizard(false)} />
        </div>
      )}
    </div>
    {/* Printable QR label sheet — hidden on screen, only rendered for print */}
    {showQRPrintModal && qrPrintIds.size > 0 && (
      <div className="qr-print-sheet" aria-hidden="true">
        {tools.filter(t => qrPrintIds.has(t.id)).map(t => (
          <div className="qr-label" key={t.id}>
            <img src={getQRImageUrl(t)} alt="" />
            <div className="qr-label-name">{t.name}</div>
          </div>
        ))}
      </div>
    )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
document.title = SHOP_CONFIG.shopName;
