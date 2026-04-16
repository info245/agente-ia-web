import { getDefaultAppConfig, mergeAppConfig } from "./appConfig.js";

function normalizeServiceName(value) {
  return String(value || "").trim().toLowerCase();
}

export function getWebsiteFacts(appConfig = null) {
  const merged = mergeAppConfig(appConfig || {});
  return {
    services: merged.services || getDefaultAppConfig().services,
  };
}

export function getServiceFacts(serviceName, appConfig = null) {
  if (!serviceName) return null;

  const services = getWebsiteFacts(appConfig).services || {};
  const matchKey = Object.keys(services).find(
    (key) => normalizeServiceName(key) === normalizeServiceName(serviceName)
  );

  return matchKey ? services[matchKey] : null;
}
