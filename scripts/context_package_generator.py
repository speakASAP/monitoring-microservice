#!/usr/bin/env python3
"""Generate bounded IPS context packages from task metadata.

The generator is intentionally deterministic and dependency-free. It reads the
task's declared traceability, includes only explicitly linked documents plus
the task itself, and emits a Markdown context package that the strict audit can
validate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
CODE_BLOCK_RE = re.compile(r"```(?:yaml|yml)?\s*(.*?)```", re.MULTILINE | re.DOTALL)
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]{2,}")
OPTIONAL_RETRIEVAL_EXCLUDED_PARTS = {
    ".git",
    ".pytest_cache",
    ".venv",
    "node_modules",
    "__pycache__",
    "reports",
    "dist",
    "build",
}
STOPWORDS = {
    "and",
    "are",
    "can",
    "for",
    "from",
    "has",
    "into",
    "must",
    "not",
    "that",
    "the",
    "this",
    "with",
}
LOCAL_EMBEDDING_DIMENSIONS = 64


@dataclass(frozen=True)
class TaskContext:
    task_id: str
    task_path: Path
    task_rel: str
    title: str
    upstream: list[str]
    goal_impact: list[str]
    execution_plan: list[str]
    validation: list[str]
    acceptance_criteria: str
    required_context: list[str]


@dataclass(frozen=True)
class OptionalSuggestion:
    path: str
    rank: int
    score: int
    retrieval_mode: str
    reason: str
    matched_terms: list[str]
    score_components: dict[str, int]


@dataclass(frozen=True)
class LocalEmbeddingDocument:
    path: str
    title: str
    token_count: int
    vector: list[float]


@dataclass(frozen=True)
class EmbeddingInput:
    body: str
    path: str = ""
    title: str = ""


@dataclass(frozen=True)
class EmbeddingResult:
    vector: list[float]
    token_count: int
    provider: str
    dimensions: int


class EmbeddingProvider(Protocol):
    name: str
    dimensions: int

    def embed(self, item: EmbeddingInput) -> EmbeddingResult:
        """Return a deterministic vector for one text item."""
        ...


def normalize_heading(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def section_body(text: str, heading: str) -> str:
    matches = list(HEADING_RE.finditer(text))
    target = normalize_heading(heading)
    for index, match in enumerate(matches):
        if normalize_heading(match.group(2)) != target:
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        return text[start:end].strip()
    return ""


def parse_metadata(text: str) -> dict[str, str | list[str]]:
    metadata: dict[str, str | list[str]] = {}
    for block in CODE_BLOCK_RE.findall(text):
        current_key: str | None = None
        for raw_line in block.splitlines():
            line = raw_line.rstrip()
            item = re.match(r"^\s*-\s+(.+?)\s*$", line)
            if item and current_key:
                existing = metadata.get(current_key)
                if not isinstance(existing, list):
                    existing = []
                existing.append(clean_scalar(item.group(1)))
                metadata[current_key] = existing
                continue
            key_value = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$", line)
            if key_value:
                key = key_value.group(1)
                current_key = key
                value = clean_scalar(key_value.group(2))
                metadata[key] = [] if value == "[]" else value
    return metadata


def clean_scalar(value: str) -> str:
    return value.strip().strip("\"'")


def metadata_list(value: str | list[str] | None) -> list[str]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        return [value]
    return []


def markdown_list_paths(body: str) -> list[str]:
    paths: list[str] = []
    for match in re.finditer(r"`([^`]+\.md(?:#[^`]*)?)`", body):
        paths.append(match.group(1))
    return paths


def title_from(text: str, fallback: str) -> str:
    match = HEADING_RE.search(text)
    if not match:
        return fallback
    return match.group(2).strip()


def task_path_for(root: Path, task_id: str) -> Path:
    matches = sorted((root / "11_tasks").glob(f"{task_id}*.md"))
    if not matches:
        raise FileNotFoundError(f"No task document found for {task_id}")
    if len(matches) > 1:
        options = ", ".join(path.relative_to(root).as_posix() for path in matches)
        raise ValueError(f"Task id {task_id} is ambiguous: {options}")
    return matches[0]


def load_task_context(root: Path, task_id: str) -> TaskContext:
    task_path = task_path_for(root, task_id)
    text = task_path.read_text(encoding="utf-8")
    metadata = parse_metadata(text)
    task_rel = task_path.relative_to(root).as_posix()
    declared_id = metadata.get("id")
    if isinstance(declared_id, list):
        declared_id = declared_id[0] if declared_id else ""
    resolved_task_id = declared_id or task_id

    required_context = markdown_list_paths(section_body(text, "Required Context"))
    validation_links = metadata_list(metadata.get("validation_report")) + metadata_list(
        metadata.get("validation")
    )
    return TaskContext(
        task_id=resolved_task_id,
        task_path=task_path,
        task_rel=task_rel,
        title=title_from(text, resolved_task_id),
        upstream=metadata_list(metadata.get("upstream")),
        goal_impact=metadata_list(metadata.get("goal_impact")),
        execution_plan=metadata_list(metadata.get("execution_plan")),
        validation=validation_links,
        acceptance_criteria=section_body(text, "Acceptance Criteria"),
        required_context=required_context,
    )


def dedupe(items: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def normalize_rel_from_task(root: Path, task_path: Path, ref: str) -> str:
    if ref.startswith(("http://", "https://", "#")):
        return ref
    clean = ref.split("#", 1)[0]
    resolved = (task_path.parent / clean).resolve()
    try:
        rel = resolved.relative_to(root.resolve()).as_posix()
    except ValueError:
        return ref
    if "#" in ref:
        rel = f"{rel}#{ref.split('#', 1)[1]}"
    return f"../{rel}"


def included_documents(root: Path, task: TaskContext) -> list[str]:
    refs = [
        f"../{task.task_rel}",
        *task.upstream,
        *task.goal_impact,
        *task.execution_plan,
        *task.validation,
        *task.required_context,
    ]
    normalized = [normalize_rel_from_task(root, task.task_path, ref) for ref in refs]
    return dedupe(normalized)


def repository_rel(root: Path, ref: str) -> str:
    clean = ref.removeprefix("../").split("#", 1)[0]
    resolved = (root / clean).resolve()
    try:
        return resolved.relative_to(root.resolve()).as_posix()
    except ValueError:
        return clean


def tokenize(value: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(value.lower()) if token not in STOPWORDS]


def token_bucket(token: str, dimensions: int = LOCAL_EMBEDDING_DIMENSIONS) -> int:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % dimensions


def add_weighted_tokens(vector: list[float], value: str, weight: float) -> int:
    tokens = tokenize(value)
    for token in tokens:
        vector[token_bucket(token, len(vector))] += weight
    return len(tokens)


def local_embedding_vector(
    body: str,
    *,
    path: str = "",
    title: str = "",
    dimensions: int = LOCAL_EMBEDDING_DIMENSIONS,
) -> tuple[list[float], int]:
    vector = [0.0] * dimensions
    token_count = 0
    token_count += add_weighted_tokens(vector, path.replace("/", " "), 2.0)
    token_count += add_weighted_tokens(vector, title, 3.0)
    token_count += add_weighted_tokens(vector, body, 1.0)
    return vector, token_count


class LocalHashEmbeddingProvider:
    name = "local-hash"

    def __init__(self, dimensions: int = LOCAL_EMBEDDING_DIMENSIONS) -> None:
        self.dimensions = dimensions

    def embed(self, item: EmbeddingInput) -> EmbeddingResult:
        vector, token_count = local_embedding_vector(
            item.body,
            path=item.path,
            title=item.title,
            dimensions=self.dimensions,
        )
        return EmbeddingResult(
            vector=vector,
            token_count=token_count,
            provider=self.name,
            dimensions=self.dimensions,
        )


def embedding_provider_for(name: str) -> EmbeddingProvider:
    if name == "local-hash":
        return LocalHashEmbeddingProvider()
    raise ValueError(f"Unsupported embedding provider: {name}")


def cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def query_terms_for(task: TaskContext, query: str | None = None) -> list[str]:
    source = query if query is not None else " ".join(
        [
            task.task_id,
            task.title,
            task.acceptance_criteria,
            " ".join(task.required_context),
        ]
    )
    return sorted(set(tokenize(source)))


def should_scan_optional_document(path: Path, root: Path) -> bool:
    if path.suffix != ".md":
        return False
    rel_parts = path.relative_to(root).parts
    return not bool(OPTIONAL_RETRIEVAL_EXCLUDED_PARTS.intersection(rel_parts))


def optional_document_paths(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.md") if path.is_file() and should_scan_optional_document(path, root))


def required_context_rels(root: Path, task: TaskContext) -> tuple[list[str], set[str]]:
    required_context = included_documents(root, task)
    required_rels = {repository_rel(root, ref) for ref in required_context}
    required_rels.add(task.task_rel)
    return required_context, required_rels


def count_term_matches(value: str, terms: list[str]) -> tuple[int, list[str]]:
    tokens = tokenize(value)
    token_counts = {token: tokens.count(token) for token in set(tokens)}
    matched: list[str] = []
    score = 0
    for term in terms:
        count = token_counts.get(term, 0)
        if count <= 0:
            continue
        matched.append(term)
        score += count
    return score, matched


def score_optional_document(text: str, rel_path: str, terms: list[str]) -> tuple[int, list[str], dict[str, int]]:
    title = title_from(text, rel_path)
    path_score, path_terms = count_term_matches(rel_path.replace("/", " "), terms)
    title_score, title_terms = count_term_matches(title, terms)
    body_score, body_terms = count_term_matches(text, terms)
    score_components = {
        "path": path_score * 2,
        "title": title_score * 3,
        "body": body_score,
    }
    matched = sorted(set(path_terms + title_terms + body_terms))
    return sum(score_components.values()), matched, score_components


def optional_retrieval_report(
    root: Path,
    task_id: str,
    query: str | None = None,
    limit: int = 5,
    min_score: int = 1,
) -> dict[str, Any]:
    root = root.resolve()
    try:
        task = load_task_context(root, task_id)
    except FileNotFoundError:
        return {
            "task_id": task_id,
            "retrieval_mode": "keyword",
            "query_terms": [],
            "required_context": [],
            "optional_suggestions": [],
            "scan_summary": {
                "documents_scanned": 0,
                "required_documents_excluded": 0,
                "candidate_documents": 0,
                "min_score": min_score,
            },
            "findings": [
                {
                    "type": "missing_task",
                    "path": "",
                    "reference": task_id,
                    "message": "Task document was not found for optional retrieval.",
                }
            ],
        }

    required_context, required_rels = required_context_rels(root, task)
    terms = query_terms_for(task, query)

    ranked: list[tuple[int, str, list[str], dict[str, int]]] = []
    documents_scanned = 0
    required_documents_excluded = 0
    for path in optional_document_paths(root):
        rel = path.relative_to(root).as_posix()
        documents_scanned += 1
        if rel in required_rels:
            required_documents_excluded += 1
            continue
        score, matched, score_components = score_optional_document(path.read_text(encoding="utf-8"), rel, terms)
        if score < min_score:
            continue
        ranked.append((score, rel, matched, score_components))

    suggestions = [
        OptionalSuggestion(
            path=rel,
            rank=index,
            score=score,
            retrieval_mode="keyword",
            reason=f"Matched terms: {', '.join(matched[:5])}",
            matched_terms=matched,
            score_components=score_components,
        )
        for index, (score, rel, matched, score_components) in enumerate(
            sorted(ranked, key=lambda item: (-item[0], item[1]))[:limit],
            start=1,
        )
    ]

    findings: list[dict[str, str]] = []
    if not suggestions:
        findings.append(
            {
                "type": "no_optional_suggestions",
                "path": task.task_rel,
                "reference": task.task_id,
                "message": "No optional supporting documents matched the retrieval query.",
            }
        )

    return {
        "task_id": task.task_id,
        "retrieval_mode": "keyword",
        "query_terms": terms,
        "required_context": required_context,
        "optional_suggestions": [asdict(suggestion) for suggestion in suggestions],
        "scan_summary": {
            "documents_scanned": documents_scanned,
            "required_documents_excluded": required_documents_excluded,
            "candidate_documents": len(ranked),
            "min_score": min_score,
        },
        "findings": findings,
    }


def build_local_embedding_index(
    root: Path,
    required_rels: set[str] | None = None,
    provider: EmbeddingProvider | None = None,
) -> tuple[list[LocalEmbeddingDocument], dict[str, int | str]]:
    root = root.resolve()
    required_rels = required_rels or set()
    provider = provider or LocalHashEmbeddingProvider()
    documents: list[LocalEmbeddingDocument] = []
    documents_scanned = 0
    required_documents_excluded = 0
    for path in optional_document_paths(root):
        rel = path.relative_to(root).as_posix()
        documents_scanned += 1
        if rel in required_rels:
            required_documents_excluded += 1
            continue
        text = path.read_text(encoding="utf-8")
        title = title_from(text, rel)
        embedding = provider.embed(EmbeddingInput(body=text, path=rel, title=title))
        documents.append(
            LocalEmbeddingDocument(
                path=rel,
                title=title,
                token_count=embedding.token_count,
                vector=embedding.vector,
            )
        )
    return documents, {
        "provider": provider.name,
        "dimensions": provider.dimensions,
        "documents_scanned": documents_scanned,
        "required_documents_excluded": required_documents_excluded,
        "documents_indexed": len(documents),
    }


def local_embedding_retrieval_report(
    root: Path,
    task_id: str,
    query: str | None = None,
    limit: int = 5,
    min_score: int = 1,
    provider_name: str = "local-hash",
) -> dict[str, Any]:
    root = root.resolve()
    provider = embedding_provider_for(provider_name)
    try:
        task = load_task_context(root, task_id)
    except FileNotFoundError:
        return {
            "task_id": task_id,
            "retrieval_mode": "local-embedding-index",
            "query_terms": [],
            "required_context": [],
            "optional_suggestions": [],
            "embedding_index": {
                "provider": provider.name,
                "dimensions": provider.dimensions,
                "documents_scanned": 0,
                "required_documents_excluded": 0,
                "documents_indexed": 0,
            },
            "scan_summary": {
                "documents_scanned": 0,
                "required_documents_excluded": 0,
                "candidate_documents": 0,
                "min_score": min_score,
            },
            "findings": [
                {
                    "type": "missing_task",
                    "path": "",
                    "reference": task_id,
                    "message": "Task document was not found for local embedding retrieval.",
                }
            ],
        }

    required_context, required_rels = required_context_rels(root, task)
    terms = query_terms_for(task, query)
    query_source = " ".join(terms)
    query_embedding = provider.embed(EmbeddingInput(body=query_source))
    documents, index_summary = build_local_embedding_index(root, required_rels, provider=provider)
    ranked: list[tuple[int, str, list[str], dict[str, int]]] = []
    for document in documents:
        similarity = cosine_similarity(query_embedding.vector, document.vector)
        text = (root / document.path).read_text(encoding="utf-8")
        _, matched = count_term_matches(
            " ".join([document.path.replace("/", " "), document.title, text]),
            terms,
        )
        if not matched:
            continue
        vector_score = int(round(similarity * 10000))
        exact_match_bonus = len(matched) * 1000
        score = vector_score + exact_match_bonus
        if score < min_score:
            continue
        ranked.append(
            (
                score,
                document.path,
                matched,
                {
                    "cosine_similarity_x10000": vector_score,
                    "exact_match_bonus": exact_match_bonus,
                    "indexed_tokens": document.token_count,
                },
            )
        )

    suggestions = [
        OptionalSuggestion(
            path=rel,
            rank=index,
            score=score,
            retrieval_mode="local-embedding-index",
            reason=f"Vector similarity matched query terms: {', '.join(matched[:5]) or 'hashed token vector'}",
            matched_terms=matched,
            score_components=score_components,
        )
        for index, (score, rel, matched, score_components) in enumerate(
            sorted(ranked, key=lambda item: (-item[0], item[1]))[:limit],
            start=1,
        )
    ]

    findings: list[dict[str, str]] = []
    if not suggestions:
        findings.append(
            {
                "type": "no_optional_suggestions",
                "path": task.task_rel,
                "reference": task.task_id,
                "message": "No optional supporting documents matched the local embedding query.",
            }
        )

    return {
        "task_id": task.task_id,
        "retrieval_mode": "local-embedding-index",
        "query_terms": terms,
        "required_context": required_context,
        "optional_suggestions": [asdict(suggestion) for suggestion in suggestions],
        "embedding_index": index_summary,
        "scan_summary": {
            "documents_scanned": index_summary["documents_scanned"],
            "required_documents_excluded": index_summary["required_documents_excluded"],
            "candidate_documents": len(ranked),
            "min_score": min_score,
        },
        "findings": findings,
    }


def normalize_result_path(path: str) -> str:
    return path.removeprefix("../").split("#", 1)[0]


def string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def evaluate_retrieval_baseline(root: Path, baseline_path: Path) -> dict[str, Any]:
    root = root.resolve()
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    raw_cases = baseline.get("cases", []) if isinstance(baseline, dict) else []
    cases: list[dict[str, Any]] = []

    for index, raw_case in enumerate(raw_cases):
        if not isinstance(raw_case, dict):
            continue
        case_id = str(raw_case.get("id") or f"case-{index + 1}")
        task_id = str(raw_case.get("task_id") or "")
        query = raw_case.get("query")
        report = optional_retrieval_report(
            root,
            task_id,
            query=str(query) if query is not None else None,
            limit=int(raw_case.get("limit", 5)),
            min_score=int(raw_case.get("min_score", 1)),
        )
        expected = sorted(normalize_result_path(path) for path in string_list(raw_case.get("expected_optional_paths")))
        returned = sorted(normalize_result_path(str(suggestion["path"])) for suggestion in report["optional_suggestions"])
        expected_findings = sorted(string_list(raw_case.get("expected_findings")))
        actual_findings = sorted(str(finding["type"]) for finding in report["findings"])
        missing = sorted(path for path in expected if path not in returned)
        unexpected = sorted(path for path in returned if path not in expected)
        missing_findings = sorted(finding for finding in expected_findings if finding not in actual_findings)
        passed = not missing and not unexpected and not missing_findings
        cases.append(
            {
                "id": case_id,
                "task_id": task_id,
                "query": report["query_terms"],
                "passed": passed,
                "expected_optional_paths": expected,
                "returned_optional_paths": returned,
                "missing_optional_paths": missing,
                "unexpected_optional_paths": unexpected,
                "expected_findings": expected_findings,
                "actual_findings": actual_findings,
                "missing_findings": missing_findings,
            }
        )

    cases.sort(key=lambda item: str(item["id"]))
    failed_cases = [case for case in cases if not case["passed"]]
    return {
        "baseline_path": baseline_path.as_posix(),
        "retrieval_mode": "keyword",
        "total_cases": len(cases),
        "passed_cases": len(cases) - len(failed_cases),
        "failed_cases": len(failed_cases),
        "cases": cases,
        "findings": [
            {
                "type": "retrieval_baseline_failed",
                "path": baseline_path.as_posix(),
                "reference": str(case["id"]),
                "message": "Retrieval baseline case did not match expected output.",
            }
            for case in failed_cases
        ],
    }


def compare_candidate_retrieval(baseline_path: Path, candidate_path: Path) -> dict[str, Any]:
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    baseline_cases = baseline.get("cases", []) if isinstance(baseline, dict) else []
    candidate_cases = candidate.get("cases", []) if isinstance(candidate, dict) else []
    candidate_by_id = {
        str(case.get("id")): case
        for case in candidate_cases
        if isinstance(case, dict) and case.get("id") is not None
    }
    cases: list[dict[str, Any]] = []

    for index, raw_case in enumerate(baseline_cases):
        if not isinstance(raw_case, dict):
            continue
        case_id = str(raw_case.get("id") or f"case-{index + 1}")
        expected = sorted(normalize_result_path(path) for path in string_list(raw_case.get("expected_optional_paths")))
        candidate_case = candidate_by_id.get(case_id)
        if candidate_case is None:
            cases.append(
                {
                    "id": case_id,
                    "passed": False,
                    "expected_optional_paths": expected,
                    "candidate_optional_paths": [],
                    "missing_expected_paths": expected,
                    "unexpected_candidate_paths": [],
                    "findings": ["missing_candidate_case"],
                }
            )
            continue
        returned = sorted(normalize_result_path(path) for path in string_list(candidate_case.get("returned_optional_paths")))
        missing = sorted(path for path in expected if path not in returned)
        unexpected = sorted(path for path in returned if path not in expected)
        cases.append(
            {
                "id": case_id,
                "passed": not missing and not unexpected,
                "expected_optional_paths": expected,
                "candidate_optional_paths": returned,
                "missing_expected_paths": missing,
                "unexpected_candidate_paths": unexpected,
                "findings": [],
            }
        )

    cases.sort(key=lambda item: str(item["id"]))
    failed_cases = [case for case in cases if not case["passed"]]
    return {
        "baseline_path": baseline_path.as_posix(),
        "candidate_path": candidate_path.as_posix(),
        "baseline_retrieval_mode": "keyword",
        "candidate_retrieval_mode": str(candidate.get("retrieval_mode", "candidate")) if isinstance(candidate, dict) else "candidate",
        "total_cases": len(cases),
        "passed_cases": len(cases) - len(failed_cases),
        "failed_cases": len(failed_cases),
        "cases": cases,
        "findings": [
            {
                "type": "candidate_retrieval_comparison_failed",
                "path": candidate_path.as_posix(),
                "reference": str(case["id"]),
                "message": "Candidate retrieval case did not match baseline expectations.",
            }
            for case in failed_cases
        ],
    }


def generate_candidate_results(
    root: Path,
    baseline_path: Path,
    limit: int = 5,
    min_score: int = 1,
    retrieval_mode: str = "local-semantic-token-overlap",
    embedding_provider: str = "local-hash",
) -> dict[str, Any]:
    root = root.resolve()
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    raw_cases = baseline.get("cases", []) if isinstance(baseline, dict) else []
    cases: list[dict[str, Any]] = []

    for index, raw_case in enumerate(raw_cases):
        if not isinstance(raw_case, dict):
            continue
        case_id = str(raw_case.get("id") or f"case-{index + 1}")
        task_id = str(raw_case.get("task_id") or "")
        query = raw_case.get("query")
        if retrieval_mode == "external-provider-dry-run":
            cases.append(
                {
                    "id": case_id,
                    "task_id": task_id,
                    "returned_optional_paths": [
                        normalize_result_path(path)
                        for path in string_list(raw_case.get("expected_optional_paths"))
                    ],
                    "findings": string_list(raw_case.get("expected_findings")),
                    "dry_run": True,
                }
            )
            continue
        report_kwargs: dict[str, Any] = {
            "query": str(query) if query is not None else None,
            "limit": int(raw_case.get("limit", limit)),
            "min_score": int(raw_case.get("min_score", min_score)),
        }
        if retrieval_mode == "local-embedding-index":
            report = local_embedding_retrieval_report(
                root,
                task_id,
                provider_name=embedding_provider,
                **report_kwargs,
            )
        else:
            report = optional_retrieval_report(root, task_id, **report_kwargs)
        cases.append(
            {
                "id": case_id,
                "task_id": task_id,
                "returned_optional_paths": [
                    normalize_result_path(str(suggestion["path"]))
                    for suggestion in report["optional_suggestions"]
                ],
                "findings": [str(finding["type"]) for finding in report["findings"]],
            }
        )

    result: dict[str, Any] = {
        "retrieval_mode": retrieval_mode,
        "baseline_path": baseline_path.as_posix(),
        "cases": sorted(cases, key=lambda item: str(item["id"])),
    }
    if retrieval_mode == "local-embedding-index":
        result["embedding_provider"] = embedding_provider
    if retrieval_mode == "external-provider-dry-run":
        result["embedding_provider"] = "external-provider-dry-run"
        result["dry_run"] = True
        result["network_calls"] = 0
    return result


def render_context_package(root: Path, task: TaskContext) -> str:
    documents = included_documents(root, task)
    trace_parts = [task.task_id]
    if task.upstream:
        trace_parts = [*task.upstream, task.task_id]
    criteria = task.acceptance_criteria or "[MISSING: define measurable acceptance criteria]"
    document_lines = "\n".join(f"- `{path}`" for path in documents)
    return f"""# Context Package: {task.task_id}

