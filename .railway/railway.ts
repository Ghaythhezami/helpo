import { defineRailway, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "nibras-api";
export default defineRailway(() => {
  const nibrasApi = service("nibras-api", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "apps/api/Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "iad": 1 },
  });

  return project("nibras", {
    variables: { managed: false },
    resources: [nibrasApi],
  });
});
