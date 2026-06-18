# Update Documentation and Fix Markdown Lint

This document tracks changes made to the project's documentation.

## What was done
1. Searched the whole repository to find markdown files containing documentation (`.md` extension).
2. Found many markdown linting errors mostly concerning:
    * Blank line formatting before and after headings or lists.
    * Missing pipes in table borders or malformed tables.
    * Duplicated headings.
    * Missing language specifier tags on markdown fenced codeblocks (`bash`, `text`, etc).
3. Used a lint configuration `.markdownlint.json` to configure the standard style.
4. Used command-line tools to apply correct formatting to markdown files to comply with the standard configuration, specifically `AGENTS.md`, `LESSONS_LEARNED.md`, `README.md`, `supabase/DB_REQUIREMENTS.md`, and `QA_CHECKLIST.md`.
5. Created this document as a summary.

No manual documents explicitly named `Manual` (English/German) were found.
