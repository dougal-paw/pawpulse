-- GPU offload reporting: share of loaded model weights in VRAM (Ollama /api/ps).
ALTER TABLE beats ADD COLUMN gpu_offload_pct REAL;
ALTER TABLE monitors ADD COLUMN last_gpu_pct REAL;
ALTER TABLE monitors ADD COLUMN min_gpu_pct REAL;
