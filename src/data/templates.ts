import type { Template } from '../types';

export const TEMPLATES: Template[] = [
  {
    slug: 'saas-dashboard',
    name: 'SaaS dashboard',
    tagline: 'Metrics, charts, team activity',
    icon: 'LayoutDashboard',
    prompt: 'Build a SaaS analytics dashboard with a sidebar, overview stat cards (MRR, active users, churn), a line chart of weekly signups built with SVG, a recent activity feed, and a settings page. Use a dark professional theme.',
  },
  {
    slug: 'crm',
    name: 'CRM',
    tagline: 'Contacts, pipeline, deal stages',
    icon: 'Users',
    prompt: 'Build a CRM with a contacts table (add/edit/delete, search), a kanban deal pipeline with drag between stages (Lead, Qualified, Proposal, Won), and a contact detail panel with notes. Persist everything in localStorage.',
  },
  {
    slug: 'marketplace',
    name: 'Marketplace',
    tagline: 'Listings, filters, seller pages',
    icon: 'Store',
    prompt: 'Build a marketplace for handmade goods with a listing grid, category and price filters, a listing detail view, a favorites system, and a "sell an item" form. Seed it with 12 sample listings.',
  },
  {
    slug: 'ai-chatbot',
    name: 'AI chatbot',
    tagline: 'Chat UI with streaming feel',
    icon: 'MessageSquare',
    prompt: 'Build a chat assistant UI with a message thread, typing indicator, suggested prompts, conversation list sidebar, and a settings drawer for model and temperature. Simulate assistant replies locally with a // INTEGRATION: AI provider hook point.',
  },
  {
    slug: 'course-platform',
    name: 'Course platform',
    tagline: 'Lessons, progress, quizzes',
    icon: 'GraduationCap',
    prompt: 'Build an online course platform with a course catalog, a course page with video placeholder and lesson list, per-lesson completion tracking with a progress bar, and a simple end-of-module quiz with scoring.',
  },
  {
    slug: 'real-estate',
    name: 'Real estate',
    tagline: 'Listings, map placeholder, tours',
    icon: 'Home',
    prompt: 'Build a real estate listings app with property cards (price, beds, baths, sqft), filters for price range and bedrooms, a property detail page with an image gallery placeholder and a "book a tour" form, and a saved-homes list.',
  },
  {
    slug: 'career-platform',
    name: 'Career platform',
    tagline: 'Jobs, applications, tracking',
    icon: 'Briefcase',
    prompt: 'Build a job board with searchable job listings, filters by role type and location, a job detail view with an apply form, and an application tracker board (Applied, Interview, Offer, Rejected).',
  },
  {
    slug: 'admin-dashboard',
    name: 'Admin dashboard',
    tagline: 'Users, moderation, system health',
    icon: 'ShieldCheck',
    prompt: 'Build an admin dashboard with a user management table (ban/unban, role change), a content moderation queue with approve/reject, system health cards, and an audit log list. Dark theme, dense layout.',
  },
];
