# Desktop release hosting

`stack.yaml` provisions an isolated S3 bucket in London (`eu-west-2`) and a CloudFront HTTPS endpoint. It does not modify the match server, networking, DNS, or existing IAM identities. AWS charges for storage and delivery apply.

## Deploy

The London EC2 SSH key cannot provision AWS resources. Use an authenticated AWS CLI profile for account `533797168831` with CloudFormation, S3 and CloudFront deployment permissions. Credentials remain in the standard AWS credential provider; never commit or paste keys here.

```sh
npm run releases:infra -- --profile canopy
npm run releases:infra -- --profile canopy --apply
```

The first command validates without changing resources. The second creates or updates the stack, records non-secret endpoints in `deployment.json`, bootstraps an empty changelog index without overwriting existing objects, and checks HTTPS delivery. The script refuses the wrong AWS account. An intentional deployment to another account requires explicit `--account ACCOUNT_ID`.

## Storage and public paths

The CDN exposes only objects under the bucket's `updates/` prefix:

```text
S3                                  HTTPS
updates/health.json                 /health.json
updates/changelog.json              /changelog.json
updates/stable.json                 /stable.json
updates/releases/0.2.0/changelog.json
updates/releases/0.2.0/<signed updater packages and .sig files>
```

The bucket blocks public access. CloudFront has read-only access through a signed origin request restricted to this distribution. Public clients can download over HTTPS but cannot upload or list the bucket. CORS permits public GET/HEAD reads for changelogs in desktop and browser clients.

S3 versioning preserves overwritten metadata. The bucket is retained if the stack is removed or replaced. Incomplete multipart uploads expire after seven days; published releases do not expire automatically.

## First release and publication contract

Infrastructure deployment does **not** publish a game release or claim the app supports updates. `stable.json` is absent until a signed release exists. The desktop updater plugin, its public signing key, release publisher and changelog UI must be implemented separately.

A release publisher should:

1. Validate the version, changelog, updater packages and signatures locally.
2. Upload packages, signatures and the per-version changelog under `updates/releases/<version>/`. Treat this folder as immutable; use conditional writes to prevent overwrites.
3. Verify every uploaded file and public download before promoting the release.
4. Update `updates/changelog.json`, then write `updates/stable.json` last. The latter must use Tauri's JSON updater format with platform URLs and signatures.

Use `Cache-Control: public, max-age=31536000, immutable` for versioned release files and `public, max-age=60` for the changelog index and stable feed. CloudFront respects these headers; no invalidation is needed for normal publication. Keep updater signing private keys in protected release-build secrets, never in S3 or the app.

Changelog format proposed for the future publisher/UI:

```json
{
  "schemaVersion": 1,
  "version": "0.2.0",
  "publishedAt": "2026-10-05T12:00:00Z",
  "title": "Release title",
  "added": [],
  "improved": [],
  "fixed": [],
  "knownIssues": []
}
```

The index starts as `{"schemaVersion":1,"releases":[]}`. Future entries should contain version, title, publication date and relative changelog URL. Bundle the installed version's changelog in the app for offline viewing; show new-release notes separately. Never render remote changelog text as trusted HTML.
