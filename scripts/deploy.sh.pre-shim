#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVICE_NAME="monitoring-microservice"
WEB_SERVICE_NAME="monitoring-web"
NAMESPACE="${NAMESPACE:-statex-apps}"
K8S_DIR="$PROJECT_ROOT/k8s"
REGISTRY="localhost:5000"
API_PORT="${PORT:-3395}"
WEB_PORT="${FRONTEND_PORT:-3396}"

# Tag describes the WORKING TREE that is actually built, not just git HEAD:
# a tag derived from HEAD alone repeats itself when files changed without a
# commit, which makes `kubectl set image` a no-op and silently keeps the old
# image running.
compute_default_tag() {
  local head dirty root
  root="${PROJECT_ROOT:-$(pwd)}"
  head="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || true)"
  if [ -z "$head" ]; then
    echo "build-$(date -u +%Y%m%d%H%M%S)"
    return
  fi
  dirty="$(git -C "$root" status --porcelain 2>/dev/null || true)"
  if [ -n "$dirty" ]; then
    echo "${head}-wt$(date -u +%Y%m%d%H%M%S)"
  else
    echo "$head"
  fi
}

DEFAULT_TAG="$(compute_default_tag)"
IMAGE_TAG="${1:-$DEFAULT_TAG}"
API_IMAGE="${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}"
API_IMAGE_LATEST="${REGISTRY}/${SERVICE_NAME}:latest"
WEB_IMAGE="${REGISTRY}/${WEB_SERVICE_NAME}:${IMAGE_TAG}"
WEB_IMAGE_LATEST="${REGISTRY}/${WEB_SERVICE_NAME}:latest"

if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

# shellcheck disable=SC1091
source "$(dirname "$PROJECT_ROOT")/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" 2>/dev/null \
  || source "$HOME/Documents/Github/shared/scripts/load-deploy-phase-timing.sh" "$PROJECT_ROOT" \
  || { echo -e "${RED}Error: deploy timing library not found${NC}" >&2; exit 1; }
deploy_timing_init "$SERVICE_NAME"

preflight_checks() {
  echo -e "${YELLOW}Preflight: checking Kubernetes...${NC}"
  if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${RED}Namespace not found: $NAMESPACE${NC}"
    exit 1
  fi
  if ! kubectl get nodes >/dev/null 2>&1; then
    echo -e "${RED}kubectl cannot reach cluster${NC}"
    exit 1
  fi
  echo -e "${GREEN}Preflight passed${NC}"
}

apply_manifest_tree() {
  local dir="$1"
  find "$dir" -name '*.yaml' -type f | sort | while read -r manifest; do
    kubectl apply -f "$manifest" -n "$NAMESPACE"
  done
}

reload_prometheus_config() {
  local pod
  pod="$(kubectl get pod -n "$NAMESPACE" -l app=prometheus --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -z "$pod" ]; then
    echo -e "${YELLOW}WARN Prometheus pod not running; skipping config reload${NC}"
    return 0
  fi
  echo -e "${YELLOW}Reloading Prometheus config (do not rollout restart — PVC lock)...${NC}"
  kubectl exec -n "$NAMESPACE" "$pod" -- wget -qO- --post-data='' 'http://127.0.0.1:9090/-/reload' >/dev/null
  echo -e "${GREEN}OK Prometheus config reloaded${NC}"
}

verify_api_registry() {
  local count
  count="$(kubectl exec -n "$NAMESPACE" deploy/"$SERVICE_NAME" -- node -e "
    const { ECOSYSTEM_SERVICES } = require('/app/dist/config/ecosystem-services');
    process.stdout.write(String((ECOSYSTEM_SERVICES || []).length));
  " 2>/dev/null || echo "0")"
  if [ "$count" -lt 50 ]; then
    echo -e "${RED}API registry count too low: ${count} (expected 50+)${NC}"
    echo -e "${RED}Rebuild/redeploy API image after editing src/config/ecosystem-services.ts${NC}"
    exit 1
  fi
  echo -e "${GREEN}OK API registry: ${count} services${NC}"
}

