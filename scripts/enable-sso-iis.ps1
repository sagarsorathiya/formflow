<#
.SYNOPSIS
  Enables Windows Integrated SSO for FormFlow on the IIS server. Run ELEVATED on the server.

.DESCRIPTION
  Same design as other Node apps behind IIS:

    browser -> /api/sso/windows  (IIS Windows auth, Negotiate/NTLM)
            -> rewritten to _authbridge/negotiate.aspx   (ASP.NET, runs INSIDE IIS)
            -> reads User.Identity.Name, calls http://127.0.0.1:3833/api/sso/ticket
               with X-SSO-User + X-SSO-Secret
            -> relays the app's JSON ({ok, ticket}) back to the login page

  Why a bridge: URL Rewrite expands {LOGON_USER} BEFORE Windows auth runs, so an identity
  header stamped by a rewrite rule is always blank. ASP.NET sees the real identity.

  Steps: verify domain join, install Windows Auth + ASP.NET roles, unlock the IIS auth
  sections, switch the FormFlow app pool to .NET v4.0 (needed to run the .aspx), write
  SSO_DOMAIN / SSO_SHARED_SECRET to .env (secret reused if present), write the bridge page
  and web.config, restart FormFlowApp.

  Deploy and build the code first (deploy-sso-fetch.ps1). Re-running is safe.
  Use -Disable to turn SSO off again (password login is unaffected either way).

.PARAMETER Domain
  NetBIOS domain name, i.e. the part before the backslash in DOMAIN\user (e.g. EXAMPLE).
  NOT the DNS name. Check with:  whoami  on a domain PC.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Domain,
  [string]$AppRoot  = "C:\FormFlow",
  [string]$SiteRoot = "C:\FormFlow\public_iis",
  [string]$AppService = "FormFlowApp",
  [string]$AppPool = "FormFlow",
  [string]$PublicHost = "formflow.example.com",
  [switch]$Disable
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an elevated PowerShell."
}

$envFile = Join-Path $AppRoot ".env"
$nssm    = Join-Path $AppRoot "tools\nssm.exe"
$appcmd  = Join-Path $env:windir "System32\inetsrv\appcmd.exe"
$utf8    = New-Object System.Text.UTF8Encoding($false)
$backup  = "C:\FormFlow-predeploy-backups\sso_$(Get-Date -Format yyyyMMdd_HHmmss)"   # outside the app root on purpose: tsc scans it otherwise

function Set-EnvLine([string]$Text, [string]$Key, [string]$Value) {
  $pattern = "(?m)^$([regex]::Escape($Key))=.*(\r?\n|$)"
  $Text = [regex]::Replace($Text, $pattern, "")
  if ($Value -ne $null -and $Value -ne "") {
    if ($Text.Length -gt 0 -and -not $Text.EndsWith("`n")) { $Text += "`r`n" }
    $Text += "$Key=$Value`r`n"
  }
  return $Text
}

function Restart-App {
  # stop+start: `nssm restart` fails on a service NSSM has throttled to PAUSED
  & $nssm stop $AppService | Out-Null
  Start-Sleep 2
  & $nssm start $AppService | Out-Null
  Start-Sleep 6
}

New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $envFile (Join-Path $backup ".env") -Force
if (Test-Path "$SiteRoot\web.config") { Copy-Item "$SiteRoot\web.config" (Join-Path $backup "web.config") -Force }
Write-Host "Backups in $backup"

# ── Disable ────────────────────────────────────────────────────────────────
if ($Disable) {
  $t = [IO.File]::ReadAllText($envFile, $utf8)
  $t = Set-EnvLine $t "SSO_DOMAIN" ""
  $t = Set-EnvLine $t "SSO_SHARED_SECRET" ""
  [IO.File]::WriteAllText($envFile, $t, $utf8)
  Restart-App
  Write-Host "SSO disabled (env vars removed). IIS config left in place - it is inert without them."
  return
}

# ── 1. Preconditions ───────────────────────────────────────────────────────
$cs = Get-CimInstance Win32_ComputerSystem
if (-not $cs.PartOfDomain) { throw "This server is not domain-joined; Windows authentication can only see local accounts." }
Write-Host "Server domain: $($cs.Domain)"

