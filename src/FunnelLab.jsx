import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Megaphone, Music2, Sparkles, Users, Mail, MousePointerClick,
  FileText, Film, CheckCircle2, Gift, MessageSquare, MessagesSquare,
  Phone, PhoneCall, Send, Package, Plus, Trash2, Lock, Unlock,
  Play, Pause, Copy, Save, ChevronRight, X, Settings2, Zap,
  TrendingUp, DollarSign, Target, Activity, GitBranch, Layers,
  BarChart3, Share2, LogOut, Link2, Check, Cloud, CloudOff, AlertCircle,
  Calendar, GitMerge
} from "lucide-react";
import { supabase } from "./supabase.js";
import {
  listScenarios as listScenariosDb,
  createScenario as createScenarioDb,
  updateScenario as updateScenarioDb,
  deleteScenario as deleteScenarioDb,
  publishScenario as publishScenarioDb,
  unpublishScenario as unpublishScenarioDb,
} from "./scenarios.js";
import { useAutoSave, readDraft, clearDraft } from "./useAutoSave.js";

/* =========================================================================
   FUNNEL LAB — a canvas for sketching, computing and comparing funnels
   ========================================================================= */

// --- Node type registry -----------------------------------------------------

// Fixed node dimensions — important so edge endpoints and ports stay aligned
export const NODE_W = 232;
export const NODE_H = 118;
export const PORT_Y = NODE_H / 2; // true vertical center

// Asset types — kinds of creative deliverables a node might require
export const ASSET_TYPES = {
  video:  { label: "Video",  color: "#ff5a00", short: "vid" },
  copy:   { label: "Copy",   color: "#60a5fa", short: "copy" },
  design: { label: "Design", color: "#a78bfa", short: "dsn" },
  page:   { label: "Page",   color: "#34d399", short: "pg" },
  audio:  { label: "Audio",  color: "#fbbf24", short: "aud" },
  other:  { label: "Other",  color: "#71717a", short: "oth" },
};

export const NODE_CATEGORIES = {
  traffic: {
    label: "Traffic",
    color: "#eab308",
    accent: "#facc15",
    types: {
      meta_ads:      { label: "Meta Ads",       icon: Megaphone },
      tiktok_ads:    { label: "TikTok Ads",     icon: Music2 },
      organic:       { label: "Organic",        icon: Sparkles },
      referrals:     { label: "Referrals",      icon: Users },
      email_camp:    { label: "Email Campaign", icon: Mail },
    },
  },
  conversion: {
    label: "Conversion",
    color: "#64748b",
    accent: "#94a3b8",
    types: {
      optin:         { label: "Opt-in Page",    icon: MousePointerClick },
      landing:       { label: "Landing Page",   icon: FileText },
      vsl:           { label: "VSL Page",       icon: Film },
      live_event:    { label: "Live Event",     icon: Calendar },
      thankyou:      { label: "Thank You",      icon: CheckCircle2 },
      confirm:       { label: "Confirmation",   icon: CheckCircle2 },
    },
  },
  nurture: {
    label: "Nurture",
    color: "#8b5cf6",
    accent: "#a78bfa",
    types: {
      email_single:  { label: "Email",             icon: Mail },
      email_seq:     { label: "Email Sequence",    icon: MessagesSquare },
      sms:           { label: "SMS Reminder",      icon: MessageSquare },
      wa_group:      { label: "WA Group",          icon: MessagesSquare },
      wa_followup:   { label: "WA Follow-up",      icon: Send },
      welcome_video: { label: "Welcome Video",     icon: Film },
      webinar:       { label: "Webinar",           icon: Film },
      personal_video:{ label: "Personal Video",    icon: Film },
      phone:         { label: "Phone Call",        icon: Phone },
      sales_call:    { label: "Sales Call",        icon: PhoneCall },
      followup_call: { label: "Follow-up Call",    icon: PhoneCall },
    },
  },
  offer: {
    label: "Offer",
    color: "#ff5a00",
    accent: "#ff7a2e",
    types: {
      offer:         { label: "Offer",          icon: Gift },
      upsell:        { label: "Upsell",         icon: Package },
    },
  },
  flow: {
    label: "Flow",
    color: "#06b6d4",
    accent: "#22d3ee",
    types: {
      checkpoint:    { label: "Checkpoint",     icon: GitMerge },
    },
  },
};

// Default driver fields per node type. Values are "drivers" by default.
// Any field can be overridden (unlocked) by the user.
function defaultNodeData(category, type) {
  const base = {}; // no label override — type's canonical name is used
  if (category === "traffic") {
    if (type === "organic" || type === "referrals") {
      return { ...base,
        impressions: 20000, ctr: 2.0, adSpend: 0, cpm: 0,
      };
    }
    if (type === "email_camp") {
      return { ...base,
        impressions: 5000, ctr: 3.0, adSpend: 0, cpm: 0,
      };
    }
    return { ...base,
      adSpend: 1000, cpm: 12, ctr: 1.5,
    };
  }
  if (category === "conversion") {
    if (type === "optin")      return { ...base, conversionRate: 35 };
    if (type === "vsl")        return { ...base, conversionRate: 4 };
    if (type === "landing")    return { ...base, conversionRate: 8 };
    if (type === "live_event") return { ...base, showUpRate: 60, conversionRate: 30 };
    return { ...base, conversionRate: 95 }; // thankyou / confirm
  }
  if (category === "nurture") {
    if (type === "sales_call" || type === "followup_call") {
      return { ...base, showUpRate: 60, closeRate: 25 };
    }
    if (type === "phone") {
      return { ...base, showUpRate: 50, closeRate: 15 };
    }
    if (type === "webinar") {
      return { ...base, showUpRate: 45, closeRate: 8 };
    }
    if (type === "welcome_video" || type === "personal_video") {
      return { ...base, viewRate: 55, engagementRate: 30 };
    }
    return { ...base, openRate: 45, engagementRate: 20 }; // emails/sms/wa
  }
  if (category === "offer") {
    return { ...base,
      price: 997, conversionRate: 100,
      useBundle: false,           // when true, `price` is the bundle price; when false, price = sum(products) or fallback `price` field
      products: [],               // [{ id, name, price }]
    };
  }
  if (category === "flow") {
    // Checkpoint: pass-through aggregator. No drivers — volumeOut = sum of inputs.
    return { ...base };
  }
  return base;
}

// --- Metrics engine ---------------------------------------------------------
// Walks the graph topologically from traffic sources, propagating volume.
// Returns per-node computed metrics and a global summary.

export function computeFunnel(nodes, edges) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const incoming = {};
  const outgoing = {};
  nodes.forEach(n => { incoming[n.id] = []; outgoing[n.id] = []; });
  edges.forEach(e => {
    if (incoming[e.to] && outgoing[e.from]) {
      incoming[e.to].push(e.from);
      outgoing[e.from].push(e.to);
    }
  });

  // Topological order (Kahn)
  const indeg = Object.fromEntries(nodes.map(n => [n.id, incoming[n.id].length]));
  const queue = nodes.filter(n => indeg[n.id] === 0).map(n => n.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    outgoing[id].forEach(nid => {
      indeg[nid]--;
      if (indeg[nid] === 0) queue.push(nid);
    });
  }

  // Per-node computed state
  const metrics = {}; // id -> { volumeIn, volumeOut, ...computed }
  nodes.forEach(n => { metrics[n.id] = { volumeIn: 0, volumeOut: 0 }; });

  for (const id of order) {
    const node = nodeMap[id];
    const m = metrics[id];
    const d = node.data;

    // Sum incoming volume
    m.volumeIn = incoming[id].reduce((s, fromId) => {
      const fromOut = metrics[fromId]?.volumeOut || 0;
      // Volume splits evenly across outgoing edges of the parent
      const splits = outgoing[fromId].length || 1;
      return s + fromOut / splits;
    }, 0);

    if (node.category === "traffic") {
      // Traffic nodes generate volume
      let impressions = d.impressions;
      let clicks;
      if (node.type === "organic" || node.type === "referrals" || node.type === "email_camp") {
        impressions = d.impressions || 0;
        clicks = impressions * (d.ctr / 100);
        m.impressions = impressions;
        m.clicks = clicks;
        m.adSpend = 0;
        m.cpm = 0;
        m.cpc = 0;
      } else {
        impressions = d.cpm > 0 ? (d.adSpend / d.cpm) * 1000 : 0;
        clicks = impressions * (d.ctr / 100);
        m.impressions = impressions;
        m.clicks = clicks;
        m.adSpend = d.adSpend;
        m.cpm = d.cpm;
        m.cpc = clicks > 0 ? d.adSpend / clicks : 0;
      }
      m.volumeOut = clicks;
    } else if (node.category === "conversion") {
      if (node.type === "live_event") {
        // Live event: registrations → attendees (show-up) → conversions
        m.showUpRate = d.showUpRate;
        m.conversionRate = d.conversionRate;
        m.attendees = m.volumeIn * (d.showUpRate / 100);
        m.conversions = m.attendees * (d.conversionRate / 100);
        m.volumeOut = m.conversions;
        const upstreamSpend = sumUpstreamSpend(id, incoming, metrics);
        m.costPerResult = m.conversions > 0 ? upstreamSpend / m.conversions : 0;
      } else {
        m.conversionRate = d.conversionRate;
        m.conversions = m.volumeIn * (d.conversionRate / 100);
        m.volumeOut = m.conversions;
        // Cost per result = upstream spend / conversions
        const upstreamSpend = sumUpstreamSpend(id, incoming, metrics);
        m.costPerResult = m.conversions > 0 ? upstreamSpend / m.conversions : 0;
      }
    } else if (node.category === "flow") {
      // Checkpoint: pure pass-through aggregator. volumeIn already sums
      // multiple incoming edges in the topological propagation.
      m.volumeOut = m.volumeIn;
      m.total = m.volumeIn;
    } else if (node.category === "nurture") {
      if (d.showUpRate !== undefined) {
        m.showUpRate = d.showUpRate;
        m.closeRate = d.closeRate;
        m.shows = m.volumeIn * (d.showUpRate / 100);
        m.closes = m.shows * (d.closeRate / 100);
        // volume out to offer = closes
        m.volumeOut = m.closes;
      } else if (d.viewRate !== undefined) {
        m.viewRate = d.viewRate;
        m.engagementRate = d.engagementRate;
        m.views = m.volumeIn * (d.viewRate / 100);
        m.engaged = m.views * (d.engagementRate / 100);
        m.volumeOut = m.engaged;
      } else {
        m.openRate = d.openRate;
        m.engagementRate = d.engagementRate;
        m.engaged = m.volumeIn * (d.engagementRate / 100);
        m.volumeOut = m.engaged;
      }
    } else if (node.category === "offer") {
      const products = d.products || [];
      const productsSum = products.reduce((s, p) => s + (parseFloat(p.price) || 0), 0);
      // If products exist: bundle mode uses d.price, otherwise effective price = sum of products
      // If no products: use d.price directly
      let effectivePrice;
      if (products.length > 0) {
        effectivePrice = d.useBundle ? (d.price || 0) : productsSum;
      } else {
        effectivePrice = d.price || 0;
      }
      m.price = effectivePrice;
      m.productsSum = productsSum;
      m.bundleDiscount = (products.length > 0 && d.useBundle && productsSum > 0)
        ? ((productsSum - (d.price || 0)) / productsSum) * 100
        : 0;
      m.purchaseRate = d.conversionRate;
      m.buyers = m.volumeIn * (d.conversionRate / 100);
      m.revenue = m.buyers * effectivePrice;
      m.volumeOut = m.buyers;
    }
  }

  // Global summary
  const totalSpend = nodes
    .filter(n => n.category === "traffic")
    .reduce((s, n) => s + (metrics[n.id].adSpend || 0), 0);
  const totalRevenue = nodes
    .filter(n => n.category === "offer")
    .reduce((s, n) => s + (metrics[n.id].revenue || 0), 0);
  const totalBuyers = nodes
    .filter(n => n.category === "offer" && n.type === "offer")
    .reduce((s, n) => s + (metrics[n.id].buyers || 0), 0);
  const totalLeads = nodes
    .filter(n => n.category === "conversion" && (n.type === "optin" || n.type === "landing"))
    .reduce((s, n) => s + (metrics[n.id].conversions || 0), 0);

  const summary = {
    totalSpend,
    totalRevenue,
    totalBuyers,
    totalLeads,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    profit: totalRevenue - totalSpend,
    cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    cac: totalBuyers > 0 ? totalSpend / totalBuyers : 0,
    aov: totalBuyers > 0 ? totalRevenue / totalBuyers : 0,
  };

  return { metrics, summary };
}

function sumUpstreamSpend(id, incoming, metrics, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  let s = 0;
  for (const from of (incoming[id] || [])) {
    s += metrics[from]?.adSpend || 0;
    s += sumUpstreamSpend(from, incoming, metrics, seen);
  }
  return s;
}

// --- Formatters -------------------------------------------------------------
export const fmt = {
  int: n => isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—",
  money: n => isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—",
  money2: n => isFinite(n) ? "$" + n.toFixed(2) : "—",
  pct: n => isFinite(n) ? n.toFixed(1) + "%" : "—",
  x: n => isFinite(n) ? n.toFixed(2) + "×" : "—",
};

// --- Field definitions per node type ---------------------------------------
// Declares which fields are drivers (editable by default) and which are computed.
// Computed fields can be unlocked to override.

