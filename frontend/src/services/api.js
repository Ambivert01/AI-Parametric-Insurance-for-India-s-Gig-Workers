import axios from 'axios';
const api = axios.create({ baseURL: '/api/v1', timeout: 15000 });
api.interceptors.request.use(c => { const t = localStorage.getItem('gs_at'); if(t) c.headers.Authorization=`Bearer ${t}`; return c; });
api.interceptors.response.use(r => r.data, async e => {
  const o = e.config;
  if(e.response?.status===401 && !o._retry) {
    o._retry=true;
    const r = localStorage.getItem('gs_rt');
    if(r) try {
      const res = await axios.post('/api/v1/auth/refresh',{refreshToken:r});
      const {accessToken}=res.data.data;
      localStorage.setItem('gs_at',accessToken);
      o.headers.Authorization=`Bearer ${accessToken}`;
      return api(o);
    } catch { localStorage.clear(); window.location.href='/login'; }
  }
  return Promise.reject(e.response?.data||e);
});
export const authAPI = {
  sendOTP: p => api.post('/auth/otp/send',{phone:p}),
  verifyOTP: (phone,otp,deviceData) => api.post('/auth/otp/verify',{phone,otp,deviceData}),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  onboard: d => api.put('/auth/onboarding',d),
};
export const policyAPI = {
  quote: tier => api.get('/policies/quote',{params:{tier}}),
  create: (tier,isAutoRenew) => api.post('/policies',{tier,isAutoRenew}),
  confirmPayment: (id,d) => api.post(`/policies/${id}/confirm-payment`,d),
  active: () => api.get('/policies/active'),
  list: (p=1) => api.get('/policies',{params:{page:p}}),
  toggleAutoRenew: e => api.patch('/policies/auto-renew',{enabled:e}),
  shiftQuote: (lat,lon) => api.get('/policies/shift/quote',{params:{lat,lon}}),
  activateShift: d => api.post('/policies/shift/activate',d),
  activeShift: () => api.get('/policies/shift/active'),
};
export const claimsAPI = {
  list: (p=1) => api.get('/claims',{params:{page:p}}),
  get: id => api.get(`/claims/${id}`),
  appeal: (id,reason,evidenceUrls=[]) => api.post(`/claims/${id}/appeal`,{reason,evidenceUrls}),
  selfie: (id,imageBase64) => api.post(`/claims/${id}/selfie`,{imageBase64}),
};
export const paymentAPI = {
  verifyBank: upiId => api.post('/payments/verify-bank',{upiId}),
  history: (p=1) => api.get('/payments/history',{params:{page:p}}),
};
export const kycAPI = {
  status: () => api.get('/kyc/status'),
  selfie: b64 => api.post('/kyc/selfie',{imageBase64:b64}),
  aadhaar: (num,name) => api.post('/kyc/aadhaar',{aadhaarNumber:num,name}),
};
export const analyticsAPI = {
  riderDashboard: () => api.get('/analytics/dashboard'),
  adminDashboard: () => api.get('/admin/dashboard'),
  heatmap: () => api.get('/admin/heatmap'),
  predictions: () => api.get('/admin/predictions'),
  triggers: (p=1) => api.get('/admin/triggers',{params:{page:p}}),
  injectTrigger: d => api.post('/admin/triggers/inject',d),
  claims: params => api.get('/admin/claims',{params}),
  reviewClaim: (id,decision,note) => api.patch(`/admin/claims/${id}/review`,{decision,note}),
  fraudLogs: params => api.get('/admin/fraud-logs',{params}),
  users: params => api.get('/admin/users',{params}),
  blockUser: (id,block,reason) => api.patch(`/admin/users/${id}/block`,{block,reason}),
  loyaltyPool: () => api.get('/admin/loyalty-pool'),
  apiHealth: () => api.get('/admin/health/apis'),
};
export const communityAPI = {
  stats: cityId => api.get('/community/stats',{params:{cityId}}),
  pool: () => api.get('/community/pool'),
  leaderboard: () => api.get('/community/leaderboard'),
};
export const walletAPI = {
  balance: () => api.get('/wallet/balance'),
  referralStats: () => api.get('/referral'),
  applyReferral: code => api.post('/referral/apply',{code}),
};
export const notifAPI = {
  list: () => api.get('/notifications'),
  markRead: () => api.patch('/notifications/read'),
  updatePrefs: prefs => api.patch('/notifications/prefs',prefs),
};
export const publicAPI = {
  map: () => api.get('/public/map'),
  stats: () => api.get('/public/stats'),
};
export const iotAPI = {
  sensors: cityId => api.get(`/iot/sensors/${cityId}`),
  simulate: d => api.post('/iot/simulate',d),
};
export default api;

// ─── Admin (alias + extended) ─────────────────────────────
export const adminAPI = {
  getTriggers: (page = 1) => api.get(`/admin/triggers?page=${page}&limit=20`),
  injectTrigger: (cityId, triggerType, triggerValue) =>
    api.post('/admin/triggers/inject', { cityId, triggerType, triggerValue }),
  getClaims: (params = {}) => api.get(`/admin/claims?${new URLSearchParams(params)}`),
  reviewClaim: (id, decision, note) =>
    api.patch(`/admin/claims/${id}/review`, { decision, note }),
  getFraudLogs: (page = 1, tier) =>
    api.get(`/admin/fraud-logs${tier ? `?tier=${tier}&page=${page}` : `?page=${page}`}`),
  getUsers: (params = {}) => api.get(`/admin/users?${new URLSearchParams(params)}`),
  blockUser: (id, block, reason) =>
    api.patch(`/admin/users/${id}/block`, { block, reason }),
  getLoyaltyPool: () => api.get('/admin/loyalty-pool'),
  exportData: (type) => api.get(`/admin/analytics/export?type=${type}`),
  getAPIHealth: () => api.get('/admin/health/apis'),
  simulateIoT: (cityId, type, value) =>
    api.post('/iot/simulate', { cityId, type, value }),
};

export const referralAPI = {
  getStats: () => api.get('/referral'),
  apply: (code) => api.post('/referral/apply', { code }),
};