foreach ($feature in "Web-Windows-Auth", "Web-Asp-Net45") {
  if ((Get-WindowsFeature $feature).InstallState -ne "Installed") {
    Write-Host "Installing $feature..."
    Install-WindowsFeature $feature | Out-Null
  }
}

# ── 2. Allow web.config to set the auth sections ───────────────────────────
foreach ($s in "windowsAuthentication", "anonymousAuthentication") {
  & $appcmd unlock config -section:"system.webServer/security/authentication/$s" | Out-Null
}

# ── 3. App pool must run .NET to execute the bridge page ───────────────────
# It was created with no managed code (pure reverse proxy). Proxying is unaffected.
& $appcmd set apppool /apppool.name:$AppPool /managedRuntimeVersion:v4.0 | Out-Null
Write-Host "App pool '$AppPool' set to .NET v4.0"

# ── 4. Secret + .env ───────────────────────────────────────────────────────
$envText = [IO.File]::ReadAllText($envFile, $utf8)
$m = [regex]::Match($envText, "(?m)^SSO_SHARED_SECRET=(\S{32,})")
if ($m.Success) { $secret = $m.Groups[1].Value; Write-Host "Reusing existing SSO_SHARED_SECRET." }
else {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })   # hex only: no '$' for @next/env to expand
}
$envText = Set-EnvLine $envText "SSO_DOMAIN" $Domain
$envText = Set-EnvLine $envText "SSO_SHARED_SECRET" $secret
[IO.File]::WriteAllText($envFile, $envText, $utf8)

# ── 5. Bridge page ─────────────────────────────────────────────────────────
$bridgeDir = Join-Path $SiteRoot "_authbridge"
New-Item -ItemType Directory -Force $bridgeDir | Out-Null
$aspx = @'
<%@ Page Language="C#" %>
<%@ Import Namespace="System.Net" %>
<%@ Import Namespace="System.IO" %>
<script runat="server">
// Bridges IIS Windows Authentication to the FormFlow Node app.
// Reached at /api/sso/windows via the rewrite rule in the site web.config, with Windows
// auth enabled and anonymous disabled for this location. Runs natively in IIS (not proxied
// through ARR) so User.Identity.Name is reliably populated. Same pattern as another Node app.
// SECRET must match SSO_SHARED_SECRET in C:\FormFlow\.env.
void Page_Load(object sender, EventArgs e)
{
    const string SECRET = "__SECRET__";
    const string TICKET_URL = "http://127.0.0.1:3833/api/sso/ticket";

    Response.Clear();
    Response.ContentType = "application/json";
    Response.Cache.SetCacheability(HttpCacheability.NoCache);

    string identity = (User != null && User.Identity != null) ? User.Identity.Name : null;
    if (string.IsNullOrEmpty(identity))
    {
        Response.StatusCode = 401;
        Response.Write("{\"ok\":false}");
        Response.End();
        return;
    }

    try
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(TICKET_URL);
        req.Method = "GET";
        req.Headers["X-SSO-User"] = identity;   // DOMAIN\user, verbatim - the app enforces SSO_DOMAIN
        req.Headers["X-SSO-Secret"] = SECRET;
        req.Timeout = 10000;

        HttpWebResponse resp;
        try { resp = (HttpWebResponse)req.GetResponse(); }
        catch (WebException wex)
        {
            resp = wex.Response as HttpWebResponse;
            if (resp == null)
            {
                Response.StatusCode = 502;
                Response.Write("{\"ok\":false}");
                Response.End();
                return;
            }
        }

        using (resp)
        {
            Response.StatusCode = (int)resp.StatusCode;
            using (Stream s = resp.GetResponseStream())
            using (StreamReader sr = new StreamReader(s))
            {
                Response.Write(sr.ReadToEnd());
            }
        }
    }
    catch (Exception)
    {
        Response.StatusCode = 500;
        Response.Write("{\"ok\":false}");
    }
    Response.End();
}
</script>
'@
[IO.File]::WriteAllText((Join-Path $bridgeDir "negotiate.aspx"), $aspx.Replace("__SECRET__", $secret), $utf8)

