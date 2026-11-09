# Deployment Guide (Azure)

This guide explains how PARKEA is published on the internet and how to publish a new version. Run every command in **Git Bash** unless a step says otherwise.

## Live URLs

| Part | URL |
|---|---|
| Web app (frontend) | https://parkea-web-sena-gcf8d5ggfcdncyam.chilecentral-01.azurewebsites.net |
| API (backend) | https://parkea-api-sena-c2bjcbhqg7f3epfz.chilecentral-01.azurewebsites.net/api |
| Health check | https://parkea-api-sena-c2bjcbhqg7f3epfz.chilecentral-01.azurewebsites.net/api/health |

## How it is built

All the resources live in the **Azure for Students** subscription, in the resource group `parkea-rg`, region **Chile Central**.

| Resource | Name | Plan | What it does |
|---|---|---|---|
| Azure Database for MySQL (flexible server) | `parkea-db-sena` | Burstable B1ms, 20 GiB, MySQL 8.4 | Database `parkea_db` (utf8mb4) |
| App Service plan | `parkea-plan` | Free F1, Linux | Runs both apps below |
| App Service (web app) | `parkea-api-sena` | Node 22 LTS | Backend (Express API) |
| App Service (web app) | `parkea-web-sena` | Node 22 LTS | Frontend (React build served with PM2) |

Notes:

- The subscription only allows these regions: North Central US, West US, Canada Central, Chile Central and France Central. The MySQL server could not be created in North Central US, so everything was created in Chile Central, the closest allowed region to Colombia.
- Azure Static Web Apps is not available in any of the allowed regions, so the frontend runs as a second web app on the same free plan.
- **Azure is not connected to GitHub.** Pushing to a branch does not change the live site. The site only changes when someone runs the deploy steps below.

## What runs where

- The live site runs the code of the branch that was last deployed. For Sprint 2 that is `integration/sprint-2`.
- App changes follow the normal flow: personal branch, PR to `frontend` or `backend`, review, merge. To publish them, merge `frontend` and `backend` into the branch you deploy from, then deploy.
- Changes that only matter for the hosted version (for example the encrypted database connection in `backend/src/config/config.js`) go directly to the branch you deploy from.

## Prerequisites

1. Access to the Azure subscription that owns `parkea-rg`.
2. Node 22 and the repository cloned, with `npm ci` run in `backend` and `frontend`.
3. Azure CLI. Install it from PowerShell:

   ```
   winget install -e --id Microsoft.AzureCLI
   ```

   Then close VS Code completely and open it again, and check it in Git Bash:

   ```
   az version
   ```

4. Sign in (a window or the browser opens; pick the account of the subscription, then choose **Azure for Students**):

   ```
   az login
   ```

   If the sign-in window never appears, use `az login --use-device-code`.

## Environment variables

They are set in the Azure portal: web app, **Settings > Environment variables > App settings**. Values are never stored in the repository.

After adding or editing a variable, click **Apply** in the small panel and then **Apply** again at the bottom of the list, and confirm. If the second Apply is skipped, the change is not saved.

