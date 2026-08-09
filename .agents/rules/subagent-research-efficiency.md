# Subagent Research Efficiency

When delegating research to subagents:

1. **Never instruct subagents to return full file contents.** Subagent
   responses land in the parent's context and bloat it with redundant data.
   The parent can always read files directly with `view_file`.

   **Anti-pattern** (do NOT do this):
   > "Read these 15 files and return ALL contents verbatim"

   **Correct pattern**:
   > "Read these 15 files and report: key types/interfaces, method
   > signatures, patterns used, and anything relevant to [specific task].
   > Include file paths and line numbers so I can view_file directly."

2. **Instruct subagents to analyze and summarize.** Ask for:
   - Key interfaces, types, and method signatures
   - Patterns and conventions observed
   - Answers to specific questions (e.g., "how does X handle Y?")
   - File paths and line numbers for relevant code

3. **Use `view_file` directly** for files you need to read verbatim (e.g.,
   before editing). This is cheaper and doesn't duplicate content.

4. **Reserve subagents for broad surveys.** They're valuable when you need
   to search across many files, correlate patterns, or answer questions
   that require reading 10+ files. But the output should be a concise
   analysis, not a file dump.

5. **Hard cap**: If a subagent response would exceed ~2 KB of code
   snippets, it is too verbose. Summarize further and point to file
   paths instead.
