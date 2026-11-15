import { db } from "@/lib/dataClient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  List,
  Megaphone,
  Plus,
  Target,
  Users,
} from "lucide-react";

import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/hooks/useLookups";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CalendarGrid from "@/components/content/CalendarGrid";
import CampaignDialog from "@/components/content/CampaignDialog";
import MonthlyPlanDialog from "@/components/content/MonthlyPlanDialog";
import PostDialog from "@/components/content/PostDialog";
import { PLATFORMS, PLATFORM_MAP } from "@/components/content/platforms";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/format";


const ALL_CLIENTS = "__all_clients__";
const ALL_CAMPAIGNS = "__all_campaigns__";
const POST_STAGES = ["planned", "writing", "design", "internal_review", "client_approval", "approved", "scheduled", "published", "revisions", "rejected", "failed"];

function StatCard({ label, value, icon: Icon, tone = "default" }) {
  const tones = {
    default: "border-border bg-card text-foreground",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    blue: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
  };
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${tones[tone]}`}>
      <div className="rounded-lg bg-background/70 p-2"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="truncate text-xl font-bold leading-tight">{value}</p>
        <p className="truncate text-xs opacity-75">{label}</p>
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, children }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
      {children}
    </Button>
  );
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function workflowBadgeClass(stage) {
  if (["published", "approved", "scheduled"].includes(stage)) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200";
  if (["client_approval", "client_review", "internal_review", "revisions", "needs_edit"].includes(stage)) return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  if (["failed", "rejected"].includes(stage)) return "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200";
  return "bg-muted text-muted-foreground";
}

export default function ContentCalendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const lookups = useLookups();
  const isAdmin = user?.role === "admin";

  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedClient, setSelectedClient] = useState(ALL_CLIENTS);
  const [selectedCampaign, setSelectedCampaign] = useState(ALL_CAMPAIGNS);
  const [view, setView] = useState("month");
  const [posts, setPosts] = useState([]);
  const [monthlyPosts, setMonthlyPosts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [monthlyPlans, setMonthlyPlans] = useState([]);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [presetDate, setPresetDate] = useState(null);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPosts, setCampaignPosts] = useState([]);
  const [monthlyPlanOpen, setMonthlyPlanOpen] = useState(false);
  const [editingMonthlyPlan, setEditingMonthlyPlan] = useState(null);
  const [selectedPostAssets, setSelectedPostAssets] = useState([]);
  const partiallySavedPostRef = useRef(null);
  const uploadedMediaRef = useRef(new Set());
  const deletedAssetRef = useRef(new Set());

  const selectedClientRecord = lookups.clients.find((client) => client.id === selectedClient);
  const dateRange = useMemo(() => {
    if (view === "week") {
      return { start: startOfWeek(monthDate), end: endOfWeek(monthDate) };
    }
    return { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
  }, [monthDate, view]);

  const fetchPlannerData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const start = format(dateRange.start, "yyyy-MM-dd");
    const end = format(dateRange.end, "yyyy-MM-dd");
    const monthStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
    try {
      const clientQuery = selectedClient === ALL_CLIENTS ? {} : { client_id: selectedClient };
      const [postResult, monthlyPostResult, campaignResult, planResult, templateResult] = await Promise.all([
        db.entities.SocialPost.filter(
          { ...clientQuery, publish_date: { $gte: start, $lte: end } },
          { sort: "publish_date", limit: 500 },
        ),
        db.entities.SocialPost.filter(
          { ...clientQuery, publish_date: { $gte: monthStart, $lte: monthEnd } },
          { sort: "publish_date", limit: 1000 },
        ),
        db.entities.Campaign.filter(clientQuery, { sort: "start_date", limit: 500 }),
        db.entities.MonthlyPlan.filter(
          { month: monthDate.getMonth() + 1, year: monthDate.getFullYear(), is_template: { $ne: true } },
          { limit: 500 },
        ),
        db.entities.MonthlyPlan.filter({ is_template: true }, { limit: 500 }),
      ]);
      const loadedPosts = postResult.items || [];
      const postIds = loadedPosts.map((post) => post.id).filter(Boolean);
      const assetsResult = postIds.length
        ? await db.entities.MediaAsset.filter({ post_id: { $in: postIds } }, { limit: 1000 })
        : { items: [] };

      setPosts(loadedPosts);
      setMonthlyPosts(monthlyPostResult.items || []);
      setCampaigns(campaignResult.items || []);
      setMonthlyPlans([
        ...(planResult.items || []).filter((plan) => selectedClient === ALL_CLIENTS || plan.client_id === selectedClient),
        ...(templateResult.items || []),
      ]);
      setMediaAssets(assetsResult.items || []);
    } catch (error) {
      console.error("Content planner load failed:", error);
      setLoadError(error.message || "Please try again.");
      toast({ title: "Could not load planner data", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [dateRange, monthDate, selectedClient, toast]);

  useEffect(() => {
    fetchPlannerData();
  }, [fetchPlannerData]);

  useEffect(() => {
    setSelectedCampaign(ALL_CAMPAIGNS);
  }, [selectedClient]);

  const assetsByPost = useMemo(() => {
    const map = {};
    for (const asset of mediaAssets) {
      (map[asset.post_id] ||= []).push(asset);
    }
    return map;
  }, [mediaAssets]);

  const campaignMap = useMemo(
    () => Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns],
  );

  const filteredPosts = useMemo(() => posts
    .filter((post) => selectedCampaign === ALL_CAMPAIGNS || post.campaign_id === selectedCampaign)
    .map((post) => ({
      ...post,
      media_assets: assetsByPost[post.id] || [],
      assigned_to_name: lookups.userMap[post.assigned_to]?.full_name || lookups.userMap[post.assigned_to]?.email,
    }))
    .sort((a, b) => `${a.publish_date} ${a.publish_time || ""}`.localeCompare(`${b.publish_date} ${b.publish_time || ""}`)),
  [posts, selectedCampaign, assetsByPost, lookups.userMap]);

  const activePlans = monthlyPlans.filter((plan) => !plan.is_template);
  const planByClient = Object.fromEntries(activePlans.map((plan) => [plan.client_id, plan]));
  const target = (selectedClient === ALL_CLIENTS ? lookups.clients : [selectedClientRecord])
    .filter(Boolean)
    .reduce((total, client) => total + Number(planByClient[client.id]?.content_target ?? client.monthly_content_target ?? 0), 0);
  const filteredMonthlyPosts = monthlyPosts.filter((post) => selectedCampaign === ALL_CAMPAIGNS || post.campaign_id === selectedCampaign);
  const stages = filteredMonthlyPosts.map((post) => post.workflow_stage || post.status || "planned");
  const stats = [
    { label: "Monthly Content Target", value: target, icon: Target, tone: "emerald" },
    { label: "Total Planned Posts", value: filteredMonthlyPosts.length, icon: FileText },
    { label: "In Production", value: stages.filter((stage) => ["writing", "design", "internal_review"].includes(stage)).length, icon: Clock3, tone: "blue" },
    { label: "Awaiting Client Approval", value: stages.filter((stage) => stage === "client_approval" || stage === "client_review").length, icon: Users, tone: "amber" },
    { label: "Approved", value: stages.filter((stage) => stage === "approved").length, icon: Check, tone: "emerald" },
    { label: "Scheduled", value: filteredMonthlyPosts.filter((post) => post.workflow_stage === "scheduled" || (!post.workflow_stage && post.status === "scheduled")).length, icon: CalendarDays },
    { label: "Published", value: filteredMonthlyPosts.filter((post) => post.workflow_stage === "published" || (!post.workflow_stage && post.status === "published")).length, icon: CircleCheck, tone: "emerald" },
    { label: "Remaining Deliverables", value: Math.max(0, target - filteredMonthlyPosts.length), icon: Target, tone: "amber" },
  ];

  const openNewPost = (day) => {
    partiallySavedPostRef.current = null;
    uploadedMediaRef.current.clear();
    deletedAssetRef.current.clear();
    setPresetDate(typeof day === "string" ? day : format(day || new Date(), "yyyy-MM-dd"));
    setEditingPost(null);
    setSelectedPostAssets([]);
    setPostDialogOpen(true);
  };

  const openEditPost = async (post) => {
    partiallySavedPostRef.current = null;
    uploadedMediaRef.current.clear();
    deletedAssetRef.current.clear();
    setEditingPost(post);
    setPresetDate(null);
    const assets = assetsByPost[post.id];
    setSelectedPostAssets(assets || []);
    setPostDialogOpen(true);
    if (!assets) {
      try {
        const result = await db.entities.MediaAsset.filter({ post_id: post.id }, { limit: 100 });
        setSelectedPostAssets(result.items || []);
      } catch (error) {
        console.error("Post media load failed:", error);
        toast({ title: "Could not load post media", description: error.message || "Please try again.", variant: "destructive" });
      }
    }
  };

  const openCampaign = async (campaign) => {
    setEditingCampaign(campaign);
    setCampaignPosts([]);
    setCampaignDialogOpen(true);
    try {
      const result = await db.entities.SocialPost.filter({ campaign_id: campaign.id }, { sort: "publish_date", limit: 500 });
      setCampaignPosts(result.items || []);
    } catch (error) {
      console.error("Campaign posts load failed:", error);
      toast({ title: "Could not load campaign posts", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const openCampaignPost = (post) => {
    setCampaignDialogOpen(false);
    setEditingCampaign(null);
    openEditPost(post);
  };

  const handlePostSave = async (postData, filesToUpload = [], removedAssetIds = [], { action = "save" } = {}) => {
    if (["approved", "rejected", "published"].includes(action) && !isAdmin) {
      throw new Error("Only an administrator can approve, reject, or publish a post.");
    }
    let savedPost;
    const existingPostId = editingPost?.id || partiallySavedPostRef.current;
    if (existingPostId) {
      savedPost = await db.entities.SocialPost.update(existingPostId, postData);
    } else {
      savedPost = await db.entities.SocialPost.create({ ...postData, created_by: user?.id });
    }
    const postId = savedPost?.id || existingPostId;
    if (!postId) throw new Error("The post was saved without an ID; media and workflow updates cannot be attached.");
    partiallySavedPostRef.current = postId;
    if (action === "published") {
      await db.entities.SocialPost.update(postId, { published_at: new Date().toISOString() });
    }
    if (removedAssetIds.length) {
      await Promise.all(removedAssetIds
        .filter((assetId) => !deletedAssetRef.current.has(assetId))
        .map(async (assetId) => {
          await db.entities.MediaAsset.delete(assetId);
          deletedAssetRef.current.add(assetId);
        }));
    }
    for (const file of filesToUpload) {
      const uploadKey = `${file.name}:${file.size}:${file.lastModified}`;
      if (uploadedMediaRef.current.has(uploadKey)) continue;
      const result = await db.integrations.Core.UploadFile(file);
      if (!result?.file_url) throw new Error(`Upload did not return a file URL for ${file.name}.`);
      await db.entities.MediaAsset.create({
        post_id: postId,
        file_url: result.file_url,
        asset_type: file.type.startsWith("video/") ? "video" : "image",
        file_name: file.name,
        file_size: file.size,
      });
      uploadedMediaRef.current.add(uploadKey);
    }
    if (["client_approval", "approved", "revisions", "rejected"].includes(action)) {
      await db.entities.ApprovalLog.create({
        post_id: postId,
        client_id: postData.client_id,
        status: action === "approved" ? "approved" : action === "rejected" ? "rejected" : action === "revisions" ? "needs_edit" : "pending",
        approved_by: ["approved", "rejected"].includes(action) ? user?.id : undefined,
        client_feedback: postData.client_feedback || "",
      });
    }
    partiallySavedPostRef.current = null;
    uploadedMediaRef.current.clear();
    deletedAssetRef.current.clear();
    setPostDialogOpen(false);
    setEditingPost(null);
    await fetchPlannerData();
  };

  const handlePostMove = async (postId, newDate) => {
    const post = posts.find((item) => item.id === postId);
    if (!post || post.publish_date === newDate) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(Date.parse(newDate))) {
      toast({ title: "Invalid publishing date", description: "Choose a valid calendar date.", variant: "destructive" });
      return;
    }
    if (post.status === "published" || post.workflow_stage === "published") {
      toast({ title: "Published post cannot be rescheduled", description: "Published content cannot be moved to another date.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Reschedule “${post.title || "Untitled post"}” to ${formatDate(newDate)}?`)) return;
    const previous = posts;
    setPosts((current) => current.map((item) => item.id === postId ? { ...item, publish_date: newDate } : item));
    try {
      await db.entities.SocialPost.update(postId, { publish_date: newDate });
      await fetchPlannerData();
    } catch (error) {
      setPosts(previous);
      console.error("Social post reschedule failed:", error);
      toast({ title: "Could not reschedule post", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const handlePostDelete = async (post) => {
    if (!isAdmin) {
      toast({ title: "Permission required", description: "Only an administrator can delete a post.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    try {
      await Promise.all((assetsByPost[post.id] || []).map((asset) => db.entities.MediaAsset.delete(asset.id)));
      await db.entities.SocialPost.delete(post.id);
      setPostDialogOpen(false);
      setEditingPost(null);
      await fetchPlannerData();
    } catch (error) {
      console.error("Social post delete failed:", error);
      toast({ title: "Could not delete post", description: error.message || "Please try again.", variant: "destructive" });
    }
  };

  const handleCampaignSave = async (campaignData) => {
    if (!isAdmin) throw new Error("Only an administrator can create or edit campaigns.");
    if (editingCampaign?.id) await db.entities.Campaign.update(editingCampaign.id, campaignData);
    else await db.entities.Campaign.create(campaignData);
    setCampaignDialogOpen(false);
    setEditingCampaign(null);
    await fetchPlannerData();
  };

  const saveMonthlyPlan = async (planData, asTemplate) => {
    if (asTemplate) {
      await db.entities.MonthlyPlan.create(planData);
      await fetchPlannerData();
      return;
    }
    if (editingMonthlyPlan?.id) {
      await db.entities.MonthlyPlan.update(editingMonthlyPlan.id, planData);
    } else {
      const existing = await db.entities.MonthlyPlan.filter(
        { client_id: planData.client_id, month: planData.month, year: planData.year, is_template: { $ne: true } },
        { limit: 1 },
      );
      const record = existing.items?.[0];
      if (record) await db.entities.MonthlyPlan.update(record.id, planData);
      else await db.entities.MonthlyPlan.create(planData);
    }
    await fetchPlannerData();
  };

  const templates = monthlyPlans.filter((plan) => plan.is_template);
  const visibleCampaigns = selectedCampaign === ALL_CAMPAIGNS
    ? campaigns
    : campaigns.filter((campaign) => campaign.id === selectedCampaign);
  const planForSelectedClient = activePlans.find((plan) => plan.client_id === selectedClient);
  const campaignFilterItems = selectedClient === ALL_CLIENTS
    ? campaigns
    : campaigns.filter((campaign) => campaign.client_id === selectedClient);

  const setMonth = (direction) => setMonthDate((current) => direction > 0 ? addMonths(current, 1) : subMonths(current, 1));
  const stepRange = (direction) => {
    if (view === "week") {
      setMonthDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7));
    } else setMonth(direction);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agency Monthly Planner"
        description="Plan, create, review, and manage monthly content across clients."
        action={
          <div className="flex flex-wrap gap-2">
            {isAdmin && <Button variant="outline" onClick={() => { setEditingMonthlyPlan(planForSelectedClient || null); setMonthlyPlanOpen(true); }}>
              <FileText className="mr-2 h-4 w-4" /> Monthly Plan
            </Button>}
            {isAdmin && <Button variant="outline" onClick={() => { setEditingCampaign(null); setCampaignDialogOpen(true); }}>
              <Megaphone className="mr-2 h-4 w-4" /> New Campaign
            </Button>}
            <Button onClick={() => openNewPost()}>
              <Plus className="mr-2 h-4 w-4" /> New Post
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <Select value={selectedClient} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-[200px]" aria-label="Filter by client"><SelectValue placeholder="Choose client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>All Clients</SelectItem>
            {lookups.clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>{client.company_name}{client.status === "inactive" ? " · Inactive" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-[200px]" aria-label="Filter by campaign"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CAMPAIGNS}>All Campaigns</SelectItem>
            {campaignFilterItems.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => stepRange(-1)} aria-label="Previous month or week"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[150px] text-center text-sm font-semibold">{format(monthDate, view === "week" ? "'Week of' MMM d, yyyy" : "MMMM yyyy")}</span>
          <Button variant="outline" size="icon" onClick={() => stepRange(1)} aria-label="Next month or week"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setMonthDate(new Date())}>Today</Button>
        </div>
        <div className="flex gap-1" role="group" aria-label="Calendar view">
          <ViewButton active={view === "month"} onClick={() => setView("month")}><CalendarDays className="mr-1.5 h-4 w-4" />Month</ViewButton>
          <ViewButton active={view === "week"} onClick={() => setView("week")}><CalendarDays className="mr-1.5 h-4 w-4" />Week</ViewButton>
          <ViewButton active={view === "list"} onClick={() => setView("list")}><List className="mr-1.5 h-4 w-4" />List</ViewButton>
        </div>
      </div>

      {selectedClient === ALL_CLIENTS && (
        <p className="text-xs text-muted-foreground">All Clients shows posts and campaigns available to your account.</p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="Monthly content summary">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => (
            <div key={platform.value} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: platform.color }} />
              <span className="text-xs text-muted-foreground">{platform.label}</span>
            </div>
          ))}
        </div>
        {selectedClient !== ALL_CLIENTS && selectedClientRecord && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectedClientRecord.logo_url
              ? <img src={selectedClientRecord.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-900">{selectedClientRecord.company_name?.[0] || "C"}</span>}
            <span>{selectedClientRecord.status || "active"}</span>
            {selectedClientRecord.account_manager_id && <span>· {lookups.userMap[selectedClientRecord.account_manager_id]?.full_name || "Account manager assigned"}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card py-20 text-center text-sm text-muted-foreground">Loading planner…</div>
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          <span>Planner data could not be loaded: {loadError}</span>
          <Button variant="outline" size="sm" onClick={fetchPlannerData}>Try again</Button>
        </div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-emerald-50/70 text-left text-xs text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Post</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Platform</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Assignee</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPosts.map((post) => {
                const stage = post.workflow_stage || post.status || "planned";
                return <tr key={post.id} className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20">
                  <td className="px-4 py-3">{formatDate(post.publish_date)}{post.publish_time && <span className="ml-1 text-xs text-muted-foreground">{post.publish_time}</span>}</td>
                  <td className="px-4 py-3 font-medium"><button type="button" className="text-left hover:text-primary focus-visible:outline-none focus-visible:underline" onClick={() => openEditPost(post)}>{post.title || "Untitled post"}</button></td>
                  <td className="px-4 py-3">{lookups.clientMap[post.client_id]?.company_name || "—"}</td>
                  <td className="px-4 py-3">{PLATFORM_MAP[post.platform]?.label || post.platform}</td>
                  <td className="px-4 py-3">{campaignMap[post.campaign_id]?.name || "—"}</td>
                  <td className="px-4 py-3">{post.assigned_to_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs capitalize ${workflowBadgeClass(stage)}`}>{stage.replaceAll("_", " ")}</span>
                  </td>
                </tr>;
              })}
              {filteredPosts.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No planned posts in this period. Create a post or click a calendar date to start.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <CalendarGrid
          monthDate={monthDate}
          posts={filteredPosts}
          campaigns={visibleCampaigns}
          view={view}
          onDayClick={openNewPost}
          onPostClick={openEditPost}
          onPostMove={handlePostMove}
          onCampaignClick={isAdmin ? openCampaign : undefined}
        />
      )}

      {postDialogOpen && (
        <PostDialog
          open={postDialogOpen}
          onOpenChange={(nextOpen) => {
            setPostDialogOpen(nextOpen);
            if (!nextOpen) {
              setEditingPost(null);
              setPresetDate(null);
              setSelectedPostAssets([]);
            }
          }}
          post={editingPost}
          presetDate={presetDate}
          clientId={selectedClient === ALL_CLIENTS ? "" : selectedClient}
          clientName={selectedClientRecord?.company_name}
          clients={selectedClientRecord ? [selectedClientRecord] : lookups.clients}
          users={lookups.users}
          campaigns={campaigns}
          assets={selectedPostAssets}
          workflowStages={POST_STAGES}
          isAdmin={isAdmin}
          onSave={handlePostSave}
          onDelete={isAdmin ? handlePostDelete : undefined}
        />
      )}

      {campaignDialogOpen && (
        <CampaignDialog
          open={campaignDialogOpen}
          onOpenChange={(nextOpen) => {
            setCampaignDialogOpen(nextOpen);
            if (!nextOpen) setEditingCampaign(null);
          }}
          campaign={editingCampaign}
          clientId={selectedClient === ALL_CLIENTS ? "" : selectedClient}
          clients={selectedClientRecord ? [selectedClientRecord] : lookups.clients}
          monthlyPlans={monthlyPlans}
          relatedPosts={campaignPosts}
          onViewPost={openCampaignPost}
          onSave={handleCampaignSave}
        />
      )}

      {monthlyPlanOpen && (
        <MonthlyPlanDialog
          open={monthlyPlanOpen}
          onOpenChange={setMonthlyPlanOpen}
          client={selectedClientRecord}
          clients={lookups.clients}
          allowClientSelection={selectedClient === ALL_CLIENTS}
          users={lookups.users}
          campaigns={campaigns}
          monthDate={monthDate}
          plan={editingMonthlyPlan}
          templates={templates}
          onSave={saveMonthlyPlan}
        />
      )}
    </div>
  );
}
