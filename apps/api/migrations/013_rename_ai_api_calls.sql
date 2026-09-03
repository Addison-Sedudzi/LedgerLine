-- The AI integration switched from Anthropic (Claude) to OpenAI; this table's name no
-- longer describes what it holds. Renamed rather than dropped and recreated so existing
-- token-usage history for cost reporting is preserved.
ALTER TABLE claude_api_calls RENAME TO ai_api_calls;
