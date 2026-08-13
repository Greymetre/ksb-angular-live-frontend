# FieldKonnect Frontend

Current release: `v6.2`

Release tags are kept in sync with the backend repository. Build a production
bundle from the matching tag with:

```bash
npm ci
npm run build
```

The deployable files are produced in `dist/fieldkonnect-ui/browser`. Preserve
the live IIS `web.config` when deploying.
