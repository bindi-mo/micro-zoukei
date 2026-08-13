## Commit Message Instructions

When asked to create a commit message, follow this process:

1. Even if the request is written in Japanese, always output the commit message in English.
2. Inspect staged changes only.
3. Identify the main purpose of the change set.
4. Write an English Conventional Commit subject line:
   - Format: `<type>: <summary>`
   - Prefer `feat` for new behavior, `fix` for bug fixes, `refactor` for internal restructuring.
5. Keep the subject concise and under 60 characters when possible.
6. Add a short body as bullet points that map directly to the staged diff:
   - architecture or pipeline changes
   - validation or contract changes
   - fallback or error-handling changes
   - metrics, stats, or logging changes
   - related cleanup and simplification
7. Use imperative verbs such as: replace, add, remove, simplify, switch.
8. Avoid vague wording and avoid listing unrelated file-by-file noise.
9. Summarize related changes into 1-3 key points instead of listing every modification.
10. Do not include unstaged or untracked changes.
11. Keep each bullet to one short clause, ideally under 12 words.
12. Avoid filler words and adjectives (e.g., "robust", "comprehensive", "various").
13. If the change is small or single-purpose (e.g., content additions), output subject only (no body).

Output format:

<subject>

- <key change 1>
- <key change 2>
- <key change 3>

If small change:

<subject>

Note:
- Prefer grouped, high-signal bullets over exhaustive change lists.
- Target output length: 2-4 lines total.
- Even if many files are affected, if the purpose is single (e.g., adding documentation for one update), keep it concise.
