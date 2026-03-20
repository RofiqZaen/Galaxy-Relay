const express = require("express");
const WebSocket = require("ws");
const app = express();
app.use(express.json());

let socket = null;
let currentRecovery = null;
let recoveryList = [];
let recoveryIndex = 0;
let logs = [];
let me = { id: 0 };
let hash = null;

function addLog(msg) {
  const entry = "[" + new Date().toISOString() + "] " + msg;
  console.log(entry);
  logs.push(entry);
  if (logs.length > 100) logs.shift();
}

function genHash(code) {
  const CryptoJS = require("crypto-js");
  let h = CryptoJS.MD5(code).toString(CryptoJS.enc.Hex);
  h = h.split("").reverse().join("0");
  return h.substr(5, 10);
}

function send(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(msg + "\r\n");
    addLog("📤 " + msg);
  }
}

function receive(data) {
  const lines = data.trim().split("\r\n");
  for (const line of lines) {
    const W = line.split(/\s+/);
    const Y = W[0];

    switch (Y) {
      case "PING":
        send("PONG");
        break;

      case "HAAAPSI":
        send("RECOVER " + currentRecovery);
        hash = genHash(W[1]);
        break;

      case "REGISTER":
        send("USER " + W[1] + " " + W[2] + " " + W[3] + " " + hash);
        me.id = W[1];
        break;

      case "999":
        send("FWLISTVER 311");
        send("ADDONS 252069 2");
        send("MYADDONS 252069 2");
        send("PHONE 450 1000 0 2 :chrome 142.0.0.0");
        send("JOIN BROOD");
        break;

      case "900":
        addLog("🪐 Masuk planet: " + W[1]);
        break;

      default:
        addLog("📡 " + line);
    }
  }
}

function getNextRecovery() {
  if (recoveryList.length === 0) return null;
  const r = recoveryList[recoveryIndex % recoveryList.length];
  recoveryIndex++;
  return r;
}

function connect() {
  if (recoveryList.length === 0) {
    addLog("⚠️ Tidak ada recovery tersedia.");
    return;
  }

  currentRecovery = getNextRecovery();
  addLog("🔑 Pakai recovery ke-" + ((recoveryIndex - 1) % recoveryList.length + 1) + ": " + currentRecovery);

  socket = new WebSocket("wss://cs.mobstudio.ru:6672/");

  socket.onopen = () => {
    addLog("✅ Tersambung ke server.");
    send(":en IDENT 352 -2 4030 1 2 :GALA");
  };

  socket.onmessage = (e) => receive(e.data);

  socket.onclose = () => {
    addLog("🔌 Terputus. Ganti recovery & reconnect 5 detik lagi...");
    socket = null;
    setTimeout(connect, 5000);
  };

  socket.onerror = (err) => {
    addLog("⚠️ Error: " + err.message);
  };
}

// ── Endpoint dipanggil GAS ──────────────────────────────

// GAS kirim daftar recovery terbaru & ping keep-alive
app.post("/ping", (req, res) => {
  const incoming = req.body.recoveries;
  if (Array.isArray(incoming) && incoming.length > 0) {
    recoveryList = incoming;
  }

  // Kalau socket mati, nyalakan
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addLog("🔄 Socket tidak aktif, menghubungkan...");
    connect();
  }

  res.json({
    status: "ok",
    connected: socket ? socket.readyState === WebSocket.OPEN : false,
    currentRecovery: currentRecovery,
    totalRecoveries: recoveryList.length,
    logs: logs.slice(-30)
  });
  logs = [];
});

// Endpoint cek status manual
app.get("/status", (req, res) => {
  res.json({
    connected: socket ? socket.readyState === WebSocket.OPEN : false,
    currentRecovery: currentRecovery,
    recoveryIndex: recoveryIndex,
    totalRecoveries: recoveryList.length
  });
});

app.listen(3000, () => addLog("🚀 Relay server jalan di port 3000"));
