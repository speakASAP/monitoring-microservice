# deploy.config.sh — declaration consumed by shared/scripts/deploy.sh.
# See shared/docs/DEPLOY_STANDARDIZATION_REPORT.md section 6/7 (Phase D) for the design.
# scripts/deploy.sh is still the live, authoritative deploy path.
#
# This service once deployed an entire observability stack (Prometheus,
# Alertmanager, Blackbox-exporter, Node-exporter, kube-state-metrics, Grafana)
# through a preflight hook. That stack was intentionally retired on 2026-08-27
# and its manifest trees no longer exist, so the hooks that applied and
# reloaded it have been removed. Only the monitoring-microservice api+web app
# is deployed now, and it is modeled generically.

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

# rbac.yaml is listed FIRST and ahead of deployment.yaml deliberately: the
# deployment now names serviceAccountName monitoring-microservice, and a pod
# referencing a ServiceAccount that does not exist yet cannot read the
# Kubernetes API. JobWatcher would then sit permanently dormant while the
# service still reported healthy — the precise silent-failure shape this
# service exists to detect. Declared here rather than applied by hand so a
# cluster rebuild cannot quietly drop the identity.
MANIFESTS=(rbac.yaml configmap.yaml external-secret.yaml deployment.yaml service.yaml deployment-web.yaml service-web.yaml ingress.yaml)

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
