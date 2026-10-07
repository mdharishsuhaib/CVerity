import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache needed: every page is either static or rendered on the client.
export default defineCloudflareConfig({});