### Backend (`parkea-api-sena`)

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://parkeaadmin:<password>@parkea-db-sena.mysql.database.azure.com:3306/parkea_db` |
| `JWT_SECRET` | A long random value, different from any local one |
| `JWT_EXPIRES_IN` | `1h` |
| `FRONTEND_URL` | The web app URL, with `https://` and without a trailing `/` |
| `MAILTRAP_HOST` | `smtp.resend.com` (see [Email (Resend)](#email-resend)) |
| `MAILTRAP_PORT` | `587` |
| `MAILTRAP_USER` | `resend` |
| `MAILTRAP_PASS` | The Resend API key. It exists only here. |
| `MAIL_FROM` | `no-reply@parkeaweb.me` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` (Azure runs `npm install` on Linux; required by `bcrypt`) |

Do not set `PORT`; Azure provides it.

To create a new `JWT_SECRET`:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`parkea-web-sena`)

The frontend has no variables in Azure. The API address is written into the build, from the file `frontend/.env.production.local` on the computer that builds it. That file is ignored by Git.

The web app has this **startup command** (Settings > Configuration > General settings):

```
pm2 serve /home/site/wwwroot --no-daemon --spa
```

`--spa` returns `index.html` for any route, so reloading a page like `/zones` works.

## Deploy the backend

From the repository root, on the branch you deploy from:

1. Make sure everything is committed. Only committed files are deployed.

   ```
   git status
   ```

2. Package the `backend` folder. The zip is created outside the repository and includes neither `node_modules` nor `.env`.

   ```
   git archive --format=zip -o ../parkea-backend.zip HEAD:backend
   ```

3. Upload it. It takes a few minutes: Azure runs `npm install` and restarts the API.

   ```
   az webapp deploy --resource-group parkea-rg --name parkea-api-sena --src-path ../parkea-backend.zip --type zip
   ```

4. Open the health check URL. It must answer `{"status":"ok","service":"PARKEA API"}`.

## Deploy the frontend

If the backend also changed, deploy the backend first.

1. Point the build at the hosted API (only needed once per computer):

   ```
   echo "VITE_API_URL=https://parkea-api-sena-c2bjcbhqg7f3epfz.chilecentral-01.azurewebsites.net/api" > frontend/.env.production.local
   ```

2. Build:

   ```
   cd frontend
   ```

   ```
   npm run build
   ```

3. Package the `dist` folder with the Windows `tar`, which can create zip files:

   ```
   cd dist
   ```

   ```
   /c/Windows/System32/tar.exe -a -c -f ../../../parkea-frontend.zip *
   ```

4. Go back to the root and upload it:

   ```
   cd ../..
   ```

   ```
   az webapp deploy --resource-group parkea-rg --name parkea-web-sena --src-path ../parkea-frontend.zip --type zip
   ```

5. Open the web app URL and reload with Ctrl + F5.

## Database changes (migrations and seeders)

New migrations must be run on the hosted database before (or right after) deploying the backend that needs them. From the repository root:

```
cd backend
```

```
export DATABASE_URL='mysql://parkeaadmin:<password>@parkea-db-sena.mysql.database.azure.com:3306/parkea_db'
```

```
npx sequelize-cli db:migrate --env production
```

Only on an empty database, load the initial data:

```
npx sequelize-cli db:seed:all --env production
```

Always finish with:

```
unset DATABASE_URL
```

The database firewall only accepts the IP addresses listed in **parkea-db-sena > Networking**. If the commands fail with `ETIMEDOUT` or `ECONNREFUSED`, add your current IP there with **Add current client IP address** and save.

The hosted database is separate from everyone's local database. Everything done on the live site stays there.

## Email (Resend)

Password recovery emails reach real inboxes through [Resend](https://resend.com). The code still reads the `MAILTRAP_*` names, so on our own computers those settings keep pointing to the Mailtrap sandbox and nothing changes there.

Resend only sends from a domain verified in its account, so PARKEA has its own domain just for email.

| Item | Value |
|---|---|
| Domain | `parkeaweb.me`, registered on Namecheap in Marín's account |
| Domain expiry | **November 6, 2027**. Automatic renewal is off; renewing is paid. |
| Resend account | Marín's, free plan: 100 emails a day and 3,000 a month |
| Resend region | São Paulo (`sa-east-1`) |
| Sender | `PARKEA <no-reply@parkeaweb.me>` |
| Click and open tracking | Off, so the recovery link is never rewritten |
| Receiving | Off. PARKEA only sends emails. |

### DNS records

They are in Namecheap: **Domain List > parkeaweb.me > Manage > Advanced DNS**. In the Host column Namecheap expects only the prefix, never the full domain.

| Type | Host | Value | Purpose |
|---|---|---|---|
| TXT | `resend._domainkey` | The long `p=...` value shown in Resend > Domains > parkeaweb.me | DKIM: proves the emails come from this domain |
| CNAME | `send` | `send.forge.rmta.net.` | SPF and return path |
| CNAME | `rsend` | `rsend-sae1.forge.rmta.net.` | SPF and return path |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC: helps the emails stay out of spam |

The four `A` records of `@` (185.199.108.153 to 185.199.111.153) and the `CNAME` of `www` point to GitHub Pages. Namecheap added them when the domain was registered; they are not used and do not affect email.

If Resend ever shows the domain as not verified, compare these records with the ones on its domain page.

### API key

Create it in Resend, **API keys > Create API key**, with **Sending access** and only the domain `parkeaweb.me`. Paste it straight into `MAILTRAP_PASS` in Azure and nowhere else: not in the repository, not in a chat, not in a file. Resend shows it only once; if it is lost, delete it in Resend and create a new one.

### Check that it works

1. On the live site, open **¿Olvidaste tu contraseña?** and enter the email of a real account.
2. Within a minute an email from **PARKEA** arrives (check the spam folder too), and its link opens the reset page of the live site.
3. Resend > **Emails** lists every email sent.

The page always answers with the same message, whether the account exists or not and whether the email could be sent or not. If the email does not arrive, read the API log (see Troubleshooting) and look for `Could not send the recovery email`.

### Switch back to Mailtrap

If Resend fails, the daily limit runs out or the domain expires, the site keeps working with Mailtrap without changing any code:

1. In `parkea-api-sena`, set `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER` and `MAILTRAP_PASS` back to the Mailtrap sandbox values. `MAIL_FROM` can stay as it is: Mailtrap accepts any sender.
2. Click Apply twice. The API restarts by itself; no deploy is needed.

From then on the emails go to the Mailtrap inbox instead of real inboxes. To go back to Resend, set the values of the backend table in Environment variables again.

## Free tier behavior and costs

- The free plan sleeps after about 20 minutes without visits. The first visit after that takes 30 to 60 seconds; then it works normally.
- Each app has a daily CPU quota (60 minutes). Normal use is far below it. Do not run load tests on the live site: if the quota runs out, the app stops until the next day.
- Cost today is 0: the apps use the Free F1 plan, and the MySQL server (B1ms, 20 GiB) is covered by the student offer of 750 hours per month for 12 months. The subscription has no credit card, so it can never charge money; if the 100 USD credit ran out, Azure would stop the services.
- A custom domain is not possible on the Free F1 plan; it requires the Basic B1 plan, which is paid with the credit.

To stop or start an app: web app, **Overview**, **Stop** or **Start**.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Login shows "Ocurrió un error inesperado" and the browser console says "blocked by CORS policy" | `FRONTEND_URL` in the backend is missing or different from the web app URL. Fix it and click Apply twice. |
| `az: command not found` | VS Code was open while Azure CLI was installed. Close VS Code completely, or restart the computer. |
| Migrations fail with `ETIMEDOUT` | Your IP is not in the database firewall. See Database changes. |
| Creating a resource fails with "policy violation" | The region is not allowed. Use one of the allowed regions listed above. |
| The recovery email does not arrive | Check the spam folder, then Resend > Emails. If it is not there, read the API log (row below) and look for `Could not send the recovery email`. If Resend is down or the domain expired, switch back to Mailtrap (see Email (Resend)). |
| The API does not start | Read the live log: `az webapp log tail --resource-group parkea-rg --name parkea-api-sena` (stop with Ctrl + C). |