function fieldDefs(node) {
  const { category, type } = node;
  if (category === "traffic") {
    const organic = type === "organic" || type === "referrals" || type === "email_camp";
    if (organic) {
      return [
        { key: "impressions", label: "Impressions / Reach", kind: "int", driver: true },
        { key: "ctr", label: "CTR", kind: "pct", driver: true },
        { key: "clicks", label: "Clicks", kind: "int", driver: false },
      ];
    }
    return [
      { key: "adSpend", label: "Ad Spend", kind: "money", driver: true },
      { key: "cpm", label: "CPM", kind: "money", driver: true },
      { key: "ctr", label: "CTR", kind: "pct", driver: true },
      { key: "impressions", label: "Impressions", kind: "int", driver: false },
      { key: "clicks", label: "Clicks", kind: "int", driver: false },
      { key: "cpc", label: "CPC", kind: "money2", driver: false },
    ];
  }
  if (category === "conversion") {
    if (type === "live_event") {
      return [
        { key: "showUpRate", label: "Show-up Rate", kind: "pct", driver: true },
        { key: "conversionRate", label: "Conversion Rate", kind: "pct", driver: true },
        { key: "volumeIn", label: "Registered", kind: "int", driver: false },
        { key: "attendees", label: "Attendees", kind: "int", driver: false },
        { key: "conversions", label: "Conversions", kind: "int", driver: false },
        { key: "costPerResult", label: "Cost / Result", kind: "money2", driver: false },
      ];
    }
    return [
      { key: "conversionRate", label: "Conversion Rate", kind: "pct", driver: true },
      { key: "volumeIn", label: "Visitors", kind: "int", driver: false },
      { key: "conversions", label: "Conversions", kind: "int", driver: false },
      { key: "costPerResult", label: "Cost / Result", kind: "money2", driver: false },
    ];
  }
  if (category === "flow") {
    // Checkpoint — pure aggregator, all values computed from upstream
    return [
      { key: "volumeIn", label: "Inbound", kind: "int", driver: false },
      { key: "total", label: "Total", kind: "int", driver: false },
    ];
  }
  if (category === "nurture") {
    const isCall = node.type === "sales_call" || node.type === "followup_call" || node.type === "phone" || node.type === "webinar";
    if (isCall) {
      const showLbl = node.type === "webinar" ? "Attendance Rate" : "Show-up Rate";
      return [
        { key: "showUpRate", label: showLbl, kind: "pct", driver: true },
        { key: "closeRate", label: "Close Rate", kind: "pct", driver: true },
        { key: "volumeIn", label: node.type === "webinar" ? "Registered" : "Booked", kind: "int", driver: false },
        { key: "shows", label: node.type === "webinar" ? "Attendees" : "Shows", kind: "int", driver: false },
        { key: "closes", label: "Closes", kind: "int", driver: false },
      ];
    }
    const isVideo = node.type === "welcome_video" || node.type === "personal_video";
    if (isVideo) {
      return [
        { key: "viewRate", label: "View Rate", kind: "pct", driver: true },
        { key: "engagementRate", label: "Engagement Rate", kind: "pct", driver: true },
        { key: "volumeIn", label: "Audience", kind: "int", driver: false },
        { key: "views", label: "Views", kind: "int", driver: false },
        { key: "engaged", label: "Engaged", kind: "int", driver: false },
      ];
    }
    return [
      { key: "openRate", label: "Open Rate", kind: "pct", driver: true },
      { key: "engagementRate", label: "Engagement Rate", kind: "pct", driver: true },
      { key: "volumeIn", label: "Audience", kind: "int", driver: false },
      { key: "engaged", label: "Engaged", kind: "int", driver: false },
    ];
  }
  if (category === "offer") {
    return [
      { key: "conversionRate", label: "Purchase Rate", kind: "pct", driver: true },
      { key: "volumeIn", label: "Reached", kind: "int", driver: false },
      { key: "buyers", label: "Buyers", kind: "int", driver: false },
      { key: "price", label: "Effective Price", kind: "money", driver: false },
      { key: "revenue", label: "Revenue", kind: "money", driver: false },
    ];
  }
  return [];
}

function formatValue(kind, v) {
  if (kind === "int") return fmt.int(v);
  if (kind === "money") return fmt.money(v);
  if (kind === "money2") return fmt.money2(v);
  if (kind === "pct") return fmt.pct(v);
  return String(v);
}

// --- Sample starter funnel --------------------------------------------------
function starterScenario() {
  const n = (id, category, type, x, y, data) => ({
    id, category, type, x, y, data: { ...defaultNodeData(category, type), ...data },
    overrides: {},
  });
  const nodes = [
    n("t1", "traffic",    "meta_ads",  80,  120, {
      campaignCode: "LAUNCH 1.0", adSpend: 2000, cpm: 14, ctr: 1.8,
      assets: [
        { id: "a1", kind: "video",  name: "Event highlight reel",     description: "45s vertical cut from Investor Connect, framed around authority + energy" },
        { id: "a2", kind: "video",  name: "Testimonial remix",        description: "3 client testimonials, split into 3 individual 30s ads" },
        { id: "a3", kind: "copy",   name: "Ad copy — 3 variants",     description: "Hook-driven, outcome-driven, curiosity-driven" },
        { id: "a4", kind: "design", name: "Static carousel",          description: "5 slides on the Método 4R's framework" },
      ],
    }),
    n("c1", "conversion", "optin",     380, 120, {
      campaignCode: "LP-A", conversionRate: 38,
      assets: [
        { id: "a5", kind: "page",   name: "Opt-in landing page",      description: "Hero + benefit bullets + social proof block + form" },
        { id: "a6", kind: "copy",   name: "Headline + subhead copy",  description: "Test 2 versions, rotate weekly" },
      ],
    }),
    n("nu1","nurture",    "email_seq", 680, 60,  {
      openRate: 48, engagementRate: 22,
      assets: [
        { id: "a7", kind: "copy",   name: "5-email welcome sequence", description: "Day 0, 1, 2, 4, 7 — each ends with a soft CTA to book the call" },
      ],
    }),
    n("nu2","nurture",    "sales_call",680, 220, {
      showUpRate: 55, closeRate: 22,
      assets: [
        { id: "a8", kind: "copy",   name: "Sales call script",        description: "Discovery questions, pain diagnosis, offer presentation, objection handling" },
      ],
    }),
    n("o1", "offer",      "offer",     980, 220, {
      campaignCode: "ACCELERATOR", price: 2500, conversionRate: 100,
      useBundle: true,
      products: [
        { id: "p1", name: "Strategy Session", price: 500 },
        { id: "p2", name: "3 Months Content",  price: 1800 },
        { id: "p3", name: "VSL + Funnel Build", price: 1200 },
        { id: "p4", name: "CRM + Automation",   price: 500 },
      ],
    }),
    n("o2", "offer",      "upsell",    1260, 220, { price: 500, conversionRate: 25 }),
  ];
  const edges = [
    { id: "e1", from: "t1", to: "c1" },
    { id: "e2", from: "c1", to: "nu1" },
    { id: "e3", from: "c1", to: "nu2" },
    { id: "e4", from: "nu2", to: "o1" },
    { id: "e5", from: "o1", to: "o2" },
  ];
  const textBlocks = [
    { id: "tx1", kind: "h1", x: 80, y: 30, w: 420,
      html: "Content Accelerator — base scenario" },
    { id: "tx2", kind: "p", x: 80, y: 370, w: 520,
      html: "Assumes <b>cold traffic</b> from Meta Ads, opt-in to a VSL page, then a split between nurture sequence and a direct sales call. Adjust the close rate on the sales call to see how sensitive the model is." },
  ];
  return { nodes, edges, textBlocks };
}

// ============================================================================
// Main component
// ============================================================================

