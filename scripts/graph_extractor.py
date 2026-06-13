#!/usr/bin/env python3
"""Extract IPS knowledge graph nodes and edges from repository documents.

The extractor is deterministic and dependency-free. It reads Markdown
artifacts, classifies known IPS document types, resolves explicit metadata and
document references, and emits a JSON-compatible graph object.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


CODE_BLOCK_RE = re.compile(r"```(?:yaml|yml)?\s*(.*?)```", re.MULTILINE | re.DOTALL)
FRONT_MATTER_RE = re.compile(r"^---\s*(.*?)^---\s*", re.MULTILINE | re.DOTALL)
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
REFERENCE_RE = re.compile(r"`((?:\.\./|[A-Za-z0-9_./-]+/)[A-Za-z0-9_./#*-]+)`")
TARGET_ID_RE = re.compile(r"\b(?:TASK|EP-TASK|FEAT|SYS|SUB|ADR|MS)-\d+\b")
LOCAL_TOP_LEVEL_DIRS = {
    "00_constitution",
    "01_vision",
    "02_business_case",
    "03_domain_model",
    "04_systems",
    "05_subsystems",
    "06_architecture",
    "07_decisions",
    "08_roadmap",
    "09_milestones",
    "10_features",
    "11_tasks",
    "12_validation",
    "13_context_packages",
    "14_prompts",
    "15_audits",
    "16_operations",
    "17_governance",
    "18_templates",
    "19_examples",
    "20_semantic_compression",
    "21_execution_plans",
    "22_goal_impact",
    "23_documentation_contracts",
    "24_onboarding",
    "graph",
    "scripts",
    "tests",
}

EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    ".venv",
    "node_modules",
    "__pycache__",
    "reports",
    "dist",
    "build",
}


@dataclass(frozen=True)
class Node:
    id: str
    type: str
    path: str


@dataclass(frozen=True)
class Edge:
    from_id: str
    type: str
    to_id: str
    source: str


@dataclass(frozen=True)
class Finding:
    type: str
    path: str
    reference: str
    message: str


@dataclass(frozen=True)
class TraceStep:
    from_id: str
    edge_type: str
    to_id: str
    source: str


@dataclass(frozen=True)
class Document:
    path: Path
    rel: str
    type: str
    node_id: str
    metadata: dict[str, str | list[str]]
    text: str


DOC_TYPE_BY_FOLDER: tuple[tuple[str, str, str], ...] = (
    ("00_constitution", "CONSTITUTION", "Constitution"),
    ("01_vision", "VISION", "Vision"),
    ("02_business_case", "BUSINESS_CASE", "BusinessCase"),
    ("04_systems", "SYS-", "System"),
    ("05_subsystems", "SUB-", "Subsystem"),
    ("06_architecture", "", "ArchitectureDocument"),
    ("07_decisions", "ADR-", "ADR"),
    ("08_roadmap", "ROADMAP", "Roadmap"),
    ("09_milestones", "MS-", "Milestone"),
    ("10_features", "FEAT-", "Feature"),
    ("11_tasks", "TASK-", "Task"),
    ("12_validation", "VAL-", "ValidationReport"),
    ("13_context_packages", "CP-", "ContextPackage"),
    ("14_prompts", "PROMPT-", "CodingPrompt"),
    ("20_semantic_compression/summaries", "", "SemanticSummary"),
    ("20_semantic_compression/ultra", "", "SemanticSummary"),
    ("21_execution_plans", "EP-", "ExecutionPlan"),
    ("22_goal_impact", "GOAL-IMPACT-", "GoalImpact"),
)


def clean_scalar(value: str) -> str:
    return value.strip().strip("\"'")


def metadata_list(value: str | list[str] | None) -> list[str]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        return [value]
    return []


def parse_metadata(text: str) -> dict[str, str | list[str]]:
    candidates: list[str] = []
    front_matter = FRONT_MATTER_RE.search(text)
    if front_matter:
        candidates.append(front_matter.group(1))
    candidates.extend(CODE_BLOCK_RE.findall(text))

    metadata: dict[str, str | list[str]] = {}
    for block in candidates:
        current_key: str | None = None
        for raw_line in block.splitlines():
            line = raw_line.rstrip()
            if not line.strip():
                continue
            list_item = re.match(r"^\s*-\s+(.+?)\s*$", line)
            if list_item and current_key:
                existing = metadata.get(current_key)
                if not isinstance(existing, list):
                    existing = []
                existing.append(clean_scalar(list_item.group(1)))
                metadata[current_key] = existing
                continue
            item = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$", line)
            if item:
                key = item.group(1)
                value = clean_scalar(item.group(2))
                current_key = key
                metadata[key] = [] if value in {"", "[]"} else value
    return metadata


def classify(path: Path, root: Path) -> str | None:
    rel = path.relative_to(root).as_posix()
    name = path.name
    for folder, prefix, doc_type in DOC_TYPE_BY_FOLDER:
        if not rel.startswith(f"{folder}/") and rel != f"{folder}.md":
            continue
        if prefix and not name.startswith(prefix):
            continue
        return doc_type
    return None


def node_id_for(path: Path, doc_type: str, metadata: dict[str, str | list[str]]) -> str:
    value = metadata.get("id")
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list) and value:
        return value[0]
    if doc_type == "Constitution":
        return "CONSTITUTION"
    if doc_type == "Vision":
        return "VISION"
    if doc_type in {"BusinessCase", "Roadmap"}:
        return path.stem
    return path.stem


def should_scan(path: Path, root: Path) -> bool:
    if path.suffix != ".md":
        return False
    rel_parts = path.relative_to(root).parts
    return not bool(EXCLUDED_PARTS.intersection(rel_parts))


def load_documents(root: Path) -> list[Document]:
    documents: list[Document] = []
    for path in sorted(root.rglob("*.md")):
        if not path.is_file() or not should_scan(path, root):
            continue
        doc_type = classify(path, root)
        if doc_type is None:
            continue
        text = path.read_text(encoding="utf-8")
        metadata = parse_metadata(text)
        rel = path.relative_to(root).as_posix()
        documents.append(
            Document(
                path=path,
                rel=rel,
                type=doc_type,
                node_id=node_id_for(path, doc_type, metadata),
                metadata=metadata,
                text=text,
            )
        )
    return documents


def strip_fragment(ref: str) -> str:
    return ref.split("#", 1)[0]


def resolve_reference(root: Path, base_path: Path, ref: str) -> Path | None:
    if ref.startswith(("http://", "https://", "mailto:", "#")) or "*" in ref:
        return None
    clean = strip_fragment(ref)
    if not clean:
        return None
    root_relative = (root / clean).resolve()
    if root_relative.exists():
        return root_relative
    return (base_path.parent / clean).resolve()


def normalize_resolved(root: Path, resolved: Path) -> str | None:
    try:
        return resolved.relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def extract_references(value: str) -> set[str]:
    refs: set[str] = set()
    for match in REFERENCE_RE.finditer(value):
        refs.add(match.group(1))
    for match in MARKDOWN_LINK_RE.finditer(value):
        refs.add(match.group(1))
    return refs


def is_path_like(ref: str) -> bool:
    if ref.startswith(("../", "./", "/")):
        return True
    if ref.endswith((".md", ".py", ".yaml", ".yml", ".json", ".sh")):
        return True
    first = ref.split("/", 1)[0]
    return first in LOCAL_TOP_LEVEL_DIRS


def has_cross_repository_target(doc: Document) -> bool:
    return bool(metadata_list(doc.metadata.get("target_repository")) or metadata_list(doc.metadata.get("target_repositories")))


def should_check_text_reference(doc: Document, ref: str) -> bool:
    if not is_path_like(ref):
        return False
    if has_cross_repository_target(doc) and not ref.startswith(("../", "./", "/")):
        return False
    return True


def resolve_node_id(
    root: Path,
    by_path: dict[str, Document],
    base_path: Path,
    ref: str,
) -> tuple[str | None, str | None]:
    resolved = resolve_reference(root, base_path, ref)
    if resolved is None:
        return None, None
    rel = normalize_resolved(root, resolved)
    if rel is None:
        return None, None
    doc = by_path.get(rel)
    if doc is None:
        return None, rel
    return doc.node_id, rel


def target_ids_from_validation(text: str) -> list[str]:
    ids: list[str] = []
    for line in text.splitlines():
        if not line.lower().startswith("target:"):
            continue
        ids.extend(TARGET_ID_RE.findall(line))
        break
    return sorted(set(ids))


def link_edges_for_metadata(
    root: Path,
    by_path: dict[str, Document],
    doc: Document,
    key: str,
    edge_type: str,
    findings: list[Finding],
) -> list[Edge]:
    edges: list[Edge] = []
    for ref in metadata_list(doc.metadata.get(key)):
        if not is_path_like(ref):
            continue
        to_id, rel = resolve_node_id(root, by_path, doc.path, ref)
        if to_id:
            edges.append(Edge(doc.node_id, edge_type, to_id, f"{doc.rel}:{key}"))
            continue
        if rel:
            findings.append(
                Finding(
                    "missing_reference",
                    doc.rel,
                    ref,
                    f"Reference resolves to {rel}, but no graph node was extracted.",
                )
            )
    return edges


def extract_edges(root: Path, documents: list[Document]) -> tuple[list[Edge], list[Finding]]:
    by_path = {doc.rel: doc for doc in documents}
    by_id = {doc.node_id: doc for doc in documents}
    edges: list[Edge] = []
    findings: list[Finding] = []

    for doc in documents:
        if doc.type == "Task":
            edges.extend(link_edges_for_metadata(root, by_path, doc, "upstream", "derives_from", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "goal_impact", "impacts_goal", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "execution_plan", "decomposes_into", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "validation_report", "validated_by", findings))
        elif doc.type == "ExecutionPlan":
            edges.extend(link_edges_for_metadata(root, by_path, doc, "source_task", "derives_from", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "goal_impact", "impacts_goal", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "coding_prompt", "generates", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "context_package", "included_in_context", findings))
            for key in ("adr", "architecture"):
                edges.extend(link_edges_for_metadata(root, by_path, doc, key, "constrained_by", findings))
        elif doc.type == "CodingPrompt":
            edges.extend(link_edges_for_metadata(root, by_path, doc, "source_task", "derives_from", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "execution_plan", "derives_from", findings))
            edges.extend(link_edges_for_metadata(root, by_path, doc, "context_package", "included_in_context", findings))
        elif doc.type == "GoalImpact":
            edges.extend(link_edges_for_metadata(root, by_path, doc, "artifact_path", "impacts", findings))
            for ref in metadata_list(doc.metadata.get("upstream_links")):
                to_id, rel = resolve_node_id(root, by_path, doc.path, ref)
                if to_id:
                    edges.append(Edge(doc.node_id, "derives_from", to_id, f"{doc.rel}:upstream_links"))
                elif rel:
                    findings.append(
                        Finding(
                            "missing_reference",
                            doc.rel,
                            ref,
                            f"Reference resolves to {rel}, but no graph node was extracted.",
                        )
                    )
        elif doc.type == "ValidationReport":
            for target_id in target_ids_from_validation(doc.text):
                if target_id in by_id:
                    edges.append(Edge(doc.node_id, "validates", target_id, f"{doc.rel}:Target"))
                else:
                    findings.append(
                        Finding(
                            "unresolved_target",
                            doc.rel,
                            target_id,
                            "Validation target does not match an extracted graph node.",
                        )
                    )

        for ref in sorted(extract_references(doc.text)):
            if not should_check_text_reference(doc, ref):
                continue
            resolved = resolve_reference(root, doc.path, ref)
            if resolved is None:
                continue
            rel = normalize_resolved(root, resolved)
            if rel is not None and not resolved.exists():
                findings.append(
                    Finding(
                        "missing_reference",
                        doc.rel,
                        ref,
                        f"Reference resolves to missing path {rel}.",
                    )
                )

    return sorted(set(edges), key=lambda edge: (edge.from_id, edge.type, edge.to_id, edge.source)), sorted(
        set(findings), key=lambda finding: (finding.path, finding.type, finding.reference, finding.message)
    )


def extract_graph(root: Path) -> dict[str, Any]:
    root = root.resolve()
    documents = load_documents(root)
    nodes = sorted(
        (Node(doc.node_id, doc.type, doc.rel) for doc in documents),
        key=lambda node: (node.type, node.id, node.path),
    )
    edges, findings = extract_edges(root, documents)
    return {
        "nodes": [asdict(node) for node in nodes],
        "edges": [
            {
                "from": edge.from_id,
                "type": edge.type,
                "to": edge.to_id,
                "source": edge.source,
            }
            for edge in edges
        ],
        "findings": [asdict(finding) for finding in findings],
    }


def trace_paths(
    graph: dict[str, Any],
    start_id: str,
    target_types: set[str] | None = None,
    max_depth: int = 6,
) -> dict[str, Any]:
    target_types = target_types or {"Goal", "Vision", "VisionGoal"}
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    if start_id not in nodes:
        return {
            "start": start_id,
            "target_types": sorted(target_types),
            "paths": [],
            "findings": [
                {
                    "type": "missing_start_node",
                    "path": "",
                    "reference": start_id,
                    "message": "Trace start node does not exist in extracted graph.",
                }
            ],
        }

    adjacency: dict[str, list[TraceStep]] = {}
    for edge in graph["edges"]:
        step = TraceStep(
            from_id=str(edge["from"]),
            edge_type=str(edge["type"]),
            to_id=str(edge["to"]),
            source=str(edge["source"]),
        )
        adjacency.setdefault(step.from_id, []).append(step)
    for steps in adjacency.values():
        steps.sort(key=lambda step: (step.edge_type, step.to_id, step.source))

    queue: list[tuple[str, list[str], list[TraceStep]]] = [(start_id, [start_id], [])]
    paths: list[dict[str, Any]] = []
    shortest_depth: int | None = None

    while queue:
        current, node_path, edge_path = queue.pop(0)
        depth = len(edge_path)
        if shortest_depth is not None and depth > shortest_depth:
            break
        if depth > max_depth:
            continue
        if current != start_id and str(nodes[current]["type"]) in target_types:
            shortest_depth = depth
            paths.append(
                {
                    "nodes": node_path,
                    "edges": [
                        {
                            "from": step.from_id,
                            "type": step.edge_type,
                            "to": step.to_id,
                            "source": step.source,
                        }
                        for step in edge_path
                    ],
                }
            )
            continue
        for step in adjacency.get(current, []):
            if step.to_id in node_path:
                continue
            queue.append((step.to_id, [*node_path, step.to_id], [*edge_path, step]))

    findings: list[dict[str, str]] = []
    if not paths:
        findings.append(
            {
                "type": "trace_path_not_found",
                "path": "",
                "reference": start_id,
                "message": "No trace path to the requested target node types was found within max depth.",
            }
        )

    return {
        "start": start_id,
        "target_types": sorted(target_types),
        "paths": sorted(paths, key=lambda path: tuple(path["nodes"])),
        "findings": findings,
    }


def detect_orphan_tasks(
    graph: dict[str, Any],
    target_types: set[str] | None = None,
    max_depth: int = 6,
) -> dict[str, Any]:
    target_types = target_types or {"Goal", "Vision", "VisionGoal"}
    task_nodes = sorted(
        (node for node in graph["nodes"] if str(node["type"]) == "Task"),
        key=lambda node: (str(node["id"]), str(node["path"])),
    )
    tasks: list[dict[str, Any]] = []
    orphan_tasks: list[dict[str, Any]] = []
    findings: list[dict[str, str]] = []

    for node in task_nodes:
        task_id = str(node["id"])
        trace = trace_paths(graph, task_id, target_types, max_depth)
        task_result = {
            "id": task_id,
            "path": str(node["path"]),
            "trace_path_count": len(trace["paths"]),
            "is_orphan": not bool(trace["paths"]),
        }
        tasks.append(task_result)
        if trace["paths"]:
            continue
        orphan_tasks.append({"id": task_id, "path": str(node["path"])})
        findings.append(
            {
                "type": "orphan_task",
                "path": str(node["path"]),
                "reference": task_id,
                "message": "Task has no trace path to the requested upstream target node types.",
            }
        )

    return {
        "target_types": sorted(target_types),
        "max_depth": max_depth,
        "tasks": tasks,
        "orphan_tasks": orphan_tasks,
        "findings": findings,
    }


def dependency_map(
    graph: dict[str, Any],
    start_id: str,
    max_depth: int = 2,
) -> dict[str, Any]:
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    if start_id not in nodes:
        return {
            "start": start_id,
            "max_depth": max_depth,
            "nodes": [],
            "edges": [],
            "findings": [
                {
                    "type": "missing_start_node",
                    "path": "",
                    "reference": start_id,
                    "message": "Dependency-map start node does not exist in extracted graph.",
                }
            ],
        }

    outgoing: dict[str, list[TraceStep]] = {}
    incoming: dict[str, list[TraceStep]] = {}
    for edge in graph["edges"]:
        step = TraceStep(
            from_id=str(edge["from"]),
            edge_type=str(edge["type"]),
            to_id=str(edge["to"]),
            source=str(edge["source"]),
        )
        outgoing.setdefault(step.from_id, []).append(step)
        incoming.setdefault(step.to_id, []).append(step)
    for steps in [*outgoing.values(), *incoming.values()]:
        steps.sort(key=lambda step: (step.from_id, step.edge_type, step.to_id, step.source))

    node_directions: dict[str, set[str]] = {start_id: {"start"}}
    node_distances: dict[str, int] = {start_id: 0}
    edge_results: dict[tuple[str, str, str, str, str, int], dict[str, Any]] = {}
    queue: list[tuple[str, str, int, list[str]]] = [
        (start_id, "upstream", 0, [start_id]),
        (start_id, "downstream", 0, [start_id]),
    ]

    while queue:
        current, direction, depth, path = queue.pop(0)
        if depth >= max_depth:
            continue
        steps = outgoing.get(current, []) if direction == "upstream" else incoming.get(current, [])
        for step in steps:
            next_id = step.to_id if direction == "upstream" else step.from_id
            if next_id in path:
                continue
            next_depth = depth + 1
            node_directions.setdefault(next_id, set()).add(direction)
            node_distances[next_id] = min(node_distances.get(next_id, next_depth), next_depth)
            edge_key = (step.from_id, step.edge_type, step.to_id, step.source, direction, next_depth)
            edge_results[edge_key] = {
                "from": step.from_id,
                "type": step.edge_type,
                "to": step.to_id,
                "source": step.source,
                "direction": direction,
                "depth": next_depth,
            }
            queue.append((next_id, direction, next_depth, [*path, next_id]))

    mapped_nodes = [
        {
            "id": node_id,
            "type": str(nodes[node_id]["type"]),
            "path": str(nodes[node_id]["path"]),
            "distance": node_distances[node_id],
            "directions": sorted(node_directions[node_id]),
        }
        for node_id in node_directions
    ]

    return {
        "start": start_id,
        "max_depth": max_depth,
        "nodes": sorted(mapped_nodes, key=lambda node: (node["distance"], node["id"], node["path"])),
        "edges": sorted(edge_results.values(), key=lambda edge: (edge["depth"], edge["direction"], edge["from"], edge["type"], edge["to"], edge["source"])),
        "findings": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract IPS graph nodes and edges from Markdown documents.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output.")
    parser.add_argument("--trace", help="Optional node id to trace to upstream target types.")
    parser.add_argument(
        "--orphan-tasks",
        action="store_true",
        help="Report task nodes that cannot trace to upstream target types.",
    )
    parser.add_argument("--dependency-map", help="Optional node id to generate a bounded dependency map for.")
    parser.add_argument(
        "--target-type",
        action="append",
        dest="target_types",
        help="Target node type for --trace. May be supplied more than once. Defaults to Goal/Vision/VisionGoal.",
    )
    parser.add_argument("--max-depth", type=int, default=6, help="Maximum trace traversal depth.")
    args = parser.parse_args()

    graph = extract_graph(Path(args.root))
    selected_modes = sum(1 for selected in (args.trace, args.orphan_tasks, args.dependency_map) if selected)
    if selected_modes > 1:
        parser.error("--trace, --orphan-tasks and --dependency-map cannot be used together.")
    target_types = set(args.target_types or [])
    if args.trace:
        result = trace_paths(graph, args.trace, target_types, args.max_depth)
    elif args.orphan_tasks:
        result = detect_orphan_tasks(graph, target_types, args.max_depth)
    elif args.dependency_map:
        result = dependency_map(graph, args.dependency_map, args.max_depth)
    else:
        result = graph
    indent = 2 if args.pretty else None
    print(json.dumps(result, indent=indent, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
