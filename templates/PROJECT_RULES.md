# Project Rules Template

## Governance Kit

This project may pin a reusable governance kit version:

```json
{
  "repo": "https://github.com/zhaohernando-code/codex-skills",
  "version": "<commit-or-tag>",
  "install": "scripts/install.sh",
  "required": true
}
```

Project gates must remain executable from this repository's pinned version or from project-local scripts. Do not depend on an unpinned personal machine state.
