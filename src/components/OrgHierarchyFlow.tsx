import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  type Node,
  type Edge,
  type NodeProps,
  Background,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ManagerRecord } from "../types";
import type { EmployeeProfile } from "../types";
import type { ProjectAssignment } from "../types";
import "./OrgHierarchyFlow.css";

export interface OrgHierarchyFlowProps {
  managers: ManagerRecord[];
  employees: EmployeeProfile[];
  assignments: ProjectAssignment[];
  loading?: boolean;
}

const VERTICAL_GAP = 140;
const HORIZONTAL_GAP = 180;
const CONTENT_PADDING = 48;
const NODE_HEIGHT = 88;
const VIRTUAL_ROOT_ID = "__root__";

/** Deterministic avatar URL for a person (no profile picture). Same seed = same avatar. */
function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

type PersonNodeData = {
  displayName: string;
  position?: string;
  uid: string;
  isManager: boolean;
} & Record<string, unknown>;

type PersonNodeType = Node<PersonNodeData, "person">;

function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const navigate = useNavigate();
  const isManager = data.isManager;
  const isVirtualRoot = data.uid === VIRTUAL_ROOT_ID;
  const positionLabel = data.position ?? (isManager ? "Manager" : "Employee");

  return (
    <div
      className={`org-flow-node org-flow-node--vertical ${isManager ? "org-flow-node--manager" : "org-flow-node--employee"} ${selected ? "org-flow-node--selected" : ""} ${isVirtualRoot ? "org-flow-node--root" : ""}`}
      onClick={() => !isVirtualRoot && navigate(`/admin/people/${data.uid}`)}
      onKeyDown={(e) => !isVirtualRoot && e.key === "Enter" && navigate(`/admin/people/${data.uid}`)}
      role={isVirtualRoot ? "presentation" : "button"}
      tabIndex={isVirtualRoot ? -1 : 0}
    >
      <Handle type="target" position={Position.Top} className="org-flow-handle" />
      <Handle type="source" position={Position.Bottom} className="org-flow-handle" />
      <div className="org-flow-node__circle">
        <img src={getAvatarUrl(data.uid)} alt="" className="org-flow-node__avatar-img" />
      </div>
      <span className="org-flow-node__name">{data.displayName}</span>
      <span className="org-flow-node__role">{positionLabel}</span>
    </div>
  );
}

const nodeTypes = { person: PersonNode };

/** Rank order: higher rank = lower index. Used so top of hierarchy is highest rank and layers flow down. */
const RANK_ORDER = ["Alex Rivera", "Jordan Kim", "Sam Chen", "Taylor Reed", "Jamie Foster"];
function rankIndex(displayName: string): number {
  const i = RANK_ORDER.indexOf(displayName);
  return i >= 0 ? i : RANK_ORDER.length;
}
function sortByRank(a: { displayName?: string }, b: { displayName?: string }): number {
  return rankIndex(a.displayName || "") - rankIndex(b.displayName || "");
}

type TreePerson = { uid: string; displayName: string; position?: string; isManager: boolean };
type TreeNode = { person: TreePerson; children: TreeNode[] };

/** Resolve parent uid for each person. Employees report to manager (managerId); managers optionally report to another manager (reportsTo). Breaks cycles. */
function resolveParents(
  managers: ManagerRecord[],
  employees: EmployeeProfile[]
): Map<string, string | null> {
  const managerSet = new Set(managers.map((m) => m.uid));
  const parent = new Map<string, string | null>();

  managers.forEach((m) => {
    const reportsTo = m.reportsTo && managerSet.has(m.reportsTo) ? m.reportsTo : null;
    parent.set(m.uid, reportsTo);
  });
  employees.forEach((e) => {
    const p = e.managerId && managerSet.has(e.managerId) ? e.managerId : null;
    parent.set(e.uid, p);
  });

  // Break cycles: follow parent chain; if we re-enter a node in the current path, set current node's parent to null
  const inStack = new Set<string>();
  const resolved = new Set<string>();
  function clearCycle(uid: string): void {
    if (resolved.has(uid)) return;
    if (inStack.has(uid)) return;
    inStack.add(uid);
    const p = parent.get(uid) ?? null;
    if (p !== null && p !== "") {
      if (inStack.has(p)) {
        parent.set(uid, null);
      } else {
        clearCycle(p);
      }
    }
    inStack.delete(uid);
    resolved.add(uid);
  }
  managers.forEach((m) => clearCycle(m.uid));
  employees.forEach((e) => clearCycle(e.uid));

  return parent;
}

