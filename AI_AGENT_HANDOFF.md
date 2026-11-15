# Agency OS: Handoff Brief for AI Coding Agents

Put this file in the root of the Agency OS project and point your coding agent at it
(for example: "Read AI_AGENT_HANDOFF.md and do Step 1").

## Your role

The high-level plan below is already decided. Your job is to check it against the real
code, turn it into a detailed plan, and only then build, one phase at a time.

The plan was written from the running app and then checked against part of the source.
Wherever it conflicts with what you find in the code, the code is the truth: report the
conflict instead of forcing the plan.

## Ground rules

1. Do Step 1 (check) and Step 2 (detailed plan) before writing any feature code.
2. Work on one phase at a time. Stop and wait for approval at the end of each step.
3. Do not restructure existing tables or rename existing columns.
4. Never put the AI provider key in front-end code or commit it. It belongs in a
   server-side secret.
5. Never use the Supabase service-role key in the agent path. Every agent database call
   uses the signed-in user's token so row-level security applies.
6. Every agent write must be previewed and confirmed by the user. No autonomous writes.
7. Make small commits, one change each, with a clear message.
8. If something is unclear or missing, ask. Do not guess table names, column names or IDs.

## What is known about the app

Verified against the source on 15 Nov 2026 (not read: `.env.local`, the Edge Function
code, `Staff.jsx`).

- Vite + React front end (JSX), Supabase JS client, Supabase Auth, Radix UI, Tailwind.
- Dev server: http://localhost:5174
- **Data model:** there is no tasks table. All business records (Task, Project, Client,
  Workflow, WorkflowStage, User and others) are rows in `public.agency_records`
  (`entity`, `record_id`, `payload` jsonb). The front end reads them through
  `src/lib/dataClient.js` as `db.entities.<Entity>`.
- **Task payload fields:** `title`, `description`, `project_id`, `client_id`,
  `assigned_to`, `reviewer_id`, `workflow_id`, `workflow_stage_id`, `start_date`,
  `deadline`, `status` (todo, in_progress, review, done, blocked), `priority` (low,
  medium, high, urgent), `estimated_hours`, `subtasks_json`, `checklist_json`,
  `comments_json`, `activity_json`. Subtasks are a JSON string inside the task. There is
  no dependency field.
- **Users and roles:** `public.agency_profiles` (role: admin or user; status: active,
  inactive, pending). One database serves one agency; there is no workspace ID.
- **Capacity:** `public.agency_remote_work_profiles` holds working days and hours per
  person.
- **Server side:** six Supabase Edge Functions already exist in `supabase/functions/`.
- **Known fault:** `supabase/migrations/20261018000000_remote_staff_management.sql`
  creates `agency_remote_work_settings`, `agency_remote_work_profiles` and
  `agency_staff_availability`, but the database does not have them (error PGRST205 on
  the Tasks and Staff pages). The same migration also rewrites the row-level security
  policies on `agency_records` and `agency_profiles`.
- **Why Tasks goes blank:** `src/pages/Tasks.jsx` loads tasks, workflows, stages and
  availability in one `Promise.all`, so one failed call fails all four.
- `dataClient.js` downloads every record of an entity and filters in the browser. Do
  not copy this pattern in agent tools; filter in the query.
- `CLAUDE.md` points to `AGENTS.md`, which is not in the project root.
- Google sign-in button shows a "must be enabled" message on the login page.
- The workspace has no data yet.

## Step 1: Check (read-only, change nothing)

Inspect the repository and report:

1. Folder structure, framework versions, and how the app is started.
2. Where Supabase is configured and which project the environment file points to
   (do not print keys).
3. Whether `.env.local` points to the same Supabase project the CLI is linked to, and
   which migrations that project has applied (`supabase migration list`).
4. The row-level security policies in the remote staff migration: what changes for
   non-admin users once it is applied.
5. How the existing Edge Functions authenticate the caller, so the agent function can
   follow the same pattern.
