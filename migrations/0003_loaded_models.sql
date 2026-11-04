-- Loaded-model reporting: names from Ollama /api/ps, and an optional expected model.
ALTER TABLE beats ADD COLUMN loaded_models TEXT;
ALTER TABLE monitors ADD COLUMN last_loaded_models TEXT;
ALTER TABLE monitors ADD COLUMN expected_model TEXT;
