import React, { useMemo } from "react";
import {
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  format,
  getDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { PLATFORM_MAP } from "./platforms";

function PostDot({ post }) {
  const plat = PLATFORM_MAP[post.platform] || { label: post.platform || "Social", color: "#6B7280" };
  const media = post.media_assets?.[0]?.file_url || post.cover_image_url;
  const time = post.publish_time
    ? new Date(`2000-01-01T${post.publish_time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
  const stage = post.workflow_stage || post.status || "planned";
  const statusLabel = stage.replaceAll("_", " ");
  const statusTone = ["published", "approved", "scheduled"].includes(stage)
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
    : ["client_approval", "client_review", "internal_review", "revisions", "needs_edit"].includes(stage)
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
      : ["failed", "rejected"].includes(stage)
        ? "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
        : "bg-muted text-muted-foreground";
  return (
    <div
      title={`${post.title}${time ? ` at ${time}` : ""} — ${plat.label} · ${statusLabel}`}
      className="flex gap-1.5 rounded-md border border-border/70 bg-card p-1 text-left text-[10px] text-foreground shadow-sm transition hover:border-primary/40 hover:shadow"
    >
      {media && <img src={media} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}
      <span className="min-w-0">
        <span className="block truncate font-semibold">{time && <span className="mr-1 text-primary">{time}</span>}{post.title}</span>
        <span className="block truncate text-muted-foreground">{plat.label}{post.content_format ? ` · ${post.content_format}` : ""}</span>
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate text-muted-foreground">{post.assigned_to_name}</span>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] capitalize ${statusTone}`}>{statusLabel}</span>
        </span>
      </span>
    </div>
  );
}

export default function CalendarGrid({
  monthDate,
  posts = [],
  campaigns = [],
  view = "month",
  onDayClick,
  onPostClick,
  onPostMove,
  onCampaignClick,
}) {
  const days = useMemo(() => {
    const start = view === "week" ? startOfWeek(monthDate) : startOfWeek(startOfMonth(monthDate));
    const end = view === "week" ? endOfWeek(monthDate) : endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [monthDate, view]);

  // Map posts by date string
  const postsByDate = useMemo(() => {
    const map = {};
    posts.forEach(p => {
      if (!p.publish_date) return;
      const key = p.publish_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [posts]);

  // Campaign date spans
  const activeCampaignsByDate = useMemo(() => {
    const map = {};
    campaigns.forEach(c => {
      if (!c.start_date || !c.end_date) return;
      days.forEach(d => {
        const ds = format(d, "yyyy-MM-dd");
        if (ds >= c.start_date && ds <= c.end_date) {
          if (!map[ds]) map[ds] = [];
          map[ds].push(c);
        }
      });
    });
    return map;
  }, [campaigns, days]);

  const firstDayOfWeek = getDay(days[0]); // 0=Sun
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 bg-muted/50">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className={`grid grid-cols-7 divide-x divide-y border-t ${view === "week" ? "min-h-[540px]" : ""}`}>
        {/* Empty cells before month start */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[100px] bg-muted/20" />
        ))}
        {days.map(day => {
          const ds = format(day, "yyyy-MM-dd");
          const dayPosts = postsByDate[ds] || [];
          const dayCampaigns = activeCampaignsByDate[ds] || [];
          const isToday = ds === today;
          return (
            <div
              key={ds}
              className={`${view === "week" ? "min-h-[480px]" : "min-h-[120px]"} p-1.5 cursor-pointer hover:bg-muted/30 transition-colors`}
              onClick={() => onDayClick?.(ds)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const postId = event.dataTransfer.getData("text/plain");
                if (postId) onPostMove?.(postId, ds);
              }}
            >
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                {format(day, "d")}
              </div>
              {/* Campaign stripes */}
              {dayCampaigns.length > 0 && (
                dayCampaigns.slice(0, 2).map((campaign) => (
                  onCampaignClick ? (
                    <button
                      key={campaign.id}
                      type="button"
                      className="mb-1 block w-full truncate rounded px-1 py-0.5 text-left text-[10px] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      style={{
                        backgroundColor: `${campaign.color || "#6366f1"}25`,
                        color: campaign.color || "#6366f1",
                      }}
                      title={campaign.name}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCampaignClick(campaign);
                      }}
                    >
                      {campaign.name}
                    </button>
                  ) : (
                    <div
                      key={campaign.id}
                      className="mb-1 truncate rounded px-1 py-0.5 text-[10px]"
                      style={{
                        backgroundColor: `${campaign.color || "#6366f1"}25`,
                        color: campaign.color || "#6366f1",
                      }}
                      title={campaign.name}
                    >
                      {campaign.name}
                    </div>
                  )
                ))
              )}
              {/* Posts */}
              <div className="space-y-0.5">
                {dayPosts.slice(0, 3).map(post => (
                  <div
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", post.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(event) => { event.stopPropagation(); onPostClick?.(post); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onPostClick?.(post);
                      }
                    }}
                  >
                    <PostDot post={post} />
                  </div>
                ))}
                {dayPosts.length > 3 && view !== "week" && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayPosts.length - 3} more posts</div>
                )}
                {view === "week" && dayPosts.slice(3).map((post) => (
                  <div
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", post.id)}
                    onClick={(event) => { event.stopPropagation(); onPostClick?.(post); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onPostClick?.(post);
                      }
                    }}
                  >
                    <PostDot post={post} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
