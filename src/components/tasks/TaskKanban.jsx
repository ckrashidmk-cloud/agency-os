import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { AlertTriangle, Calendar, CheckSquare, Clock, GripVertical, MoreVertical } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { formatDate } from "@/lib/format";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { id: "todo", title: "To Do", color: "bg-slate-500", ring: "ring-slate-400/30" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-500", ring: "ring-blue-400/30" },
  { id: "review", title: "Review", color: "bg-amber-500", ring: "ring-amber-400/30" },
  { id: "done", title: "Done", color: "bg-emerald-500", ring: "ring-emerald-400/30" },
];

function readChecklist(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function initials(user) {
  return (user?.full_name || user?.email || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function TaskCard({ task, userMap, projectMap, clientMap, onOpen, onMove, pending, provided, isDragging }) {
  const assignee = userMap?.[task.assigned_to];
  const project = projectMap?.[task.project_id];
  const client = clientMap?.[task.client_id || project?.client_id];
  const checklist = readChecklist(task.checklist_json);
  const completedItems = checklist.filter((item) => item.done).length;
  const isOverdue = Boolean(task.deadline && task.deadline < new Date().toISOString().slice(0, 10) && task.status !== "done");

  return (
    <article
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={cn(
        "group relative rounded-xl border border-emerald-950/5 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-border",
        isDragging && "rotate-1 scale-[1.02] shadow-xl ring-2 ring-primary/40",
        pending && "pointer-events-none opacity-65",
      )}
    >
      <div {...provided.dragHandleProps} className="absolute left-1 top-0 bottom-0 flex w-5 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing" aria-label="Drag task">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="p-3 pl-5">
        <div className="flex items-start gap-2">
          <button type="button" className="min-w-0 flex-1 text-left text-sm font-semibold leading-snug hover:text-emerald-800 focus-visible:outline-none focus-visible:underline dark:hover:text-emerald-300" onClick={() => onOpen(task)}>
            {task.title}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-accent group-hover:opacity-100 focus-visible:opacity-100" aria-label="Task actions">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onOpen(task)}>Open details</DropdownMenuItem>
              {COLUMNS.filter((column) => column.id !== task.status).map((column) => (
                <DropdownMenuItem key={column.id} disabled={pending} onClick={() => onMove(task.id, column.id)}>Move to {column.title}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {task.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.description}</p>}

        <div className="mt-2 flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs font-medium text-emerald-950 dark:text-emerald-100">{client?.company_name || client?.name || "No client"}</span>
          <span className="truncate text-[11px] text-muted-foreground">{project?.name || "No project"}</span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority || "medium"} />
          {task.status === "blocked" && <StatusBadge status="blocked" />}
          {task.estimated_hours != null && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />{task.estimated_hours}h</span>}
          {task.deadline && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
              isOverdue ? "bg-rose-100 font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-muted text-muted-foreground",
            )}>
              {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
              {isOverdue ? "Overdue · " : ""}{formatDate(task.deadline)}
            </span>
          )}
        </div>

        {(assignee || checklist.length > 0) && (
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            {assignee ? (
              <div className="flex min-w-0 items-center gap-1.5" title={assignee.full_name || assignee.email}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100">{initials(assignee)}</span>
                <span className="truncate text-[11px] text-muted-foreground">{assignee.full_name?.split(" ")[0] || assignee.email}</span>
              </div>
            ) : <span className="text-[11px] text-muted-foreground">Unassigned</span>}
            {checklist.length > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Checklist progress"><CheckSquare className="h-3 w-3" />{completedItems}/{checklist.length}</span>}
          </div>
        )}
        {pending && <span className="mt-2 block text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Saving status…</span>}
      </div>
    </article>
  );
}

export default function TaskKanban({ tasks, lookups, onOpen, onMove }) {
  const [pendingIds, setPendingIds] = useState([]);
  const userMap = lookups?.userMap || {};
  const projectMap = lookups?.projectMap || {};
  const clientMap = lookups?.clientMap || {};

  const moveTask = async (taskId, status) => {
    if (pendingIds.includes(taskId)) return;
    setPendingIds((current) => [...current, taskId]);
    try {
      await onMove(taskId, status);
    } finally {
      setPendingIds((current) => current.filter((id) => id !== taskId));
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { draggableId, destination, source } = result;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const task = tasks.find((item) => item.id === draggableId);
    const destinationColumn = destination.droppableId;
    if (!task || (destinationColumn === "todo" && task.status === "todo")) return;
    await moveTask(draggableId, destinationColumn);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid min-w-0 grid-cols-1 gap-4 pb-4 md:grid-cols-2 2xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => column.id === "todo"
            ? task.status === "todo" || task.status === "blocked"
            : (task.status || "todo") === column.id);
          return (
            <section key={column.id} className="flex min-w-0 flex-col">
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("h-2.5 w-2.5 rounded-full", column.color)} />
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-muted-foreground dark:bg-card">{columnTasks.length}</span>
              </header>
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex min-h-[260px] flex-1 flex-col gap-2.5 rounded-xl border border-emerald-950/5 bg-emerald-50/50 p-2.5 transition-colors dark:border-border dark:bg-muted/30 sm:min-h-[380px]",
                      snapshot.isDraggingOver && `ring-2 ${column.ring} bg-emerald-50 dark:bg-muted/60`,
                    )}
                  >
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={pendingIds.includes(task.id)}>
                        {(providedDraggable, snapshotDraggable) => (
                          <TaskCard
                            task={task}
                            userMap={userMap}
                            projectMap={projectMap}
                            clientMap={clientMap}
                            onOpen={onOpen}
                            onMove={moveTask}
                            pending={pendingIds.includes(task.id)}
                            isDragging={snapshotDraggable.isDragging}
                            provided={providedDraggable}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {!columnTasks.length && !snapshot.isDraggingOver && <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground/70">Drag tasks here</div>}
                  </div>
                )}
              </Droppable>
            </section>
          );
        })}
      </div>
    </DragDropContext>
  );
}