## Target task

{task.task_id}: `../{task.task_rel}`

## Upstream traceability

```text
{" -> ".join(trace_parts)}
```

## Included documents

{document_lines}

## Excluded documents

- Unrelated tasks, execution plans and validation reports are excluded.
- Raw production data, secrets, confidential identifiers and real customer data are excluded.

## Constraints

- Preserve original task scope and upstream traceability.
- Do not modify `../00_constitution/CONSTITUTION.md` or `../01_vision/VISION.md`.
- Use only synthetic or repository-local fixture data.
- Keep generated outputs deterministic and auditable.

## Agent prompt

Implement {task.task_id} using the included documents. Preserve the declared scope, non-goals, acceptance criteria and required gates from the task and execution plan.

## Validation instructions

Acceptance criteria from the source task:

{criteria}

Run the narrowest relevant tests, then run:

```bash
npm run validate
python3 scripts/pre_coding_gate.py --root .
python3 scripts/deployment_readiness_gate.py --root . --target {task.task_id}
```
"""


def output_path_for(root: Path, task_id: str) -> Path:
    suffix = task_id.lower()
    return root / "13_context_packages" / f"CP-{suffix}.md"


def generate(root: Path, task_id: str, output: Path | None = None, force: bool = False) -> Path:
    root = root.resolve()
    task = load_task_context(root, task_id)
    target = output.resolve() if output else output_path_for(root, task.task_id).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Output path must stay inside repository root: {target}") from exc
    if target.exists() and not force:
        raise FileExistsError(f"Refusing to overwrite existing context package: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_context_package(root, task), encoding="utf-8")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate an IPS context package for a task id.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--task", help="Task id, for example TASK-006.")
    parser.add_argument("--output", help="Optional output Markdown path.")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing output file.")
    parser.add_argument(
        "--optional-retrieval",
        action="store_true",
        help="Emit optional keyword retrieval suggestions as JSON instead of generating Markdown.",
    )
    parser.add_argument("--evaluate-retrieval", help="Evaluate optional retrieval against a baseline JSON file.")
    parser.add_argument("--compare-retrieval-candidate", help="Baseline JSON file for candidate retrieval comparison.")
    parser.add_argument("--candidate-results", help="Candidate retrieval result JSON file to compare.")
    parser.add_argument("--generate-candidate-results", help="Generate candidate retrieval results from a baseline JSON file.")
    parser.add_argument(
        "--candidate-mode",
        choices=["local-semantic-token-overlap", "local-embedding-index", "external-provider-dry-run"],
        default="local-semantic-token-overlap",
        help="Candidate retrieval implementation to use with --generate-candidate-results.",
    )
    parser.add_argument(
        "--embedding-provider",
        choices=["local-hash"],
        default="local-hash",
        help="Embedding provider adapter to use with --candidate-mode local-embedding-index.",
    )
    parser.add_argument("--query", help="Optional retrieval query. Defaults to task metadata.")
    parser.add_argument("--limit", type=int, default=5, help="Maximum optional suggestions to return.")
    parser.add_argument("--min-score", type=int, default=1, help="Minimum optional retrieval score.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print optional retrieval JSON.")
    args = parser.parse_args()

    root = Path(args.root)
    output = Path(args.output) if args.output else None
    try:
        if args.evaluate_retrieval:
            report = evaluate_retrieval_baseline(root, Path(args.evaluate_retrieval))
            print(json.dumps(report, indent=2 if args.pretty else None, sort_keys=True))
            return 1 if report["failed_cases"] else 0
        if args.compare_retrieval_candidate:
            if not args.candidate_results:
                parser.error("--candidate-results is required with --compare-retrieval-candidate.")
            report = compare_candidate_retrieval(Path(args.compare_retrieval_candidate), Path(args.candidate_results))
            print(json.dumps(report, indent=2 if args.pretty else None, sort_keys=True))
            return 1 if report["failed_cases"] else 0
        if args.generate_candidate_results:
            report = generate_candidate_results(
                root,
                Path(args.generate_candidate_results),
                limit=args.limit,
                min_score=args.min_score,
                retrieval_mode=args.candidate_mode,
                embedding_provider=args.embedding_provider,
            )
            print(json.dumps(report, indent=2 if args.pretty else None, sort_keys=True))
            return 0
        if not args.task:
            parser.error("--task is required unless --evaluate-retrieval is used.")
        if args.optional_retrieval:
            report = optional_retrieval_report(root, args.task, query=args.query, limit=args.limit, min_score=args.min_score)
            print(json.dumps(report, indent=2 if args.pretty else None, sort_keys=True))
            return 0
        target = generate(root, args.task, output=output, force=args.force)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(target.relative_to(root.resolve()).as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
