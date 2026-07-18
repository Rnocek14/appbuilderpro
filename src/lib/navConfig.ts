// src/lib/navConfig.ts
// ONE source of truth for the app's primary destinations. The sidebar (AppShell) renders these, and
// the ⌘K command palette generates its "go to" commands from the SAME list — so the two can never
// drift (the palette used to miss half the sidebar and over-index legacy rooms). Add a destination
// here and it shows up in both places at once.

import type { LucideIcon } from 'lucide-react';
import {
  Sparkles, Compass, KeyRound, MessageSquare, Waypoints, Rocket, Zap, Receipt,
  CircleDollarSign, Users, BrainCircuit, Telescope, LayoutGrid, Plus, FolderDown, Bot, Globe,
  CreditCard, Settings, Activity,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon }
export interface NavSection { title: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operate',
    items: [
      { to: '/garvis/command', label: 'Command', icon: Sparkles },
      { to: '/garvis/home', label: 'Canvas', icon: Compass },
      { to: '/garvis/setup', label: 'Setup', icon: KeyRound },
      { to: '/garvis/queue', label: 'Queue', icon: MessageSquare },
      { to: '/garvis/webs', label: 'Businesses', icon: Waypoints },
      { to: '/garvis/clients', label: 'Win clients', icon: Rocket },
      { to: '/garvis/automations', label: 'Automations', icon: Zap },
      { to: '/garvis/working', label: 'Working for you', icon: Activity },
      // Renamed from "Client billing" so it stops colliding with "Money" and account "Billing":
      // three money doors, now three distinct names — agency MRR vs personal invoices vs the app's own bill.
      { to: '/garvis/client-billing', label: 'Client revenue', icon: Receipt },
      { to: '/garvis/money', label: 'Money', icon: CircleDollarSign },
      { to: '/garvis/contacts', label: 'Contacts', icon: Users },
      { to: '/garvis/memory', label: 'Memory', icon: BrainCircuit },
      { to: '/garvis/universe', label: 'Galaxy', icon: Telescope },
    ],
  },
  {
    title: 'Apps',
    items: [
      { to: '/dashboard', label: 'Projects', icon: LayoutGrid },
      { to: '/new', label: 'New app', icon: Plus },
      { to: '/import', label: 'Import', icon: FolderDown },
      { to: '/autopilot', label: 'Autopilot', icon: Bot },
      { to: '/business-preview-engine', label: 'Preview Engine', icon: Globe },
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
