import { useState } from 'react';
import { Upload, KeyRound, BellRing } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Button, Card, Input } from '../components/ui';

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [webhookUrl, setWebhookUrl] = useState(profile?.webhook_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName.trim(), webhook_url: webhookUrl.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    setSaving(false);
    if (error) toast('error', error.message);
    else { toast('success', 'Profile saved.'); refreshProfile(); }
  };

  const uploadAvatar = async (file: File) => {
    if (!profile) return;
    if (file.size > 2 * 1024 * 1024) return toast('error', 'Avatar must be under 2 MB.');
    setUploading(true);
    const path = `${profile.id}/avatar-${Date.now()}`;
    const { error } = await supabase.storage.from('project-assets').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('project-assets').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
      toast('success', 'Avatar updated.');
      refreshProfile();
    } else {
      toast('error', error.message);
    }
    setUploading(false);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-xl font-semibold">Settings</h1>

        <Card className="mt-6 p-5">
          <h2 className="text-sm font-medium">Profile</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="full-name">Full name</label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="email">Email</label>
              <Input id="email" value={profile?.email ?? ''} disabled className="opacity-60" />
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
                <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload avatar'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </label>
              {profile?.avatar_url && <img src={profile.avatar_url} alt="Your avatar" className="h-9 w-9 rounded-full border border-forge-border object-cover" />}
            </div>
            <label className="block text-xs text-forge-dim">
              <span className="flex items-center gap-1.5"><BellRing size={12} /> Notification webhook (Discord, Slack, or any URL)</span>
              <Input
                className="mt-1"
                placeholder="https://discord.com/api/webhooks/…"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <span className="mt-1 block">
                Autopilot pings this when a build finishes, fails, pauses, or needs an answer — so you can
                check in from your phone.
              </span>
            </label>
            <Button onClick={saveProfile} loading={saving}>Save changes</Button>
          </div>
        </Card>

        <Card className="mt-4 p-5">
          <div className="flex items-start gap-3">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-forge-ember" />
            <div className="text-sm text-forge-dim">
              <p className="font-medium text-forge-ink">AI provider</p>
              <p className="mt-1">
                Model keys are configured by the instance operator, not per-user: set <code className="font-mono text-xs">AI_PROVIDER</code>,{' '}
                <code className="font-mono text-xs">AI_MODEL</code>, and the matching key as Supabase Edge Function secrets
                (<code className="font-mono text-xs">supabase secrets set</code>). Admins can switch the default model in the admin panel.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
