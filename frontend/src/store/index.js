import { configureStore, createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    accessToken: localStorage.getItem("accessToken") || null,
    refreshToken: localStorage.getItem("refreshToken") || null,
    isAuthenticated: !!localStorage.getItem("accessToken"),
    onboardingComplete: false,
  },
  reducers: {
    setTokens: (state, a) => {
      state.accessToken = a.payload.accessToken;
      state.refreshToken = a.payload.refreshToken;
      state.isAuthenticated = true;
      localStorage.setItem("accessToken", a.payload.accessToken);
      localStorage.setItem("refreshToken", a.payload.refreshToken);
    },
    setUser: (state, a) => {
      state.user = a.payload;
      state.onboardingComplete = !!a.payload?.riderProfile;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.onboardingComplete = false;
      localStorage.clear();
    },
  },
});

const policySlice = createSlice({
  name: "policy",
  initialState: {
    activePolicy: null,
    policies: [],
    currentQuote: null,
    activeShift: null,
    isLoading: false,
  },
  reducers: {
    setActivePolicy: (s, a) => {
      s.activePolicy = a.payload;
    },
    setPolicies: (s, a) => {
      s.policies = a.payload;
    },
    setCurrentQuote: (s, a) => {
      s.currentQuote = a.payload;
    },
    setActiveShift: (s, a) => {
      s.activeShift = a.payload;
    },
    setPolicyLoading: (s, a) => {
      s.isLoading = a.payload;
    },
  },
});

const claimsSlice = createSlice({
  name: "claims",
  initialState: { claims: [], total: 0, isLoading: false, activeClaim: null },
  reducers: {
    setClaims: (s, a) => {
      s.claims = a.payload.claims;
      s.total = a.payload.total;
    },
    setClaimsLoading: (s, a) => {
      s.isLoading = a.payload;
    },
    setActiveClaim: (s, a) => {
      s.activeClaim = a.payload;
    },
    updateClaimStatus: (s, a) => {
      const idx = s.claims.findIndex((c) => c._id === a.payload.id);
      if (idx !== -1) s.claims[idx].status = a.payload.status;
    },
  },
});

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState: {
    riderData: null,
    adminData: null,
    communityStats: null,
    walletBalance: null,
    loyaltyPool: null,
    heatmap: [],
    isLoading: false,
  },
  reducers: {
    setRiderDashboard: (s, a) => {
      s.riderData = a.payload;
    },
    setAdminDashboard: (s, a) => {
      s.adminData = a.payload;
    },
    setCommunityStats: (s, a) => {
      s.communityStats = a.payload;
    },
    setWalletBalance: (s, a) => {
      s.walletBalance = a.payload;
    },
    setLoyaltyPool: (s, a) => {
      s.loyaltyPool = a.payload;
    },
    setHeatmap: (s, a) => {
      s.heatmap = a.payload;
    },
    setDashboardLoading: (s, a) => {
      s.isLoading = a.payload;
    },
  },
});

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    sidebarOpen: true,
    notifications: [],
    unreadCount: 0,
    activeTriggerAlert: null,
    realtimePayoutAlert: null,
  },
  reducers: {
    toggleSidebar: (s) => {
      s.sidebarOpen = !s.sidebarOpen;
    },
    setNotifications: (s, a) => {
      s.notifications = a.payload;
      s.unreadCount = a.payload.filter((n) => !n.read).length;
    },
    addNotification: (s, a) => {
      s.notifications.unshift(a.payload);
      if (!a.payload.read) s.unreadCount++;
    },
    setTriggerAlert: (s, a) => {
      s.activeTriggerAlert = a.payload;
    },
    setPayoutAlert: (s, a) => {
      s.realtimePayoutAlert = a.payload;
    },
    clearPayoutAlert: (s) => {
      s.realtimePayoutAlert = null;
    },
  },
});

const adminSlice = createSlice({
  name: "admin",
  initialState: {
    triggers: [],
    fraudLogs: [],
    users: [],
    loyaltyPool: null,
    isLoading: false,
  },
  reducers: {
    setTriggers: (s, a) => {
      s.triggers = a.payload;
    },
    addLiveTrigger: (s, a) => {
      s.triggers.unshift(a.payload);
    },
    setFraudLogs: (s, a) => {
      s.fraudLogs = a.payload;
    },
    setAdminUsers: (s, a) => {
      s.users = a.payload;
    },
    setAdminPool: (s, a) => {
      s.loyaltyPool = a.payload;
    },
    setAdminLoading: (s, a) => {
      s.isLoading = a.payload;
    },
  },
});

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    policy: policySlice.reducer,
    claims: claimsSlice.reducer,
    dashboard: dashboardSlice.reducer,
    ui: uiSlice.reducer,
    admin: adminSlice.reducer,
  },
  middleware: (g) => g({ serializableCheck: false }),
});

export const authActions = authSlice.actions;
export const policyActions = policySlice.actions;
export const claimsActions = claimsSlice.actions;
export const dashboardActions = dashboardSlice.actions;
export const uiActions = uiSlice.actions;
export const adminActions = adminSlice.actions;

export const selectAuth = (s) => s.auth;
export const selectUser = (s) => s.auth.user;
export const selectPolicy = (s) => s.policy;
export const selectClaims = (s) => s.claims;
export const selectDashboard = (s) => s.dashboard;
export const selectUI = (s) => s.ui;
export const selectAdmin = (s) => s.admin;
