import { db } from "@/lib/dataClient";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { remoteWorkService } from "@/lib/remoteWorkService";




// Lightweight shared lookup of users, clients, and projects with name maps.
// Refetches on mount so newly added records appear.
export function useLookups() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState({ users: [], clients: [], projects: [], services: [], loaded: false });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [users, clients, projects, services] = await Promise.all([
          currentUser?.role === "admin" ? db.entities.User.list() : remoteWorkService.listTeamMembers(),
          db.entities.Client.list(),
          db.entities.Project.list(),
          db.entities.Service.list(),
        ]);
        if (!active) return;
        setData({ users: users || [], clients: clients || [], projects: projects || [], services: services || [], loaded: true });
      } catch (e) {
        if (active) setData({ users: [], clients: [], projects: [], services: [], loaded: true });
      }
    })();
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.role]);

  const userMap = {};
  data.users.forEach((u) => { userMap[u.id] = u; });
  const clientMap = {};
  data.clients.forEach((c) => { clientMap[c.id] = c; });
  const projectMap = {};
  data.projects.forEach((p) => { projectMap[p.id] = p; });

  return { ...data, userMap, clientMap, projectMap };
}