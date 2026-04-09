import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getWelcomeHtml(): string {
    return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Synapse Automation Suite</title>
    <style>
      :root {
        --bg: #0b0f17;
        --card: #121826;
        --text: #e6e9ef;
        --muted: #9aa4b2;
        --accent: #5eead4;
        --accent-2: #60a5fa;
        --border: #1f2937;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: radial-gradient(1200px 600px at 20% -10%, #0b3b4a 0%, transparent 60%),
          radial-gradient(1000px 500px at 80% -10%, #1e3a8a 0%, transparent 55%),
          var(--bg);
        color: var(--text);
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(900px, 100%);
        background: linear-gradient(180deg, rgba(18, 24, 38, 0.9), rgba(11, 15, 23, 0.9));
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(94, 234, 212, 0.1);
        color: var(--accent);
        border: 1px solid rgba(94, 234, 212, 0.3);
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.4px;
        text-transform: uppercase;
      }
      h1 {
        margin: 14px 0 8px;
        font-size: clamp(28px, 4vw, 40px);
        line-height: 1.1;
      }
      p {
        margin: 0 0 16px;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
      }
      .label {
        color: var(--accent-2);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 6px;
      }
      code {
        display: block;
        background: #0b1220;
        border: 1px solid #1e293b;
        color: #dbeafe;
        padding: 10px;
        border-radius: 8px;
        overflow-x: auto;
        font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
        font-size: 13px;
      }
      .footer {
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">Synapse Automation Suite</span>
      <h1>Welcome. Your API is live and ready.</h1>
      <p>
        This endpoint confirms the deployment is healthy. Use the echo route
        below to validate POST payloads end-to-end.
      </p>

      <div class="grid">
        <div class="panel">
          <div class="label">Quick Test</div>
          <code>GET /</code>
        </div>
        <div class="panel">
          <div class="label">Echo Endpoint</div>
          <code>POST /echo</code>
        </div>
        <div class="panel">
          <div class="label">Sample JSON</div>
          <code>{
  "name": "Mr_User",
  "intent": "Deployment Testing"
}</code>
        </div>
      </div>

      <div class="footer">
        Tip: send any JSON to <strong>/echo</strong> and it will be returned as-is.
      </div>
    </div>
  </body>
</html>
    `.trim();
  }
}