/** Build tree from all managers and employees. Every person appears exactly once. No cycles. */
function buildTree(
  managers: ManagerRecord[],
  employees: EmployeeProfile[]
): TreeNode[] {
  const managerMap = new Map(managers.map((m) => [m.uid, m]));
  const parent = resolveParents(managers, employees);

  const childrenMap = new Map<string, (ManagerRecord | EmployeeProfile)[]>();
  function ensureList(uid: string): (ManagerRecord | EmployeeProfile)[] {
    let list = childrenMap.get(uid);
    if (!list) {
      list = [];
      childrenMap.set(uid, list);
    }
    return list;
  }

  const allPeople: (ManagerRecord | EmployeeProfile)[] = [...managers, ...employees];
  const rootIds = new Set<string>();

  allPeople.forEach((p) => {
    const pUid = p.uid;
    const par = parent.get(pUid) ?? null;
    if (par == null || par === "") {
      rootIds.add(pUid);
    } else {
      ensureList(par).push(p);
    }
  });

  const sortedManagers = [...managers].sort(sortByRank);
  const managerRoots = sortedManagers.filter((m) => rootIds.has(m.uid));
  const orphanRoots = allPeople.filter((p) => rootIds.has(p.uid) && !managerMap.has(p.uid));
  orphanRoots.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  const rootList: (ManagerRecord | EmployeeProfile)[] =
    managerRoots.length > 0 || orphanRoots.length > 0
      ? [...managerRoots, ...orphanRoots]
      : allPeople.length > 0
        ? [allPeople[0]]
        : [];

  function sortChildren(list: (ManagerRecord | EmployeeProfile)[]): (ManagerRecord | EmployeeProfile)[] {
    const managersHere = list.filter((x): x is ManagerRecord => managerMap.has(x.uid));
    const employeesHere = list.filter((x) => !managerMap.has(x.uid));
    managersHere.sort(sortByRank);
    employeesHere.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    return [...managersHere, ...employeesHere];
  }

  const visited = new Set<string>();
  function toTreeNode(p: ManagerRecord | EmployeeProfile): TreeNode {
    if (visited.has(p.uid)) {
      return { person: { uid: p.uid, displayName: p.displayName, position: p.position, isManager: !!managerMap.get(p.uid) }, children: [] };
    }
    visited.add(p.uid);
    const person: TreePerson = {
      uid: p.uid,
      displayName: p.displayName,
      position: p.position,
      isManager: !!managerMap.get(p.uid),
    };
    const raw = childrenMap.get(p.uid) ?? [];
    const ordered = sortChildren(raw);
    const children = ordered.map((c) => toTreeNode(c));
    return { person, children };
  }

  return rootList.map((r) => toTreeNode(r));
}

