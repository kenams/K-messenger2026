# Agent-Kah import procedure

Use this when Agent-Kah is back on the machine that contains the local K-ssenger repositories.

## Mobile

```bash
git remote add origin-kssenger https://github.com/kenams/K-messenger2026.git
git push origin-kssenger HEAD:refs/heads/import/mobile-agent-kah
```

## Server

```bash
git remote add origin-kssenger https://github.com/kenams/K-messenger2026.git
git push origin-kssenger HEAD:refs/heads/import/server-agent-kah
```

If the remote name already exists, use another name or update the existing remote. Do not force push `main`.

After both branches exist, compare them against `bootstrap/platform` and integrate the real implementation deliberately. Preserve the local commit history and run secret scans before merge.
