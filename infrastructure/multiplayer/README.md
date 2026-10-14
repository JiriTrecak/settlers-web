# Multiplayer HTTPS / WSS

Public lobby API: `https://18.134.138.1/api/health`. Match connections use
`wss://18.134.138.1/match/:id?token=…`. Clients have no plaintext fallback.
macOS transport security remains enabled; do not add ATS exceptions to fix networking.

Nginx terminates TLS on the London EC2 instance and proxies only `/api/` and
`/match/` to MatchHost at **127.0.0.1:8787**. The loopback connection never leaves
the host. Port 80 serves ACME validation and redirects other requests to HTTPS.
The public security group allows 80/443, not 8787. SSH access is unchanged.
Access logging is disabled for HTTPS because WebSocket URLs contain room tokens.

## Routine deployment

Run `npm run server:deploy`. It requires an existing certificate and working
Nginx configuration, deploys `nginx.conf` alongside the service, and verifies both
loopback and public HTTPS health. It does not change AWS firewall rules. Before
restarting, inspect `/api/rooms` for active matches and retain a rollback copy of
the current server files outside `/home/ubuntu/settlers-match`.

Changes to `src/shared/net/endpoint.ts` require rebuilding desktop clients.
Updating the server alone does not alter addresses embedded in downloaded apps.
Local desktop verification uses `npm run build:desktop`; publishing a new version
follows the separate release workflow and requires release intent.

## Certificate provisioning and renewal

AWS account **533797168831**, region **eu-west-2**, instance
**i-00283091b192feab9**, security group **sg-0ae99a69cf8d1d325**.
Validate `aws sts get-caller-identity` before infrastructure changes.

Install Nginx from Ubuntu packages and Certbot from the official `certbot` snap.
Certbot must be at least 5.4 for IP certificates with the webroot authenticator.
The host uses a publicly trusted Let's Encrypt **shortlived** IP certificate,
not a self-signed certificate. Private keys stay under `/etc/letsencrypt` on EC2.

On a new host, first allow inbound TCP 80 and 443, create `/var/www/canopy-acme`,
and configure an HTTP-only Nginx server for `18.134.138.1` serving
`/.well-known/acme-challenge/` from that directory. Do not install the final TLS
configuration until the certificate exists. Verify issuance first by adding
`--dry-run` to the following command, then issue the live certificate:

```sh
sudo /snap/bin/certbot certonly --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --preferred-profile shortlived --webroot \
  --webroot-path /var/www/canopy-acme --ip-address 18.134.138.1 \
  --cert-name canopy-matchhost \
  --deploy-hook 'nginx -t && systemctl reload nginx'
```

Install `nginx.conf` as `/etc/nginx/sites-available/canopy-matchhost` and symlink it
into `sites-enabled`. Run `sudo nginx -t` before reloading. Deploy MatchHost with
its loopback-only service configuration, verify HTTPS/WSS, then revoke public
8787 ingress. No reboot is required.

The Certbot snap installs `snap.certbot.renew.timer`; keep it enabled. IP
certificates last about six days, so renewal is essential. Certbot remembers
the webroot, profile and deployment hook, and reloads Nginx after renewal.
Validate the complete renewal path after setup:

```sh
sudo /snap/bin/certbot renew --cert-name canopy-matchhost --dry-run --run-deploy-hooks
systemctl list-timers snap.certbot.renew.timer
sudo openssl x509 -in /etc/letsencrypt/live/canopy-matchhost/fullchain.pem \
  -noout -dates -ext subjectAltName
curl --fail https://18.134.138.1/api/health
```

Never use `curl -k`, disable certificate checks, or log WebSocket tokens when
verifying. Test actual desktop lobby creation and a second WSS client, not only
command-line HTTP. If the public IP changes, update the endpoint, Nginx config,
and certificate, then ship rebuilt clients.

Reference: [Let's Encrypt IP certificates with Certbot](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).
