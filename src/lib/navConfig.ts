// src/lib/navConfig.ts
// ONE source of truth for the app's primary destinations. The sidebar (AppShell) renders these, and
// the ⌘K command palette generates its "go to" commands from the SAME list — so the two can never
// drift (the palette used to miss half the sidebar and over-index legacy rooms). Add a destination
// here and it shows up in both places at once.

import type { LucideIcon } from 'lucide-react';
import {
  Sparkles, Compass, KeyRound, MessageSquare, Waypoints, Rocket, Zap, Receipt,
  CircleDollarSign, Users, BrainCircuit, Telescope, LayoutGrid, Plus, FolderDown, Bot, Globe,
  CreditCard, Settings, Activity, Wand2, Crosshair, BookUser,
  Hammer, PhoneMissed, Target, Film, HeartPulse, CalendarClock,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon }
export interface NavSection { title: string; items: NavItem[] }

// ONE list, but the FIRST section is the daily selling loop — Prospects → Queue (build & send) →
// Clients — and it's the only one the sidebar shows by default. Everything else lives under "More"
// (AppShell renders section[0] always, the rest behind a disclosure) and stays fully ⌘K-searchable.
// The whole "app feels too big" fix is here: regroup, don't delete. Nothing lost a route.
export const NAV_SECTIONS: NavSection[] = [
  {
    // THE CORE LOOP — what you touch every day. Keep this to ~4 items.
    title: 'Core',
    items: [
      { to: '/garvis/command', label: 'Home', icon: Sparkles },
      // The swift-prep screen: the prospect list + one-click Build & send (and the Claude scrape).
      { to: '/garvis/leads', label: 'Prospects', icon: Target },
      { to: '/garvis/queue', label: 'Queue', icon: MessageSquare },
      { to: '/garvis/client-book', label: 'Clients', icon: BookUser },
    ],
  },
  {
    title: 'Prospecting',
    items: [
      // The richer hunt/config front door (set up ongoing hunts, verticals, territory).
      { to: '/garvis/clients', label: 'Win clients', icon: Rocket },
      // Where the opportunity hunts' catches land (jobs/RFPs/grants/commissions) for triage.
      { to: '/garvis/opportunity-feed', label: 'Opportunities', icon: Crosshair },
      { to: '/business-preview-engine', label: 'Preview Engine', icon: Globe },
    ],
  },
  {
    title: 'Build',
    items: [
      // Focused, outcome-shaped rooms over every business capability — the "make something" door.
      { to: '/garvis/workshops', label: 'Workshops', icon: Hammer },
      // The whole-intent front door: one sentence → a compiled, reviewable plan over everything.
      { to: '/garvis/orchestrate', label: 'Orchestrate', icon: Wand2 },
      { to: '/garvis/home', label: 'Canvas', icon: Compass },
      { to: '/garvis/webs', label: 'Businesses', icon: Waypoints },
      { to: '/garvis/scenes', label: 'Scenes', icon: Film },
    ],
  },
  {
    title: 'Money',
    items: [
      // Renamed from "Client billing" so it stops colliding with "Money" and account "Billing":
      // three money doors, three distinct names — agency MRR vs personal invoices vs the app's own bill.
      { to: '/garvis/client-billing', label: 'Client revenue', icon: Receipt },
      { to: '/garvis/money', label: 'Money', icon: CircleDollarSign },
    ],
  },
  {
    title: 'Automation & status',
    items: [
      { to: '/garvis/automations', label: 'Automations', icon: Zap },
      { to: '/garvis/booking', label: 'Online booking', icon: CalendarClock },
      { to: '/garvis/missed-call', label: 'Missed-call text-back', icon: PhoneMissed },
      { to: '/garvis/working', label: 'Working for you', icon: Activity },
      { to: '/garvis/setup', label: 'Setup', icon: KeyRound },
      { to: '/garvis/health', label: 'Health', icon: HeartPulse },
    ],
  },
  {
    title: 'Knowledge',
    items: [
      { to: '/garvis/memory', label: 'Memory', icon: BrainCircuit },
      { to: '/garvis/universe', label: 'Galaxy', icon: Telescope },
      { to: '/garvis/contacts', label: 'Contacts', icon: Users },
    ],
  },
  {
    title: 'Apps',
    items: [
      { to: '/dashboard', label: 'Projects', icon: LayoutGrid },
      { to: '/new', label: 'New app', icon: Plus },
      { to: '/import', label: 'Import', icon: FolderDown },
      { to: '/autopilot', label: 'Autopilot', icon: Bot },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/billing', label: 'Subscription', icon: CreditCard },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
