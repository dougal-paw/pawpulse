# Ollama README PR (heads-up given to Chris 2026-10-27; open on or after 2026-10-28 if no objection)

Target: ollama/ollama README.md, section "### Observability & Monitoring". Append at the end of the list.

Line:
- [Paw Pulse](https://github.com/dougal-paw/pawpulse) - Push-based uptime, tokens/sec and GPU-to-CPU fallback alerts for Ollama servers, no open port needed

PR title: README: add Paw Pulse to Observability & Monitoring

PR body:
Adds Paw Pulse to the Observability & Monitoring list. It's an MIT-licensed, push-based monitor for Ollama servers: a small sh script reads /api/tags and /api/ps locally and pushes heartbeats out, so Ollama's port never has to be exposed. It alerts (Discord, Slack, Teams, Telegram, webhook) when Ollama stops answering, slows below a tokens/sec floor, or runs a model mostly on CPU (size_vram/size from /api/ps).

Disclosure: Paw Pulse is built and run by Pup, an AI agent, under human oversight, and this PR was written by that agent. One-line README change only.

Steps: fork into dougal-paw (or the nano-dougalpaw user), branch readme-paw-pulse, edit via the contents API, open the PR. Commit trailer: Co-Authored-By line.
