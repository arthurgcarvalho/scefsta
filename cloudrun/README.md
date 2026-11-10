# Hosting the Dapp on Google Cloud Run

One Cloud Run service runs the whole app from one container
([`../Dockerfile`](../Dockerfile)):

* the Next.js web app (production build), on the service's port;
* the backend API, inside the same container. The web server forwards
  `/backend/*` to it, so the browser uses one address for both.

The hosted app talks to the **Sepolia** contracts listed in
`testnet/deployments.json` and uses the **dev wallet** (no MetaMask): the page
shows an account switcher for the superAdmin, initiator, two transport and
facility test accounts.

## Deploying

Needs the [gcloud CLI](https://cloud.google.com/sdk/docs/install), signed in
(`gcloud auth login`) to an account that can administer the project, and
`testnet/accounts.json`.

```bash
node cloudrun/deploy.js <gcp-project-id> [region] [--public]
```

The script:

1. writes `project_code/.env.production.local` (git-ignored) with the network,
   the API address and the dev-wallet account addresses (no keys);
2. creates a storage bucket `<project>-scefsta-data` for the database, and a
   service identity `scefsta-run` that may use only that bucket and the secret
   below;
3. stores the test accounts' private keys in Secret Manager;
4. on the first deployment for a contract, uploads the local database
   (`backend-api/data/ais-sepolia-<contract>.sqlite`) so the hosted app starts
   with the same users and patients;
5. builds the container in Cloud Build and deploys the service `scefsta`
   (1 GiB memory, at most one instance, scales to zero when idle).

It can be run again at any time to publish a new version; the database in the
bucket is kept.

## Who can open it

Deploying again without `--public` never changes who can open the service.

* **A new service deployed without `--public`** can be reached only by Google
  accounts with the *Cloud Run Invoker* role on it. The simplest way to use it
  from your own computer is a local tunnel that signs you in:

  ```bash
  gcloud run services proxy scefsta --project <gcp-project-id> --region <region> --port 8080
  ```

  and then open http://localhost:8080.

* **With `--public`** anyone who has the address can open it. To switch an
  existing deployment without rebuilding:

  ```bash
  gcloud run services add-iam-policy-binding scefsta --project <gcp-project-id> --region <region> --member=allUsers --role=roles/run.invoker
  ```

  and to close it again, the same command with `remove-iam-policy-binding`.

> **Before making it public:** the private keys are not in the page (see
> "The test accounts' keys" below), but with the dev wallet anyone who opens
> the public address can still *use* the five test accounts through the app:
> post, bid on and settle tenders, and, as superAdmin, add or remove role
> accounts on the Sepolia contracts. Each transaction can carry at most 0.01
> ETH and can only go to the two contracts, but a determined visitor could
> still move the accounts' test ETH out through tenders. Do this only with
> accounts that hold nothing of value. The image adds a `robots.txt` that asks
> search engines not to index the site, which hides it from casual discovery
> but protects nothing.

## The test accounts' keys

The deploy script stores the keys from `testnet/accounts.json` in Secret
Manager (secret `scefsta-dev-wallet-keys`), readable only by the service's
identity, and Cloud Run hands them to the backend API as the `DEV_WALLET_KEYS`
environment variable. The page gets only the account addresses. When a user
does something that needs a transaction, the page's dev wallet sends it to the
backend (`/backend/api/dev-wallet/send`), which signs and broadcasts it
(`backend-api/devWallet.js`). The backend refuses anything that is not a call
to this deployment's Accounts or Auctions contract, anything carrying more than
`DEV_WALLET_MAX_VALUE_WEI` (default 0.01 ETH), and message signing.

To replace the keys, change `testnet/accounts.json` and deploy again; the
script adds a new secret version when the keys differ.

## The database

Cloud Run containers lose their disk when they stop, so the backend keeps the
SQLite file on local disk and copies it to the bucket (mounted at `/mnt/db`)
after every change, and restores it from there when the container starts
(`SQLITE_BACKUP_DIR`, see `backend-api/db.js`). This is why the service is
limited to one instance. The file is named after the Auctions contract, so
redeploying the contracts starts a fresh database.

To look at or replace the hosted database:

```bash
gcloud storage ls gs://<gcp-project-id>-scefsta-data
```

## Running the hosted build locally

```bash
node testnet/app-env.js sepolia --dev-wallet
node cloudrun/deploy.js --env-only
cd project_code
API_PROXY_TARGET=http://127.0.0.1:5001 NODE_OPTIONS=--openssl-legacy-provider npm run build
cd ..
node cloudrun/start.js
```

then open http://localhost:8080. (`next dev` ignores `.env.production.local`,
so the normal local setup in `testnet/README.md` is unaffected. Delete
`project_code/.next` before going back to `npm run dev`.)