6. How `Staff.jsx` loads data and where it fails.
7. Anything in the plan below that does not fit the code.

Output: a short written report. Stop here for review.

## Step 2: Detailed plan

For the phase you are asked to work on, produce:

1. The exact files to create or change, with a one-line reason each.
2. The SQL for any migration, including row-level security policies.
3. The order of work and what can be tested after each item.
4. Risks and anything that needs a decision from the owner.

Output: the plan as a checklist. Stop here for approval before building.

## Step 3: Build

Build the approved checklist for that phase only. After each item, run the app, confirm
there are no console errors on the affected pages, and tick the item off.

## The phases

### Phase 0: Stabilize

- Review the remote staff migration's access-rule changes, then apply it with
  `supabase db push`.
- Make `supabase db push` a required step of every release.
- Create `AGENTS.md`, or point `CLAUDE.md` at this file.
- Load each data source on Tasks and Staff independently, so one failed query shows a
  warning in that panel instead of blanking the page.
- Add a startup health check that reports any expected table the API cannot find.
- Default new workspaces to five modules: My Day, Tasks, Projects, Clients, Staff.
- Add a first-run checklist on the empty Dashboard, and sample-data load and clear.
- Configure Google sign-in or hide the button until it is configured.

Done when: no console errors on any page, and a new workspace can reach its first task
in a few minutes.

### Phase 1: Quick add

A text box on Tasks. The user types a sentence such as "Send Acme invoice by Friday,
assign Rahul", sees the parsed task in a confirm dialog, and confirms.

- New tables: `agent_runs`, `agent_tool_calls` (with row-level security).
- New field in the Task record payload: `agent_run_id`.
- Tool schemas use the real field names: `deadline`, `assigned_to`, `estimated_hours`,
  priority `medium` (not `normal`).
- Non-admins can only create tasks that pass the team-assignment check; the agent must
  report a refusal clearly.
- New server function `agent`: verify the user token, run the tool loop, cap at 25 tool
  calls per request, log the run.
- Tools: `list_members`, `list_projects`, `resolve_date`, `create_task`.
- AI key stored as a function secret; per-user rate limit.
- Settings: AI on/off per workspace.

Done when: no task is written without a confirm click; ambiguous names trigger a
question; relative dates resolve correctly in the user's timezone; duplicates are flagged.

### Phase 2: Plan a project

A "Plan with AI" button on a project. The agent proposes tasks, owners and dates; the
user accepts, edits or rejects per task.

- New table: `agent_plans` (status: proposed, approved, partly_approved, rejected,
  applied, failed).
- Tools: `get_workload`, `validate_plan`, `propose_plan`, `apply_plan`.
- `validate_plan` runs in code: no past dates, no subtask due after its parent, nobody
  over capacity, no duplicates.
- Subtasks go into `subtasks_json`. Task-to-task dependencies need a new payload field;
  decide with the owner whether to add it or leave dependencies out.

Done when: partial approval creates exactly the approved tasks; one click undoes a batch
(remove all Task records with that `agent_run_id`; only admins can delete today); an impossible deadline is reported, not
faked.

### Phase 3: Weekly review

A read-only panel listing overdue, stalled, blocked and overloaded work with a suggested
fix for each.

- Tools: `analyze_project`, `search_tasks`, `get_activity`.
- Metrics are computed in code; the model only interprets them.

Done when: every finding cites task IDs; a healthy project reports no problems; an empty
project reports that there is no data.

## Reference documents

Three planning documents exist in Claude. Export each as Markdown and place it in a
`docs/` folder so the coding agent can read it:

- `docs/agent-framework.md`: the agent's system prompt, all 21 tool definitions and the
  25 test scenarios.
- `docs/app-check-findings.md`: what is broken and what works.
- `docs/design-and-change-plan.md`: architecture, change list, data model, open decisions.

## Decisions the owner still has to make

- AI provider and model.
- Whether quick add must accept Malayalam and Hindi in the first release.
- Monthly AI spend cap per workspace.