api_health_check() {
  kubectl exec -n "$NAMESPACE" deploy/"$SERVICE_NAME" -- node -e "
    const http = require('http');
    http.get('http://127.0.0.1:${API_PORT}/health', (res) => {
      process.exit(res.statusCode === 200 ? 0 : 1);
    }).on('error', () => process.exit(1));
  "
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    monitoring-microservice - Kubernetes Deployment     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"

if [ ! -d "$K8S_DIR" ]; then
  echo -e "${RED}Missing k8s directory: $K8S_DIR${NC}"
  exit 1
fi

deploy_timing_run_phase "Preflight" preflight_checks

# No git fetch/pull/stash here on purpose: the deploy ships exactly the code
# in $PROJECT_ROOT. Pulling would replace the tree being tested with origin.

deploy_timing_phase_start "Build API image"
docker build -t "$API_IMAGE" -t "$API_IMAGE_LATEST" "$PROJECT_ROOT"
deploy_timing_phase_end "Build API image"

deploy_timing_phase_start "Build web image"
docker build -f "$PROJECT_ROOT/Dockerfile.web" -t "$WEB_IMAGE" -t "$WEB_IMAGE_LATEST" "$PROJECT_ROOT"
deploy_timing_phase_end "Build web image"

deploy_timing_phase_start "Push images"
docker push "$API_IMAGE"
docker push "$API_IMAGE_LATEST"
docker push "$WEB_IMAGE"
docker push "$WEB_IMAGE_LATEST"
deploy_timing_phase_end "Push images"

deploy_timing_phase_start "Apply monitoring stack manifests"
apply_manifest_tree "$K8S_DIR/prometheus"
apply_manifest_tree "$K8S_DIR/alertmanager"
apply_manifest_tree "$K8S_DIR/blackbox-exporter"
apply_manifest_tree "$K8S_DIR/node-exporter"
apply_manifest_tree "$K8S_DIR/kube-state-metrics"
apply_manifest_tree "$K8S_DIR/loki"
apply_manifest_tree "$K8S_DIR/grafana"
deploy_timing_phase_end "Apply monitoring stack manifests"

deploy_timing_phase_start "Apply API and web manifests"
for manifest in configmap.yaml external-secret.yaml deployment.yaml service.yaml deployment-web.yaml service-web.yaml ingress.yaml; do
  [ -f "$K8S_DIR/$manifest" ] && kubectl apply -f "$K8S_DIR/$manifest" -n "$NAMESPACE"
done
deploy_timing_phase_end "Apply API and web manifests"

deploy_timing_phase_start "Reload Prometheus scrape config"
reload_prometheus_config
deploy_timing_phase_end "Reload Prometheus scrape config"

deploy_timing_phase_start "Update deployment images"
kubectl set image "deployment/${SERVICE_NAME}" app="$API_IMAGE" -n "$NAMESPACE"
kubectl set image "deployment/${WEB_SERVICE_NAME}" app="$WEB_IMAGE" -n "$NAMESPACE"
deploy_timing_phase_end "Update deployment images"

deploy_timing_phase_start "Wait for API rollout"
deploy_timing_k8s_rollout_wait kubectl "$SERVICE_NAME" "$NAMESPACE"
deploy_timing_phase_end "Wait for API rollout"

deploy_timing_phase_start "Wait for web rollout"
deploy_timing_k8s_rollout_wait kubectl "$WEB_SERVICE_NAME" "$NAMESPACE"
deploy_timing_phase_end "Wait for web rollout"

deploy_timing_phase_start "Health and registry verification"
api_health_check
verify_api_registry
deploy_timing_phase_end "Health and registry verification"

deploy_timing_finish_success "$SERVICE_NAME"
echo -e "${GREEN}Dashboard: https://monitoring.alfares.cz${NC}"
echo -e "${GREEN}Grafana:   https://grafana.alfares.cz${NC}"
DEPLOY_TIMING_FINISHED=1
exit 0
