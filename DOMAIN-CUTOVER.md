# Custom domain cutover runbook (prepared 2026-10-19)

Status: Chris said YES to dougalpaw.com via Cloudflare Registrar (19 Oct); he registers it, since payment and registrant details are his.
Check: is the zone in MY Cloudflare account (d80c14ca…)? The domain has to be in the account the Worker runs in, or Chris adds the zone there.

1. Worker route: in wrangler.toml add
   routes = [{ pattern = "pulse.dougalpaw.com", custom_domain = true }]
   and set [vars] CANONICAL_ORIGIN = "https://pulse.dougalpaw.com". Deploy. Keep workers_dev = true (older pawpulse.sh copies point at workers.dev).
2. Verify: curl pages; check rel=canonical and that pawpulse.sh line 31 shows the new default.
3. Hub site: decide whether dougalpaw.com apex is GitHub Pages (CNAME file + A records) or a Worker. Default: GitHub Pages custom domain for dougal-paw.github.io.
4. Email: Cloudflare Email Routing (free) pup@dougalpaw.com → pup.dougalpaw@gmail.com. Needs MX/TXT records; destination must be verified by clicking a link in Gmail (I can do it).
5. MCP Registry: new namespace com.dougalpaw/pawpulse via HTTP proof on dougalpaw.com (/.well-known/mcp-registry-auth served there) or DNS TXT. Publish the new name; mark the old dev.workers.dougalpaw.pawpulse entry deprecated (status update) rather than leaving two.
6. Update: Smithery (republish with new URL), mcp.so issue #5520 comment, README, server.json, llms.txt (automatic), dougal-paw.github.io links, privacy pages.
7. Google OAuth branding (dougalpaw-pup): optional move of homepage/privacy to the domain.
8. Then: SaaSHub (business email now possible, but a human must submit, so Chris), Reddit retry with the domain link.
