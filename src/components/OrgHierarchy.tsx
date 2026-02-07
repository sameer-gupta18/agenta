import React, { useMemo } from "react";
import { motion } from "framer-motion";
import type { ManagerRecord } from "../types";
import type { EmployeeProfile } from "../types";
import type { ProjectAssignment } from "../types";
import "./OrgHierarchy.css";

export interface OrgHierarchyProps {
  managers: ManagerRecord[];
  employees: EmployeeProfile[];
  assignments: ProjectAssignment[];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function OrgHierarchy({ managers, employees, assignments }: OrgHierarchyProps) {
  const { byManager, assignedPairs } = useMemo(() => {
    const byManager: Record<string, EmployeeProfile[]> = {};
    managers.forEach((m) => (byManager[m.uid] = []));
    employees.forEach((e) => {
      if (byManager[e.managerId]) byManager[e.managerId].push(e);
    });
    const assignedPairs = new Set<string>();
    assignments.forEach((a) => assignedPairs.add(`${a.assignedBy}:${a.assignedTo}`));
    return { byManager, assignedPairs };
  }, [managers, employees, assignments]);

  if (managers.length === 0) return null;

  return (
    <div className="org-hierarchy">
      <h3 className="org-hierarchy__title">Team hierarchy</h3>
      <p className="org-hierarchy__subtitle">
        Solid lines = assigned task · Dashed = no current assignment
      </p>
      <div className="org-hierarchy__grid">
        {managers.map((manager, mi) => (
          <motion.div
            key={manager.uid}
            className="org-hierarchy__manager-column"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: mi * 0.08, duration: 0.35 }}
          >
            <div className="org-hierarchy__manager-card">
              <div className="org-hierarchy__avatar org-hierarchy__avatar--manager">
                {getInitials(manager.displayName)}
              </div>
              <div className="org-hierarchy__manager-info">
                <span className="org-hierarchy__name">{manager.displayName}</span>
                <span className="org-hierarchy__role">Manager</span>
                <span className="org-hierarchy__email">{manager.email}</span>
              </div>
            </div>
            <div className="org-hierarchy__wires">
              {(byManager[manager.uid] ?? []).map((emp, ei) => {
                const hasAssignment = assignedPairs.has(`${manager.uid}:${emp.uid}`);
                return (
                  <motion.div
                    key={emp.uid}
                    className="org-hierarchy__wire-row"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + ei * 0.06, duration: 0.3 }}
                  >
                    <div
                      className={`org-hierarchy__wire ${hasAssignment ? "org-hierarchy__wire--assigned" : "org-hierarchy__wire--unassigned"}`}
                      title={hasAssignment ? "Has assignment(s)" : "No current assignment"}
                    >
                      <svg className="org-hierarchy__wire-svg" viewBox="0 0 80 48" preserveAspectRatio="none">
                        <path d="M 0 0 L 40 0 L 40 48 L 80 48" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                    <div className="org-hierarchy__employee-card">
                      <div className="org-hierarchy__avatar org-hierarchy__avatar--employee">
                        {getInitials(emp.displayName)}
                      </div>
                      <div className="org-hierarchy__employee-info">
                        <span className="org-hierarchy__name">{emp.displayName}</span>
                        <span className="org-hierarchy__email">{emp.email}</span>
                        {hasAssignment && (
                          <span className="org-hierarchy__badge">Assigned</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            {(byManager[manager.uid] ?? []).length === 0 && (
              <p className="org-hierarchy__empty">No employees</p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