function layoutTree(
  tree: TreeNode[],
  assignments: ProjectAssignment[]
): { nodes: Node[]; edges: Edge[]; contentHeight: number; contentWidth: number } {
  const assignmentCount = new Map<string, number>();
  assignments.forEach((a) => {
    const key = `${a.assignedBy}:${a.assignedTo}`;
    assignmentCount.set(key, (assignmentCount.get(key) ?? 0) + 1);
  });

  const xByUid = new Map<string, number>();
  let leafIndex = 0;

  function assignX(node: TreeNode): number {
    if (node.children.length === 0) {
      const x = leafIndex++;
      xByUid.set(node.person.uid, x);
      return x;
    }
    const childX = node.children.map(assignX);
    const x = (Math.min(...childX) + Math.max(...childX)) / 2;
    xByUid.set(node.person.uid, x);
    return x;
  }

  tree.forEach((root) => assignX(root));

  const numLeaves = leafIndex;
  let maxLevel = 0;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function place(node: TreeNode, level: number): void {
    maxLevel = Math.max(maxLevel, level);
    const { person, children } = node;
    const x = xByUid.get(person.uid) ?? 0;
    const px = CONTENT_PADDING + x * HORIZONTAL_GAP;
    const py = CONTENT_PADDING + level * VERTICAL_GAP;
    nodes.push({
      id: person.uid,
      type: "person",
      position: { x: px, y: py },
      data: {
        displayName: person.displayName,
        position: person.position,
        uid: person.uid,
        isManager: person.isManager,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
    children.forEach((child) => {
      place(child, level + 1);
      const count = assignmentCount.get(`${person.uid}:${child.person.uid}`) ?? 0;
      const speedClass = count === 0 ? "org-flow-edge--idle" : count <= 5 ? `org-flow-edge--speed-${count}` : "org-flow-edge--speed-5";
      edges.push({
        id: `${person.uid}-${child.person.uid}`,
        source: person.uid,
        target: child.person.uid,
        type: "smoothstep",
        className: count > 0 ? `org-flow-edge--pulsating ${speedClass}` : speedClass,
        animated: count > 0,
      });
    });
  }

  tree.forEach((root) => place(root, 0));

  const contentWidth = numLeaves > 0 ? CONTENT_PADDING * 2 + (numLeaves - 1) * HORIZONTAL_GAP + 100 : 400;
  const contentHeight = CONTENT_PADDING * 2 + (maxLevel + 1) * VERTICAL_GAP + NODE_HEIGHT;

  return { nodes, edges, contentHeight, contentWidth };
}

function buildFlowData(
  managers: ManagerRecord[],
  employees: EmployeeProfile[],
  assignments: ProjectAssignment[]
): { nodes: Node[]; edges: Edge[]; contentHeight: number; contentWidth: number; rootNodeId: string | null } {
  let tree: TreeNode[];
  if (managers.length === 0) {
    if (employees.length === 0) return { nodes: [], edges: [], contentHeight: 0, contentWidth: 0, rootNodeId: null };
    const virtualRoot: TreePerson = { uid: VIRTUAL_ROOT_ID, displayName: "Organization", position: undefined, isManager: true };
    tree = [
      {
        person: virtualRoot,
        children: employees
          .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))
          .map((e) => ({ person: { uid: e.uid, displayName: e.displayName, position: e.position, isManager: false }, children: [] })),
      },
    ];
  } else {
    tree = buildTree(managers, employees);
  }

  let { nodes, edges, contentHeight, contentWidth } = layoutTree(tree, assignments);
  const placedIds = new Set(nodes.map((n) => n.id));
  const allIds = new Set<string>([
    ...managers.map((m) => m.uid),
    ...employees.map((e) => e.uid),
  ]);
  const firstRootId = tree.length > 0 ? tree[0].person.uid : VIRTUAL_ROOT_ID;
  const missing = [...allIds].filter((id) => !placedIds.has(id) && id !== VIRTUAL_ROOT_ID);

  if (missing.length > 0) {
    const peopleByUid = new Map<string, TreePerson>();
    managers.forEach((m) => peopleByUid.set(m.uid, { uid: m.uid, displayName: m.displayName, position: m.position, isManager: true }));
    employees.forEach((e) => peopleByUid.set(e.uid, { uid: e.uid, displayName: e.displayName, position: e.position, isManager: false }));
    const maxY = Math.max(...nodes.map((n) => n.position.y), 0);
    const rowY = maxY + VERTICAL_GAP;
    missing.forEach((uid, i) => {
      const person = peopleByUid.get(uid);
      if (!person) return;
      const px = CONTENT_PADDING + i * HORIZONTAL_GAP;
      nodes.push({
        id: person.uid,
        type: "person",
        position: { x: px, y: rowY },
        data: {
          displayName: person.displayName,
          position: person.position,
          uid: person.uid,
          isManager: person.isManager,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });
      edges.push({
        id: `${firstRootId}-${person.uid}`,
        source: firstRootId,
        target: person.uid,
        type: "smoothstep",
        className: "org-flow-edge--idle",
      });
    });
    const extraWidth = missing.length * HORIZONTAL_GAP;
    const extraHeight = VERTICAL_GAP + NODE_HEIGHT;
    contentWidth = Math.max(contentWidth, extraWidth + CONTENT_PADDING * 2);
    contentHeight = Math.max(contentHeight, rowY + NODE_HEIGHT + CONTENT_PADDING);
  }

  const rootNodeId = tree.length > 0 ? tree[0].person.uid : null;
  return { nodes, edges, contentHeight, contentWidth, rootNodeId };
}

const VIEWPORT_HEIGHT = 520;
const VIEWPORT_MIN_WIDTH = 400;
const FIT_VIEW_MIN_ZOOM = 0.15;
const FIT_VIEW_MAX_ZOOM = 1;
const FIT_VIEW_PADDING = 0.12;

function OrgHierarchyFlowInner({ managers, employees, assignments, loading }: OrgHierarchyFlowProps) {
  const flowData = useMemo(
    () => buildFlowData(managers, employees, assignments),
    [managers, employees, assignments]
  );
  const { nodes: initialNodes, edges: initialEdges, contentHeight, contentWidth, rootNodeId } = flowData;
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView, getNode, getViewport, setViewport } = useReactFlow();
  const flowWidth = useStore((s) => s.width);
  const flowHeight = useStore((s) => s.height);

  React.useEffect(() => {
    const { nodes: n, edges: e } = buildFlowData(managers, employees, assignments);
    setNodes(n);
    setEdges(e);
  }, [managers, employees, assignments, setNodes, setEdges]);

  const TOP_PADDING = 24;

  React.useEffect(() => {
    if (nodes.length === 0 || !rootNodeId || flowWidth <= 0 || flowHeight <= 0) return;
    const cw = canvasWRef.current;
    const ch = canvasHRef.current;
    const t = setTimeout(() => {
      fitView({
        padding: FIT_VIEW_PADDING,
        minZoom: FIT_VIEW_MIN_ZOOM,
        maxZoom: FIT_VIEW_MAX_ZOOM,
        duration: 180,
      }).then(() => {
        const rootNode = getNode(rootNodeId);
        if (!rootNode) return;
        const viewport = getViewport();
        const { position } = rootNode;
        const w = (rootNode.measured?.width ?? 100) / 2;
        const h = (rootNode.measured?.height ?? NODE_HEIGHT) / 2;
        const rootCenterX = position.x + w;
        const rootCenterY = position.y + h;
        const zoom = viewport.zoom;
        const x = flowWidth / 2 - rootCenterX * zoom;
        const y = TOP_PADDING - rootCenterY * zoom;
        setViewport({ x, y, zoom }, { duration: 0 });
        const scrollContainer = scrollRef.current;
        if (scrollContainer && cw > 0 && ch > 0) {
          scrollContainer.scrollLeft = Math.max(0, Math.min(cw - scrollContainer.clientWidth, cw / 2 - scrollContainer.clientWidth / 2));
          scrollContainer.scrollTop = Math.max(0, Math.min(ch - scrollContainer.clientHeight, 0));
        }
      });
    }, 80);
    return () => clearTimeout(t);
  }, [nodes, fitView, rootNodeId, getNode, getViewport, setViewport, flowWidth, flowHeight]);

  const canvasW = Math.max(VIEWPORT_MIN_WIDTH, contentWidth);
  const canvasH = Math.max(VIEWPORT_HEIGHT, contentHeight);
  const hasPeople = managers.length > 0 || employees.length > 0;

  const translateExtent: [[number, number], [number, number]] = [
    [0, 0],
    [canvasW, canvasH],
  ];

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const canvasWRef = React.useRef(canvasW);
  canvasWRef.current = canvasW;
  const canvasHRef = React.useRef(canvasH);
  canvasHRef.current = canvasH;

  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target;
      if (target instanceof globalThis.Node && canvasRef.current?.contains(target)) {
        e.preventDefault();
      }
    };
    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    return () => scrollEl.removeEventListener("wheel", onWheel);
  }, [hasPeople]);

  return (
    <div className="org-hierarchy-flow">
      {loading ? (
        <div className="org-hierarchy-flow__empty">
          <div className="org-hierarchy-flow__loading">
            <span /><span /><span />
          </div>
        </div>
      ) : !hasPeople ? (
        <div className="org-hierarchy-flow__empty">
          <p className="org-hierarchy-flow__empty-text">No managers or employees yet. Create a manager invite link below to get started.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="org-hierarchy-flow__scroll"
          style={{ height: VIEWPORT_HEIGHT }}
        >
          <div
            ref={canvasRef}
            className="org-hierarchy-flow__canvas"
            style={{ width: canvasW, height: canvasH, minWidth: canvasW, minHeight: canvasH }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              minZoom={FIT_VIEW_MIN_ZOOM}
              maxZoom={FIT_VIEW_MAX_ZOOM}
              translateExtent={translateExtent}
              zoomOnScroll={false}
              zoomOnPinch={false}
              panOnScroll={true}
              panOnDrag={true}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={true}
              proOptions={{ hideAttribution: true }}
              className="org-flow-container org-flow-container--locked"
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              fitView={true}
              fitViewOptions={{
                padding: FIT_VIEW_PADDING,
                minZoom: FIT_VIEW_MIN_ZOOM,
                maxZoom: FIT_VIEW_MAX_ZOOM,
              }}
            >
              <Background gap={16} size={1} color="var(--agenta-border)" />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgHierarchyFlow(props: OrgHierarchyFlowProps) {
  return (
    <ReactFlowProvider>
      <OrgHierarchyFlowInner {...props} />
    </ReactFlowProvider>
  );
}