export default function FunnelLab() {
  const [nodes, setNodes] = useState(() => starterScenario().nodes);
  const [edges, setEdges] = useState(() => starterScenario().edges);
  const [textBlocks, setTextBlocks] = useState(() => starterScenario().textBlocks || []);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [draggingText, setDraggingText] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null); // { id, offsetX, offsetY }
  const [connecting, setConnecting] = useState(null); // { fromId, x, y }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [animating, setAnimating] = useState(true);
  const [scenarios, setScenarios] = useState([]);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [showPalette, setShowPalette] = useState(true);
  const [rightTab, setRightTab] = useState("metrics"); // metrics | scenarios | compare
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState("lab"); // "lab" | "whiteboard"
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const [draftPrompt, setDraftPrompt] = useState(null); // { draft } — offered restore banner

  const canvasRef = useRef(null);

  // ---- Auto-save ----------------------------------------------------------
  const autoSave = useAutoSave({
    nodes, edges, textBlocks,
    activeScenarioId,
    enabled: true,
  });

  // ---- Persistence (Supabase) ---------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const loaded = await listScenariosDb();
        setScenarios(loaded);

        // Check for a saved draft in localStorage
        const draft = readDraft();
        if (draft && draft.savedAt) {
          // Is the draft newer than any corresponding saved scenario?
          const corresponding = draft.activeScenarioId
            ? loaded.find(s => s.id === draft.activeScenarioId)
            : null;
          const draftIsNewer = corresponding
            ? draft.savedAt > corresponding.updatedAt + 1000 // 1s grace
            : true; // no scenario → always offer to restore an unnamed draft
          if (draftIsNewer && hasMeaningfulContent(draft)) {
            setDraftPrompt({ draft, corresponding });
          } else {
            clearDraft();
          }
        }
      } catch (e) {
        console.error('Failed to load scenarios:', e);
      }
    })();
  }, []);

  const saveScenario = async (name) => {
    try {
      const scenario = await createScenarioDb({
        name: name || `Scenario ${scenarios.length + 1}`,
        nodes, edges, textBlocks,
      });
      setScenarios(prev => [scenario, ...prev]);
      setActiveScenarioId(scenario.id);
      clearDraft(); // saved properly — no need for draft buffer
    } catch (e) {
      console.error('Save failed:', e);
      alert('Could not save scenario. ' + e.message);
    }
  };

  const overwriteScenario = async (id) => {
    try {
      const updated = await updateScenarioDb(id, { nodes, edges, textBlocks });
      setScenarios(prev => prev.map(s => s.id === id ? updated : s));
    } catch (e) {
      console.error('Update failed:', e);
      alert('Could not update scenario. ' + e.message);
    }
  };

  const loadScenario = (id) => {
    const sc = scenarios.find(s => s.id === id);
    if (!sc) return;
    setNodes(sc.nodes);
    setEdges(sc.edges);
    setTextBlocks(sc.textBlocks || []);
    setActiveScenarioId(id);
    setSelectedId(null);
    setSelectedTextId(null);
  };

  const deleteScenarioFn = async (id) => {
    if (!confirm('Delete this scenario permanently?')) return;
    try {
      await deleteScenarioDb(id);
      setScenarios(prev => prev.filter(s => s.id !== id));
      if (activeScenarioId === id) setActiveScenarioId(null);
      setCompareIds(prev => prev.filter(x => x !== id));
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Could not delete. ' + e.message);
    }
  };

  // ---- Client-share: publish/unpublish a scenario -------------------------
  const publishScenario = async (id) => {
    const sc = scenarios.find(s => s.id === id);
    if (!sc) return null;
    try {
      const updated = await publishScenarioDb(id, sc.name);
      setScenarios(prev => prev.map(s => s.id === id ? updated : s));
      return updated;
    } catch (e) {
      console.error('Publish failed:', e);
      alert('Could not publish. ' + e.message);
      return null;
    }
  };

  const unpublishScenario = async (id) => {
    try {
      const updated = await unpublishScenarioDb(id);
      setScenarios(prev => prev.map(s => s.id === id ? updated : s));
    } catch (e) {
      console.error('Unpublish failed:', e);
    }
  };

  const renameScenarioFn = async (id, newName) => {
    try {
      const updated = await updateScenarioDb(id, { name: newName });
      setScenarios(prev => prev.map(s => s.id === id ? updated : s));
    } catch (e) {
      console.error('Rename failed:', e);
    }
  };

  // ---- Draft restore ------------------------------------------------------
  const restoreDraft = () => {
    if (!draftPrompt?.draft) return;
    const d = draftPrompt.draft;
    setNodes(d.nodes || []);
    setEdges(d.edges || []);
    setTextBlocks(d.textBlocks || []);
    setActiveScenarioId(d.activeScenarioId || null);
    setSelectedId(null);
    setSelectedTextId(null);
    setDraftPrompt(null);
  };

  const dismissDraft = () => {
    clearDraft();
    setDraftPrompt(null);
  };

  // ---- Computed ------------------------------------------------------------
  const { metrics, summary } = useMemo(() => computeFunnel(nodes, edges), [nodes, edges]);

  // Pre-compute comparison summaries
  const comparisonSummaries = useMemo(() => {
    return compareIds.map(id => {
      const sc = scenarios.find(s => s.id === id);
      if (!sc) return null;
      const r = computeFunnel(sc.nodes, sc.edges);
      return { id, name: sc.name, ...r.summary };
    }).filter(Boolean);
  }, [compareIds, scenarios]);

  // ---- Node + edge manipulation --------------------------------------------
  const addNode = (category, type, pos) => {
    const id = "n_" + Math.random().toString(36).slice(2, 8);
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = pos ? pos.x : (rect ? (rect.width / 2 - panOffset.x - 110) / zoom : 200);
    const y = pos ? pos.y : (rect ? (rect.height / 2 - panOffset.y - 60) / zoom : 200);
    setNodes(prev => [...prev, {
      id, category, type, x, y,
      data: defaultNodeData(category, type),
      overrides: {},
    }]);
  };

  const removeNode = (id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateNodeData = (id, key, value) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n
    ));
  };

  const toggleOverride = (id, key) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== id) return n;
      const ov = { ...n.overrides };
      ov[key] = !ov[key];
      return { ...n, overrides: ov };
    }));
  };

  const addEdge = (fromId, toId) => {
    if (fromId === toId) return;
    if (edges.some(e => e.from === fromId && e.to === toId)) return;
    // Prevent cycles (simple check: if toId can reach fromId, skip)
    const reachable = new Set();
    const stack = [toId];
    while (stack.length) {
      const cur = stack.pop();
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      edges.filter(e => e.from === cur).forEach(e => stack.push(e.to));
    }
    if (reachable.has(fromId)) return;
    setEdges(prev => [...prev, { id: "e_" + Math.random().toString(36).slice(2,8), from: fromId, to: toId }]);
  };

  const removeEdge = (id) => {
    setEdges(prev => prev.filter(e => e.id !== id));
  };

  // ---- Text blocks ---------------------------------------------------------
  const addTextBlock = (kind, pos) => {
    const id = "tx_" + Math.random().toString(36).slice(2, 8);
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = pos ? pos.x : (rect ? (rect.width / 2 - panOffset.x - 180) / zoom : 200);
    const y = pos ? pos.y : (rect ? (rect.height / 2 - panOffset.y - 20) / zoom : 200);
    const defaultHtml = {
      h1: "Heading",
      h2: "Subheading",
      h3: "Section label",
      p:  "Write your note here. Select text to format it.",
    }[kind] || "Text";
    setTextBlocks(prev => [...prev, { id, kind, x, y, w: 360, html: defaultHtml }]);
    setSelectedTextId(id);
    setSelectedId(null);
  };

  const updateTextBlock = (id, patch) => {
    setTextBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  const removeTextBlock = (id) => {
    setTextBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  // ---- Mouse handling ------------------------------------------------------
  const onCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.dataset?.bg === "1") {
      setSelectedId(null);
      setSelectedTextId(null);
      setExpandedNodeId(null);
      // Plain left-click on background = pan. No modifier needed.
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        setPanning({ startX: e.clientX, startY: e.clientY, origX: panOffset.x, origY: panOffset.y });
      }
    }
  };

  const onCanvasMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;
    setMousePos({ x, y });

    if (panning) {
      setPanOffset({
        x: panning.origX + (e.clientX - panning.startX),
        y: panning.origY + (e.clientY - panning.startY),
      });
    }
    if (draggingNode) {
      setNodes(prev => prev.map(n =>
        n.id === draggingNode.id
          ? { ...n, x: x - draggingNode.offsetX, y: y - draggingNode.offsetY }
          : n
      ));
    }
    if (draggingText) {
      setTextBlocks(prev => prev.map(b =>
        b.id === draggingText.id
          ? { ...b, x: x - draggingText.offsetX, y: y - draggingText.offsetY }
          : b
      ));
    }
  };

  const onCanvasMouseUp = (e) => {
    setDraggingNode(null);
    setDraggingText(null);
    setPanning(null);
    if (connecting) {
      // Check if we released over a node's input port
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const portEl = target?.closest?.("[data-port-in]");
      if (portEl) {
        const toId = portEl.getAttribute("data-node-id");
        if (toId) addEdge(connecting.fromId, toId);
      }
      setConnecting(null);
    }
  };

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setZoom(z => Math.max(0.4, Math.min(2, z * delta)));
    }
  };

  // Keyboard delete + view toggle + escape
  useEffect(() => {
    const onKey = (e) => {
      if (isEditableEl(document.activeElement)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) removeNode(selectedId);
        else if (selectedTextId) removeTextBlock(selectedTextId);
      } else if (e.key === "v" || e.key === "V") {
        setViewMode(m => m === "lab" ? "whiteboard" : "lab");
      } else if (e.key === "Escape") {
        setExpandedNodeId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedTextId]);

  // Palette drag
  const [paletteDrag, setPaletteDrag] = useState(null); // { kind: "node" | "text", category, type } or { kind: "text", textKind }

  const onPaletteDragStart = (category, type) => {
    setPaletteDrag({ kind: "node", category, type });
  };
  const onPaletteTextDragStart = (textKind) => {
    setPaletteDrag({ kind: "text", textKind });
  };
  const onCanvasDragOver = (e) => {
    if (paletteDrag) e.preventDefault();
  };
  const onCanvasDrop = (e) => {
    if (!paletteDrag) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom - (paletteDrag.kind === "text" ? 180 : 110);
    const y = (e.clientY - rect.top - panOffset.y) / zoom - (paletteDrag.kind === "text" ? 20 : 60);
    if (paletteDrag.kind === "text") {
      addTextBlock(paletteDrag.textKind, { x, y });
    } else {
      addNode(paletteDrag.category, paletteDrag.type, { x, y });
    }
    setPaletteDrag(null);
  };

  // ---- Derived node list with metrics attached -----------------------------
  const selectedNode = nodes.find(n => n.id === selectedId);

  // ---- Rendering -----------------------------------------------------------

  return (
    <div className="w-full h-screen flex flex-col text-zinc-200 font-ui overflow-hidden select-none"
         style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "var(--bg-0)" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Caveat:wght@400;500;600;700&family=Kalam:wght@400;700&display=swap');
        :root {
          --brand: #ff5a00;
          --brand-bright: #ff7a2e;
          --brand-deep: #cc4800;
          --bg-0: #000000;
          --bg-1: #08070a;
          --bg-2: #0d0c10;
          --bg-3: #121116;
          --border-1: #1a1920;
          --border-2: #26242c;
          --paper: #f5ebd8;
          --paper-deep: #ebe0c4;
          --ink: #1a1410;
          --ink-soft: #3d3125;
        }
        .font-display { font-family: 'Azeret Mono', 'JetBrains Mono', monospace; letter-spacing: -0.04em; font-feature-settings: 'tnum' 1, 'ss01' 1; }
        .font-mono-data { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum' 1; }
        .font-ui { font-family: 'Inter', system-ui, sans-serif; }
        .font-hand { font-family: 'Caveat', cursive; }
        .font-hand-neat { font-family: 'Kalam', cursive; }
        .grid-bg {
          background-image:
            radial-gradient(circle, rgba(255,90,0,0.045) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .paper-bg {
          background-color: #0e0b0a;
          background-image:
            radial-gradient(ellipse at 50% 50%, rgba(255,90,0,0.025), transparent 70%),
            radial-gradient(circle at 16px 16px, rgba(255,255,255,0.14) 1.2px, transparent 1.4px);
          background-size: auto, 32px 32px;
        }
        .node-shadow { box-shadow: 0 1px 2px rgba(0,0,0,0.6), 0 12px 32px rgba(0,0,0,0.5); }
        .node-selected-shadow { box-shadow: 0 0 0 1.5px currentColor, 0 1px 2px rgba(0,0,0,0.6), 0 16px 48px rgba(0,0,0,0.65), 0 0 40px rgba(255,90,0,0.12); }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1f1e25; border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #2f2d37; }

        @keyframes flow {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        .edge-flow { stroke-dasharray: 4 6; animation: flow 1.2s linear infinite; }

        @keyframes profit-pulse {
          0%, 100% { text-shadow: 0 0 24px rgba(255,90,0,0.25), 0 0 8px rgba(255,90,0,0.15); }
          50%      { text-shadow: 0 0 36px rgba(255,90,0,0.4),  0 0 12px rgba(255,90,0,0.25); }
        }
        .profit-glow { animation: profit-pulse 3.5s ease-in-out infinite; }

        .text-block-wrap { cursor: default; }
        .text-block-wrap:hover:not(.selected-block) { outline: 1px dashed rgba(255,90,0,0.35); outline-offset: 2px; }
        .text-block-wrap.selected-block { cursor: text; }
        .text-block-inline :is(h1,h2,h3,p) { margin: 0; }
        .text-block-inline h1 { font-family: 'Space Grotesk', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; color: #fafaf9; }
        .text-block-inline h2 { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.15; color: #f4f4f5; }
        .text-block-inline h3 { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; color: #e4e4e7; text-transform: uppercase; }
        .text-block-inline p  { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 400; line-height: 1.55; color: #a1a1aa; }
        .text-block-inline b, .text-block-inline strong { color: #fafaf9; font-weight: 600; }
        .text-block-inline [contenteditable]:focus { outline: none; }

        /* Whiteboard mode text — still readable on dark bg, structured not handwritten */
        .whiteboard .text-block-inline h1 { color: #ffffff; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 38px; letter-spacing: -0.02em; }
        .whiteboard .text-block-inline h2 { color: #f4f4f5; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 26px; letter-spacing: -0.015em; }
        .whiteboard .text-block-inline h3 { color: #d4d4d8; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }
        .whiteboard .text-block-inline p  { color: #a1a1aa; font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.55; }
        .whiteboard .text-block-inline b, .whiteboard .text-block-inline strong { color: #ffffff; }
      `}</style>

      {/* ---------- TOP BAR ---------- */}
      <header className="flex items-center justify-between px-5 py-3 border-b z-30 relative"
              style={{ borderColor: "var(--border-1)", background: "rgba(5,4,7,0.92)", backdropFilter: "blur(10px)" }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-md flex items-center justify-center"
                   style={{
                     background: "linear-gradient(135deg, #ff5a00 0%, #cc4800 100%)",
                     boxShadow: "0 0 20px rgba(255,90,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                   }}>
                <GitBranch size={15} className="text-black" strokeWidth={2.5}/>
              </div>
            </div>
            <div className="leading-none">
              <div className="font-display text-[22px] tracking-tight text-white" style={{ fontWeight: 600 }}>
                FUNNEL<span style={{ color: "var(--brand)" }}>.</span>LAB
              </div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 mt-1">Digital Plane · Scenario Engine</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border overflow-hidden" style={{ borderColor: "var(--border-2)" }}>
            <button
              onClick={() => setViewMode("lab")}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition ${viewMode === "lab" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              style={viewMode === "lab" ? { background: "rgba(255,90,0,0.12)", color: "var(--brand-bright)" } : { background: "var(--bg-2)" }}
              title="Analytical view — metrics-dense"
            >
              <Activity size={11}/> Lab
            </button>
            <button
              onClick={() => setViewMode("whiteboard")}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition border-l ${viewMode === "whiteboard" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              style={{
                borderColor: "var(--border-2)",
                ...(viewMode === "whiteboard" ? { background: "rgba(255,90,0,0.12)", color: "var(--brand-bright)" } : { background: "var(--bg-2)" })
              }}
              title="Whiteboard view — client-facing sketch"
            >
              <Sparkles size={11}/> Whiteboard
            </button>
          </div>
          <button
            onClick={() => setAnimating(a => !a)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border text-zinc-300 transition"
            style={{ borderColor: "var(--border-2)", background: "var(--bg-2)" }}
          >
            {animating ? <Pause size={12}/> : <Play size={12}/>}
            {animating ? "Pause flow" : "Play flow"}
          </button>
          {activeScenarioId ? (
            <SaveStatusPill status={autoSave.status} lastSavedAt={autoSave.lastSavedAt}/>
          ) : (
            <button
              onClick={() => {
                const nm = prompt("Name this scenario:");
                if (nm) saveScenario(nm);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition"
              style={{
                borderColor: "rgba(255,90,0,0.35)",
                background: "rgba(255,90,0,0.08)",
                color: "var(--brand-bright)",
              }}
            >
              <Save size={12}/> Save scenario
            </button>
          )}
          <div className="h-6 w-px mx-1" style={{ background: "var(--border-2)" }}/>
          <div className="flex items-center gap-3 font-mono-data text-xs">
            <SummaryChip label="SPEND" value={fmt.money(summary.totalSpend)} tone="neutral"/>
            <SummaryChip label="REV" value={fmt.money(summary.totalRevenue)} tone="neutral"/>
            <SummaryChip label="ROAS" value={fmt.x(summary.roas)} tone={summary.roas >= 2 ? "brand" : "warn"}/>
            <SummaryChip label="PROFIT" value={fmt.money(summary.profit)} tone={summary.profit >= 0 ? "brand" : "neg"}/>
          </div>
          <div className="h-6 w-px mx-1" style={{ background: "var(--border-2)" }}/>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 transition"
            title="Sign out"
          >
            <LogOut size={14}/>
          </button>
        </div>
      </header>

      {/* ---------- MAIN LAYOUT ---------- */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left palette */}
        <aside
          className={`${showPalette ? "w-60" : "w-0"} transition-all duration-200 border-r overflow-y-auto scrollbar-thin relative`}
          style={{ borderColor: "var(--border-1)", background: "var(--bg-1)" }}
        >
          {showPalette && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Elements</div>
                <button onClick={() => setShowPalette(false)} className="text-zinc-600 hover:text-zinc-300">
                  <X size={14}/>
                </button>
              </div>
              {Object.entries(NODE_CATEGORIES).map(([catKey, cat]) => (
                <div key={catKey} className="mb-5">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color }}/>
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: cat.accent }}>
                      {cat.label}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {Object.entries(cat.types).map(([typeKey, typ]) => {
                      const Icon = typ.icon;
                      return (
                        <div
                          key={typeKey}
                          draggable
                          onDragStart={() => onPaletteDragStart(catKey, typeKey)}
                          onDoubleClick={() => addNode(catKey, typeKey)}
                          className="group flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-transparent cursor-grab active:cursor-grabbing transition"
                          style={{ background: "rgba(255,255,255,0.02)" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                          title="Drag to canvas (or double-click)"
                        >
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                               style={{ background: `${cat.color}18`, color: cat.accent }}>
                            <Icon size={14}/>
                          </div>
                          <div className="text-xs text-zinc-300 group-hover:text-white">{typ.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Notes / text blocks */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#52525b" }}/>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Notes
                  </div>
                </div>
                <div className="space-y-1">
                  {[
                    { kind: "h1", label: "Heading 1",  sample: "Aa", size: "18px", weight: 700 },
                    { kind: "h2", label: "Heading 2",  sample: "Aa", size: "15px", weight: 600 },
                    { kind: "h3", label: "Section",    sample: "Aa", size: "12px", weight: 600 },
                    { kind: "p",  label: "Paragraph",  sample: "Aa", size: "13px", weight: 400 },
                  ].map(item => (
                    <div
                      key={item.kind}
                      draggable
                      onDragStart={() => onPaletteTextDragStart(item.kind)}
                      onDoubleClick={() => addTextBlock(item.kind)}
                      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-transparent cursor-grab active:cursor-grabbing transition"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      title="Drag to canvas (or double-click)"
                    >
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-zinc-800/50 text-zinc-300"
                           style={{ fontFamily: item.kind === "p" ? "Inter, sans-serif" : "Space Grotesk, sans-serif",
                                    fontSize: item.size, fontWeight: item.weight, lineHeight: 1 }}>
                        {item.sample}
                      </div>
                      <div className="text-xs text-zinc-300 group-hover:text-white">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border-1)" }}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">How to use</div>
                <ul className="text-[11px] text-zinc-500 space-y-1.5 leading-relaxed">
                  <li>· Drag elements onto the canvas</li>
                  <li>· Drag from the right port of a node to the left port of another to connect</li>
                  <li>· Click a node to edit metrics · <span className="text-zinc-400">double-click</span> the header to add a campaign code (e.g. "Launch 1.0")</li>
                  <li>· Select text to format · <span className="text-zinc-400">⌘B</span> / <span className="text-zinc-400">⌘I</span> / <span className="text-zinc-400">⌘U</span></li>
                  <li>· Click-drag the background to pan · <span className="text-zinc-400">⌘+scroll</span> to zoom</li>
                  <li>· <span className="text-zinc-400">Delete</span> removes any selected element</li>
                </ul>
              </div>
            </div>
          )}
          {!showPalette && (
            <button
              onClick={() => setShowPalette(true)}
              className="absolute top-3 left-2 p-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-zinc-400"
            >
              <ChevronRight size={14}/>
            </button>
          )}
        </aside>

        {/* Canvas */}
        <main
          ref={canvasRef}
          data-bg="1"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onWheel}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
          onContextMenu={(e) => e.preventDefault()}
          className={`flex-1 relative overflow-hidden ${viewMode === "whiteboard" ? "paper-bg whiteboard" : "grid-bg"} ${panning ? "cursor-grabbing" : "cursor-grab"}`}
          style={viewMode === "lab"
            ? { background: "radial-gradient(ellipse at 85% 15%, rgba(255,90,0,0.06), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(255,90,0,0.03), transparent 60%), var(--bg-0)" }
            : {}
          }
        >
          {/* Draft restore banner */}
          {draftPrompt && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-md border z-50"
              style={{
                background: "rgba(8,7,10,0.95)",
                borderColor: "rgba(255,90,0,0.4)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                backdropFilter: "blur(8px)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <AlertCircle size={14} style={{ color: "var(--brand-bright)" }}/>
              <div className="text-[12px] text-zinc-200">
                Unsaved work from your last session.
                {draftPrompt.corresponding && (
                  <span className="text-zinc-500"> — {draftPrompt.corresponding.name}</span>
                )}
              </div>
              <button
                onClick={restoreDraft}
                className="text-[11px] uppercase tracking-wider px-2.5 py-1 rounded transition"
                style={{
                  color: "#000",
                  background: "var(--brand)",
                  fontWeight: 600,
                }}
              >
                Restore
              </button>
              <button
                onClick={dismissDraft}
                className="text-[11px] uppercase tracking-wider px-2 py-1 rounded transition text-zinc-500 hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>
          )}


          {/* Watermark */}
          <div className="absolute top-6 right-8 pointer-events-none select-none">
            {viewMode === "lab" ? (
              <div className="font-display text-[10px] tracking-[0.3em] uppercase" style={{ color: "rgba(255,90,0,0.2)" }}>
                // Digital Plane
              </div>
            ) : (
              <div className="font-display text-[10px] tracking-[0.3em] uppercase" style={{ color: "rgba(255,255,255,0.12)" }}>
                // Digital Plane · Funnel Board
              </div>
            )}
          </div>

          {/* Transform container */}
          <div
            data-bg="1"
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}
          >
            {/* Edges layer */}
            <EdgesLayer
              nodes={nodes}
              edges={edges}
              metrics={metrics}
              animating={animating && viewMode === "lab"}
              summary={summary}
              connecting={connecting}
              mousePos={mousePos}
              onRemoveEdge={removeEdge}
              viewMode={viewMode}
            />

            {/* Text blocks layer (rendered under nodes) */}
            {textBlocks.map(block => (
              <TextBlockEl
                key={block.id}
                block={block}
                selected={selectedTextId === block.id}
                onMouseDown={(e) => {
                  if (isEditableEl(e.target)) return; // don't start drag when clicking into editable area
                  e.stopPropagation();
                  const rect = canvasRef.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left - panOffset.x) / zoom;
                  const y = (e.clientY - rect.top - panOffset.y) / zoom;
                  setDraggingText({ id: block.id, offsetX: x - block.x, offsetY: y - block.y });
                  setSelectedTextId(block.id);
                  setSelectedId(null);
                }}
                onSelect={() => { setSelectedTextId(block.id); setSelectedId(null); }}
                onChange={(patch) => updateTextBlock(block.id, patch)}
                onRemove={() => removeTextBlock(block.id)}
              />
            ))}

            {/* Nodes layer */}
            {nodes.map(node => {
              const cat = NODE_CATEGORIES[node.category];
              const typeDef = cat.types[node.type];
              const m = metrics[node.id] || {};
              const selected = selectedId === node.id;
              const commonProps = {
                key: node.id,
                node, cat, typeDef, m, selected,
                expanded: expandedNodeId === node.id,
                onToggleExpand: () => setExpandedNodeId(prev => prev === node.id ? null : node.id),
                onUpdateAssets: (assets) => updateNodeData(node.id, "assets", assets),
                readonlyAssets: viewMode === "whiteboard", // Whiteboard = read-only inline
                onMouseDown: (e) => {
                  e.stopPropagation();
                  const rect = canvasRef.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left - panOffset.x) / zoom;
                  const y = (e.clientY - rect.top - panOffset.y) / zoom;
                  setDraggingNode({ id: node.id, offsetX: x - node.x, offsetY: y - node.y });
                  setSelectedId(node.id);
                  setSelectedTextId(null);
                },
                onSelect: () => { setSelectedId(node.id); setSelectedTextId(null); },
                onStartConnect: (e) => {
                  e.stopPropagation();
                  const rect = canvasRef.current.getBoundingClientRect();
                  setConnecting({
                    fromId: node.id,
                    x: (e.clientX - rect.left - panOffset.x) / zoom,
                    y: (e.clientY - rect.top - panOffset.y) / zoom,
                  });
                },
                onRemove: () => removeNode(node.id),
                onRename: (id, code) => updateNodeData(id, "campaignCode", code),
              };
              return viewMode === "whiteboard"
                ? <WhiteboardNode {...commonProps} />
                : <NodeCard {...commonProps} />;
            })}
          </div>

          {/* Zoom control */}
          <div
            className="absolute bottom-5 left-5 flex items-center gap-1 rounded-md border overflow-hidden"
            style={{ borderColor: "var(--border-2)", background: "rgba(8,7,10,0.8)", backdropFilter: "blur(8px)" }}
          >
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="px-2 py-1 text-xs text-zinc-400 hover:text-white transition">−</button>
            <div className="px-2 text-xs font-mono-data text-zinc-400 min-w-[48px] text-center">{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-2 py-1 text-xs text-zinc-400 hover:text-white transition">+</button>
            <button
              onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
              className="px-2 py-1 text-xs text-zinc-400 hover:text-[color:var(--brand-bright)] transition border-l"
              style={{ borderColor: "var(--border-2)" }}
            >fit</button>
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-5 right-5 flex items-center gap-3 rounded-md border px-3 py-1.5"
            style={{ borderColor: "var(--border-2)", background: "rgba(8,7,10,0.8)", backdropFilter: "blur(8px)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Flow intensity</div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-px rounded-full" style={{ background: "#3f3f46" }}/>
              <div className="w-6 rounded-full" style={{ height: "2px", background: "rgba(255,90,0,0.5)" }}/>
              <div className="w-6 rounded-full" style={{ height: "3px", background: "var(--brand-bright)" }}/>
            </div>
          </div>
        </main>

        {/* Right panel */}
        <aside
          className="w-96 border-l overflow-y-auto scrollbar-thin flex flex-col"
          style={{ borderColor: "var(--border-1)", background: "var(--bg-1)" }}
        >
          <div className="flex border-b shrink-0" style={{ borderColor: "var(--border-1)" }}>
            {[
              { key: "metrics", label: "Breakdown", icon: BarChart3 },
              { key: "scenarios", label: "Scenarios", icon: Layers },
              { key: "compare", label: "Compare", icon: Activity },
            ].map(t => {
              const Icon = t.icon;
              const active = rightTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setRightTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-wider transition ${active ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  style={active ? {
                    borderBottom: "1px solid var(--brand)",
                    background: "rgba(255,90,0,0.06)",
                  } : {}}
                >
                  <Icon size={12}/> {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {rightTab === "metrics" && (
              <MetricsPanel
                nodes={nodes}
                metrics={metrics}
                summary={summary}
                selectedNode={selectedNode}
                onUpdateField={updateNodeData}
                onToggleOverride={toggleOverride}
                onRemoveNode={removeNode}
              />
            )}
            {rightTab === "scenarios" && (
              <ScenariosPanel
                scenarios={scenarios}
                activeId={activeScenarioId}
                compareIds={compareIds}
                onLoad={loadScenario}
                onDelete={deleteScenarioFn}
                onPublish={publishScenario}
                onUnpublish={unpublishScenario}
                onRename={renameScenarioFn}
                onToggleCompare={(id) => setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(-4))}
                onOverwrite={overwriteScenario}
                onSaveAs={() => {
                  const nm = prompt("Name this scenario:");
                  if (nm) saveScenario(nm);
                }}
                currentSummary={summary}
              />
            )}
            {rightTab === "compare" && (
              <ComparePanel
                comparisonSummaries={comparisonSummaries}
                currentSummary={summary}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function isEditableEl(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// Treat a draft as "meaningful" if it has more than what the starter scenario
// would have — basically, any user changes worth offering to restore.
function hasMeaningfulContent(draft) {
  if (!draft) return false;
  const { nodes = [], edges = [], textBlocks = [] } = draft;
  // Any user text content is meaningful
  if (textBlocks.length > 2) return true;
  // More than starter's 6 nodes? Changed a node count?
  if (nodes.length !== 6) return true;
  if (edges.length !== 5) return true;
  return false;
}

// ------------- Save status pill ---------------------------------------------

function SaveStatusPill({ status, lastSavedAt }) {
  let Icon = Cloud;
  let label = "Saved";
  let color = "#71717a"; // idle neutral
  let bg = "rgba(113,113,122,0.08)";
  let border = "rgba(113,113,122,0.25)";

  if (status === 'saving') {
    label = "Saving…";
    color = "#fbbf24";
    bg = "rgba(251,191,36,0.08)";
    border = "rgba(251,191,36,0.3)";
  } else if (status === 'saved') {
    Icon = Check;
    label = "Saved";
    color = "#34d399";
    bg = "rgba(52,211,153,0.08)";
    border = "rgba(52,211,153,0.3)";
  } else if (status === 'error') {
    Icon = AlertCircle;
    label = "Save failed";
    color = "#f87171";
    bg = "rgba(248,113,113,0.08)";
    border = "rgba(248,113,113,0.3)";
  } else if (status === 'offline') {
    Icon = CloudOff;
    label = "Offline";
    color = "#fbbf24";
    bg = "rgba(251,191,36,0.08)";
    border = "rgba(251,191,36,0.3)";
  } else {
    // idle — show last save time subtly
    label = lastSavedAt ? "Saved" : "Ready";
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border font-mono-data uppercase tracking-wider"
      style={{ color, background: bg, borderColor: border }}
      title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}` : undefined}
    >
      <Icon size={11}/>
      <span>{label}</span>
    </div>
  );
}

function SummaryChip({ label, value, tone }) {
  const tones = {
    brand: "text-[color:var(--brand-bright)]",
    pos: "text-emerald-400",
    neg: "text-red-400",
    warn: "text-amber-400",
    neutral: "text-zinc-300",
  };
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className={`tabular-nums font-medium ${tones[tone]}`}>{value}</span>
    </div>
  );
}

// ------------- Node card ----------------------------------------------------

// ------------- Whiteboard node (client-facing sketch view) ------------------

// Deterministic pseudo-random from id → -1.2deg..+1.2deg rotation
function nodeRotation(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 24) - 12) / 10;
}

export function WhiteboardNode({ node, cat, typeDef, m, selected, expanded, onToggleExpand, onUpdateAssets, readonlyAssets, onMouseDown, onSelect, onStartConnect, onRemove, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.data.campaignCode || "");
  const inputRef = useRef(null);

  useEffect(() => { setDraftName(node.data.campaignCode || ""); }, [node.data.campaignCode]);
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const commitRename = () => {
    onRename(node.id, draftName.trim() || null);
    setRenaming(false);
  };

  const campaignCode = node.data.campaignCode;
  const typeName = typeDef.label;
  const headline = getNodeHeadline(node, m);

  return (
    <div
      onMouseDown={renaming ? undefined : onMouseDown}
      onClick={onSelect}
      onDoubleClick={(e) => {
        if (renaming) return;
        if (onToggleExpand) {
          e.stopPropagation();
          onToggleExpand();
        }
      }}
      className="absolute cursor-grab active:cursor-grabbing group"
      style={{
        left: node.x, top: node.y, width: NODE_W, height: NODE_H,
      }}
    >
      {/* Clean card */}
      <div
        className="absolute inset-0 rounded-lg transition"
        style={{
          background: "#ffffff",
          border: selected ? "2px solid #ff5a00" : "1px solid #e4e4e7",
          boxShadow: selected
            ? "0 10px 30px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,90,0,0.15)"
            : "0 4px 14px rgba(0,0,0,0.28)",
        }}
      />

      {/* Campaign code tag — clean, not a post-it */}
      {(campaignCode || renaming) && (
        <div
          className="absolute left-3 z-10"
          style={{ top: -10 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {renaming ? (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") { setDraftName(campaignCode || ""); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Launch 1.0"
              className="font-mono-data text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm focus:outline-none"
              style={{
                background: "#ffffff",
                color: "#ff5a00",
                border: "1px solid #ff5a00",
                minWidth: 100,
              }}
            />
          ) : (
            <div
              className="font-mono-data text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm"
              style={{
                background: "#ffffff",
                color: "#ff5a00",
                border: "1px solid #ff5a00",
              }}
            >
              {campaignCode}
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="relative h-full p-3 flex items-center gap-3">
        {/* Pictogram */}
        <div className="shrink-0 flex items-center justify-center" style={{ width: 68, height: 68 }}>
          <NodePictogram node={node} />
        </div>

        {/* Label stack */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.16em] cursor-text"
            style={{ color: cat.color }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!readonlyAssets) setRenaming(true);
            }}
            title="Double-click to edit campaign code"
          >
            {cat.label}
          </div>
          <div
            className="text-[15px] font-semibold leading-tight truncate mt-0.5"
            style={{ color: "#18181b", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}
          >
            {typeName}
          </div>
          <div className="font-mono-data text-[11px] tabular-nums mt-1 truncate" style={{ color: "#71717a" }}>
            {headline.value} <span style={{ color: "#a1a1aa" }}>{headline.value !== "—" && headline.label.toLowerCase()}</span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className={`absolute top-1.5 right-1.5 rounded-full p-1 transition ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          style={{ background: "rgba(0,0,0,0.05)", color: "#71717a" }}
          title="Remove"
        >
          <X size={11}/>
        </button>
      </div>

      {/* Asset pill */}
      <WhiteboardAssetPill node={node} />

      {/* Ports */}
      <div
        data-port-in="1"
        data-node-id={node.id}
        className="absolute left-0 w-3 h-3 rounded-full transition hover:scale-125"
        style={{
          top: PORT_Y, transform: "translate(-50%, -50%)",
          background: "#ffffff",
          border: "2px solid #27272a",
        }}
      />
      <div
        onMouseDown={(e) => { e.stopPropagation(); onStartConnect(e); }}
        className="absolute right-0 w-3 h-3 rounded-full cursor-crosshair transition hover:scale-125"
        style={{
          top: PORT_Y, transform: "translate(50%, -50%)",
          background: "#ff5a00",
          border: "2px solid #ffffff",
        }}
        title="Drag to another node to connect"
      />
    </div>
  );
}

// ------------- Pictograms ---------------------------------------------------

export function NodePictogram({ node }) {
  const { category, type } = node;
  const stroke = "#1a1410";
  const sw = 1.8;

  // Landing / Opt-in / VSL — rectangle with video area and button beneath
  if (category === "conversion" && (type === "optin" || type === "landing" || type === "vsl")) {
    const isVSL = type === "vsl";
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Page outline */}
        <rect x="8" y="8" width="56" height="56" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        {/* Video area */}
        <rect x="14" y="14" width="44" height={isVSL ? 34 : 24} rx="2" fill="#efe0c4" stroke={stroke} strokeWidth={sw}/>
        {/* Play triangle */}
        <path d={isVSL ? "M 33 25 L 33 37 L 43 31 Z" : "M 33 20 L 33 30 L 41 25 Z"} fill={stroke}/>
        {/* Button (not on VSL — VSL typically has no button pre-play) */}
        {!isVSL && (
          <>
            <rect x="20" y="44" width="32" height="8" rx="4" fill="#ff5a00" stroke={stroke} strokeWidth={sw}/>
            <line x1="20" y1="56" x2="52" y2="56" stroke={stroke} strokeWidth={1} opacity="0.3"/>
          </>
        )}
        {isVSL && <rect x="14" y="52" width="44" height="2" rx="1" fill={stroke} opacity="0.2"/>}
      </svg>
    );
  }

  // Live Event — calendar page with spotlight/stage
  if (category === "conversion" && type === "live_event") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Calendar frame */}
        <rect x="10" y="14" width="52" height="48" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        {/* Calendar top band */}
        <rect x="10" y="14" width="52" height="12" rx="3" fill="#fde68a" stroke={stroke} strokeWidth={sw}/>
        {/* Binding dots */}
        <rect x="20" y="10" width="3" height="10" rx="1" fill={stroke}/>
        <rect x="49" y="10" width="3" height="10" rx="1" fill={stroke}/>
        {/* Stage / spotlight */}
        <path d="M 24 52 L 36 34 L 48 52 Z" fill="#ff5a00" stroke={stroke} strokeWidth={sw} strokeLinejoin="round"/>
        {/* Star above (event sparkle) */}
        <circle cx="36" cy="32" r="2" fill={stroke}/>
      </svg>
    );
  }

  // Checkpoint — confluence of three streams merging into one
  if (category === "flow" && type === "checkpoint") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Three incoming lines merging at center */}
        <path d="M 8 18 C 22 18, 26 34, 36 34" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        <path d="M 8 34 L 36 34" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        <path d="M 8 50 C 22 50, 26 34, 36 34" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        {/* Out arrow */}
        <path d="M 36 34 L 60 34" fill="none" stroke={stroke} strokeWidth={sw * 1.3} strokeLinecap="round"/>
        <path d="M 55 29 L 60 34 L 55 39" fill="none" stroke={stroke} strokeWidth={sw * 1.3} strokeLinecap="round" strokeLinejoin="round"/>
        {/* Merge node */}
        <circle cx="36" cy="34" r="5" fill="#22d3ee" stroke={stroke} strokeWidth={sw}/>
      </svg>
    );
  }

  // Thank you / Confirmation — page with checkmark
  if (category === "conversion") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <rect x="8" y="8" width="56" height="56" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <circle cx="36" cy="30" r="10" fill="#d4f5d4" stroke={stroke} strokeWidth={sw}/>
        <path d="M 31 30 L 35 34 L 42 26" fill="none" stroke={stroke} strokeWidth={sw * 1.2} strokeLinecap="round"/>
        <rect x="18" y="48" width="36" height="2" fill={stroke} opacity="0.3"/>
        <rect x="22" y="54" width="28" height="2" fill={stroke} opacity="0.2"/>
      </svg>
    );
  }

  // Meta Ads — stack of reel rectangles
  if (category === "traffic" && type === "meta_ads") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <rect x="6" y="14"  width="22" height="38" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw} transform="rotate(-5 17 33)"/>
        <rect x="25" y="12" width="22" height="40" rx="3" fill="#ffe0cc" stroke={stroke} strokeWidth={sw}/>
        <path d="M 32 26 L 32 38 L 42 32 Z" fill={stroke}/>
        <rect x="44" y="14" width="22" height="38" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw} transform="rotate(5 55 33)"/>
        <text x="36" y="64" textAnchor="middle" fontFamily="Inter" fontSize="9" fontWeight="600" fill={stroke} opacity="0.55" letterSpacing="0.5">meta</text>
      </svg>
    );
  }

  // TikTok Ads — single reel with music note
  if (category === "traffic" && type === "tiktok_ads") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <rect x="20" y="8" width="32" height="52" rx="4" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <path d="M 32 24 L 32 38 L 42 31 Z" fill={stroke}/>
        <circle cx="44" cy="46" r="2.5" fill={stroke}/>
        <path d="M 46 46 L 46 38 L 50 40" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        <text x="36" y="66" textAnchor="middle" fontFamily="Inter" fontSize="9" fontWeight="600" fill={stroke} opacity="0.55" letterSpacing="0.5">tiktok</text>
      </svg>
    );
  }

  // Organic — sparkle/sun
  if (category === "traffic" && type === "organic") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle cx="36" cy="36" r="12" fill="#fff8a8" stroke={stroke} strokeWidth={sw}/>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
          const rad = (a * Math.PI) / 180;
          const x1 = 36 + Math.cos(rad) * 18;
          const y1 = 36 + Math.sin(rad) * 18;
          const x2 = 36 + Math.cos(rad) * 26;
          const y2 = 36 + Math.sin(rad) * 26;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>;
        })}
      </svg>
    );
  }

  // Referrals — two figures with arrow
  if (category === "traffic" && type === "referrals") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle cx="20" cy="28" r="6" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <path d="M 14 48 Q 20 38 26 48" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <circle cx="52" cy="28" r="6" fill="#ffe0cc" stroke={stroke} strokeWidth={sw}/>
        <path d="M 46 48 Q 52 38 58 48" fill="#ffe0cc" stroke={stroke} strokeWidth={sw}/>
        <path d="M 30 28 L 42 28" stroke={stroke} strokeWidth={sw} strokeLinecap="round" markerEnd="url(#arrow-ink)"/>
      </svg>
    );
  }

  // Email campaign + nurture emails — envelope
  if ((category === "traffic" && type === "email_camp") ||
      (category === "nurture" && (type === "email_single" || type === "email_seq"))) {
    const stack = type === "email_seq";
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {stack && <rect x="10" y="22" width="40" height="28" rx="2" fill="#fff" stroke={stroke} strokeWidth={sw}/>}
        {stack && <rect x="16" y="18" width="40" height="28" rx="2" fill="#fff" stroke={stroke} strokeWidth={sw}/>}
        <rect x="14" y="22" width="44" height="30" rx="2" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <path d="M 14 22 L 36 40 L 58 22" fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round"/>
      </svg>
    );
  }

  // SMS / WhatsApp — speech bubble
  if (category === "nurture" && (type === "sms" || type === "wa_followup" || type === "wa_group")) {
    const group = type === "wa_group";
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        <path d="M 14 20 L 58 20 Q 62 20 62 24 L 62 42 Q 62 46 58 46 L 28 46 L 20 54 L 22 46 L 18 46 Q 14 46 14 42 Z"
              fill={group ? "#d4f5d4" : "#fff"} stroke={stroke} strokeWidth={sw}/>
        <circle cx="26" cy="33" r="2" fill={stroke}/>
        <circle cx="36" cy="33" r="2" fill={stroke}/>
        <circle cx="46" cy="33" r="2" fill={stroke}/>
      </svg>
    );
  }

  // Sales call / follow-up call — calendar tile with clock (booked appointment)
  if (category === "nurture" && (type === "sales_call" || type === "followup_call")) {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Calendar body */}
        <rect x="14" y="18" width="44" height="40" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        {/* Header bar */}
        <path d="M 14 26 L 58 26" stroke={stroke} strokeWidth={sw}/>
        {/* Binder rings */}
        <line x1="24" y1="14" x2="24" y2="22" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        <line x1="48" y1="14" x2="48" y2="22" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        {/* Grid dots (sample dates) */}
        <circle cx="22" cy="34" r="1.2" fill={stroke} opacity="0.35"/>
        <circle cx="30" cy="34" r="1.2" fill={stroke} opacity="0.35"/>
        <circle cx="38" cy="34" r="1.2" fill={stroke} opacity="0.35"/>
        <circle cx="46" cy="34" r="1.2" fill={stroke} opacity="0.35"/>
        <circle cx="22" cy="42" r="1.2" fill={stroke} opacity="0.35"/>
        <circle cx="30" cy="42" r="1.2" fill={stroke} opacity="0.35"/>
        {/* Highlighted date (the booking) */}
        <circle cx="38" cy="42" r="4" fill="#ff5a00"/>
        {/* Clock overlay in corner */}
        <circle cx="52" cy="48" r="8" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        <path d="M 52 44 L 52 48 L 55 50" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
      </svg>
    );
  }

  // Plain phone call — clean smartphone outline with ringing arcs
  if (category === "nurture" && type === "phone") {
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Phone */}
        <rect x="24" y="14" width="24" height="44" rx="4" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        {/* Speaker slit */}
        <line x1="32" y1="19" x2="40" y2="19" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
        {/* Home indicator */}
        <rect x="32" y="52" width="8" height="1.5" rx="0.75" fill={stroke}/>
        {/* Ringing arcs */}
        <path d="M 54 24 Q 60 28 56 34" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity="0.6"/>
        <path d="M 58 20 Q 66 28 60 38" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity="0.4"/>
      </svg>
    );
  }

  // Video nurture — circle with play (welcome/personal video / webinar)
  if (category === "nurture" && (type === "welcome_video" || type === "personal_video" || type === "webinar")) {
    const webinar = type === "webinar";
    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {webinar ? (
          <>
            <rect x="10" y="14" width="52" height="36" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
            <path d="M 30 24 L 30 40 L 46 32 Z" fill={stroke}/>
            {/* Audience dots below */}
            <circle cx="20" cy="58" r="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
            <circle cx="30" cy="58" r="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
            <circle cx="40" cy="58" r="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
            <circle cx="50" cy="58" r="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
          </>
        ) : (
          <>
            <circle cx="36" cy="36" r="22" fill="#fff" stroke={stroke} strokeWidth={sw}/>
            <path d="M 30 26 L 30 46 L 48 36 Z" fill={stroke}/>
          </>
        )}
      </svg>
    );
  }

  // Offer / Upsell — pricing card with product line items
  if (category === "offer") {
    const upsell = type === "upsell";
    const productCount = (node.data.products || []).length;
    // Show up to 3 line items. If no products, show a single "main item" line.
    const lineCount = productCount > 0 ? Math.min(3, productCount) : 1;
    const headerColor = upsell ? "#fbbf24" : "#ff5a00";

    return (
      <svg viewBox="0 0 72 72" width="72" height="72">
        {/* Card body */}
        <rect x="10" y="12" width="52" height="50" rx="3" fill="#fff" stroke={stroke} strokeWidth={sw}/>
        {/* Colored header strip */}
        <path d="M 10 15 Q 10 12 13 12 L 59 12 Q 62 12 62 15 L 62 22 L 10 22 Z" fill={headerColor}/>
        {/* Header icon (dot mark) */}
        <circle cx="16" cy="17" r="1.8" fill="#fff"/>
        <circle cx="21" cy="17" r="1.8" fill="#fff" opacity="0.6"/>
        <circle cx="26" cy="17" r="1.8" fill="#fff" opacity="0.35"/>
        {/* "Price" badge on right of header */}
        <rect x="44" y="14.5" width="14" height="5" rx="1" fill="#fff" opacity="0.85"/>
        <line x1="47" y1="17" x2="55" y2="17" stroke={headerColor} strokeWidth="1.2"/>

        {/* Product line items */}
        {Array.from({ length: lineCount }).map((_, i) => {
          const y = 30 + i * 9;
          return (
            <g key={i}>
              {/* small check/bullet square */}
              <rect x="15" y={y - 2} width="4" height="4" rx="0.8" fill="#fff" stroke={stroke} strokeWidth="1"/>
              {/* product name line */}
              <line x1="22" y1={y} x2={44} y2={y} stroke={stroke} strokeWidth="1.4" strokeLinecap="round"/>
              {/* price indicator */}
              <line x1="48" y1={y} x2={57} y2={y} stroke={stroke} strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
            </g>
          );
        })}

        {/* "+more" indicator if there are more than 3 products */}
        {productCount > 3 && (
          <text x="36" y="59" textAnchor="middle"
                fontFamily="Inter" fontSize="7" fontWeight="600"
                fill={stroke} opacity="0.55" letterSpacing="0.3">
            +{productCount - 3} more
          </text>
        )}
      </svg>
    );
  }

  // Fallback
  return (
    <svg viewBox="0 0 72 72" width="72" height="72">
      <rect x="14" y="14" width="44" height="44" rx="4" fill="#fff" stroke={stroke} strokeWidth={sw}/>
    </svg>
  );
}


// ------------- Lab node card (analytical view) ------------------------------

export function NodeCard({ node, cat, typeDef, m, selected, expanded, onToggleExpand, onUpdateAssets, readonlyAssets, onMouseDown, onSelect, onStartConnect, onRemove, onRename }) {
  const Icon = typeDef.icon;
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.data.campaignCode || "");
  const inputRef = useRef(null);

  useEffect(() => { setDraftName(node.data.campaignCode || ""); }, [node.data.campaignCode]);
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const commitRename = () => {
    const v = draftName.trim();
    onRename(node.id, v || null);  // empty string clears the campaign code
    setRenaming(false);
  };

  const headline = getNodeHeadline(node, m);
  const campaignCode = node.data.campaignCode;

  return (
    <div
      onMouseDown={renaming ? undefined : onMouseDown}
      onClick={onSelect}
      className={`group absolute rounded-xl transition-[box-shadow] cursor-grab active:cursor-grabbing ${selected ? "node-selected-shadow" : "node-shadow"}`}
      style={{
        left: node.x, top: node.y, width: NODE_W, height: NODE_H,
        background: "linear-gradient(180deg, #131116 0%, #0a090d 100%)",
        border: `1px solid ${selected ? cat.accent : "var(--border-1)"}`,
        color: cat.accent,
      }}
    >
      {/* Campaign code pill — floats above the card */}
      {(campaignCode || renaming) && (
        <div
          className="absolute left-3 flex items-center"
          style={{ top: -10 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {renaming ? (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") { setDraftName(campaignCode || ""); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="e.g. Launch 1.0"
              className="font-mono-data text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm bg-black text-white focus:outline-none min-w-[120px]"
              style={{ border: `1px solid ${cat.accent}` }}
            />
          ) : (
            <div
              onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}
              className="font-mono-data text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm cursor-text"
              style={{
                background: "#000",
                color: cat.accent,
                border: `1px solid ${cat.accent}40`,
              }}
              title="Double-click to edit campaign code"
            >
              {campaignCode}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "var(--border-1)" }}
        onDoubleClick={(e) => {
          if (!campaignCode && !renaming) {
            e.stopPropagation();
            setRenaming(true);
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: `${cat.color}22`, color: cat.accent }}>
            <Icon size={12}/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: cat.accent, opacity: 0.85 }}>{cat.label}</div>
            <div className="text-[13px] font-medium text-zinc-100 truncate" title={!campaignCode ? "Double-click header to add a campaign code" : undefined}>
              {typeDef.label}
            </div>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition ml-1"
          title="Delete"
        >
          <Trash2 size={12}/>
        </button>
      </div>
      {/* Body */}
      <div
        className="px-3 py-2 relative"
        onDoubleClick={(e) => {
          if (onToggleExpand) {
            e.stopPropagation();
            onToggleExpand();
          }
        }}
      >
        <div className="font-mono-data text-[10px] text-zinc-500 uppercase tracking-wider">{headline.label}</div>
        <div className="font-mono-data text-base text-white tabular-nums mt-0.5 leading-tight">{headline.value}</div>
        {headline.sub && (
          <div className="font-mono-data text-[10px] text-zinc-500 mt-0.5 truncate">{headline.sub}</div>
        )}
        {/* Asset dots (bottom-right) */}
        <AssetDots node={node} />
      </div>

      {/* Inline asset expansion */}
      {expanded && (
        <ExpandedAssets
          node={node}
          readonly={!!readonlyAssets}
          variant="lab"
          onUpdateAssets={onUpdateAssets || (() => {})}
        />
      )}

      {/* Ports — positioned at exact vertical center of fixed-height card */}
      <div
        data-port-in="1"
        data-node-id={node.id}
        className="absolute left-0 w-3 h-3 rounded-full border-2 hover:scale-125 transition"
        style={{
          top: PORT_Y, transform: "translate(-50%, -50%)",
          background: "#1a1920",
          borderColor: selected ? cat.accent : "#000",
        }}
      />
      <div
        onMouseDown={(e) => { e.stopPropagation(); onStartConnect(e); }}
        className="absolute right-0 w-3 h-3 rounded-full border-2 hover:scale-125 transition cursor-crosshair"
        style={{
          top: PORT_Y, transform: "translate(50%, -50%)",
          background: cat.color, borderColor: "#000",
        }}
        title="Drag to another node to connect"
      />
    </div>
  );
}

// Returns the primary metric to show on the node body
// ------------- TextBlock element (markdown-style canvas note) ---------------

export function TextBlockEl({ block, selected, onMouseDown, onSelect, onChange, onRemove }) {
  const editorRef = useRef(null);
  const [toolbar, setToolbar] = useState(null); // { x, y, kind } relative to block
  const [activeFormats, setActiveFormats] = useState({ b: false, i: false, u: false });
  const [editing, setEditing] = useState(false);

  // Sync HTML in on mount, when content changes externally, or when kind changes (remount)
  useEffect(() => {
    if (!editorRef.current) return;
    if (document.activeElement !== editorRef.current && editorRef.current.innerHTML !== block.html) {
      editorRef.current.innerHTML = block.html;
    }
  }, [block.html, block.kind]);

  // When entering edit mode, focus the editor and place caret at end
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.focus();
      // Place caret at end
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editing]);

  // Exit edit mode on ESC
  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setEditing(false);
        editorRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  // Deselection exits edit mode
  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  const pushHtml = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    if (html !== block.html) onChange({ html });
  };

  const updateActiveFormats = () => {
    try {
      setActiveFormats({
        b: document.queryCommandState("bold"),
        i: document.queryCommandState("italic"),
        u: document.queryCommandState("underline"),
      });
    } catch {}
  };

  const handleSelectionChange = () => {
    if (!editing) { setToolbar(null); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const parentRect = editorRef.current.getBoundingClientRect();
    setToolbar({
      x: rect.left - parentRect.left + rect.width / 2,
      y: rect.top - parentRect.top - 6,
    });
    updateActiveFormats();
  };

  useEffect(() => {
    const onSel = () => handleSelectionChange();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [editing]);

  const exec = (cmd) => {
    document.execCommand(cmd, false, null);
    pushHtml();
    updateActiveFormats();
    handleSelectionChange();
  };

  const changeKind = (newKind) => {
    onChange({ kind: newKind });
  };

  const onKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === "b" || e.key === "B") { e.preventDefault(); exec("bold"); }
    else if (e.key === "i" || e.key === "I") { e.preventDefault(); exec("italic"); }
    else if (e.key === "u" || e.key === "U") { e.preventDefault(); exec("underline"); }
  };

  const Tag = block.kind === "p" ? "p" : block.kind;

  return (
    <div
      onMouseDown={editing ? (e) => e.stopPropagation() : onMouseDown}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`absolute group rounded-md transition text-block-wrap text-block-inline ${selected ? "selected-block" : ""} ${editing ? "" : "cursor-grab active:cursor-grabbing"}`}
      style={{
        left: block.x, top: block.y, width: block.w,
        padding: "8px 10px",
        border: editing
          ? "1px solid rgba(255,90,0,0.7)"
          : (selected ? "1px solid rgba(255,90,0,0.5)" : "1px solid transparent"),
        background: editing
          ? "rgba(255,90,0,0.07)"
          : (selected ? "rgba(255,90,0,0.04)" : "transparent"),
      }}
    >
      {/* Kind switcher + remove — only when selected */}
      {selected && (
        <div
          className="absolute -top-7 left-0 flex items-center gap-0.5 rounded border text-[10px]"
          style={{
            background: "var(--bg-2)",
            borderColor: "var(--border-2)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { k: "h1", label: "H1" },
            { k: "h2", label: "H2" },
            { k: "h3", label: "H3" },
            { k: "p",  label: "P"  },
          ].map(o => (
            <button
              key={o.k}
              onClick={() => changeKind(o.k)}
              className={`px-2 py-1 uppercase tracking-wider transition ${block.kind === o.k ? "text-[color:var(--brand)]" : "text-zinc-500 hover:text-zinc-300"}`}
              style={block.kind === o.k ? { background: "rgba(255,90,0,0.1)" } : {}}
            >
              {o.label}
            </button>
          ))}
          <div className="w-px h-4 self-center" style={{ background: "var(--border-2)" }}/>
          <button
            onClick={() => setEditing(e => !e)}
            className={`px-2 py-1 uppercase tracking-wider transition ${editing ? "text-[color:var(--brand)]" : "text-zinc-500 hover:text-zinc-300"}`}
            title={editing ? "Exit edit (Esc)" : "Edit text (double-click)"}
            style={editing ? { background: "rgba(255,90,0,0.1)" } : {}}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <div className="w-px h-4 self-center" style={{ background: "var(--border-2)" }}/>
          <button
            onClick={onRemove}
            className="px-2 py-1 text-zinc-500 hover:text-red-400 transition"
            title="Delete"
          >
            <Trash2 size={10}/>
          </button>
        </div>
      )}

      {/* Hint shown when selected but not editing */}
      {selected && !editing && (
        <div
          className="absolute -bottom-6 left-0 text-[9px] uppercase tracking-[0.14em] text-zinc-600 pointer-events-none"
        >
          Double-click to edit
        </div>
      )}

      {/* Floating inline format toolbar (appears on text selection) */}
      {selected && editing && toolbar && (
        <div
          className="absolute flex items-center gap-0.5 rounded border text-[11px] z-20 pointer-events-auto"
          style={{
            left: toolbar.x, top: toolbar.y,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-3)",
            borderColor: "var(--border-2)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => exec("bold")}
            className={`px-2 py-1 font-bold transition ${activeFormats.b ? "text-[color:var(--brand)]" : "text-zinc-300 hover:text-white"}`}
            title="Bold (⌘B)"
          >B</button>
          <button
            onClick={() => exec("italic")}
            className={`px-2 py-1 italic transition ${activeFormats.i ? "text-[color:var(--brand)]" : "text-zinc-300 hover:text-white"}`}
            title="Italic (⌘I)"
          >I</button>
          <button
            onClick={() => exec("underline")}
            className={`px-2 py-1 underline transition ${activeFormats.u ? "text-[color:var(--brand)]" : "text-zinc-300 hover:text-white"}`}
            title="Underline (⌘U)"
          >U</button>
        </div>
      )}

      <Tag style={{ outline: "none" }}>
        <span
          key={block.kind}
          ref={editorRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onInput={pushHtml}
          onBlur={() => {
            pushHtml();
            setTimeout(() => setToolbar(null), 100);
          }}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            // When editing, let clicks through to place caret.
            // When not editing, swallow the click so it's handled by the wrapper
            // (which either selects or starts drag via onMouseDown prop).
            if (editing) e.stopPropagation();
          }}
          onClick={(e) => { if (editing) e.stopPropagation(); }}
          style={{
            display: "inline-block",
            minWidth: "20px",
            width: "100%",
            cursor: editing ? "text" : "inherit",
            userSelect: editing ? "text" : "none",
          }}
        />
      </Tag>
    </div>
  );
}


// ------------- Node headline helper -----------------------------------------

// ------------- Asset summary helper -----------------------------------------

// Returns an array like [{ kind, label, color, count }] sorted by count desc
export function getAssetSummary(node) {
  const assets = (node.data && node.data.assets) || [];
  if (assets.length === 0) return [];
  const counts = {};
  for (const a of assets) {
    const kind = a.kind || "other";
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([kind, count]) => ({
      kind,
      count,
      label: (ASSET_TYPES[kind] || ASSET_TYPES.other).label,
      color: (ASSET_TYPES[kind] || ASSET_TYPES.other).color,
    }))
    .sort((a, b) => b.count - a.count);
}

// ------------- Asset badges (visual summaries on nodes) --------------------

// Lab view — small colored dots in the node body, one per asset type present
export function AssetDots({ node }) {
  const summary = getAssetSummary(node);
  if (summary.length === 0) return null;
  const total = summary.reduce((s, r) => s + r.count, 0);
  const tooltip = summary.map(s => `${s.count} ${s.label.toLowerCase()}`).join(" · ");
  return (
    <div
      className="absolute bottom-1.5 right-2 flex items-center gap-0.5"
      title={tooltip}
    >
      {summary.slice(0, 4).map(s => (
        <div
          key={s.kind}
          className="rounded-full"
          style={{
            width: 6,
            height: 6,
            background: s.color,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
        />
      ))}
      <div className="font-mono-data text-[9px] text-zinc-500 ml-1 tabular-nums">{total}</div>
    </div>
  );
}

// Whiteboard view — clean pill below the node showing "N videos · M copy"
export function WhiteboardAssetPill({ node }) {
  const summary = getAssetSummary(node);
  if (summary.length === 0) return null;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full pointer-events-none"
      style={{
        bottom: -14,
        background: "#18181b",
        border: "1px solid #27272a",
        padding: "3px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {summary.slice(0, 3).map((s, i) => (
        <div key={s.kind} className="flex items-center gap-1">
          {i > 0 && <div className="w-px h-2.5" style={{ background: "#3f3f46" }}/>}
          <div
            className="rounded-full"
            style={{ width: 5, height: 5, background: s.color }}
          />
          <span
            className="font-mono-data text-[9px] uppercase tracking-wider tabular-nums"
            style={{ color: "#d4d4d8" }}
          >
            {s.count} {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ------------- Expanded inline assets panel (shown on double-click) --------

/**
 * Renders below a node card (Lab or Whiteboard variant), attached visually.
 * readonly = true → display only (whiteboard owner + client-share view)
 * readonly = false → inline-edit (lab owner view)
 * variant: "lab" | "whiteboard" — controls styling
 */
export function ExpandedAssets({ node, readonly, variant, onUpdateAssets, width }) {
  const assets = node.data.assets || [];

  const updateAsset = (id, patch) => {
    onUpdateAssets(assets.map(a => a.id === id ? { ...a, ...patch } : a));
  };
  const removeAsset = (id) => {
    onUpdateAssets(assets.filter(a => a.id !== id));
  };
  const addAsset = () => {
    const id = "a_" + Math.random().toString(36).slice(2, 7);
    onUpdateAssets([...assets, { id, kind: "video", name: "", description: "" }]);
  };

  const isWB = variant === "whiteboard";

  // Clean presentation styling for whiteboard/client mode
  if (isWB || readonly) {
    return (
      <div
        className="absolute left-0"
        style={{
          top: NODE_H + 22, // leaves space for the whiteboard asset pill
          width: width || NODE_W,
          background: isWB ? "#ffffff" : "#0d0c10",
          border: isWB ? "1px solid #e4e4e7" : "1px solid var(--border-1)",
          borderRadius: 8,
          padding: "12px 14px",
          boxShadow: isWB
            ? "0 4px 14px rgba(0,0,0,0.28)"
            : "0 4px 14px rgba(0,0,0,0.5)",
          zIndex: 5,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="text-[10px] uppercase tracking-[0.18em] mb-2"
          style={{ color: isWB ? "#71717a" : "#a1a1aa" }}
        >
          Creative scope {assets.length > 0 && `· ${assets.length}`}
        </div>
        {assets.length === 0 && (
          <div
            className="text-[11px] italic"
            style={{ color: isWB ? "#a1a1aa" : "#52525b" }}
          >
            No assets defined for this step.
          </div>
        )}
        <div className="space-y-2">
          {assets.map((a) => {
            const t = ASSET_TYPES[a.kind] || ASSET_TYPES.other;
            return (
              <div key={a.id} className="flex gap-2">
                <div
                  className="shrink-0 font-mono-data text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm h-fit"
                  style={{
                    background: t.color + "20",
                    color: t.color,
                    border: `1px solid ${t.color}40`,
                  }}
                >
                  {t.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[12px] font-medium leading-tight"
                    style={{
                      color: isWB ? "#18181b" : "#fafafa",
                      fontFamily: isWB ? "'Space Grotesk', sans-serif" : undefined,
                    }}
                  >
                    {a.name || <span style={{ color: isWB ? "#a1a1aa" : "#52525b" }}>(untitled)</span>}
                  </div>
                  {a.description && (
                    <div
                      className="text-[11px] leading-snug mt-0.5"
                      style={{ color: isWB ? "#52525b" : "#a1a1aa" }}
                    >
                      {a.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Lab view (editable)
  return (
    <div
      className="absolute left-0"
      style={{
        top: NODE_H + 4,
        width: width || NODE_W,
        background: "linear-gradient(180deg, #131116 0%, #0a090d 100%)",
        border: "1px solid var(--border-2)",
        borderRadius: 8,
        padding: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        zIndex: 5,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={11} style={{ color: "var(--brand-bright)" }}/>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            Assets {assets.length > 0 && <span className="text-zinc-600">· {assets.length}</span>}
          </div>
        </div>
        <button
          onClick={addAsset}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition"
          style={{ color: "var(--brand-bright)", background: "rgba(255,90,0,0.1)", border: "1px solid rgba(255,90,0,0.25)" }}
        >
          <Plus size={10}/> Add
        </button>
      </div>
      {assets.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic py-2">
          No creatives yet. Click Add.
        </div>
      )}
      <div className="space-y-1.5">
        {assets.map((a) => {
          const t = ASSET_TYPES[a.kind] || ASSET_TYPES.other;
          return (
            <div
              key={a.id}
              className="rounded p-1.5 group/row"
              style={{ background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-1)" }}
            >
              <div className="flex items-start gap-1.5">
                <select
                  value={a.kind}
                  onChange={(e) => updateAsset(a.id, { kind: e.target.value })}
                  className="bg-black border rounded px-1 py-0.5 text-[9px] font-mono-data uppercase tracking-wider focus:outline-none"
                  style={{
                    borderColor: t.color + "55",
                    color: t.color,
                    fontWeight: 600,
                  }}
                >
                  {Object.entries(ASSET_TYPES).map(([k, v]) => (
                    <option key={k} value={k} style={{ background: "#000", color: "#fff" }}>{v.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => updateAsset(a.id, { name: e.target.value })}
                  placeholder="Name"
                  className="flex-1 min-w-0 bg-black border rounded px-1.5 py-0.5 text-[11px] text-zinc-100 focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700"
                  style={{ borderColor: "var(--border-2)" }}
                />
                <button
                  onClick={() => removeAsset(a.id)}
                  className="p-0.5 text-zinc-700 hover:text-red-400 transition opacity-0 group-hover/row:opacity-100"
                  title="Remove"
                >
                  <X size={10}/>
                </button>
              </div>
              <input
                type="text"
                value={a.description}
                onChange={(e) => updateAsset(a.id, { description: e.target.value })}
                placeholder="Short description"
                className="mt-1 w-full bg-black border rounded px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700"
                style={{ borderColor: "var(--border-2)" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function getNodeHeadline(node, m) {
  if (node.category === "traffic") {
    return { label: "Clicks", value: fmt.int(m.clicks), sub: `${fmt.int(m.impressions)} impressions` };
  }
  if (node.category === "conversion") {
    if (node.type === "live_event") {
      return { label: "Conversions", value: fmt.int(m.conversions), sub: `${fmt.int(m.attendees)} attended · ${fmt.int(m.volumeIn)} registered` };
    }
    return { label: "Conversions", value: fmt.int(m.conversions), sub: `${fmt.pct(m.conversionRate)} rate · ${fmt.int(m.volumeIn)} in` };
  }
  if (node.category === "flow") {
    return { label: "Total", value: fmt.int(m.total || m.volumeIn), sub: "aggregated" };
  }
  if (node.category === "nurture") {
    if (m.closes !== undefined) {
      return { label: "Closes", value: fmt.int(m.closes), sub: `${fmt.int(m.shows)} shows from ${fmt.int(m.volumeIn)} booked` };
    }
    if (m.views !== undefined) {
      return { label: "Engaged", value: fmt.int(m.engaged), sub: `${fmt.int(m.views)} views · ${fmt.pct(m.viewRate)}` };
    }
    return { label: "Engaged", value: fmt.int(m.engaged), sub: `${fmt.pct(m.engagementRate)} of ${fmt.int(m.volumeIn)}` };
  }
  if (node.category === "offer") {
    const productCount = (node.data.products || []).length;
    const subBits = [
      `${fmt.int(m.buyers)} buyers`,
      `${fmt.money(m.price)}`,
    ];
    if (productCount > 0) subBits.push(`${productCount} product${productCount > 1 ? "s" : ""}`);
    return { label: "Revenue", value: fmt.money(m.revenue), sub: subBits.join(" · ") };
  }
  return { label: "—", value: "—" };
}

// ------------- Edges layer (with traffic particles) -------------------------

export function EdgesLayer({ nodes, edges, metrics, animating, summary, connecting, mousePos, onRemoveEdge, viewMode }) {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const isWB = viewMode === "whiteboard";

  // Compute max outgoing volume for normalization
  const maxVol = Math.max(
    1,
    ...edges.map(e => {
      const from = nodeById[e.from];
      if (!from) return 0;
      const fromM = metrics[from.id] || {};
      const splits = edges.filter(x => x.from === from.id).length || 1;
      return (fromM.volumeOut || 0) / splits;
    })
  );

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ width: "100%", height: "100%" }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {/* Arrowhead for lab mode (kept for any legacy refs) */}
        <marker id="arrow-ink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1410"/>
        </marker>
        {/* Arrowhead for whiteboard — brand orange, fits the dark dotted bg */}
        <marker id="arrow-wb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff7a2e"/>
        </marker>
        <marker id="arrow-brand" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff7a2e"/>
        </marker>
      </defs>

      {edges.map(e => {
        const from = nodeById[e.from];
        const to = nodeById[e.to];
        if (!from || !to) return null;
        const p1 = { x: from.x + NODE_W, y: from.y + PORT_Y };
        const p2 = { x: to.x,             y: to.y   + PORT_Y };
        const path = bezierPath(p1, p2);

        const fromM = metrics[from.id] || {};
        const splits = edges.filter(x => x.from === from.id).length || 1;
        const vol = (fromM.volumeOut || 0) / splits;
        const intensity = Math.min(1, vol / maxVol);
        const thickness = isWB ? (1.2 + intensity * 1.6) : (1 + intensity * 2.5);

        const fromCat = NODE_CATEGORIES[from.category];
        const color = isWB ? "#d4d4d8" : interpolateColor("#52525b", fromCat.color, intensity);

        // particle count proportional to volume
        const particleCount = Math.max(1, Math.round(1 + intensity * 6));

        return (
          <g key={e.id} className="pointer-events-auto">
            {isWB ? (
              <path
                d={path}
                stroke={color}
                strokeWidth={thickness}
                fill="none"
                strokeLinecap="round"
                markerEnd="url(#arrow-wb)"
                opacity={0.75}
              />
            ) : (
              <>
                <path d={path} stroke={color} strokeWidth={thickness} fill="none" opacity={0.55} />
                {animating && vol > 0 && (
                  <path d={path} stroke={color} strokeWidth={thickness} fill="none"
                        className="edge-flow" opacity={0.6} filter="url(#glow)" />
                )}
                {animating && vol > 0 && Array.from({ length: particleCount }).map((_, i) => (
                  <circle key={i} r={2 + intensity * 1.2} fill={fromCat.accent} filter="url(#glow)">
                    <animateMotion
                      path={path}
                      dur={`${1.6 + (1 - intensity) * 2.5}s`}
                      begin={`${(i / particleCount) * (1.6 + (1 - intensity) * 2.5)}s`}
                      repeatCount="indefinite"
                    />
                    <animate attributeName="opacity" values="0;1;1;0" dur={`${1.6 + (1 - intensity) * 2.5}s`} repeatCount="indefinite"/>
                  </circle>
                ))}
              </>
            )}
            {/* Invisible wider hit target for click-delete */}
            <path d={path} stroke="transparent" strokeWidth={16} fill="none"
                  style={{ cursor: "pointer" }}
                  onClick={() => onRemoveEdge(e.id)}>
              <title>Click to remove</title>
            </path>
            {/* Volume label at midpoint */}
            {vol > 0 && !isWB && (
              <g>
                <text
                  x={(p1.x + p2.x) / 2}
                  y={(p1.y + p2.y) / 2 - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fill={fromCat.accent}
                  opacity="0.85"
                >
                  {fmt.int(vol)}
                </text>
              </g>
            )}
            {vol > 0 && isWB && (
              <g>
                <text
                  x={(p1.x + p2.x) / 2}
                  y={(p1.y + p2.y) / 2 - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="500"
                  fill="#a1a1aa"
                >
                  {fmt.int(vol)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Connecting preview line */}
      {connecting && (() => {
        const from = nodeById[connecting.fromId];
        if (!from) return null;
        const p1 = { x: from.x + NODE_W, y: from.y + PORT_Y };
        const p2 = mousePos;
        const path = bezierPath(p1, p2);
        return <path d={path} stroke="#ff5a00" strokeWidth={1.5} fill="none" strokeDasharray="4 4"/>;
      })()}
    </svg>
  );
}

export function bezierPath(p1, p2) {
  const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.5);
  return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
}

function interpolateColor(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16),
  };
}

// ------------- Right panel: metrics breakdown -------------------------------

function MetricsPanel({ nodes, metrics, summary, selectedNode, onUpdateField, onToggleOverride, onRemoveNode }) {
  return (
    <div className="p-4">
      {/* Headline */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Funnel result</div>
        <div className="rounded-lg border p-5 relative overflow-hidden"
             style={{
               borderColor: summary.profit >= 0 ? "rgba(255,90,0,0.35)" : "rgba(239,68,68,0.3)",
               background: summary.profit >= 0
                 ? "radial-gradient(ellipse at top right, rgba(255,90,0,0.10), transparent 60%), linear-gradient(180deg, #0f0d11 0%, #08070a 100%)"
                 : "radial-gradient(ellipse at top right, rgba(239,68,68,0.08), transparent 60%), linear-gradient(180deg, #0f0d11 0%, #08070a 100%)",
             }}>
          {/* decorative corner ticks */}
          <div className="absolute top-2 left-2 w-2 h-2 border-l border-t" style={{ borderColor: "var(--brand)" }}/>
          <div className="absolute top-2 right-2 w-2 h-2 border-r border-t" style={{ borderColor: "var(--brand)" }}/>
          <div className="absolute bottom-2 left-2 w-2 h-2 border-l border-b" style={{ borderColor: "var(--brand)" }}/>
          <div className="absolute bottom-2 right-2 w-2 h-2 border-r border-b" style={{ borderColor: "var(--brand)" }}/>

          <div className="flex items-center justify-between mb-2 relative">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: "var(--brand)" }}/>
              <div className="text-[10px] text-zinc-500 uppercase tracking-[0.22em]">Net Profit</div>
            </div>
            <div className={`font-mono-data tabular-nums text-[10px] px-2 py-0.5 rounded ${summary.profit >= 0 ? "bg-[rgba(255,90,0,0.12)] text-[color:var(--brand-bright)] border border-[rgba(255,90,0,0.25)]" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
              ROAS · {fmt.x(summary.roas)}
            </div>
          </div>
          <div
            className={`font-display text-[44px] leading-none tabular-nums ${summary.profit >= 0 ? "profit-glow" : ""}`}
            style={{
              color: summary.profit >= 0 ? "var(--brand-bright)" : "#fca5a5",
              fontWeight: 600,
            }}
          >
            {fmt.money(summary.profit)}
          </div>
          <div className="mt-4 pt-3 border-t border-zinc-800/60 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <StatRow label="Ad Spend"    value={fmt.money(summary.totalSpend)}/>
            <StatRow label="Revenue"     value={fmt.money(summary.totalRevenue)}/>
            <StatRow label="Leads"       value={fmt.int(summary.totalLeads)}/>
            <StatRow label="Buyers"      value={fmt.int(summary.totalBuyers)}/>
            <StatRow label="CPL"         value={fmt.money2(summary.cpl)}/>
            <StatRow label="CAC"         value={fmt.money2(summary.cac)}/>
            <StatRow label="AOV"         value={fmt.money2(summary.aov)} span/>
          </div>
        </div>
      </div>

      {/* Selected node editor */}
      {selectedNode ? (
        <NodeEditor
          node={selectedNode}
          metrics={metrics[selectedNode.id] || {}}
          onUpdateField={onUpdateField}
          onToggleOverride={onToggleOverride}
          onRemoveNode={onRemoveNode}
        />
      ) : (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Selected node</div>
          <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center">
            <div className="text-sm text-zinc-500">Click any node on the canvas to edit its metrics.</div>
          </div>
        </div>
      )}

      {/* Per-stage breakdown */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">Per-stage breakdown</div>
        <div className="space-y-1">
          {nodes.map(n => {
            const cat = NODE_CATEGORIES[n.category];
            const typeDef = cat.types[n.type];
            const m = metrics[n.id] || {};
            const headline = getNodeHeadline(n, m);
            return (
              <div key={n.id} className="flex items-center gap-3 px-2.5 py-2 rounded-md transition"
                   style={{ background: "rgba(255,255,255,0.02)" }}
                   onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                   onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
                <div className="w-1 h-8 rounded-full" style={{ background: cat.color }}/>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    {cat.label}
                    {n.data.campaignCode && (
                      <span className="font-mono-data px-1 py-[1px] rounded-sm tracking-[0.14em]"
                            style={{ background: `${cat.color}22`, color: cat.accent, fontSize: "9px" }}>
                        {n.data.campaignCode}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-300 truncate">{typeDef.label}</div>
                </div>
                <div className="text-right font-mono-data">
                  <div className="text-[10px] text-zinc-500 uppercase">{headline.label}</div>
                  <div className="text-xs text-white tabular-nums">{headline.value}</div>
                </div>
              </div>
            );
          })}
          {nodes.length === 0 && (
            <div className="text-xs text-zinc-600 italic p-3">No nodes yet. Drag elements from the palette to start.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, span }) {
  return (
    <div className={`flex items-center justify-between ${span ? "col-span-2" : ""}`}>
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono-data text-zinc-200 tabular-nums">{value}</span>
    </div>
  );
}

// ------------- Node editor --------------------------------------------------

function NodeEditor({ node, metrics, onUpdateField, onToggleOverride, onRemoveNode }) {
  const cat = NODE_CATEGORIES[node.category];
  const typeDef = cat.types[node.type];
  const fields = fieldDefs(node);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: cat.accent }}>
          {cat.label} · {typeDef.label}
        </div>
        <button onClick={() => onRemoveNode(node.id)} className="text-zinc-600 hover:text-red-400 text-[11px] flex items-center gap-1">
          <Trash2 size={11}/> remove
        </button>
      </div>

      <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-1)", background: "var(--bg-2)" }}>
        <label className="block mb-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Campaign code <span className="text-zinc-700 normal-case tracking-normal">— optional</span></div>
          <input
            type="text"
            value={node.data.campaignCode || ""}
            onChange={(e) => onUpdateField(node.id, "campaignCode", e.target.value || null)}
            placeholder="e.g. Launch 1.0 · LP-A · Q2-UPSELL"
            className="w-full font-mono-data bg-black border rounded px-2 py-1.5 text-[12px] uppercase tracking-[0.14em] text-white focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700 placeholder:normal-case placeholder:tracking-normal"
            style={{ borderColor: "var(--border-2)" }}
          />
        </label>

        <div className="space-y-2">
          {fields.map(f => {
            const isOverride = !!node.overrides[f.key];
            const editable = f.driver || isOverride;
            const currentVal = editable ? (node.data[f.key] ?? metrics[f.key] ?? 0) : metrics[f.key];
            return (
              <div key={f.key} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5 flex items-center gap-1.5">
                    {f.label}
                    {!f.driver && <span className="px-1 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[9px] normal-case tracking-normal">computed</span>}
                  </div>
                  {editable ? (
                    <NumericInput
                      kind={f.kind}
                      value={currentVal}
                      onChange={(v) => onUpdateField(node.id, f.key, v)}
                    />
                  ) : (
                    <div className="font-mono-data text-sm text-zinc-300 tabular-nums h-[30px] flex items-center">
                      {formatValue(f.kind, metrics[f.key])}
                    </div>
                  )}
                </div>
                {!f.driver && (
                  <button
                    onClick={() => onToggleOverride(node.id, f.key)}
                    className={`p-1 rounded transition ${isOverride ? "text-amber-400 bg-amber-500/10" : "text-zinc-600 hover:text-zinc-300"}`}
                    title={isOverride ? "Locked — computed" : "Override this value"}
                  >
                    {isOverride ? <Unlock size={12}/> : <Lock size={12}/>}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Products editor — only for offer nodes */}
        {node.category === "offer" && (
          <ProductsEditor
            node={node}
            metrics={metrics}
            onUpdateField={onUpdateField}
          />
        )}

        {/* Assets editor — available for every node */}
        <AssetsEditor
          node={node}
          onUpdateField={onUpdateField}
        />

        {/* Live downstream info */}
        <div className="mt-3 pt-3 border-t border-zinc-800/70">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Live flow</div>
          <div className="flex items-center justify-between text-[11px] font-mono-data">
            <div>
              <div className="text-zinc-600">IN</div>
              <div className="text-zinc-200 tabular-nums">{fmt.int(metrics.volumeIn || 0)}</div>
            </div>
            <div className="flex-1 mx-3 h-px bg-gradient-to-r from-zinc-700 to-zinc-700/30"/>
            <div className="text-right">
              <div className="text-zinc-600">OUT</div>
              <div className="tabular-nums" style={{ color: cat.accent }}>{fmt.int(metrics.volumeOut || 0)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------- Assets editor (any node) -------------------------------------

function AssetsEditor({ node, onUpdateField }) {
  const assets = (node.data.assets || []);

  const updateAssets = (next) => onUpdateField(node.id, "assets", next);

  const addAsset = () => {
    const id = "a_" + Math.random().toString(36).slice(2, 7);
    updateAssets([...assets, { id, kind: "video", name: "", description: "" }]);
  };

  const updateAsset = (id, patch) => {
    updateAssets(assets.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  const removeAsset = (id) => {
    updateAssets(assets.filter(a => a.id !== id));
  };

  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border-1)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={11} style={{ color: "var(--brand-bright)" }}/>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            Assets to produce {assets.length > 0 && <span className="text-zinc-600">· {assets.length}</span>}
          </div>
        </div>
        <button
          onClick={addAsset}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition"
          style={{ color: "var(--brand-bright)", background: "rgba(255,90,0,0.1)", border: "1px solid rgba(255,90,0,0.25)" }}
        >
          <Plus size={10}/> Add
        </button>
      </div>

      {assets.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic py-2">
          No creatives defined. Add the videos, copy and design you need to produce for this step.
        </div>
      )}

      {assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((a) => {
            const t = ASSET_TYPES[a.kind] || ASSET_TYPES.other;
            return (
              <div key={a.id} className="rounded border p-2 group/row"
                   style={{ borderColor: "var(--border-2)", background: "rgba(0,0,0,0.35)" }}>
                <div className="flex items-start gap-2">
                  {/* Type selector */}
                  <select
                    value={a.kind}
                    onChange={(e) => updateAsset(a.id, { kind: e.target.value })}
                    className="bg-black border rounded px-1.5 py-1 text-[10px] font-mono-data uppercase tracking-wider focus:outline-none"
                    style={{
                      borderColor: t.color + "55",
                      color: t.color,
                      fontWeight: 600,
                    }}
                  >
                    {Object.entries(ASSET_TYPES).map(([k, v]) => (
                      <option key={k} value={k} style={{ background: "#000", color: "#fff" }}>{v.label}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={a.name}
                    onChange={(e) => updateAsset(a.id, { name: e.target.value })}
                    placeholder="e.g. Event highlight video"
                    className="flex-1 min-w-0 bg-black border rounded px-2 py-1 text-[12px] text-zinc-100 focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700"
                    style={{ borderColor: "var(--border-2)" }}
                  />

                  <button
                    onClick={() => removeAsset(a.id)}
                    className="p-1 text-zinc-700 hover:text-red-400 transition opacity-0 group-hover/row:opacity-100"
                    title="Remove"
                  >
                    <X size={11}/>
                  </button>
                </div>

                <textarea
                  value={a.description}
                  onChange={(e) => updateAsset(a.id, { description: e.target.value })}
                  placeholder="Short description — angle, length, remarks…"
                  rows={2}
                  className="mt-1.5 w-full bg-black border rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700 resize-none"
                  style={{ borderColor: "var(--border-2)" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------- Numeric input -------------------------------------------------

function NumericInput({ kind, value, onChange }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => { setLocal(String(value ?? 0)); }, [value]);
  const suffix = kind === "pct" ? "%" : null;
  const prefix = (kind === "money" || kind === "money2") ? "$" : null;
  return (
    <div className="flex items-center bg-black border rounded focus-within:border-[color:var(--brand)] h-[30px] overflow-hidden"
         style={{ borderColor: "var(--border-2)" }}>
      {prefix && <span className="text-zinc-600 text-xs pl-2">{prefix}</span>}
      <input
        type="number"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const n = parseFloat(e.target.value);
          if (isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          const n = parseFloat(local);
          if (!isFinite(n)) setLocal("0");
        }}
        className="w-full bg-transparent font-mono-data text-sm text-zinc-100 px-2 py-1 focus:outline-none tabular-nums"
      />
      {suffix && <span className="text-zinc-600 text-xs pr-2">{suffix}</span>}
    </div>
  );
}

// ------------- Products editor (offer-only) ---------------------------------

function ProductsEditor({ node, metrics, onUpdateField }) {
  const products = node.data.products || [];
  const useBundle = !!node.data.useBundle;
  const productsSum = metrics.productsSum || 0;
  const effectivePrice = metrics.price || 0;
  const discount = metrics.bundleDiscount || 0;

  const updateProducts = (next) => onUpdateField(node.id, "products", next);

  const addProduct = () => {
    const id = "p_" + Math.random().toString(36).slice(2, 7);
    updateProducts([...products, { id, name: "New product", price: 0 }]);
  };

  const updateProduct = (id, patch) => {
    updateProducts(products.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const removeProduct = (id) => {
    updateProducts(products.filter(p => p.id !== id));
  };

  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border-1)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={11} style={{ color: "var(--brand-bright)" }}/>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            Products in offer <span className="text-zinc-600">{products.length > 0 ? `· ${products.length}` : ""}</span>
          </div>
        </div>
        <button
          onClick={addProduct}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition"
          style={{ color: "var(--brand-bright)", background: "rgba(255,90,0,0.1)", border: "1px solid rgba(255,90,0,0.25)" }}
        >
          <Plus size={10}/> Add
        </button>
      </div>

      {products.length === 0 && (
        <div className="text-[11px] text-zinc-600 italic py-2">
          Single-item offer. Add products to model a bundle.
        </div>
      )}

      {products.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {products.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-1.5 group/row">
              <div className="font-mono-data text-[9px] text-zinc-600 w-4 text-right">{idx + 1}</div>
              <input
                type="text"
                value={p.name}
                onChange={(e) => updateProduct(p.id, { name: e.target.value })}
                placeholder="Product name"
                className="flex-1 min-w-0 bg-black border rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-[color:var(--brand)] placeholder:text-zinc-700"
                style={{ borderColor: "var(--border-2)" }}
              />
              <div className="flex items-center bg-black border rounded overflow-hidden h-[26px]"
                   style={{ borderColor: "var(--border-2)" }}>
                <span className="text-zinc-600 text-[10px] pl-1.5">$</span>
                <input
                  type="number"
                  value={p.price}
                  onChange={(e) => updateProduct(p.id, { price: parseFloat(e.target.value) || 0 })}
                  className="w-[64px] bg-transparent font-mono-data text-[11px] text-zinc-200 px-1 focus:outline-none tabular-nums"
                />
              </div>
              <button
                onClick={() => removeProduct(p.id)}
                className="p-1 text-zinc-700 hover:text-red-400 transition opacity-0 group-hover/row:opacity-100"
                title="Remove"
              >
                <X size={10}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pricing mode + totals */}
      {products.length > 0 && (
        <div className="mt-3 rounded border p-2.5" style={{ borderColor: "var(--border-1)", background: "rgba(0,0,0,0.35)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pricing mode</div>
            <div className="flex items-center rounded overflow-hidden border" style={{ borderColor: "var(--border-2)" }}>
              <button
                onClick={() => onUpdateField(node.id, "useBundle", false)}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wider transition ${!useBundle ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                style={!useBundle ? { background: "rgba(255,90,0,0.15)", color: "var(--brand-bright)" } : {}}
              >
                Sum
              </button>
              <button
                onClick={() => onUpdateField(node.id, "useBundle", true)}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wider transition border-l ${useBundle ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                style={{
                  borderColor: "var(--border-2)",
                  ...(useBundle ? { background: "rgba(255,90,0,0.15)", color: "var(--brand-bright)" } : {})
                }}
              >
                Bundle
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono-data mb-1">
            <span className="text-zinc-500">Sum of products</span>
            <span className="text-zinc-300 tabular-nums">{fmt.money(productsSum)}</span>
          </div>

          {useBundle && (
            <>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 whitespace-nowrap">Bundle price</label>
                <div className="flex items-center bg-black border rounded overflow-hidden h-[26px] flex-1" style={{ borderColor: "var(--border-2)" }}>
                  <span className="text-zinc-600 text-[10px] pl-1.5">$</span>
                  <input
                    type="number"
                    value={node.data.price ?? 0}
                    onChange={(e) => onUpdateField(node.id, "price", parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent font-mono-data text-[11px] text-zinc-200 px-1 focus:outline-none tabular-nums"
                  />
                </div>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-[10px] font-mono-data mt-1.5">
                  <span className="text-zinc-500 uppercase tracking-wider">Implied discount</span>
                  <span className="tabular-nums" style={{ color: "var(--brand-bright)" }}>
                    −{discount.toFixed(1)}% · save {fmt.money(productsSum - (node.data.price || 0))}
                  </span>
                </div>
              )}
              {discount < 0 && (
                <div className="flex items-center justify-between text-[10px] font-mono-data mt-1.5">
                  <span className="text-zinc-500 uppercase tracking-wider">Premium over sum</span>
                  <span className="text-amber-400 tabular-nums">+{Math.abs(discount).toFixed(1)}%</span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between text-[12px] font-mono-data mt-2 pt-2 border-t" style={{ borderColor: "var(--border-1)" }}>
            <span className="text-zinc-400 uppercase tracking-wider text-[10px]">Effective price</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--brand-bright)" }}>{fmt.money(effectivePrice)}</span>
          </div>
        </div>
      )}

      {/* Single-item price field when no products */}
      {products.length === 0 && (
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 whitespace-nowrap w-[60px]">Price</label>
          <div className="flex items-center bg-black border rounded overflow-hidden h-[30px] flex-1" style={{ borderColor: "var(--border-2)" }}>
            <span className="text-zinc-600 text-xs pl-2">$</span>
            <input
              type="number"
              value={node.data.price ?? 0}
              onChange={(e) => onUpdateField(node.id, "price", parseFloat(e.target.value) || 0)}
              className="w-full bg-transparent font-mono-data text-sm text-zinc-200 px-2 focus:outline-none tabular-nums"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------- Scenarios panel ----------------------------------------------

function ScenariosPanel({ scenarios, activeId, compareIds, onLoad, onDelete, onToggleCompare, onOverwrite, onSaveAs, currentSummary, onPublish, onUnpublish, onRename }) {
  const [copiedId, setCopiedId] = useState(null);

  const handleShare = async (sc) => {
    let scenario = sc;
    if (!scenario.slug) {
      const result = await onPublish(scenario.id);
      if (!result) return;
      scenario = result;
    }
    const url = `${window.location.origin}/s/${scenario.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(scenario.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt('Copy this share link:', url);
    }
  };

  const handleRename = (sc) => {
    const newName = window.prompt('Rename scenario:', sc.name);
    if (newName && newName.trim() && newName.trim() !== sc.name) {
      onRename(sc.id, newName.trim());
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Saved scenarios</div>
        <button onClick={onSaveAs} className="text-[11px] flex items-center gap-1 transition"
                style={{ color: "var(--brand-bright)" }}>
          <Plus size={11}/> new
        </button>
      </div>

      {scenarios.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: "var(--border-2)" }}>
          <div className="text-sm text-zinc-500 mb-1">No scenarios saved yet.</div>
          <div className="text-xs text-zinc-600">Save your current funnel to compare configurations or share with clients.</div>
        </div>
      )}

      <div className="space-y-2">
        {scenarios.map(sc => {
          const r = computeFunnel(sc.nodes, sc.edges);
          const isActive = activeId === sc.id;
          const isCompared = compareIds.includes(sc.id);
          const isShared = !!sc.slug;
          const isCopied = copiedId === sc.id;
          return (
            <div key={sc.id}
                 className="rounded-lg border p-3 transition"
                 style={{
                   borderColor: isActive ? "rgba(255,90,0,0.4)" : "var(--border-1)",
                   background: isActive ? "rgba(255,90,0,0.05)" : "rgba(255,255,255,0.02)",
                 }}>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="text-sm text-white truncate cursor-text"
                      onDoubleClick={() => handleRename(sc)}
                      title="Double-click to rename"
                    >
                      {sc.name}
                    </div>
                    {isShared && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] font-mono-data uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{
                          background: "rgba(255,90,0,0.12)",
                          color: "var(--brand-bright)",
                          border: "1px solid rgba(255,90,0,0.25)",
                        }}
                        title="Published publicly via share link"
                      >
                        <Link2 size={8}/> Live
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono-data">{new Date(sc.updatedAt).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => onToggleCompare(sc.id)}
                          className={`p-1 rounded ${isCompared ? "bg-amber-500/20 text-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}
                          title="Add to compare">
                    <Activity size={12}/>
                  </button>
                  <button onClick={() => onOverwrite(sc.id)}
                          className="p-1 text-zinc-500 hover:text-zinc-300" title="Save current over this scenario">
                    <Copy size={12}/>
                  </button>
                  <button onClick={() => onDelete(sc.id)}
                          className="p-1 text-zinc-500 hover:text-red-400" title="Delete">
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px] font-mono-data">
                <MiniStat label="SPEND" value={fmt.money(r.summary.totalSpend)}/>
                <MiniStat label="REV"   value={fmt.money(r.summary.totalRevenue)}/>
                <MiniStat label="ROAS"  value={fmt.x(r.summary.roas)}/>
                <MiniStat label="PROFIT" value={fmt.money(r.summary.profit)} tone={r.summary.profit >= 0 ? "brand" : "neg"}/>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onLoad(sc.id)}
                  className="flex-1 text-[11px] py-1 rounded transition"
                  style={{
                    background: isActive ? "rgba(255,90,0,0.15)" : "rgba(255,255,255,0.04)",
                    color: isActive ? "var(--brand-bright)" : "#d4d4d8",
                  }}
                >
                  {isActive ? "Loaded" : "Load"}
                </button>
                <button
                  onClick={() => handleShare(sc)}
                  className="flex items-center justify-center gap-1 px-3 text-[11px] py-1 rounded transition"
                  style={{
                    background: isShared ? "rgba(255,90,0,0.12)" : "rgba(255,255,255,0.04)",
                    color: isShared ? "var(--brand-bright)" : "#d4d4d8",
                    border: isShared ? "1px solid rgba(255,90,0,0.25)" : "1px solid transparent",
                  }}
                  title={isShared ? "Copy public link" : "Publish & copy public link"}
                >
                  {isCopied ? <><Check size={11}/> Copied</> : <><Share2 size={11}/> {isShared ? "Copy link" : "Share"}</>}
                </button>
                {isShared && (
                  <button
                    onClick={() => { if (confirm('Unpublish this scenario? The public link will stop working.')) onUnpublish(sc.id); }}
                    className="px-2 text-[11px] py-1 rounded text-zinc-500 hover:text-red-400 transition"
                    title="Unpublish"
                  >
                    <X size={11}/>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }) {
  const tones = {
    brand: "text-[color:var(--brand-bright)]",
    pos: "text-emerald-400",
    neg: "text-red-400",
    neutral: "text-zinc-200",
  };
  return (
    <div>
      <div className="text-zinc-600 uppercase tracking-wider text-[9px]">{label}</div>
      <div className={`tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

// ------------- Compare panel -------------------------------------------------

function ComparePanel({ comparisonSummaries, currentSummary }) {
  const all = [
    { id: "current", name: "Current (unsaved)", ...currentSummary, isCurrent: true },
    ...comparisonSummaries,
  ];

  if (comparisonSummaries.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center">
          <Activity size={20} className="text-zinc-600 mx-auto mb-2"/>
          <div className="text-sm text-zinc-400 mb-1">Nothing to compare yet</div>
          <div className="text-xs text-zinc-600">Pick up to 4 saved scenarios from the Scenarios tab by clicking the activity icon.</div>
        </div>
      </div>
    );
  }

  const keys = [
    { key: "totalSpend",   label: "Ad Spend",    fmt: fmt.money },
    { key: "totalLeads",   label: "Leads",       fmt: fmt.int },
    { key: "cpl",          label: "CPL",         fmt: fmt.money2 },
    { key: "totalBuyers",  label: "Buyers",      fmt: fmt.int },
    { key: "cac",          label: "CAC",         fmt: fmt.money2 },
    { key: "aov",          label: "AOV",         fmt: fmt.money2 },
    { key: "totalRevenue", label: "Revenue",     fmt: fmt.money },
    { key: "roas",         label: "ROAS",        fmt: fmt.x },
    { key: "profit",       label: "Profit",      fmt: fmt.money, accent: true },
  ];

  // Find best per row (higher is better except spend/cpl/cac)
  const isLowerBetter = (k) => ["totalSpend", "cpl", "cac"].includes(k);
  const bestPerRow = Object.fromEntries(keys.map(k => {
    const vals = all.map(a => a[k.key]).filter(v => isFinite(v));
    if (vals.length === 0) return [k.key, null];
    const best = isLowerBetter(k.key) ? Math.min(...vals) : Math.max(...vals);
    return [k.key, best];
  }));

  return (
    <div className="p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-3">Side-by-side</div>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `140px repeat(${all.length}, 1fr)` }}>
          <div className="bg-zinc-900 px-2.5 py-2 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">Metric</div>
          {all.map(s => (
            <div key={s.id} className={`bg-zinc-900 px-2.5 py-2 text-[11px] border-b border-zinc-800 border-l border-zinc-800 truncate ${s.isCurrent ? "text-emerald-400" : "text-zinc-200"}`}>
              {s.name}
            </div>
          ))}
          {keys.map(k => (
            <React.Fragment key={k.key}>
              <div className="px-2.5 py-2 text-[11px] text-zinc-400 border-b border-zinc-800/60 bg-zinc-950/50">
                {k.label}
              </div>
              {all.map(s => {
                const v = s[k.key];
                const isBest = v === bestPerRow[k.key] && all.length > 1;
                return (
                  <div key={s.id} className={`px-2.5 py-2 text-[11px] font-mono-data tabular-nums border-b border-zinc-800/60 border-l border-zinc-800/60 ${k.accent ? "font-semibold" : ""} ${isBest ? "text-emerald-300 bg-emerald-500/5" : "text-zinc-300"}`}>
                    {k.fmt(v)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 text-[10px] text-zinc-600">Green cells mark the best value in each row.</div>
    </div>
  );
}
