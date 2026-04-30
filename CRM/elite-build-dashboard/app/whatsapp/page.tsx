"use client";
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { limit, orderBy, where } from 'firebase/firestore';
import { Link2, Loader2, Lock, MessageCircle, Search, Send, Shield, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { useToast } from '@/lib/hooks/useToast';
import type {
  WhatsAppConversation,
  WhatsAppConversationMessage,
} from '@/lib/types/communication';
import type { Lead } from '@/lib/types/lead';
import { can } from '@/lib/utils/permissions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';

function timestampDate(value: WhatsAppConversation['last_message_at'] | WhatsAppConversationMessage['timestamp']): Date | null {
  if (!value) return null;
  return 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : null;
}

function timestampLabel(value: WhatsAppConversation['last_message_at'] | WhatsAppConversationMessage['timestamp']): string {
  const date = timestampDate(value);
  if (!date) return 'Unknown time';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function serviceWindowOpen(conversation: WhatsAppConversation | null): boolean {
  const expiresAt = timestampDate(conversation?.service_window_expires_at || null);
  return Boolean(expiresAt && expiresAt.getTime() > Date.now());
}

function leadPhone(lead: Lead): string {
  return lead.raw_data.whatsapp || lead.raw_data.whatsapp_number || lead.raw_data.phone || '';
}

export default function WhatsAppInboxPage() {
  const { crmUser, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const canViewInbox = can(crmUser?.role, 'view_whatsapp_inbox');
  const isAdmin = crmUser?.role === 'admin' || crmUser?.role === 'superadmin';
  const isSalesExec = crmUser?.role === 'sales_exec';
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [linkingLeadId, setLinkingLeadId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const [newLeadName, setNewLeadName] = useState('');
  const [creatingLead, setCreatingLead] = useState(false);
  const [createError, setCreateError] = useState('');

  const conversationKey = !canViewInbox
    ? null
    : isSalesExec && crmUser?.uid
      ? `whatsapp-conversations:sales:${crmUser.uid}`
      : 'whatsapp-conversations:all';
  const conversationConstraints = useMemo(() => {
    if (isSalesExec && crmUser?.uid) {
      return [where('assigned_to', '==', crmUser.uid), orderBy('last_message_at', 'desc'), limit(100)];
    }
    return [orderBy('last_message_at', 'desc'), limit(200)];
  }, [crmUser?.uid, isSalesExec]);
  const { data: conversations, loading } = useFirestoreCollectionKeyed<WhatsAppConversation>(
    'whatsapp_conversations',
    conversationKey,
    conversationConstraints,
  );

  const { data: leads } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    isAdmin ? 'leads:whatsapp-link-candidates' : null,
    [orderBy('created_at', 'desc')],
  );
  const activeLeads = useMemo(
    () => leads.filter(lead => !lead.archived_at && !lead.archived_at_iso),
    [leads],
  );

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter(conversation => {
      const haystack = [
        conversation.lead_name,
        conversation.display_phone,
        conversation.normalized_phone,
        conversation.last_message_preview,
      ].filter(Boolean).join(' ').toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [conversations, search]);

  const selectedConversation = filteredConversations.find(item => item.id === selectedId)
    || filteredConversations[0]
    || null;
  const messagePath = selectedConversation
    ? `whatsapp_conversations/${selectedConversation.id}/messages`
    : 'whatsapp_conversations/__none__/messages';
  const { data: messages, loading: messagesLoading } = useFirestoreCollectionKeyed<WhatsAppConversationMessage>(
    messagePath,
    selectedConversation ? `wa-messages:${selectedConversation.id}` : null,
    [orderBy('timestamp', 'asc'), limit(250)],
  );
  const selectedPhone = selectedConversation?.display_phone || selectedConversation?.normalized_phone || '';
  const latestMessage = messages[messages.length - 1] || null;
  const canSendFreeText = serviceWindowOpen(selectedConversation);
  const canReply = Boolean(selectedConversation && selectedPhone && (isAdmin || selectedConversation.lead_id));

  const linkCandidates = useMemo(() => {
    if (!isAdmin || !selectedConversation || selectedConversation.lead_id) return [];
    const normalizedNeedle = leadSearch.trim().toLowerCase();
    const phoneNeedle = selectedConversation.normalized_phone.slice(-4);

    return activeLeads
      .filter(lead => {
        const haystack = [
          lead.raw_data.lead_name,
          lead.raw_data.phone,
          lead.raw_data.whatsapp,
          lead.raw_data.whatsapp_number,
          lead.raw_data.email,
        ].filter(Boolean).join(' ').toLowerCase();
        const phones = [
          lead.raw_data.phone,
          lead.raw_data.whatsapp,
          lead.raw_data.whatsapp_number,
          ...(lead.duplicate_keys?.phones || []),
        ].filter(Boolean).map(value => String(value).replace(/\D/g, ''));
        const phoneHint = phoneNeedle.length >= 4 && phones.some(phone => phone.endsWith(phoneNeedle));
        return phoneHint || !normalizedNeedle || haystack.includes(normalizedNeedle);
      })
      .slice(0, 6);
  }, [activeLeads, isAdmin, leadSearch, selectedConversation]);

  const sendReply = async () => {
    const body = replyText.trim();
    if (!selectedConversation || !selectedPhone || !body) return;
    const token = await firebaseUser?.getIdToken();
    if (!token) {
      setSendError('Sign in again before sending WhatsApp messages.');
      return;
    }
    setSending(true);
    setSendError('');
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: selectedPhone,
          type: 'text',
          text: { body },
          leadId: selectedConversation.lead_id || undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send WhatsApp reply.');
      }
      setReplyText('');
      showToast('success', 'WhatsApp reply sent.');
    } catch (err) {
      const message = (err as Error).message || 'Failed to send WhatsApp reply.';
      setSendError(message);
      showToast('error', message);
    } finally {
      setSending(false);
    }
  };

  const linkConversationToLead = async (leadId: string) => {
    const messageId = latestMessage?.wa_message_id || latestMessage?.id;
    if (!messageId) return;
    const token = await firebaseUser?.getIdToken();
    if (!token) {
      setLinkError('Sign in again before linking WhatsApp conversations.');
      return;
    }
    setLinkingLeadId(leadId);
    setLinkError('');
    try {
      const response = await fetch('/api/whatsapp/link-lead', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, leadId }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to link WhatsApp conversation.');
      }
      setLeadSearch('');
      showToast('success', 'WhatsApp conversation linked to lead.');
    } catch (err) {
      const message = (err as Error).message || 'Failed to link WhatsApp conversation.';
      setLinkError(message);
      showToast('error', message);
    } finally {
      setLinkingLeadId(null);
    }
  };

  const createLeadFromConversation = async () => {
    const messageId = latestMessage?.wa_message_id || latestMessage?.id;
    if (!messageId) return;
    const token = await firebaseUser?.getIdToken();
    if (!token) {
      setCreateError('Sign in again before creating WhatsApp leads.');
      return;
    }
    setCreatingLead(true);
    setCreateError('');
    try {
      const response = await fetch('/api/whatsapp/create-lead', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          leadName: newLeadName.trim(),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; leadName?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create lead from WhatsApp.');
      }
      setNewLeadName('');
      showToast('success', `Lead "${data.leadName || 'WhatsApp Contact'}" created.`);
    } catch (err) {
      const message = (err as Error).message || 'Failed to create lead from WhatsApp.';
      setCreateError(message);
      showToast('error', message);
    } finally {
      setCreatingLead(false);
    }
  };

  if (!canViewInbox) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Shield className="mb-4 h-16 w-16 text-mn-border" />
        <p className="text-lg font-bold text-mn-text-muted">WhatsApp Inbox Restricted</p>
        <p className="mt-1 text-sm text-mn-text-muted/70">Your role does not have access to buyer conversations.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="WhatsApp Inbox" subtitle={isSalesExec ? 'My buyer conversations' : 'All buyer conversations'} />

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-12 sm:px-8">
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="app-shell-panel overflow-hidden">
            <div className="border-b border-mn-border/30 p-4">
              <Input
                label="Search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buyer, phone, or message"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm font-bold text-mn-text-muted">
                <MessageCircle className="h-4 w-4 animate-pulse" />
                Loading conversations...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm font-bold text-mn-text-muted">
                <Search className="h-4 w-4" />
                No WhatsApp conversations found.
              </div>
            ) : (
              <div className="divide-y divide-mn-border/30">
                {filteredConversations.map(conversation => {
                  const active = selectedConversation?.id === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      className={`block w-full px-5 py-4 text-left transition-colors ${active ? 'bg-mn-card-hover' : 'hover:bg-mn-card-hover/70'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-mn-h1">
                            {conversation.lead_name || conversation.display_phone || conversation.normalized_phone}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-mn-text-muted">
                            {timestampLabel(conversation.last_message_at)}
                          </p>
                        </div>
                        {conversation.unread_count ? <Badge variant="success">{conversation.unread_count}</Badge> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-mn-text-muted">
                        {conversation.last_message_preview || 'No message preview'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="app-shell-panel min-h-[620px] overflow-hidden">
            {selectedConversation ? (
              <div className="flex h-full min-h-[620px] flex-col">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mn-border/30 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-mn-text-muted">
                      {selectedConversation.assigned_to ? 'Assigned conversation' : 'Unassigned conversation'}
                    </p>
                    <h2 className="mt-1 text-xl font-black text-mn-h1">
                      {selectedConversation.lead_name || 'Unmatched WhatsApp Contact'}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-mn-text-muted">
                      {selectedPhone}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={canSendFreeText ? 'success' : 'warning'}>
                      {canSendFreeText ? '24h open' : 'Template required'}
                    </Badge>
                    {selectedConversation.lead_id && (
                      <Link
                        href={`/?leadId=${selectedConversation.lead_id}`}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-mn-border/70 bg-mn-card/80 px-4 py-2 text-xs font-black text-mn-text shadow-sm transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:bg-mn-card-hover"
                      >
                        Open Lead
                      </Link>
                    )}
                  </div>
                </div>

                {isAdmin && !selectedConversation.lead_id && (
                  <div className="border-b border-mn-border/30 bg-mn-warning/10 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-mn-warning" />
                      <p className="text-sm font-black text-mn-text">Link this conversation to a lead</p>
                    </div>
                    <Input
                      label="Find Lead"
                      value={leadSearch}
                      onChange={event => setLeadSearch(event.target.value)}
                      placeholder="Search by lead name or phone"
                    />
                    {linkError && (
                      <p className="mt-2 rounded-2xl border border-mn-danger/30 bg-mn-danger/10 px-3 py-2 text-xs font-bold text-mn-danger">
                        {linkError}
                      </p>
                    )}
                    <div className="mt-3 grid gap-2">
                      {linkCandidates.length === 0 ? (
                        <p className="text-xs font-bold text-mn-text-muted">No matching leads found.</p>
                      ) : linkCandidates.map(lead => (
                        <div key={lead.id} className="flex items-center justify-between gap-3 rounded-2xl border border-mn-border/50 bg-mn-card/70 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-mn-h1">{lead.raw_data.lead_name || 'Unnamed Lead'}</p>
                            <p className="text-xs font-bold text-mn-text-muted">{leadPhone(lead) || 'No phone'} • {lead.status}</p>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={linkingLeadId === lead.id}
                            onClick={() => linkConversationToLead(lead.id)}
                            icon={linkingLeadId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                          >
                            Link
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 border-t border-mn-border/40 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Input
                        label="New Lead Name"
                        value={newLeadName}
                        onChange={event => setNewLeadName(event.target.value)}
                        placeholder={`WhatsApp Contact ${selectedPhone.slice(-4) || ''}`.trim()}
                      />
                      <Button
                        type="button"
                        disabled={creatingLead}
                        onClick={createLeadFromConversation}
                        icon={creatingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                      >
                        Create Lead
                      </Button>
                    </div>
                    {createError && (
                      <p className="mt-2 rounded-2xl border border-mn-danger/30 bg-mn-danger/10 px-3 py-2 text-xs font-bold text-mn-danger">
                        {createError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto bg-mn-app/35 px-4 py-5">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-mn-text-muted">
                      <MessageCircle className="h-4 w-4 animate-pulse" />
                      Loading thread...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-sm font-bold text-mn-text-muted">
                      No messages in this conversation yet.
                    </div>
                  ) : messages.map(message => {
                    const outbound = message.direction === 'outbound';
                    return (
                      <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-2xl border px-4 py-3 shadow-sm ${
                          outbound
                            ? 'border-mn-accent/25 bg-mn-accent/12 text-mn-text'
                            : 'border-mn-border/50 bg-mn-card text-mn-text'
                        }`}>
                          <p className="whitespace-pre-wrap text-sm font-medium leading-6">
                            {message.text || `[${message.type}]`}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-mn-text-muted">
                            {message.sent_by_name && <span>{message.sent_by_name}</span>}
                            <span>{timestampLabel(message.timestamp)}</span>
                            {outbound && <span>{message.status}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-mn-border/30 p-4">
                  {!canSendFreeText && (
                    <div className="mb-3 flex items-start gap-2 rounded-2xl border border-mn-warning/30 bg-mn-warning/10 px-3 py-2 text-xs font-bold text-mn-text">
                      <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-mn-warning" />
                      WhatsApp&apos;s 24-hour service window is closed. Use an approved template to reopen the conversation.
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <textarea
                      value={replyText}
                      onChange={event => setReplyText(event.target.value)}
                      placeholder={canSendFreeText ? 'Type a WhatsApp reply...' : 'Template picker coming next'}
                      disabled={sending || !canReply || !canSendFreeText}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 py-3 text-sm font-medium text-mn-text shadow-sm transition-all placeholder:text-mn-text-muted/50 focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring"
                    />
                    <Button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || !canReply || !canSendFreeText || !replyText.trim()}
                      icon={sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    >
                      Send
                    </Button>
                  </div>
                  {sendError && (
                    <p className="mt-2 rounded-2xl border border-mn-danger/30 bg-mn-danger/10 px-3 py-2 text-xs font-bold text-mn-danger">
                      {sendError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[520px] items-center justify-center text-sm font-bold text-mn-text-muted">
                Select a WhatsApp conversation.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
