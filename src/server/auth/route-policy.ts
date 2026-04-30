export const PUBLIC_ROUTE_PATTERNS = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/witness(.*)",
  "/consultant(.*)",
  "/api/public(.*)",
  "/api/billing/pricing",
  "/api/billing/webhook",
  "/api/health",
] as const;

const PUBLIC_ROUTE_REGEXES = [
  /^\/$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/witness(?:\/.*)?$/,
  /^\/consultant(?:\/.*)?$/,
  /^\/api\/public(?:\/.*)?$/,
  /^\/api\/billing\/pricing$/,
  /^\/api\/billing\/webhook$/,
  /^\/api\/health$/,
];

export function isPublicRoutePath(pathname: string) {
  return PUBLIC_ROUTE_REGEXES.some((regex) => regex.test(pathname));
}
