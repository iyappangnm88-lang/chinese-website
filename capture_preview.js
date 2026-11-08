const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCDP() {
  console.log('Launching Headless Chrome for visual audit...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  // Give Chrome 1 second to bind port
  await sleep(1200);

  let versionData;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      versionData = await res.json();
      break;
    } catch (e) {
      await sleep(500);
    }
  }

  if (!versionData) {
    console.error('Failed to connect to Chrome debug port');
    chromeProcess.kill();
    return;
  }

  // Create new page target
  const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://localhost:3000/`, { method: 'PUT' });
  const target = await newTargetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let messageId = 1;
  const pendingRequests = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  console.log('Connected to Chrome DevTools Protocol.');

  await sendCommand('Page.enable');
  await sendCommand('DOM.enable');
  await sendCommand('Runtime.enable');

  console.log('Waiting for essential assets and preloader completion...');
  for (let i = 0; i < 40; i++) {
    const res = await sendCommand('Runtime.evaluate', {
      expression: 'Boolean(window.__MYTHIC_READY__)'
    });
    if (res && res.result && res.result.value) {
      console.log('Mythic realm ready! Preloader dismissed.');
      break;
    }
    await sleep(250);
  }
  // Allow fade-out transition to complete
  await sleep(1000);

  // Helper to set viewport and capture screenshot
  async function capture(name, width, height, scrollY = 0) {
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768
    });

    if (scrollY > 0) {
      await sendCommand('Runtime.evaluate', {
        expression: `window.scrollTo(0, ${scrollY});`
      });
      // Wait for lerp and canvas frame rendering
      await sleep(1000);
    } else {
      await sendCommand('Runtime.evaluate', {
        expression: `window.scrollTo(0, 0);`
      });
      await sleep(1200);
    }

    const { data } = await sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });

    const buffer = Buffer.from(data, 'base64');
    const outPath = path.join(__dirname, name);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${name} (${width}x${height}, scrollY: ${scrollY})`);
  }

  // 1. Desktop Hero (scrollY: 0)
  await capture('desktop_hero.png', 1440, 900, 0);

  // 2. Desktop Legend (scrollY: ~1100)
  await capture('desktop_legend.png', 1440, 900, 1200);

  // 3. Desktop Traveller (scrollY: ~2400)
  await capture('desktop_traveller.png', 1440, 900, 2400);

  // 4. Desktop Journey / Milestones (scrollY: ~3600)
  await capture('desktop_journey.png', 1440, 900, 3700);

  // 5. Desktop Final Moment (bottom of page)
  const maxScrollRes = await sendCommand('Runtime.evaluate', {
    expression: `document.documentElement.scrollHeight - window.innerHeight`
  });
  const maxScroll = maxScrollRes.result.value || 4500;
  await capture('desktop_final.png', 1440, 900, maxScroll);

  // 6. Tablet Viewport
  await capture('tablet_view.png', 820, 1180, 0);

  // 7. Mobile Phone Viewport
  await capture('mobile_view.png', 390, 844, 0);

  ws.close();
  chromeProcess.kill();
  console.log('Visual audit complete.');
}

runCDP().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