# ── 6. web.config ──────────────────────────────────────────────────────────
$webConfig = @'
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <allowedServerVariables>
        <add name="HTTP_X_FORWARDED_PROTO" />
      </allowedServerVariables>
      <rules>
        <rule name="HTTP to HTTPS" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
        <!-- Internal endpoint: only the bridge (over loopback) may call it. -->
        <rule name="BlockExternalSsoTicket" stopProcessing="true">
          <match url="^api/sso/ticket/?$" />
          <action type="CustomResponse" statusCode="403" statusReason="Forbidden" statusDescription="Internal endpoint" />
        </rule>
        <rule name="SsoAuthBridge" stopProcessing="true">
          <match url="^api/sso/windows/?$" />
          <action type="Rewrite" url="_authbridge/negotiate.aspx" appendQueryString="false" />
        </rule>
        <rule name="ReverseProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3833/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="15728640" />
      </requestFiltering>
      <authentication>
        <anonymousAuthentication enabled="true" />
        <windowsAuthentication enabled="false" />
      </authentication>
    </security>
  </system.webServer>

  <!-- Windows auth for the SSO URL and for the bridge folder it is rewritten to. -->
  <location path="api/sso/windows">
    <system.webServer>
      <security>
        <authentication>
          <anonymousAuthentication enabled="false" />
          <windowsAuthentication enabled="true" authPersistNonNTLM="true">
            <!-- NTLM only: Kerberos needs an SPN for this host name registered to the account IIS runs
                 as; without one Negotiate's Kerberos leg fails with 0x8009030C. Remove this once
                 setspn is sorted if Kerberos is preferred. -->
            <providers>
              <clear />
              <add value="NTLM" />
            </providers>
          </windowsAuthentication>
        </authentication>
      </security>
    </system.webServer>
  </location>
  <location path="_authbridge">
    <system.webServer>
      <security>
        <authentication>
          <anonymousAuthentication enabled="false" />
          <windowsAuthentication enabled="true" authPersistNonNTLM="true">
            <!-- NTLM only: Kerberos needs an SPN for this host name registered to the account IIS runs
                 as; without one Negotiate's Kerberos leg fails with 0x8009030C. Remove this once
                 setspn is sorted if Kerberos is preferred. -->
            <providers>
              <clear />
              <add value="NTLM" />
            </providers>
          </windowsAuthentication>
        </authentication>
      </security>
    </system.webServer>
  </location>
</configuration>
'@
[IO.File]::WriteAllText("$SiteRoot\web.config", $webConfig, $utf8)
Remove-Item "$SiteRoot\sso-failed.html" -ErrorAction SilentlyContinue   # left by an earlier version of this script

# NOTE: do NOT add `-H 127.0.0.1` to the Next.js start command. It makes Next build redirect URLs
# from its own bind address (https://localhost:3833/...) instead of the Host header, breaking every
# login redirect behind IIS. The shared secret already protects the SSO endpoint; to also block direct
# LAN access to port 3833, use a Windows Firewall inbound rule instead.

# ── 7. Restart ─────────────────────────────────────────────────────────────
Restart-App
$code = & curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3833/login
Write-Host "App health check /login -> $code"
if ($code -ne "200") { Write-Warning "App is not answering. Check C:\FormFlow\logs\app-err.log" }
$ext = & curl.exe -s -k -o NUL -w "%{http_code}" "https://127.0.0.1/api/sso/ticket" -H "Host: $PublicHost"
Write-Host "External /api/sso/ticket -> $ext (expect 403)"
$win = & curl.exe -s -k -o NUL -w "%{http_code}" "https://127.0.0.1/api/sso/windows" -H "Host: $PublicHost"
Write-Host "Unauthenticated /api/sso/windows -> $win (expect 401 challenge)"

Write-Host ""
Write-Host "Done. Test from a domain PC in a private window: https://$PublicHost/login" -ForegroundColor Yellow
Write-Host "If a browser prompts for credentials, $PublicHost is not in its Intranet zone (other example.com portals already are)."
Write-Host "Optional: setspn -S HTTP/$PublicHost $($env:COMPUTERNAME)  (Kerberos; NTLM works without it)"
