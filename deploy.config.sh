# deploy.config.sh — declaration consumed by shared/scripts/deploy.sh.
# See shared/docs/DEPLOY_STANDARDIZATION_REPORT.md section 6/7 (Phase D) for the design.
# scripts/deploy.sh is still the live, authoritative deploy path.
#
# monitoring-microservice's script deploys an entire observability stack
# (Prometheus/Alertmanager/Blackbox-exporter/Node-exporter/kube-state-metrics
# /Grafana), not just the app itself -- those manifest trees are
# infra-specific and modeled as a preflight hook rather than forced into the
# per-service MANIFESTS model. Only the actual monitoring-microservice
# api+web app is modeled generically.

SERVICE_NAME="monitoring-microservice"
WEB_SERVICE_NAME="monitoring-web"
PORT="3395"

IMAGES=(
  "monitoring-microservice|.||"
  "monitoring-web|.|Dockerfile.web|"
)

DEPLOYMENTS=(
  "monitoring-microservice|app|monitoring-microservice"
  "monitoring-web|app|monitoring-web"
)

MANIFESTS=(configmap.yaml external-secret.yaml deployment.yaml service.yaml deployment-web.yaml service-web.yaml ingress.yaml)

_apply_manifest_tree() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  find "$dir" -name '*.yaml' -type f | sort | while read -r manifest; do
    kubectl apply -f "$manifest" -n "$NAMESPACE"
  done
}

deploy_preflight() {
  for stack in prometheus alertmanager blackbox-exporter node-exporter kube-state-metrics grafana; do
    _apply_manifest_tree "$PROJECT_ROOT/k8s/$stack"
  done
}

deploy_post_manifests() {
  local pod
  pod=$(kubectl get pod -n "$NAMESPACE" -l app=prometheus --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [ -z "$pod" ]; then
    echo "WARN Prometheus pod not running; skipping config reload" >&2
    return 0
  fi
  # Reload, don't rollout restart -- Prometheus holds a PVC lock.
  kubectl exec -n "$NAMESPACE" "$pod" -- wget -qO- --post-data='' 'http://127.0.0.1:9090/-/reload' >/dev/null
}

deploy_post_verify() {
  kubectl exec -n "$NAMESPACE" "deploy/${SERVICE_NAME}" -- node -e "
    const http = require('http');
    http.get('http://127.0.0.1:${PORT}/health', (res) => {
      process.exit(res.statusCode === 200 ? 0 : 1);
    }).on('error', () => process.exit(1));
  "
  local count
  count=$(kubectl exec -n "$NAMESPACE" "deploy/${SERVICE_NAME}" -- node -e "
    const { ECOSYSTEM_SERVICES } = require('/app/dist/config/ecosystem-services');
    process.stdout.write(String((ECOSYSTEM_SERVICES || []).length));
  " 2>/dev/null || echo "0")
  if [ "$count" -lt 50 ]; then
    echo "API registry count too low: ${count} (expected 50+)" >&2
    return 1
  fi
}
