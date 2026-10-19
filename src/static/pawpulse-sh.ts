export const PAWPULSE_SH = `#!/bin/sh
# pawpulse.sh — tiny heartbeat client for Paw Pulse.
# __ORIGIN__
#
# Probes a local Ollama or OpenAI-compatible server and sends a heartbeat.
# With LLM_KIND=none it skips the probe: a plain "I am alive" heartbeat for
# any box, backup job or cron task.
# POSIX sh, only requires curl. jq is optional (used to pretty-parse JSON);
# falls back to crude grep/sed parsing if jq is absent.
#
# Configure via environment variables (e.g. in your crontab or a systemd
# timer's EnvironmentFile):
#
#   PAWPULSE_URL     Base URL of the Paw Pulse instance (default shown below)
#   PAWPULSE_ID      Monitor id (required)
#   PAWPULSE_TOKEN   Ingest token (required)
#   LLM_BASE_URL     Base URL of the local LLM server (default: http://127.0.0.1:11434 — Ollama)
#   LLM_KIND         "ollama", "openai" or "none" (plain heartbeat, no LLM probe; default: ollama)
#   MEASURE_TPS      "1" to run a tiny generation and measure tokens/sec (default: off)
#   MEASURE_MODEL    Model to use for the tps probe, if enabled
#   PAWPULSE_VERBOSE "1" to print a one-line result (default: only when run in a terminal)
#
# Example crontab line (every 5 minutes):
#   */5 * * * * PAWPULSE_ID=abcd1234 PAWPULSE_TOKEN=secret /usr/local/bin/pawpulse.sh
#
# This script never sends anything about who you are: no hostnames, no IPs,
# no account info. Just ok/fail, model names, and optional timing numbers.

set -eu

PAWPULSE_URL="\${PAWPULSE_URL:-__ORIGIN__}"
LLM_BASE_URL="\${LLM_BASE_URL:-http://127.0.0.1:11434}"
LLM_KIND="\${LLM_KIND:-ollama}"
MEASURE_TPS="\${MEASURE_TPS:-0}"
MEASURE_MODEL="\${MEASURE_MODEL:-}"

if [ -z "\${PAWPULSE_ID:-}" ] || [ -z "\${PAWPULSE_TOKEN:-}" ]; then
  echo "pawpulse.sh: PAWPULSE_ID and PAWPULSE_TOKEN must be set" >&2
  exit 1
fi

# Milliseconds since epoch, or 0 where date lacks %N (BusyBox, macOS).
now_ms() {
  t=\$(date +%s%3N 2>/dev/null) || t=""
  case "\$t" in ''|*[!0-9]*) echo 0 ;; *) echo "\$t" ;; esac
}

HAVE_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAVE_JQ=1
fi

ok="false"
models_json="null"
tps_json="null"
latency_json="null"
note=""

start_ms=\$(now_ms)

if [ "\$LLM_KIND" = "none" ]; then
  ok="true"
elif [ "\$LLM_KIND" = "openai" ]; then
  resp=\$(curl --noproxy "*" -fsS -m 10 "\$LLM_BASE_URL/v1/models" 2>/dev/null) && ok="true" || ok="false"
  if [ "\$ok" = "true" ]; then
    if [ "\$HAVE_JQ" = "1" ]; then
      models_json=\$(printf '%s' "\$resp" | jq -c '[.data[]?.id] // []')
    else
      models_json=$(printf '%s' "\$resp" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"\$/"\\1"/' | paste -sd, - | sed 's/^/[/;s/\$/]/')
      [ -z "\$models_json" ] && models_json="[]"
    fi
  fi
else
  resp=\$(curl --noproxy "*" -fsS -m 10 "\$LLM_BASE_URL/api/tags" 2>/dev/null) && ok="true" || ok="false"
  if [ "\$ok" = "true" ]; then
    if [ "\$HAVE_JQ" = "1" ]; then
      models_json=\$(printf '%s' "\$resp" | jq -c '[.models[]?.name] // []')
    else
      models_json=$(printf '%s' "\$resp" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\\([^"]*\\)"\$/"\\1"/' | paste -sd, - | sed 's/^/[/;s/\$/]/')
      [ -z "\$models_json" ] && models_json="[]"
    fi
  fi
  # /api/ps tells us what's actually loaded right now; best-effort, ignore failures.
  curl --noproxy "*" -fsS -m 5 "\$LLM_BASE_URL/api/ps" >/dev/null 2>&1 || true
fi

end_ms=\$(now_ms)
if [ "\$start_ms" != "0" ] && [ "\$end_ms" != "0" ]; then
  latency_json=\$((end_ms - start_ms))
fi

if [ "\$ok" = "true" ] && [ "\$MEASURE_TPS" = "1" ] && [ -n "\$MEASURE_MODEL" ]; then
  gen_start=\$(now_ms)
  if [ "\$LLM_KIND" = "openai" ]; then
    gen_resp=\$(curl --noproxy "*" -fsS -m 30 "\$LLM_BASE_URL/v1/completions" \\
      -H 'content-type: application/json' \\
      -d "{\\"model\\":\\"\$MEASURE_MODEL\\",\\"prompt\\":\\"hello\\",\\"max_tokens\\":16}" 2>/dev/null || true)
  else
    gen_resp=\$(curl --noproxy "*" -fsS -m 30 "\$LLM_BASE_URL/api/generate" \\
      -H 'content-type: application/json' \\
      -d "{\\"model\\":\\"\$MEASURE_MODEL\\",\\"prompt\\":\\"hello\\",\\"stream\\":false,\\"options\\":{\\"num_predict\\":16}}" 2>/dev/null || true)
  fi
  gen_end=\$(now_ms)
  if [ -n "\$gen_resp" ] && [ "\$HAVE_JQ" = "1" ]; then
    eval_count=\$(printf '%s' "\$gen_resp" | jq -r '.eval_count // empty')
    eval_duration=\$(printf '%s' "\$gen_resp" | jq -r '.eval_duration // empty')
    if [ -n "\$eval_count" ] && [ -n "\$eval_duration" ] && [ "\$eval_duration" != "0" ]; then
      tps_json=\$(awk -v c="\$eval_count" -v d="\$eval_duration" 'BEGIN { printf "%.2f", c / (d/1000000000) }')
    fi
    # OpenAI-compatible servers have no eval timing: use completion tokens over
    # wall-clock time (includes prompt processing, so it reads a little low).
    if [ "\$tps_json" = "null" ] && [ "\$LLM_KIND" = "openai" ]; then
      completion_tokens=\$(printf '%s' "\$gen_resp" | jq -r '.usage.completion_tokens // empty')
      gen_ms=\$((gen_end - gen_start))
      if [ -n "\$completion_tokens" ] && [ "\$completion_tokens" != "0" ] && [ "\$gen_ms" -gt 0 ]; then
        tps_json=\$(awk -v c="\$completion_tokens" -v d="\$gen_ms" 'BEGIN { printf "%.2f", c / (d/1000) }')
      fi
    fi
  fi
fi

body="{\\"ok\\":\$ok,\\"models\\":\$models_json,\\"tokens_per_sec\\":\$tps_json,\\"latency_ms\\":\$latency_json"
if [ -n "\$note" ]; then
  body="\$body,\\"note\\":\\"\$note\\""
fi
body="\$body}"

curl -fsS -m 10 -X POST "\$PAWPULSE_URL/v1/monitors/\$PAWPULSE_ID/beat" \\
  -H "authorization: Bearer \$PAWPULSE_TOKEN" \\
  -H 'content-type: application/json' \\
  -d "\$body" >/dev/null

# One-line summary for humans (terminal, or a log via PAWPULSE_VERBOSE=1).
if [ -t 1 ] || [ "\${PAWPULSE_VERBOSE:-0}" = "1" ]; then
  if [ "\$ok" = "true" ]; then
    first=\$(printf '%s' "\$models_json" | sed 's/^\\[//;s/^"//;s/[]",].*//')
    line="\$(date +%H:%M) ♥ beat ok"
    [ -n "\$first" ] && [ "\$first" != "null" ] && line="\$line  \$first"
    [ "\$tps_json" != "null" ] && line="\$line  \$tps_json tok/s"
  else
    line="\$(date +%H:%M) × beat FAIL  LLM server unreachable"
  fi
  echo "\$line"
fi
`;
